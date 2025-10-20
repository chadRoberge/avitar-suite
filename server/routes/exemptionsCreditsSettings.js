const express = require('express');
const router = express.Router();
const ExemptionsCreditsSettings = require('../models/ExemptionsCreditsSettings');
const ExemptionType = require('../models/ExemptionType');
const { authenticateToken } = require('../middleware/auth');
const { requireModuleAccess } = require('../middleware/moduleAuth');

// Helper function to update exemption type configurations
async function updateExemptionTypesConfig(municipalityId, updates, userId) {
  // Define mapping from frontend field names to exemption type names
  const fieldMapping = {
    elderly6574DisplayName: { name: 'elderly_65_74', field: 'display_name' },
    elderly6574Description: { name: 'elderly_65_74', field: 'description' },
    elderly7579DisplayName: { name: 'elderly_75_79', field: 'display_name' },
    elderly7579Description: { name: 'elderly_75_79', field: 'description' },
    elderly80plusDisplayName: {
      name: 'elderly_80_plus',
      field: 'display_name',
    },
    elderly80plusDescription: { name: 'elderly_80_plus', field: 'description' },
    blindDisplayName: { name: 'blind_exemption', field: 'display_name' },
    blindDescription: { name: 'blind_exemption', field: 'description' },
    physicalHandicapDisplayName: {
      name: 'disabled_exemption',
      field: 'display_name',
    },
    physicalHandicapDescription: {
      name: 'disabled_exemption',
      field: 'description',
    },
    veteranDisplayName: { name: 'veteran_standard', field: 'display_name' },
    veteranDescription: { name: 'veteran_standard', field: 'description' },
    allVeteranDisplayName: { name: 'veteran_all', field: 'display_name' },
    allVeteranDescription: { name: 'veteran_all', field: 'description' },
    disabledVeteranDisplayName: {
      name: 'veteran_disabled',
      field: 'display_name',
    },
    disabledVeteranDescription: {
      name: 'veteran_disabled',
      field: 'description',
    },
    survivingSpouseDisplayName: {
      name: 'veteran_surviving_spouse',
      field: 'display_name',
    },
    survivingSpouseDescription: {
      name: 'veteran_surviving_spouse',
      field: 'description',
    },
  };

  // Process each update
  const updatePromises = [];

  for (const [fieldName, value] of Object.entries(updates)) {
    if (value !== undefined && fieldMapping[fieldName]) {
      const { name, field } = fieldMapping[fieldName];

      // Find or create exemption type
      const updatePromise = ExemptionType.findOneAndUpdate(
        {
          municipality_id: municipalityId,
          name: name,
        },
        {
          $set: {
            [field]: value,
            updated_by: userId,
            updated_at: new Date(),
          },
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        },
      );

      updatePromises.push(updatePromise);
    }
  }

  await Promise.all(updatePromises);
}

// Helper function to update elderly exemption income/asset requirements
async function updateElderlyExemptionRequirements(
  municipalityId,
  elderlyLimits,
  userId,
) {
  const elderlyExemptionTypes = [
    'elderly_65_74',
    'elderly_75_79',
    'elderly_80_plus',
  ];

  const updatePromises = elderlyExemptionTypes.map((exemptionTypeName) => {
    return ExemptionType.findOneAndUpdate(
      {
        municipality_id: municipalityId,
        name: exemptionTypeName,
      },
      {
        $set: {
          'income_requirements.has_income_limit': true,
          'income_requirements.single_income_limit':
            elderlyLimits.singleIncomeLimit || 0,
          'income_requirements.married_income_limit':
            elderlyLimits.marriedIncomeLimit || 0,
          'asset_requirements.has_asset_limit': true,
          'asset_requirements.single_asset_limit':
            elderlyLimits.singleAssetLimit || 0,
          'asset_requirements.married_asset_limit':
            elderlyLimits.marriedAssetLimit || 0,
          updated_by: userId,
          updated_at: new Date(),
        },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      },
    );
  });

  await Promise.all(updatePromises);
}

// GET /api/municipalities/:municipalityId/exemptions-credits-settings - Get exemptions and credits settings
router.get(
  '/municipalities/:municipalityId/exemptions-credits-settings',
  authenticateToken,
  requireModuleAccess('assessing'),
  async (req, res) => {
    try {
      const { municipalityId } = req.params;

      let settings = await ExemptionsCreditsSettings.findOne({
        municipalityId,
      });

      // Create default settings if none exist
      if (!settings) {
        settings = new ExemptionsCreditsSettings({
          municipalityId,
          elderlyExemptions: {
            elderly6574: 0,
            elderly7579: 0,
            elderly80plus: 0,
          },
          elderlyLimits: {
            singleIncomeLimit: 0,
            marriedIncomeLimit: 0,
            singleAssetLimit: 0,
            marriedAssetLimit: 0,
          },
          disabilityExemptions: {
            blindExemption: 0,
            physicalHandicapExemption: 0,
          },
          veteranCredits: {
            veteranCredit: 0,
            allVeteranCredit: 0,
            disabledVeteranCredit: 0,
            survivingSpouseCredit: 0,
          },
          institutionalExemptions: {
            religious: [],
            educational: [],
            charitable: [],
          },
          createdBy: req.user.id,
        });
        await settings.save();
      }

      res.json({ settings });
    } catch (error) {
      console.error('Error fetching exemptions/credits settings:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// PUT /api/municipalities/:municipalityId/exemptions-credits-settings/elderly - Update elderly exemptions and limits
router.put(
  '/municipalities/:municipalityId/exemptions-credits-settings/elderly',
  authenticateToken,
  requireModuleAccess('assessing'),
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
      const {
        elderly6574,
        elderly7579,
        elderly80plus,
        singleIncomeLimit,
        marriedIncomeLimit,
        singleAssetLimit,
        marriedAssetLimit,
        // New exemption type configuration fields
        elderly6574DisplayName,
        elderly6574Description,
        elderly7579DisplayName,
        elderly7579Description,
        elderly80plusDisplayName,
        elderly80plusDescription,
      } = req.body;

      // Validation - all values must be non-negative numbers if provided
      const numericFields = {
        elderly6574,
        elderly7579,
        elderly80plus,
        singleIncomeLimit,
        marriedIncomeLimit,
        singleAssetLimit,
        marriedAssetLimit,
      };

      for (const [field, value] of Object.entries(numericFields)) {
        if (value !== undefined) {
          const numValue = Number(value);
          if (isNaN(numValue) || numValue < 0) {
            return res.status(400).json({
              error: `${field} must be a non-negative number`,
            });
          }
        }
      }

      let settings = await ExemptionsCreditsSettings.findOne({
        municipalityId,
      });

      if (!settings) {
        settings = new ExemptionsCreditsSettings({
          municipalityId,
          createdBy: req.user.id,
        });
      }

      // Update elderly exemptions
      if (elderly6574 !== undefined)
        settings.elderlyExemptions.elderly6574 = Number(elderly6574);
      if (elderly7579 !== undefined)
        settings.elderlyExemptions.elderly7579 = Number(elderly7579);
      if (elderly80plus !== undefined)
        settings.elderlyExemptions.elderly80plus = Number(elderly80plus);

      // Update elderly limits
      if (singleIncomeLimit !== undefined)
        settings.elderlyLimits.singleIncomeLimit = Number(singleIncomeLimit);
      if (marriedIncomeLimit !== undefined)
        settings.elderlyLimits.marriedIncomeLimit = Number(marriedIncomeLimit);
      if (singleAssetLimit !== undefined)
        settings.elderlyLimits.singleAssetLimit = Number(singleAssetLimit);
      if (marriedAssetLimit !== undefined)
        settings.elderlyLimits.marriedAssetLimit = Number(marriedAssetLimit);

      settings.updatedBy = req.user.id;
      await settings.save();

      // Also update exemption type configurations if provided
      const exemptionTypeUpdates = {};
      if (elderly6574DisplayName !== undefined)
        exemptionTypeUpdates.elderly6574DisplayName = elderly6574DisplayName;
      if (elderly6574Description !== undefined)
        exemptionTypeUpdates.elderly6574Description = elderly6574Description;
      if (elderly7579DisplayName !== undefined)
        exemptionTypeUpdates.elderly7579DisplayName = elderly7579DisplayName;
      if (elderly7579Description !== undefined)
        exemptionTypeUpdates.elderly7579Description = elderly7579Description;
      if (elderly80plusDisplayName !== undefined)
        exemptionTypeUpdates.elderly80plusDisplayName =
          elderly80plusDisplayName;
      if (elderly80plusDescription !== undefined)
        exemptionTypeUpdates.elderly80plusDescription =
          elderly80plusDescription;

      if (Object.keys(exemptionTypeUpdates).length > 0) {
        // Call the internal function to update exemption types
        await updateExemptionTypesConfig(
          municipalityId,
          exemptionTypeUpdates,
          req.user.id,
        );
      }

      // Also update income/asset requirements for elderly exemption types
      await updateElderlyExemptionRequirements(
        municipalityId,
        settings.elderlyLimits,
        req.user.id,
      );

      res.json({
        success: true,
        message: 'Elderly exemption settings updated successfully',
        settings: {
          elderlyExemptions: settings.elderlyExemptions,
          elderlyLimits: settings.elderlyLimits,
        },
      });
    } catch (error) {
      console.error('Error updating elderly settings:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// PUT /api/municipalities/:municipalityId/exemptions-credits-settings/disability - Update disability exemptions
router.put(
  '/municipalities/:municipalityId/exemptions-credits-settings/disability',
  authenticateToken,
  requireModuleAccess('assessing'),
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
      const {
        blindExemption,
        physicalHandicapExemption,
        // New exemption type configuration fields
        blindDisplayName,
        blindDescription,
        physicalHandicapDisplayName,
        physicalHandicapDescription,
      } = req.body;

      // Validation
      const numericFields = { blindExemption, physicalHandicapExemption };

      for (const [field, value] of Object.entries(numericFields)) {
        if (value !== undefined) {
          const numValue = Number(value);
          if (isNaN(numValue) || numValue < 0) {
            return res.status(400).json({
              error: `${field} must be a non-negative number`,
            });
          }
        }
      }

      let settings = await ExemptionsCreditsSettings.findOne({
        municipalityId,
      });

      if (!settings) {
        settings = new ExemptionsCreditsSettings({
          municipalityId,
          createdBy: req.user.id,
        });
      }

      // Update disability exemptions
      if (blindExemption !== undefined)
        settings.disabilityExemptions.blindExemption = Number(blindExemption);
      if (physicalHandicapExemption !== undefined)
        settings.disabilityExemptions.physicalHandicapExemption = Number(
          physicalHandicapExemption,
        );

      settings.updatedBy = req.user.id;
      await settings.save();

      // Also update exemption type configurations if provided
      const exemptionTypeUpdates = {};
      if (blindDisplayName !== undefined)
        exemptionTypeUpdates.blindDisplayName = blindDisplayName;
      if (blindDescription !== undefined)
        exemptionTypeUpdates.blindDescription = blindDescription;
      if (physicalHandicapDisplayName !== undefined)
        exemptionTypeUpdates.physicalHandicapDisplayName =
          physicalHandicapDisplayName;
      if (physicalHandicapDescription !== undefined)
        exemptionTypeUpdates.physicalHandicapDescription =
          physicalHandicapDescription;

      if (Object.keys(exemptionTypeUpdates).length > 0) {
        await updateExemptionTypesConfig(
          municipalityId,
          exemptionTypeUpdates,
          req.user.id,
        );
      }

      res.json({
        success: true,
        message: 'Disability exemption settings updated successfully',
        settings: {
          disabilityExemptions: settings.disabilityExemptions,
        },
      });
    } catch (error) {
      console.error('Error updating disability settings:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// PUT /api/municipalities/:municipalityId/exemptions-credits-settings/veteran - Update veteran credits
router.put(
  '/municipalities/:municipalityId/exemptions-credits-settings/veteran',
  authenticateToken,
  requireModuleAccess('assessing'),
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
      const {
        veteranCredit,
        allVeteranCredit,
        disabledVeteranCredit,
        survivingSpouseCredit,
        // New exemption type configuration fields
        veteranDisplayName,
        veteranDescription,
        allVeteranDisplayName,
        allVeteranDescription,
        disabledVeteranDisplayName,
        disabledVeteranDescription,
        survivingSpouseDisplayName,
        survivingSpouseDescription,
      } = req.body;

      // Validation
      const numericFields = {
        veteranCredit,
        allVeteranCredit,
        disabledVeteranCredit,
        survivingSpouseCredit,
      };

      for (const [field, value] of Object.entries(numericFields)) {
        if (value !== undefined) {
          const numValue = Number(value);
          if (isNaN(numValue) || numValue < 0) {
            return res.status(400).json({
              error: `${field} must be a non-negative number`,
            });
          }
        }
      }

      let settings = await ExemptionsCreditsSettings.findOne({
        municipalityId,
      });

      if (!settings) {
        settings = new ExemptionsCreditsSettings({
          municipalityId,
          createdBy: req.user.id,
        });
      }

      // Update veteran credits
      if (veteranCredit !== undefined)
        settings.veteranCredits.veteranCredit = Number(veteranCredit);
      if (allVeteranCredit !== undefined)
        settings.veteranCredits.allVeteranCredit = Number(allVeteranCredit);
      if (disabledVeteranCredit !== undefined)
        settings.veteranCredits.disabledVeteranCredit = Number(
          disabledVeteranCredit,
        );
      if (survivingSpouseCredit !== undefined)
        settings.veteranCredits.survivingSpouseCredit = Number(
          survivingSpouseCredit,
        );

      settings.updatedBy = req.user.id;
      await settings.save();

      // Also update exemption type configurations if provided
      const exemptionTypeUpdates = {};
      if (veteranDisplayName !== undefined)
        exemptionTypeUpdates.veteranDisplayName = veteranDisplayName;
      if (veteranDescription !== undefined)
        exemptionTypeUpdates.veteranDescription = veteranDescription;
      if (allVeteranDisplayName !== undefined)
        exemptionTypeUpdates.allVeteranDisplayName = allVeteranDisplayName;
      if (allVeteranDescription !== undefined)
        exemptionTypeUpdates.allVeteranDescription = allVeteranDescription;
      if (disabledVeteranDisplayName !== undefined)
        exemptionTypeUpdates.disabledVeteranDisplayName =
          disabledVeteranDisplayName;
      if (disabledVeteranDescription !== undefined)
        exemptionTypeUpdates.disabledVeteranDescription =
          disabledVeteranDescription;
      if (survivingSpouseDisplayName !== undefined)
        exemptionTypeUpdates.survivingSpouseDisplayName =
          survivingSpouseDisplayName;
      if (survivingSpouseDescription !== undefined)
        exemptionTypeUpdates.survivingSpouseDescription =
          survivingSpouseDescription;

      if (Object.keys(exemptionTypeUpdates).length > 0) {
        await updateExemptionTypesConfig(
          municipalityId,
          exemptionTypeUpdates,
          req.user.id,
        );
      }

      res.json({
        success: true,
        message: 'Veteran credit settings updated successfully',
        settings: {
          veteranCredits: settings.veteranCredits,
        },
      });
    } catch (error) {
      console.error('Error updating veteran settings:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// PUT /api/municipalities/:municipalityId/exemptions-credits-settings/institutional - Update institutional exemptions
router.put(
  '/municipalities/:municipalityId/exemptions-credits-settings/institutional',
  authenticateToken,
  requireModuleAccess('assessing'),
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
      const { religious, educational, charitable } = req.body;

      // Validation - ensure each category has required fields
      const validateCategories = (categories, type) => {
        if (!Array.isArray(categories)) {
          throw new Error(`${type} must be an array`);
        }
        for (const category of categories) {
          if (
            !category.name ||
            typeof category.name !== 'string' ||
            !category.name.trim()
          ) {
            throw new Error(`Each ${type} category must have a non-empty name`);
          }
        }
      };

      try {
        if (religious) validateCategories(religious, 'religious');
        if (educational) validateCategories(educational, 'educational');
        if (charitable) validateCategories(charitable, 'charitable');
      } catch (validationError) {
        return res.status(400).json({
          error: validationError.message,
        });
      }

      let settings = await ExemptionsCreditsSettings.findOne({
        municipalityId,
      });

      if (!settings) {
        settings = new ExemptionsCreditsSettings({
          municipalityId,
          createdBy: req.user.id,
        });
      }

      // Update institutional exemptions
      if (religious !== undefined) {
        settings.institutionalExemptions.religious = religious.map((cat) => ({
          name: cat.name.trim(),
        }));
      }
      if (educational !== undefined) {
        settings.institutionalExemptions.educational = educational.map(
          (cat) => ({
            name: cat.name.trim(),
          }),
        );
      }
      if (charitable !== undefined) {
        settings.institutionalExemptions.charitable = charitable.map((cat) => ({
          name: cat.name.trim(),
        }));
      }

      settings.updatedBy = req.user.id;
      await settings.save();

      res.json({
        success: true,
        message: 'Institutional exemption settings updated successfully',
        settings: {
          institutionalExemptions: settings.institutionalExemptions,
        },
      });
    } catch (error) {
      console.error('Error updating institutional settings:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// GET /api/municipalities/:municipalityId/exemption-types-config - Get exemption type configurations
router.get(
  '/municipalities/:municipalityId/exemption-types-config',
  authenticateToken,
  requireModuleAccess('assessing'),
  async (req, res) => {
    try {
      const { municipalityId } = req.params;

      // Get all exemption types for this municipality
      const exemptionTypes = await ExemptionType.find({
        municipality_id: municipalityId,
        is_active: true,
      });

      // Transform the data to match the expected format
      const exemptionTypesConfig = {};

      exemptionTypes.forEach((exemptionType) => {
        // Map to the field names expected by the frontend
        switch (exemptionType.name) {
          case 'elderly_65_74':
            exemptionTypesConfig.elderly6574DisplayName =
              exemptionType.display_name;
            exemptionTypesConfig.elderly6574Description =
              exemptionType.description;
            // Include income/asset requirements for elderly exemptions
            if (exemptionType.income_requirements) {
              exemptionTypesConfig.elderly6574IncomeRequirements =
                exemptionType.income_requirements;
            }
            if (exemptionType.asset_requirements) {
              exemptionTypesConfig.elderly6574AssetRequirements =
                exemptionType.asset_requirements;
            }
            break;
          case 'elderly_75_79':
            exemptionTypesConfig.elderly7579DisplayName =
              exemptionType.display_name;
            exemptionTypesConfig.elderly7579Description =
              exemptionType.description;
            if (exemptionType.income_requirements) {
              exemptionTypesConfig.elderly7579IncomeRequirements =
                exemptionType.income_requirements;
            }
            if (exemptionType.asset_requirements) {
              exemptionTypesConfig.elderly7579AssetRequirements =
                exemptionType.asset_requirements;
            }
            break;
          case 'elderly_80_plus':
            exemptionTypesConfig.elderly80plusDisplayName =
              exemptionType.display_name;
            exemptionTypesConfig.elderly80plusDescription =
              exemptionType.description;
            if (exemptionType.income_requirements) {
              exemptionTypesConfig.elderly80plusIncomeRequirements =
                exemptionType.income_requirements;
            }
            if (exemptionType.asset_requirements) {
              exemptionTypesConfig.elderly80plusAssetRequirements =
                exemptionType.asset_requirements;
            }
            break;
          case 'blind_exemption':
            exemptionTypesConfig.blindDisplayName = exemptionType.display_name;
            exemptionTypesConfig.blindDescription = exemptionType.description;
            break;
          case 'disabled_exemption':
            exemptionTypesConfig.physicalHandicapDisplayName =
              exemptionType.display_name;
            exemptionTypesConfig.physicalHandicapDescription =
              exemptionType.description;
            break;
          case 'veteran_standard':
            exemptionTypesConfig.veteranDisplayName =
              exemptionType.display_name;
            exemptionTypesConfig.veteranDescription = exemptionType.description;
            break;
          case 'veteran_all':
            exemptionTypesConfig.allVeteranDisplayName =
              exemptionType.display_name;
            exemptionTypesConfig.allVeteranDescription =
              exemptionType.description;
            break;
          case 'veteran_disabled':
            exemptionTypesConfig.disabledVeteranDisplayName =
              exemptionType.display_name;
            exemptionTypesConfig.disabledVeteranDescription =
              exemptionType.description;
            break;
          case 'veteran_surviving_spouse':
            exemptionTypesConfig.survivingSpouseDisplayName =
              exemptionType.display_name;
            exemptionTypesConfig.survivingSpouseDescription =
              exemptionType.description;
            break;
        }
      });

      res.json({ exemptionTypes: exemptionTypesConfig });
    } catch (error) {
      console.error('Error fetching exemption types config:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// PUT /api/municipalities/:municipalityId/exemption-types-config - Update exemption type configurations
router.put(
  '/municipalities/:municipalityId/exemption-types-config',
  authenticateToken,
  requireModuleAccess('assessing'),
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
      const updates = req.body;

      await updateExemptionTypesConfig(municipalityId, updates, req.user.id);

      res.json({
        success: true,
        message: 'Exemption type configurations updated successfully',
      });
    } catch (error) {
      console.error('Error updating exemption types config:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

module.exports = router;
