const express = require('express');
const router = express.Router();
const ExemptionType = require('../models/ExemptionType');
const { authenticateToken } = require('../middleware/auth');
const { requireModuleAccess } = require('../middleware/moduleAuth');

// GET /api/municipalities/:municipalityId/exemption-types - Get all exemption types for municipality
router.get(
  '/municipalities/:municipalityId/exemption-types',
  authenticateToken,
  requireModuleAccess('assessing'),
  async (req, res) => {
    try {
      const { municipalityId } = req.params;

      const exemptionTypes = await ExemptionType.find({
        municipality_id: municipalityId,
        is_active: true,
      }).sort({ sort_order: 1, category: 1, subcategory: 1 });

      // Group by category for easier frontend consumption
      const grouped = {};
      exemptionTypes.forEach((exemptionType) => {
        if (!grouped[exemptionType.category]) {
          grouped[exemptionType.category] = [];
        }
        grouped[exemptionType.category].push(exemptionType);
      });

      res.json({
        exemptionTypes,
        grouped,
      });
    } catch (error) {
      console.error('Error fetching exemption types:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// PUT /api/municipalities/:municipalityId/exemption-types/settings - Update exemption type settings (backwards compatibility)
router.put(
  '/municipalities/:municipalityId/exemption-types/settings',
  authenticateToken,
  requireModuleAccess('assessing'),
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
      const updates = req.body;

      const exemptionTypeUpdates = mapFrontendUpdatesToExemptionTypes(updates);

      // Group updates by exemption type name
      const groupedUpdates = {};
      exemptionTypeUpdates.forEach(({ name, field, value }) => {
        if (!groupedUpdates[name]) {
          groupedUpdates[name] = {};
        }

        // Handle nested field paths
        if (field.includes('.')) {
          const [parentField, childField] = field.split('.');
          if (!groupedUpdates[name][parentField]) {
            groupedUpdates[name][parentField] = {};
          }
          groupedUpdates[name][parentField][childField] = value;
        } else {
          groupedUpdates[name][field] = value;
        }
      });

      // Update each exemption type (only update existing, don't create new ones)
      const updatePromises = Object.entries(groupedUpdates).map(
        async ([name, updateData]) => {
          // First check if the exemption type exists
          const existingExemptionType = await ExemptionType.findOne({
            municipality_id: municipalityId,
            name: name,
          });

          if (existingExemptionType) {
            // Update existing exemption type
            return ExemptionType.findOneAndUpdate(
              {
                municipality_id: municipalityId,
                name: name,
              },
              {
                $set: {
                  ...updateData,
                  updated_by: req.user.id,
                  updated_at: new Date(),
                },
              },
              {
                new: true,
              },
            );
          } else {
            // Log that exemption type doesn't exist and needs to be created
            console.warn(
              `Exemption type '${name}' not found for municipality ${municipalityId}. Run migration script first.`,
            );
            return null;
          }
        },
      );

      await Promise.all(updatePromises);

      res.json({
        success: true,
        message: 'Exemption type settings updated successfully',
      });
    } catch (error) {
      console.error('Error updating exemption type settings:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// PUT /api/municipalities/:municipalityId/exemption-types/institutional - Update institutional exemptions
router.put(
  '/municipalities/:municipalityId/exemption-types/institutional',
  authenticateToken,
  requireModuleAccess('assessing'),
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
      const { religious = [], educational = [], charitable = [] } = req.body;

      console.log('Institutional exemptions update request:', {
        municipalityId,
        religious,
        educational,
        charitable,
      });

      // Remove existing institutional exemptions for this municipality
      const deleteResult = await ExemptionType.deleteMany({
        municipality_id: municipalityId,
        category: { $in: ['institutional'] },
        subcategory: { $in: ['religious', 'educational', 'charitable'] },
      });

      console.log(
        'Deleted existing institutional exemptions:',
        deleteResult.deletedCount,
      );

      const exemptionTypesToCreate = [];

      // Process religious exemptions
      religious.forEach((item, index) => {
        if (item.name && item.name.trim()) {
          exemptionTypesToCreate.push({
            municipality_id: municipalityId,
            name: `religious_${index}_${item.name.toLowerCase().replace(/\s+/g, '_')}`,
            display_name: item.name,
            description: `Religious exemption for ${item.name}`,
            category: 'institutional',
            subcategory: 'religious',
            exemption_type: 'exemption',
            calculation_method: 'user_entered_amount',
            default_exemption_value: item.amount || 0,
            min_exemption_amount: 0,
            is_active: true,
            sort_order: index + 1,
            created_by: req.user.id,
            updated_by: req.user.id,
          });
        }
      });

      // Process educational exemptions
      educational.forEach((item, index) => {
        if (item.name && item.name.trim()) {
          exemptionTypesToCreate.push({
            municipality_id: municipalityId,
            name: `educational_${index}_${item.name.toLowerCase().replace(/\s+/g, '_')}`,
            display_name: item.name,
            description: `Educational exemption for ${item.name}`,
            category: 'institutional',
            subcategory: 'educational',
            exemption_type: 'exemption',
            calculation_method: 'user_entered_amount',
            default_exemption_value: item.amount || 0,
            min_exemption_amount: 0,
            is_active: true,
            sort_order: index + 1,
            created_by: req.user.id,
            updated_by: req.user.id,
          });
        }
      });

      // Process charitable exemptions
      charitable.forEach((item, index) => {
        if (item.name && item.name.trim()) {
          exemptionTypesToCreate.push({
            municipality_id: municipalityId,
            name: `charitable_${index}_${item.name.toLowerCase().replace(/\s+/g, '_')}`,
            display_name: item.name,
            description: `Charitable exemption for ${item.name}`,
            category: 'institutional',
            subcategory: 'charitable',
            exemption_type: 'exemption',
            calculation_method: 'user_entered_amount',
            default_exemption_value: item.amount || 0,
            min_exemption_amount: 0,
            is_active: true,
            sort_order: index + 1,
            created_by: req.user.id,
            updated_by: req.user.id,
          });
        }
      });

      // Create all new exemption types
      if (exemptionTypesToCreate.length > 0) {
        console.log(
          'Creating new institutional exemptions:',
          exemptionTypesToCreate.length,
        );
        await ExemptionType.insertMany(exemptionTypesToCreate);
      }

      res.json({
        success: true,
        message: 'Institutional exemption types updated successfully',
        created: exemptionTypesToCreate.length,
      });
    } catch (error) {
      console.error('Error updating institutional exemption types:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// PUT /api/municipalities/:municipalityId/exemption-types/:exemptionTypeId - Update exemption type
router.put(
  '/municipalities/:municipalityId/exemption-types/:exemptionTypeId',
  authenticateToken,
  requireModuleAccess('assessing'),
  async (req, res) => {
    try {
      const { municipalityId, exemptionTypeId } = req.params;
      const updates = req.body;

      // Validate that the exemption type belongs to this municipality
      const exemptionType = await ExemptionType.findOne({
        _id: exemptionTypeId,
        municipality_id: municipalityId,
      });

      if (!exemptionType) {
        return res.status(404).json({ error: 'Exemption type not found' });
      }

      // Update the exemption type
      const updatedExemptionType = await ExemptionType.findByIdAndUpdate(
        exemptionTypeId,
        {
          ...updates,
          updated_by: req.user.id,
          updated_at: new Date(),
        },
        { new: true },
      );

      res.json({
        success: true,
        message: 'Exemption type updated successfully',
        exemptionType: updatedExemptionType,
      });
    } catch (error) {
      console.error('Error updating exemption type:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// POST /api/municipalities/:municipalityId/exemption-types/initialize - Initialize base exemption types
router.post(
  '/municipalities/:municipalityId/exemption-types/initialize',
  authenticateToken,
  requireModuleAccess('assessing'),
  async (req, res) => {
    try {
      const { municipalityId } = req.params;

      // Define the base exemption types that should exist
      const baseExemptionTypes = [
        {
          name: 'elderly_65_74',
          display_name: 'Elderly Exemption (65-74)',
          description:
            'Property tax exemption for elderly residents aged 65-74',
          category: 'elderly',
          subcategory: '65_74',
          exemption_type: 'exemption',
          calculation_method: 'fixed_amount',
          default_exemption_value: 0,
          sort_order: 1,
        },
        {
          name: 'elderly_75_79',
          display_name: 'Elderly Exemption (75-79)',
          description:
            'Property tax exemption for elderly residents aged 75-79',
          category: 'elderly',
          subcategory: '75_79',
          exemption_type: 'exemption',
          calculation_method: 'fixed_amount',
          default_exemption_value: 0,
          sort_order: 2,
        },
        {
          name: 'elderly_80_plus',
          display_name: 'Elderly Exemption (80+)',
          description:
            'Property tax exemption for elderly residents aged 80 and above',
          category: 'elderly',
          subcategory: '80_plus',
          exemption_type: 'exemption',
          calculation_method: 'fixed_amount',
          default_exemption_value: 0,
          sort_order: 3,
        },
        {
          name: 'blind_exemption',
          display_name: 'Blind Exemption',
          description: 'Property tax exemption for legally blind residents',
          category: 'blind',
          subcategory: 'standard',
          exemption_type: 'exemption',
          calculation_method: 'fixed_amount',
          default_exemption_value: 0,
          sort_order: 1,
        },
        {
          name: 'disabled_exemption',
          display_name: 'Physical Handicap Exemption',
          description:
            'Property tax exemption for residents with physical disabilities',
          category: 'disabled',
          subcategory: 'standard',
          exemption_type: 'exemption',
          calculation_method: 'fixed_amount',
          default_exemption_value: 0,
          sort_order: 1,
        },
        {
          name: 'veteran_standard',
          display_name: 'Standard Veteran Credit',
          description: 'Tax credit for qualified veterans',
          category: 'veteran',
          subcategory: 'standard',
          exemption_type: 'credit',
          calculation_method: 'fixed_amount',
          default_credit_value: 0,
          sort_order: 1,
        },
        {
          name: 'veteran_all',
          display_name: 'All Veteran Credit',
          description:
            'Enhanced tax credit for veterans who served in multiple conflicts',
          category: 'veteran',
          subcategory: 'all',
          exemption_type: 'credit',
          calculation_method: 'fixed_amount',
          default_credit_value: 0,
          sort_order: 2,
        },
        {
          name: 'veteran_disabled',
          display_name: 'Disabled Veteran Credit',
          description:
            'Tax credit for veterans with service-connected disabilities',
          category: 'veteran',
          subcategory: 'disabled',
          exemption_type: 'credit',
          calculation_method: 'fixed_amount',
          default_credit_value: 0,
          sort_order: 3,
        },
        {
          name: 'veteran_surviving_spouse',
          display_name: 'Surviving Spouse Credit',
          description:
            'Tax credit for unmarried surviving spouses of qualified veterans',
          category: 'veteran',
          subcategory: 'surviving_spouse',
          exemption_type: 'credit',
          calculation_method: 'fixed_amount',
          default_credit_value: 0,
          sort_order: 4,
        },
      ];

      let created = 0;
      let existing = 0;

      // Create each exemption type if it doesn't exist
      for (const exemptionTypeData of baseExemptionTypes) {
        const existingExemptionType = await ExemptionType.findOne({
          municipality_id: municipalityId,
          name: exemptionTypeData.name,
        });

        if (!existingExemptionType) {
          const newExemptionType = new ExemptionType({
            ...exemptionTypeData,
            municipality_id: municipalityId,
            is_active: true,
            created_by: req.user.id,
            updated_by: req.user.id,
          });
          await newExemptionType.save();
          created++;
        } else {
          existing++;
        }
      }

      res.json({
        success: true,
        message: `Exemption types initialized: ${created} created, ${existing} already existed`,
        created,
        existing,
      });
    } catch (error) {
      console.error('Error initializing exemption types:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// POST /api/municipalities/:municipalityId/exemption-types - Create a new exemption type
router.post(
  '/municipalities/:municipalityId/exemption-types',
  authenticateToken,
  requireModuleAccess('assessing'),
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
      const exemptionTypeData = req.body;

      // Create new exemption type
      const newExemptionType = new ExemptionType({
        ...exemptionTypeData,
        municipality_id: municipalityId,
        created_by: req.user.id,
        updated_by: req.user.id,
      });

      await newExemptionType.save();

      res.status(201).json({
        success: true,
        message: 'Exemption type created successfully',
        exemptionType: newExemptionType,
      });
    } catch (error) {
      console.error('Error creating exemption type:', error);
      if (error.name === 'ValidationError') {
        return res.status(400).json({
          error: 'Validation error',
          details: error.message,
        });
      }
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// PATCH /api/municipalities/:municipalityId/exemption-types/bulk-update - Update multiple exemption types
router.patch(
  '/municipalities/:municipalityId/exemption-types/bulk-update',
  authenticateToken,
  requireModuleAccess('assessing'),
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
      const { updates } = req.body; // Array of { exemptionTypeId, data }

      if (!Array.isArray(updates)) {
        return res.status(400).json({ error: 'Updates must be an array' });
      }

      const updatePromises = updates.map(({ exemptionTypeId, data }) => {
        return ExemptionType.findOneAndUpdate(
          {
            _id: exemptionTypeId,
            municipality_id: municipalityId,
          },
          {
            ...data,
            updated_by: req.user.id,
            updated_at: new Date(),
          },
          { new: true },
        );
      });

      const updatedExemptionTypes = await Promise.all(updatePromises);

      res.json({
        success: true,
        message: 'Exemption types updated successfully',
        exemptionTypes: updatedExemptionTypes,
      });
    } catch (error) {
      console.error('Error bulk updating exemption types:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// Helper function to map frontend field names to exemption type names and fields
function mapFrontendUpdatesToExemptionTypes(updates) {
  const exemptionTypeUpdates = [];

  const fieldMapping = {
    // Elderly exemptions
    elderly6574: { name: 'elderly_65_74', field: 'default_exemption_value' },
    elderly6574DisplayName: { name: 'elderly_65_74', field: 'display_name' },
    elderly6574Description: { name: 'elderly_65_74', field: 'description' },
    elderly7579: { name: 'elderly_75_79', field: 'default_exemption_value' },
    elderly7579DisplayName: { name: 'elderly_75_79', field: 'display_name' },
    elderly7579Description: { name: 'elderly_75_79', field: 'description' },
    elderly80plus: {
      name: 'elderly_80_plus',
      field: 'default_exemption_value',
    },
    elderly80plusDisplayName: {
      name: 'elderly_80_plus',
      field: 'display_name',
    },
    elderly80plusDescription: { name: 'elderly_80_plus', field: 'description' },

    // Income/Asset limits for elderly
    singleIncomeLimit: {
      name: ['elderly_65_74', 'elderly_75_79', 'elderly_80_plus'],
      field: 'income_requirements.single_income_limit',
    },
    marriedIncomeLimit: {
      name: ['elderly_65_74', 'elderly_75_79', 'elderly_80_plus'],
      field: 'income_requirements.married_income_limit',
    },
    singleAssetLimit: {
      name: ['elderly_65_74', 'elderly_75_79', 'elderly_80_plus'],
      field: 'asset_requirements.single_asset_limit',
    },
    marriedAssetLimit: {
      name: ['elderly_65_74', 'elderly_75_79', 'elderly_80_plus'],
      field: 'asset_requirements.married_asset_limit',
    },

    // Disability exemptions
    blindExemption: {
      name: 'blind_exemption',
      field: 'default_exemption_value',
    },
    blindDisplayName: { name: 'blind_exemption', field: 'display_name' },
    blindDescription: { name: 'blind_exemption', field: 'description' },
    physicalHandicapExemption: {
      name: 'disabled_exemption',
      field: 'default_exemption_value',
    },
    physicalHandicapDisplayName: {
      name: 'disabled_exemption',
      field: 'display_name',
    },
    physicalHandicapDescription: {
      name: 'disabled_exemption',
      field: 'description',
    },

    // Veteran credits
    veteranCredit: { name: 'veteran_standard', field: 'default_credit_value' },
    veteranDisplayName: { name: 'veteran_standard', field: 'display_name' },
    veteranDescription: { name: 'veteran_standard', field: 'description' },
    allVeteranCredit: { name: 'veteran_all', field: 'default_credit_value' },
    allVeteranDisplayName: { name: 'veteran_all', field: 'display_name' },
    allVeteranDescription: { name: 'veteran_all', field: 'description' },
    disabledVeteranCredit: {
      name: 'veteran_disabled',
      field: 'default_credit_value',
    },
    disabledVeteranDisplayName: {
      name: 'veteran_disabled',
      field: 'display_name',
    },
    disabledVeteranDescription: {
      name: 'veteran_disabled',
      field: 'description',
    },
    survivingSpouseCredit: {
      name: 'veteran_surviving_spouse',
      field: 'default_credit_value',
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

  for (const [frontendField, value] of Object.entries(updates)) {
    if (value !== undefined && fieldMapping[frontendField]) {
      const mapping = fieldMapping[frontendField];
      const names = Array.isArray(mapping.name) ? mapping.name : [mapping.name];

      names.forEach((name) => {
        exemptionTypeUpdates.push({
          name,
          field: mapping.field,
          value,
        });
      });
    }
  }

  return exemptionTypeUpdates;
}

module.exports = router;
