const mongoose = require('mongoose');
const Order = require('../models/Order');
const Medicine = require('../models/Medicine');
const {
  computeTotalAmount,
  isPrescriptionRequired,
  prescriptionNotesSatisfied,
  findInsufficientStock,
} = require('./orderLogic');

/**
 * POST /api/orders  (customer only)
 * Body: { items: [{ medicine, quantity }], prescriptionNotes? }
 *
 * - Looks up each medicine's CURRENT price server-side (client price is ignored).
 * - Verifies stock sufficiency (400 naming the short medicine).
 * - If any item requiresPrescription, non-empty prescriptionNotes is mandatory.
 * - Computes totalAmount server-side. Creates order as 'pending'.
 * - Does NOT decrement stock (that happens on first approval).
 */
async function createOrder(req, res, next) {
  try {
    const { items, prescriptionNotes } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'items must be a non-empty array of { medicine, quantity }',
      });
    }

    // Resolve all referenced medicines.
    const ids = items.map((i) => i.medicine);
    for (const id of ids) {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, message: `Invalid medicine id: ${id}` });
      }
    }

    const medicines = await Medicine.find({ _id: { $in: ids } });
    const medMap = new Map(medicines.map((m) => [m._id.toString(), m]));

    const lineItems = [];
    const stockLines = [];
    const involvedMedicines = [];

    for (const item of items) {
      const med = medMap.get(String(item.medicine));
      if (!med) {
        return res.status(400).json({
          success: false,
          message: `Medicine not found: ${item.medicine}`,
        });
      }
      const quantity = Number(item.quantity);
      if (!Number.isInteger(quantity) || quantity < 1) {
        return res.status(400).json({
          success: false,
          message: `Quantity for ${med.name} must be an integer >= 1`,
        });
      }

      involvedMedicines.push(med);
      lineItems.push({ medicine: med._id, quantity, unitPrice: med.price });
      stockLines.push({ name: med.name, requested: quantity, available: med.stockQuantity });
    }

    // Stock sufficiency check (at order time, best-effort; enforced again on approval).
    const short = findInsufficientStock(stockLines);
    if (short) {
      return res.status(400).json({
        success: false,
        message: `Insufficient stock for ${short.name}: requested ${short.requested}, available ${short.available}`,
      });
    }

    // Prescription enforcement.
    const required = isPrescriptionRequired(involvedMedicines);
    if (!prescriptionNotesSatisfied(required, prescriptionNotes)) {
      return res.status(400).json({
        success: false,
        message: 'One or more items require a prescription; prescriptionNotes must be provided',
      });
    }

    const totalAmount = computeTotalAmount(lineItems);

    const order = await Order.create({
      customer: req.user.id,
      items: lineItems,
      totalAmount,
      prescriptionNotes: prescriptionNotes || '',
      status: 'pending',
    });

    return res.status(201).json({ success: true, message: 'Order placed', data: order });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/orders/my-orders  (customer only)
 * Returns the authenticated customer's own orders.
 */
async function myOrders(req, res, next) {
  try {
    const orders = await Order.find({ customer: req.user.id })
      .populate('items.medicine', 'name brand price')
      .sort({ createdAt: -1 });
    return res.status(200).json({ success: true, message: 'Your orders', data: orders });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/orders  (pharmacist/admin)
 * Returns all orders, optionally filtered by ?status=.
 */
async function listOrders(req, res, next) {
  try {
    const { status } = req.query;
    const query = {};
    if (status) query.status = status;

    const orders = await Order.find(query)
      .populate('customer', 'name email')
      .populate('items.medicine', 'name brand price')
      .sort({ createdAt: -1 });
    return res.status(200).json({ success: true, message: 'Orders fetched', data: orders });
  } catch (err) {
    return next(err);
  }
}

/**
 * PATCH /api/orders/:id/status  (pharmacist/admin)
 * Body: { status: 'approved'|'dispensed'|'cancelled' }
 *
 * On the FIRST transition into 'approved', stock is decremented atomically using
 * per-item conditional updates guarded by { stockQuantity: { $gte: quantity } }.
 * If any item is now insufficient, the whole change is rejected (400) and any
 * partial decrements are rolled back. Re-approving never double-decrements
 * (guarded by order.stockDeducted).
 */
async function updateOrderStatus(req, res, next) {
  try {
    const { status } = req.body;
    const allowed = ['approved', 'dispensed', 'cancelled'];
    if (!allowed.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `status must be one of [${allowed.join(', ')}]`,
      });
    }

    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const enteringApprovedFirstTime = status === 'approved' && !order.stockDeducted;

    if (enteringApprovedFirstTime) {
      const applied = []; // track successful decrements for rollback

      for (const item of order.items) {
        const result = await Medicine.updateOne(
          { _id: item.medicine, stockQuantity: { $gte: item.quantity } },
          { $inc: { stockQuantity: -item.quantity } }
        );

        if (result.modifiedCount === 1) {
          applied.push(item);
        } else {
          // Insufficient stock (or medicine gone). Roll back everything applied so far.
          for (const done of applied) {
            await Medicine.updateOne(
              { _id: done.medicine },
              { $inc: { stockQuantity: done.quantity } }
            );
          }
          const med = await Medicine.findById(item.medicine).select('name stockQuantity');
          return res.status(400).json({
            success: false,
            message: med
              ? `Insufficient stock to approve: ${med.name} needs ${item.quantity}, has ${med.stockQuantity}`
              : `Medicine ${item.medicine} no longer exists; cannot approve`,
          });
        }
      }

      order.stockDeducted = true;
    }

    order.status = status;
    await order.save();

    return res.status(200).json({ success: true, message: `Order status updated to ${status}`, data: order });
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(400).json({ success: false, message: 'Invalid order id' });
    }
    return next(err);
  }
}

module.exports = { createOrder, myOrders, listOrders, updateOrderStatus };
