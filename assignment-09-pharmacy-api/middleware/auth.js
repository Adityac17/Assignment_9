const jwt = require('jsonwebtoken');

/**
 * Authentication middleware.
 *
 * Verifies a Bearer JWT from the Authorization header and attaches
 * req.user = { id, role } for downstream handlers and role guards.
 * Responds 401 if the token is missing, malformed, or invalid.
 */
module.exports = function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required: missing or malformed Bearer token',
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: decoded.id, role: decoded.role };
    return next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token',
    });
  }
};
