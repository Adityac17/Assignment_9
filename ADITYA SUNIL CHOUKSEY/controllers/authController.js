const jwt = require('jsonwebtoken');
const User = require('../models/User');

/** Sign a JWT carrying the user's id and role. */
function signToken(user) {
  return jwt.sign(
    { id: user._id.toString(), role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

/**
 * POST /api/auth/register  (public)
 * Creates a CUSTOMER account only. Any role supplied in the body is ignored.
 */
async function register(req, res, next) {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'name, email and password are required',
      });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'A user with this email already exists',
      });
    }

    // Role forced to 'customer' regardless of client input.
    const user = await User.create({ name, email, password, role: 'customer' });

    return res.status(201).json({
      success: true,
      message: 'Customer registered successfully',
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        token: signToken(user),
      },
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/auth/register-staff  (protected by ADMIN_SECRET_KEY)
 * Creates a pharmacist or admin account. Requires the correct secret key,
 * supplied via header `x-admin-secret` or body field `adminSecret`.
 */
async function registerStaff(req, res, next) {
  try {
    const providedKey = req.headers['x-admin-secret'] || req.body.adminSecret;

    if (!process.env.ADMIN_SECRET_KEY || providedKey !== process.env.ADMIN_SECRET_KEY) {
      return res.status(403).json({
        success: false,
        message: 'Invalid or missing ADMIN_SECRET_KEY',
      });
    }

    const { name, email, password, role } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({
        success: false,
        message: 'name, email, password and role are required',
      });
    }

    if (!['pharmacist', 'admin'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: "role must be 'pharmacist' or 'admin'",
      });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'A user with this email already exists',
      });
    }

    const user = await User.create({ name, email, password, role });

    return res.status(201).json({
      success: true,
      message: `Staff account (${role}) created successfully`,
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        token: signToken(user),
      },
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/auth/login  (public)
 * Verifies credentials and issues a JWT.
 */
async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'email and password are required',
      });
    }

    // password has select:false, so explicitly select it here.
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const match = await user.comparePassword(password);
    if (!match) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        token: signToken(user),
      },
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/auth/profile  (authenticated)
 * Returns the current user's record without the password.
 */
async function profile(req, res, next) {
  try {
    const user = await User.findById(req.user.id); // password excluded by default
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    return res.status(200).json({ success: true, message: 'Profile fetched', data: user });
  } catch (err) {
    return next(err);
  }
}

module.exports = { register, registerStaff, login, profile };
