const express = require('express');
const router = express.Router();
const Municipality = require('../models/Municipality');
const { authenticateToken, requireUserType } = require('../middleware/auth');
const { PERMISSION_LEVELS } = require('../config/permissions');
const { MODULES, ModuleHelpers } = require('../config/modules');

// Get all available modules and their info
router.get('/available', authenticateToken, async (req, res) => {
  try {
    const modules = ModuleHelpers.getAllModules().map((moduleName) => ({
      name: moduleName,
      ...ModuleHelpers.getModuleInfo(moduleName),
      features: ModuleHelpers.getModuleFeatures(moduleName),
    }));

    res.json({
      success: true,
      data: modules,
    });
  } catch (error) {
    console.error('Error fetching available modules:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch available modules',
    });
  }
});

// Get municipality's enabled modules
router.get('/enabled', authenticateToken, async (req, res) => {
  try {
    const municipality = await Municipality.findById(req.user.municipality);

    if (!municipality) {
      return res.status(404).json({
        success: false,
        message: 'Municipality not found',
      });
    }

    const enabledModules = municipality.getEnabledModules();
    const navigation = ModuleHelpers.getNavigationForModules(enabledModules);

    res.json({
      success: true,
      data: {
        modules: enabledModules,
        navigation,
      },
    });
  } catch (error) {
    console.error('Error fetching enabled modules:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch enabled modules',
    });
  }
});

// Check if user has access to specific module
router.get('/access/:moduleName', authenticateToken, async (req, res) => {
  try {
    const { moduleName } = req.params;
    const municipality = await Municipality.findById(req.user.municipality);

    if (!municipality) {
      return res.status(404).json({
        success: false,
        message: 'Municipality not found',
      });
    }

    const hasAccess = municipality.hasModule(moduleName);
    const tier = municipality.getModuleTier(moduleName);
    const module = municipality.module_config.modules.get(moduleName);

    const features = {};
    if (module?.features) {
      for (const [featureName, feature] of module.features) {
        features[featureName] = feature.enabled;
      }
    }

    res.json({
      success: true,
      data: {
        hasAccess,
        tier,
        version: module?.version,
        features,
        expired: municipality.isModuleExpired(moduleName),
        activatedDate: module?.activated_date,
        expirationDate: module?.expiration_date,
        disabledReason: module?.disabled_reason,
      },
    });
  } catch (error) {
    console.error('Error checking module access:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check module access',
    });
  }
});

// Check if user has access to specific feature
router.get(
  '/feature/:moduleName/:featureName',
  authenticateToken,
  async (req, res) => {
    try {
      const { moduleName, featureName } = req.params;
      const municipality = await Municipality.findById(req.user.municipality);

      if (!municipality) {
        return res.status(404).json({
          success: false,
          message: 'Municipality not found',
        });
      }

      const hasFeature = municipality.hasFeature(moduleName, featureName);
      const module = municipality.module_config.modules.get(moduleName);
      const feature = module?.features?.get(featureName);

      res.json({
        success: true,
        data: {
          hasFeature,
          moduleEnabled: municipality.hasModule(moduleName),
          moduleExpired: municipality.isModuleExpired(moduleName),
          tierRequired: feature?.tier_required,
          featureConfig: feature?.config,
        },
      });
    } catch (error) {
      console.error('Error checking feature access:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to check feature access',
      });
    }
  },
);

// Enable module for municipality (System Admin only)
router.post('/enable/:municipalityId', authenticateToken, async (req, res) => {
  try {
    const { municipalityId } = req.params;
    const {
      moduleName,
      tier = 'basic',
      version = '1.0.0',
      features = {},
      settings = {},
      permissions = {},
      expirationDate,
    } = req.body;

    if (!Object.values(MODULES).includes(moduleName)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid module name',
      });
    }

    const municipality = await Municipality.findById(municipalityId);
    if (!municipality) {
      return res.status(404).json({
        success: false,
        message: 'Municipality not found',
      });
    }

    // Validate configuration
    const validation = ModuleHelpers.validateModuleConfiguration(
      moduleName,
      tier,
      Object.keys(features),
    );
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid module configuration',
        errors: validation.errors,
      });
    }

    // Enable the module
    const config = {
      tier,
      version,
      features,
      settings,
      permissions,
      expirationDate: expirationDate ? new Date(expirationDate) : null,
    };

    await municipality.enableModule(moduleName, config);

    const enabledModule = municipality.module_config.modules.get(moduleName);

    res.json({
      success: true,
      message: `Module ${moduleName} enabled for ${municipality.name}`,
      data: {
        module: moduleName,
        tier,
        version,
        features: Object.keys(features).filter((f) => features[f]),
        activatedDate: enabledModule.activated_date,
        expirationDate: enabledModule.expiration_date,
      },
    });
  } catch (error) {
    console.error('Error enabling module:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to enable module',
    });
  }
});

// Disable module for municipality (System Admin only)
router.post('/disable/:municipalityId', authenticateToken, async (req, res) => {
  try {
    const { municipalityId } = req.params;
    const { moduleName, reason } = req.body;

    if (!Object.values(MODULES).includes(moduleName)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid module name',
      });
    }

    const municipality = await Municipality.findById(municipalityId);
    if (!municipality) {
      return res.status(404).json({
        success: false,
        message: 'Municipality not found',
      });
    }

    await municipality.disableModule(moduleName, reason);

    res.json({
      success: true,
      message: `Module ${moduleName} disabled for ${municipality.name}`,
      data: {
        module: moduleName,
        reason: reason || null,
      },
    });
  } catch (error) {
    console.error('Error disabling module:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to disable module',
    });
  }
});

// Update module features (System Admin only)
router.put('/features/:municipalityId', authenticateToken, async (req, res) => {
  try {
    const { municipalityId } = req.params;
    const { moduleName, features } = req.body;

    const municipality = await Municipality.findById(municipalityId);
    if (!municipality) {
      return res.status(404).json({
        success: false,
        message: 'Municipality not found',
      });
    }

    if (!municipality.hasModule(moduleName)) {
      return res.status(400).json({
        success: false,
        message: 'Module must be enabled first',
      });
    }

    const tier = municipality.getModuleTier(moduleName);
    const validation = ModuleHelpers.validateModuleConfiguration(
      moduleName,
      tier,
      Object.keys(features),
    );

    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid feature configuration',
        errors: validation.errors,
      });
    }

    // Update features using the new Map-based approach
    for (const [featureName, featureConfig] of Object.entries(features)) {
      await municipality.addModuleFeature(moduleName, featureName, {
        enabled: featureConfig.enabled || false,
        tier_required: featureConfig.tier_required || tier,
        config: featureConfig.config || {},
      });
    }

    const module = municipality.module_config.modules.get(moduleName);
    const updatedFeatures = {};

    if (module?.features) {
      for (const [featureName, feature] of module.features) {
        updatedFeatures[featureName] = {
          enabled: feature.enabled,
          tier_required: feature.tier_required,
          config: feature.config,
        };
      }
    }

    res.json({
      success: true,
      message: `Features updated for ${moduleName} in ${municipality.name}`,
      data: {
        module: moduleName,
        features: updatedFeatures,
      },
    });
  } catch (error) {
    console.error('Error updating module features:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update module features',
    });
  }
});

// Get all municipalities with their module status (System Admin only)
router.get('/municipalities', authenticateToken, async (req, res) => {
  try {
    const municipalities = await Municipality.find({ isActive: true })
      .select('name code state modules')
      .sort({ name: 1 });

    const municipalityModules = municipalities.map((municipality) => ({
      id: municipality._id,
      name: municipality.name,
      code: municipality.code,
      state: municipality.state,
      enabledModules: municipality.getEnabledModules(),
    }));

    res.json({
      success: true,
      data: municipalityModules,
    });
  } catch (error) {
    console.error('Error fetching municipality modules:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch municipality modules',
    });
  }
});

module.exports = router;
