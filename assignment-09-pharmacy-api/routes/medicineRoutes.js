const express = require('express');
const auth = require('../middleware/auth');
const { authorizeRoles } = require('../middleware/roleGuard');
const {
  listMedicines,
  expiringMedicines,
  createMedicine,
  updateMedicine,
  deleteMedicine,
} = require('../controllers/medicineController');

const router = express.Router();

// Public catalogue with search/category filter.
router.get('/', listMedicines);

// Expiring-soon report — pharmacist/admin. Declared before '/:id'-style routes
// is not needed here, but kept above generic handlers for clarity.
router.get('/expiring', auth, authorizeRoles('pharmacist', 'admin'), expiringMedicines);

// Create / update — pharmacist/admin.
router.post('/', auth, authorizeRoles('pharmacist', 'admin'), createMedicine);
router.put('/:id', auth, authorizeRoles('pharmacist', 'admin'), updateMedicine);

// Delete — admin only.
router.delete('/:id', auth, authorizeRoles('admin'), deleteMedicine);

module.exports = router;
