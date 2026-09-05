const express = require('express');
const auth = require('../middleware/auth');
const { authorizeRoles } = require('../middleware/roleGuard');
const {
  createOrder,
  myOrders,
  listOrders,
  updateOrderStatus,
} = require('../controllers/orderController');

const router = express.Router();

// Place an order — customer only.
router.post('/', auth, authorizeRoles('customer'), createOrder);

// A customer's own orders — customer only. Declared before '/' GET is fine since
// paths differ; kept above for readability.
router.get('/my-orders', auth, authorizeRoles('customer'), myOrders);

// All orders (with optional ?status=) — pharmacist/admin.
router.get('/', auth, authorizeRoles('pharmacist', 'admin'), listOrders);

// Change order status — pharmacist/admin.
router.patch('/:id/status', auth, authorizeRoles('pharmacist', 'admin'), updateOrderStatus);

module.exports = router;
