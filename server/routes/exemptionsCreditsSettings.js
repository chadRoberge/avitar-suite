const express = require('express');
const router = express.Router();
const ExemptionsCreditsSettings = require('../models/ExemptionsCreditsSettings');
const { authenticateToken } = require('../middleware/auth');
const { requireModuleAccess } = require('../middleware/moduleAuth');

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
      const { blindExemption, physicalHandicapExemption } = req.body;

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

module.exports = router;
