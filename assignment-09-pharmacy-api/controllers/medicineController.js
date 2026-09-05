const Medicine = require('../models/Medicine');

/**
 * GET /api/medicines  (public)
 * Supports ?search= (matches name OR brand, case-insensitive) and ?category= filter.
 */
async function listMedicines(req, res, next) {
  try {
    const { search, category } = req.query;
    const query = {};

    if (search) {
      const regex = new RegExp(search, 'i');
      query.$or = [{ name: regex }, { brand: regex }];
    }
    if (category) {
      query.category = new RegExp(`^${category}$`, 'i');
    }

    const medicines = await Medicine.find(query).sort({ name: 1 });
    return res.status(200).json({
      success: true,
      message: 'Medicines fetched',
      data: medicines,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/medicines/expiring  (pharmacist/admin)
 * Returns medicines expiring within the next 30 days using a real Mongo date-range
 * query (NOT app-side filtering of the whole collection).
 */
async function expiringMedicines(req, res, next) {
  try {
    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const medicines = await Medicine.find({
      expiryDate: { $gte: now, $lte: in30Days },
    }).sort({ expiryDate: 1 });

    return res.status(200).json({
      success: true,
      message: 'Medicines expiring within 30 days',
      data: medicines,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/medicines  (pharmacist/admin)
 * Creates a medicine. Mongoose schema validation enforces enums and min(0)
 * constraints; a few required fields are checked up front for clearer messages.
 */
async function createMedicine(req, res, next) {
  try {
    const { name, brand, category, dosageForm, price, stockQuantity, expiryDate } = req.body;

    if (!name || !brand || !category || !dosageForm || price === undefined || expiryDate === undefined) {
      return res.status(400).json({
        success: false,
        message: 'name, brand, category, dosageForm, price and expiryDate are required',
      });
    }
    if (Number(price) < 0) {
      return res.status(400).json({ success: false, message: 'price cannot be negative' });
    }
    if (stockQuantity !== undefined && Number(stockQuantity) < 0) {
      return res.status(400).json({ success: false, message: 'stockQuantity cannot be negative' });
    }

    const medicine = await Medicine.create(req.body);
    return res.status(201).json({
      success: true,
      message: 'Medicine created',
      data: medicine,
    });
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ success: false, message: err.message });
    }
    return next(err);
  }
}

/**
 * PUT /api/medicines/:id  (pharmacist/admin)
 * Partial update (e.g. stock/price). 404 if not found.
 */
async function updateMedicine(req, res, next) {
  try {
    const medicine = await Medicine.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!medicine) {
      return res.status(404).json({ success: false, message: 'Medicine not found' });
    }
    return res.status(200).json({ success: true, message: 'Medicine updated', data: medicine });
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ success: false, message: err.message });
    }
    if (err.name === 'CastError') {
      return res.status(400).json({ success: false, message: 'Invalid medicine id' });
    }
    return next(err);
  }
}

/**
 * DELETE /api/medicines/:id  (admin only)
 * 404 if not found.
 */
async function deleteMedicine(req, res, next) {
  try {
    const medicine = await Medicine.findByIdAndDelete(req.params.id);
    if (!medicine) {
      return res.status(404).json({ success: false, message: 'Medicine not found' });
    }
    return res.status(200).json({ success: true, message: 'Medicine deleted', data: { id: medicine._id } });
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(400).json({ success: false, message: 'Invalid medicine id' });
    }
    return next(err);
  }
}

module.exports = {
  listMedicines,
  expiringMedicines,
  createMedicine,
  updateMedicine,
  deleteMedicine,
};
