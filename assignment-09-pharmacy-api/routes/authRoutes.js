const express = require('express');
const auth = require('../middleware/auth');
const { register, registerStaff, login, profile } = require('../controllers/authController');

const router = express.Router();

router.post('/register', register); // public — customer only
router.post('/register-staff', registerStaff); // guarded by ADMIN_SECRET_KEY
router.post('/login', login); // public
router.get('/profile', auth, profile); // authenticated

module.exports = router;
