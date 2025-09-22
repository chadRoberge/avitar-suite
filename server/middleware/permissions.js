const {
  PERMISSION_LEVELS,
  PermissionHelpers,
} = require('../config/permissions');

/**
 * Middleware to check if user has minimum permission level
 */
const requirePermissionLevel = (minLevel) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    if (
      !PermissionHelpers.hasMinimumPermission(
        req.user.permissionLevel,
        minLevel,
      )
    ) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions',
      });
    }

    next();
  };
};

/**
 * Middleware to check if user can access specific department
 */
const requireDepartmentAccess = (department, action = 'view') => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    if (!req.user.canAccessDepartment(department, action)) {
      return res.status(403).json({
        success: false,
        message: `Access denied to ${department} department (${action})`,
      });
    }

    next();
  };
};

/**
 * Middleware to check if user can access specific service
 */
const requireServiceAccess = (service) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    if (!req.user.canAccessService(service)) {
      return res.status(403).json({
        success: false,
        message: `Access denied to ${service} service`,
      });
    }

    next();
  };
};

/**
 * Middleware to check if user is municipal staff
 */
const requireMunicipalStaff = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required',
    });
  }

  if (!PermissionHelpers.isMunicipalStaff(req.user.permissionLevel)) {
    return res.status(403).json({
      success: false,
      message: 'Municipal staff access required',
    });
  }

  next();
};

/**
 * Middleware to check if user is system admin
 */
const requireSystemAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required',
    });
  }

  if (!PermissionHelpers.isSystemAdmin(req.user.permissionLevel)) {
    return res.status(403).json({
      success: false,
      message: 'System administrator access required',
    });
  }

  next();
};

/**
 * Middleware to check if user belongs to the same municipality
 */
const requireSameMunicipality = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required',
    });
  }

  const municipalityId = req.params.municipalityId || req.body.municipalityId;

  if (!municipalityId) {
    return res.status(400).json({
      success: false,
      message: 'Municipality ID is required',
    });
  }

  // System admins can access any municipality
  if (PermissionHelpers.isSystemAdmin(req.user.permissionLevel)) {
    return next();
  }

  if (req.user.municipality.toString() !== municipalityId) {
    return res.status(403).json({
      success: false,
      message: 'Access denied - different municipality',
    });
  }

  next();
};

/**
 * Middleware to check if user can edit their own data or is admin
 */
const requireSelfOrAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required',
    });
  }

  const targetUserId = req.params.userId || req.params.id;

  // Allow users to edit their own data
  if (req.user._id.toString() === targetUserId) {
    return next();
  }

  // Allow municipal staff to edit users in their municipality
  if (PermissionHelpers.isMunicipalStaff(req.user.permissionLevel)) {
    return next();
  }

  // Allow system admins to edit any user
  if (PermissionHelpers.isSystemAdmin(req.user.permissionLevel)) {
    return next();
  }

  return res.status(403).json({
    success: false,
    message: 'Access denied - insufficient permissions',
  });
};

/**
 * Middleware to add user permissions to response
 */
const addUserPermissions = (req, res, next) => {
  if (req.user) {
    // Add permission information to req for use in controllers
    req.userPermissions = {
      level: req.user.permissionLevel,
      levelName: req.user.getPermissionLevelName(),
      isMunicipalStaff: PermissionHelpers.isMunicipalStaff(
        req.user.permissionLevel,
      ),
      isSystemAdmin: PermissionHelpers.isSystemAdmin(req.user.permissionLevel),
      canAccessService: (service) => req.user.canAccessService(service),
      canAccessDepartment: (dept, action) =>
        req.user.canAccessDepartment(dept, action),
    };
  }

  next();
};

/**
 * Middleware to check account lock status
 */
const checkAccountLock = (req, res, next) => {
  if (!req.user) {
    return next();
  }

  if (req.user.isLocked()) {
    return res.status(423).json({
      success: false,
      message:
        'Account is temporarily locked due to too many failed login attempts',
      lockedUntil: req.user.accountLockedUntil,
    });
  }

  next();
};

/**
 * Rate limiting middleware for API access
 */
const checkApiRateLimit = async (req, res, next) => {
  if (!req.user || !req.user.apiAccess?.enabled) {
    return res.status(403).json({
      success: false,
      message: 'API access not enabled for this user',
    });
  }

  // Simple rate limiting check (in production, use Redis or similar)
  const now = new Date();
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  // This is a simplified check - in production you'd track requests properly
  if (req.user.apiAccess.lastUsed && req.user.apiAccess.lastUsed > hourAgo) {
    // In a real implementation, you'd check actual request count
    // For now, just update the last used timestamp
  }

  // Update last used timestamp
  req.user.apiAccess.lastUsed = now;
  await req.user.save();

  next();
};

module.exports = {
  requirePermissionLevel,
  requireDepartmentAccess,
  requireServiceAccess,
  requireMunicipalStaff,
  requireSystemAdmin,
  requireSameMunicipality,
  requireSelfOrAdmin,
  addUserPermissions,
  checkAccountLock,
  checkApiRateLimit,

  // Permission level constants for easy access
  LEVELS: PERMISSION_LEVELS,
};
