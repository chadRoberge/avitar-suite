const Municipality = require('../models/Municipality');
const { MODULES } = require('../config/modules');

// Middleware to check if user has access to a specific module
const requireModuleAccess = (moduleName) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
      }

      // System users have access to all modules
      if (req.user.userType === 'system') {
        return next();
      }

      const hasAccess = await req.user.canAccessModule(moduleName);

      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: `Access denied to ${moduleName} module`,
          code: 'MODULE_ACCESS_DENIED',
        });
      }

      next();
    } catch (error) {
      console.error('Error checking module access:', error);
      res.status(500).json({
        success: false,
        message: 'Error validating module access',
      });
    }
  };
};

// Middleware to check if user has access to a specific module feature
const requireModuleFeature = (moduleName, featureName) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
      }

      // System users have access to all features
      if (req.user.userType === 'system') {
        return next();
      }

      const hasFeature = await req.user.canAccessModuleFeature(
        moduleName,
        featureName,
      );

      if (!hasFeature) {
        return res.status(403).json({
          success: false,
          message: `Access denied to ${featureName} feature in ${moduleName} module`,
          code: 'MODULE_FEATURE_ACCESS_DENIED',
        });
      }

      next();
    } catch (error) {
      console.error('Error checking module feature access:', error);
      res.status(500).json({
        success: false,
        message: 'Error validating module feature access',
      });
    }
  };
};

// Middleware to check if user's department has access to a module
const requireDepartmentModuleAccess = (moduleName) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
      }

      // System users have access to all modules
      if (req.user.userType === 'system') {
        return next();
      }

      // Non-municipal users are checked by general module access
      if (req.user.userType !== 'municipal') {
        return requireModuleAccess(moduleName)(req, res, next);
      }

      const departmentModules = {
        assessing: ['assessing'],
        tax: ['taxCollection'],
        building: ['buildingPermits'],
        clerk: ['townClerk'],
        motor_vehicle: ['motorVehicle'],
        finance: ['taxCollection', 'utilityBilling'],
        code_enforcement: ['buildingPermits'],
        planning: ['buildingPermits'],
        it: Object.values(MODULES), // IT can access all modules
        general: Object.values(MODULES), // General admin can access all modules
      };

      const allowedModules = departmentModules[req.user.department] || [];

      if (!allowedModules.includes(moduleName)) {
        return res.status(403).json({
          success: false,
          message: `Department ${req.user.department} does not have access to ${moduleName} module`,
          code: 'DEPARTMENT_MODULE_ACCESS_DENIED',
        });
      }

      // Also check if municipality has the module enabled
      const hasAccess = await req.user.canAccessModule(moduleName);

      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: `Module ${moduleName} is not available for your municipality`,
          code: 'MODULE_NOT_AVAILABLE',
        });
      }

      next();
    } catch (error) {
      console.error('Error checking department module access:', error);
      res.status(500).json({
        success: false,
        message: 'Error validating department module access',
      });
    }
  };
};

// Middleware to attach user's available modules to request
const attachUserModules = async (req, res, next) => {
  try {
    if (req.user) {
      req.userModules = await req.user.getAvailableModules();
    } else {
      req.userModules = [];
    }
    next();
  } catch (error) {
    console.error('Error attaching user modules:', error);
    req.userModules = [];
    next();
  }
};

// Helper to validate module name from request params
const validateModuleName = (req, res, next) => {
  const { moduleName } = req.params;

  if (!moduleName || !Object.values(MODULES).includes(moduleName)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid module name',
      validModules: Object.values(MODULES),
    });
  }

  next();
};

module.exports = {
  requireModuleAccess,
  requireModuleFeature,
  requireDepartmentModuleAccess,
  attachUserModules,
  validateModuleName,
};
