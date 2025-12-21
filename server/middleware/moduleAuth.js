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

      // Avitar staff and admins have access to all modules
      if (['avitar_staff', 'avitar_admin'].includes(req.user.global_role)) {
        return next();
      }

      // Get municipality ID from request params
      const municipalityId = req.params.municipalityId || req.params.id;

      if (!municipalityId) {
        return res.status(400).json({
          success: false,
          message: 'Municipality ID required',
        });
      }

      // Check if municipality has this module enabled
      const municipality = await Municipality.findById(municipalityId);

      if (!municipality) {
        return res.status(404).json({
          success: false,
          message: 'Municipality not found',
        });
      }

      // Check if module is enabled for this municipality
      const moduleConfig = municipality.module_config?.modules?.get(moduleName);

      if (!moduleConfig || !moduleConfig.enabled) {
        return res.status(403).json({
          success: false,
          message: `${moduleName} module is not available for this municipality`,
          code: 'MODULE_NOT_ENABLED',
        });
      }

      // For contractors and citizens: allow read access to view modules
      // Specific permissions will be checked at the action level
      if (['contractor', 'citizen'].includes(req.user.global_role)) {
        return next();
      }

      // For municipal users: check if they have permissions for this municipality and module
      const userPerm = req.user.municipal_permissions?.find(
        (perm) => perm.municipality_id.toString() === municipalityId.toString(),
      );

      if (!userPerm) {
        return res.status(403).json({
          success: false,
          message: 'No permissions for this municipality',
          code: 'NO_MUNICIPAL_PERMISSIONS',
        });
      }

      // Check if user has this module enabled in their permissions
      const userModulePerm = userPerm.module_permissions?.get(moduleName);

      if (!userModulePerm || !userModulePerm.enabled) {
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

      // Avitar staff and admins have access to all features
      if (['avitar_staff', 'avitar_admin'].includes(req.user.global_role)) {
        return next();
      }

      // Get municipality ID from request params
      const municipalityId = req.params.municipalityId || req.params.id;

      if (!municipalityId) {
        return res.status(400).json({
          success: false,
          message: 'Municipality ID required',
        });
      }

      // Check if municipality has this feature enabled
      const municipality = await Municipality.findById(municipalityId);

      if (!municipality) {
        return res.status(404).json({
          success: false,
          message: 'Municipality not found',
        });
      }

      // Check if feature is enabled for this municipality's module
      const moduleConfig = municipality.module_config?.modules?.get(moduleName);

      if (!moduleConfig || !moduleConfig.enabled) {
        return res.status(403).json({
          success: false,
          message: `${moduleName} module is not available`,
          code: 'MODULE_NOT_ENABLED',
        });
      }

      const featureEnabled = moduleConfig.features?.[featureName]?.enabled;

      if (!featureEnabled) {
        return res.status(403).json({
          success: false,
          message: `${featureName} feature is not available in ${moduleName} module`,
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

      // Avitar staff and admins have access to all modules
      if (['avitar_staff', 'avitar_admin'].includes(req.user.global_role)) {
        return next();
      }

      // Non-municipal users (contractors, citizens) are checked by general module access
      if (!['municipal_user'].includes(req.user.global_role)) {
        return requireModuleAccess(moduleName)(req, res, next);
      }

      const departmentModules = {
        assessing: ['assessing'],
        tax: ['taxCollection'],
        building: ['building_permit'],
        clerk: ['townClerk'],
        motor_vehicle: ['motorVehicle'],
        finance: ['taxCollection', 'utilityBilling'],
        code_enforcement: ['building_permit'],
        planning: ['building_permit'],
        it: Object.values(MODULES), // IT can access all modules
        general: Object.values(MODULES), // General admin can access all modules
      };

      // Get municipality ID from request params
      const municipalityId = req.params.municipalityId || req.params.id;

      if (!municipalityId) {
        return res.status(400).json({
          success: false,
          message: 'Municipality ID required',
        });
      }

      // Find user's permission for this municipality
      const userPerm = req.user.municipal_permissions?.find(
        (perm) => perm.municipality_id.toString() === municipalityId.toString(),
      );

      if (!userPerm) {
        return res.status(403).json({
          success: false,
          message: 'No permissions for this municipality',
          code: 'NO_MUNICIPAL_PERMISSIONS',
        });
      }

      const userDepartment = userPerm.department;
      const allowedModules = departmentModules[userDepartment] || [];

      if (!allowedModules.includes(moduleName)) {
        return res.status(403).json({
          success: false,
          message: `Department ${userDepartment} does not have access to ${moduleName} module`,
          code: 'DEPARTMENT_MODULE_ACCESS_DENIED',
        });
      }

      // Also check if municipality has the module enabled
      const municipality = await Municipality.findById(municipalityId);

      if (!municipality) {
        return res.status(404).json({
          success: false,
          message: 'Municipality not found',
        });
      }

      const moduleConfig = municipality.module_config?.modules?.get(moduleName);

      if (!moduleConfig || !moduleConfig.enabled) {
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
    if (req.user && req.user.municipal_permissions) {
      // Extract unique module names from user's municipal permissions
      const moduleSet = new Set();

      req.user.municipal_permissions.forEach((perm) => {
        if (perm.module_permissions) {
          for (const [moduleName, moduleConfig] of perm.module_permissions) {
            if (moduleConfig.enabled) {
              moduleSet.add(moduleName);
            }
          }
        }
      });

      req.userModules = Array.from(moduleSet);
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
