/**
 * Role-based access control middleware factory.
 *
 * Usage: router.post('/', auth, authorizeRoles('admin', 'pharmacist'), handler)
 *
 * Assumes `auth` has already run and populated req.user.role. Responds 403 if the
 * authenticated user's role is not in the allowed list, 401 if unauthenticated.
 *
 * @param {...string} roles allowed roles
 */
function authorizeRoles(...roles) {
  return function guard(req, res, next) {
    if (!req.user || !req.user.role) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied: requires one of [${roles.join(', ')}], but role is '${req.user.role}'`,
      });
    }

    return next();
  };
}

module.exports = { authorizeRoles };
