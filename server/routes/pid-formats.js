const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const PIDFormat = require('../models/PIDFormat');
const PropertyTreeNode = require('../models/PropertyTreeNode');

const router = express.Router();

// @route   GET /api/municipalities/:municipalityId/pid-format
// @desc    Get PID format configuration for municipality
// @access  Private
router.get(
  '/municipalities/:municipalityId/pid-format',
  authenticateToken,
  async (req, res) => {
    try {
      const { municipalityId } = req.params;

      // Check if user has access to this municipality
      const hasAccess =
        ['avitar_staff', 'avitar_admin'].includes(req.user.global_role) ||
        req.user.municipal_permissions?.some(
          (perm) => perm.municipality_id.toString() === municipalityId,
        );

      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: 'Access denied to this municipality',
        });
      }

      let pidFormat = await PIDFormat.findOne({
        municipality_id: municipalityId,
      });

      // Create default format if none exists
      if (!pidFormat) {
        pidFormat = await PIDFormat.createDefaultFormat(
          municipalityId,
          'standard',
        );
      }

      res.json({
        success: true,
        pid_format: pidFormat,
      });
    } catch (error) {
      console.error('Get PID format error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve PID format',
      });
    }
  },
);

// @route   PUT /api/municipalities/:municipalityId/pid-format
// @desc    Update PID format configuration for municipality
// @access  Private (Admin only)
router.put(
  '/municipalities/:municipalityId/pid-format',
  authenticateToken,
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
      const { format, display, validation, examples } = req.body;

      // Check if user has admin access to this municipality
      const hasAdminAccess =
        ['avitar_staff', 'avitar_admin'].includes(req.user.global_role) ||
        req.user.municipal_permissions?.some(
          (perm) =>
            perm.municipality_id.toString() === municipalityId &&
            perm.role === 'admin',
        );

      if (!hasAdminAccess) {
        return res.status(403).json({
          success: false,
          message: 'Administrator access required to modify PID format',
        });
      }

      let pidFormat = await PIDFormat.findOne({
        municipality_id: municipalityId,
      });

      if (pidFormat) {
        // Update existing format
        if (format) pidFormat.format = { ...pidFormat.format, ...format };
        if (display) pidFormat.display = { ...pidFormat.display, ...display };
        if (validation)
          pidFormat.validation = { ...pidFormat.validation, ...validation };
        if (examples) pidFormat.examples = examples;

        await pidFormat.save();
      } else {
        // Create new format
        pidFormat = await PIDFormat.create({
          municipality_id: municipalityId,
          format: format || {},
          display: display || {},
          validation: validation || {},
          examples: examples || [],
          created_by: req.user._id,
        });
      }

      res.json({
        success: true,
        message: 'PID format updated successfully',
        pid_format: pidFormat,
      });
    } catch (error) {
      console.error('Update PID format error:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to update PID format',
      });
    }
  },
);

// @route   POST /api/municipalities/:municipalityId/pid-format/reformat-all
// @desc    Reformat all PIDs in municipality using new format
// @access  Private (Admin only)
router.post(
  '/municipalities/:municipalityId/pid-format/reformat-all',
  authenticateToken,
  async (req, res) => {
    try {
      const { municipalityId } = req.params;

      // Check if user has admin access to this municipality
      const hasAdminAccess =
        ['avitar_staff', 'avitar_admin'].includes(req.user.global_role) ||
        req.user.municipal_permissions?.some(
          (perm) =>
            perm.municipality_id.toString() === municipalityId &&
            perm.role === 'admin',
        );

      if (!hasAdminAccess) {
        return res.status(403).json({
          success: false,
          message: 'Administrator access required to reformat PIDs',
        });
      }

      const pidFormat = await PIDFormat.findOne({
        municipality_id: municipalityId,
      });
      if (!pidFormat) {
        return res.status(404).json({
          success: false,
          message: 'PID format not found for this municipality',
        });
      }

      // Get all properties for this municipality
      const properties = await PropertyTreeNode.find({
        municipality_id: municipalityId,
      });
      let updatedCount = 0;
      let errors = [];

      // Reformat each property's PID
      for (const property of properties) {
        try {
          const newFormattedPID = pidFormat.formatPID(property.pid_raw);
          await PropertyTreeNode.findByIdAndUpdate(property._id, {
            pid_formatted: newFormattedPID,
          });
          updatedCount++;
        } catch (error) {
          errors.push({
            property_id: property._id,
            pid_raw: property.pid_raw,
            error: error.message,
          });
        }
      }

      res.json({
        success: true,
        message: `Reformatted ${updatedCount} properties`,
        updated_count: updatedCount,
        total_properties: properties.length,
        errors: errors,
      });
    } catch (error) {
      console.error('Reformat PIDs error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to reformat PIDs',
      });
    }
  },
);

// @route   POST /api/municipalities/:municipalityId/pid-format/validate
// @desc    Validate PID format configuration
// @access  Private
router.post(
  '/municipalities/:municipalityId/pid-format/validate',
  authenticateToken,
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
      const { format, test_pids } = req.body;

      // Check if user has access to this municipality
      const hasAccess =
        ['avitar_staff', 'avitar_admin'].includes(req.user.global_role) ||
        req.user.municipal_permissions?.some(
          (perm) => perm.municipality_id.toString() === municipalityId,
        );

      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: 'Access denied to this municipality',
        });
      }

      // Create a temporary format object for validation
      const tempFormat = new PIDFormat({
        municipality_id: municipalityId,
        ...format,
      });

      const results = [];
      const testPIDs = test_pids || [
        '001000001000000000',
        '001000001000000001',
        '123456789012345678',
      ];

      // Test the format with sample PIDs
      for (const pidRaw of testPIDs) {
        try {
          const formatted = tempFormat.formatPID(pidRaw);
          const parsed = tempFormat.parsePID(formatted);
          const segments = tempFormat.getSegments(pidRaw);

          results.push({
            raw_pid: pidRaw,
            formatted_pid: formatted,
            parsed_back: parsed,
            segments: segments,
            round_trip_success: pidRaw === parsed,
          });
        } catch (error) {
          results.push({
            raw_pid: pidRaw,
            error: error.message,
          });
        }
      }

      res.json({
        success: true,
        validation_results: results,
        format_summary: {
          total_digits: Object.values(tempFormat.format).reduce(
            (sum, config) => sum + (config.digits || 0),
            0,
          ),
          segments: Object.keys(tempFormat.format).filter(
            (key) => tempFormat.format[key].digits > 0,
          ),
        },
      });
    } catch (error) {
      console.error('Validate PID format error:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to validate PID format',
      });
    }
  },
);

// @route   GET /api/pid-format/presets
// @desc    Get preset PID format configurations
// @access  Private
router.get('/pid-format/presets', authenticateToken, (req, res) => {
  const presets = {
    standard: {
      name: 'Standard (6-6-6)',
      description:
        'Traditional format with 6 digits each for Map, Lot, and Sublot',
      format: {
        map: { digits: 6, position: 0, label: 'Map' },
        lot: { digits: 6, position: 6, label: 'Lot' },
        sublot: { digits: 6, position: 12, label: 'Sublot', optional: true },
      },
      display: {
        separator: '-',
        show_leading_zeros: true,
        compact_optional: true,
      },
      example: '001000-001000-000001',
    },

    complex: {
      name: 'Complex (3-4-4-3-4)',
      description:
        'Flexible format for municipalities with complex property types',
      format: {
        map: { digits: 3, position: 0, label: 'Map' },
        lot: { digits: 4, position: 3, label: 'Lot' },
        sublot: { digits: 4, position: 7, label: 'Sublot', optional: true },
        condo: { digits: 3, position: 11, label: 'Condo', optional: true },
        mobile: { digits: 4, position: 14, label: 'Mobile', optional: true },
      },
      display: {
        separator: '-',
        show_leading_zeros: true,
        compact_optional: true,
      },
      example: '001-0001-0001-001-0001',
    },

    simple: {
      name: 'Simple (9-9)',
      description: 'Simplified format with two 9-digit segments',
      format: {
        map: { digits: 9, position: 0, label: 'Map/Lot' },
        lot: { digits: 9, position: 9, label: 'Unit/Sublot' },
      },
      display: {
        separator: '-',
        show_leading_zeros: false,
        compact_optional: true,
      },
      example: '1000-1000',
    },

    massachusetts: {
      name: 'Massachusetts Style',
      description: 'Common format used in Massachusetts municipalities',
      format: {
        map: { digits: 2, position: 0, label: 'Map' },
        lot: { digits: 3, position: 2, label: 'Lot' },
        sublot: { digits: 2, position: 5, label: 'Sublot', optional: true },
        unit: { digits: 4, position: 7, label: 'Unit', optional: true },
        building: {
          digits: 3,
          position: 11,
          label: 'Building',
          optional: true,
        },
        condo: { digits: 4, position: 14, label: 'Condo', optional: true },
      },
      display: {
        separator: '-',
        show_leading_zeros: true,
        compact_optional: true,
      },
      example: '01-001-01-0001',
    },
  };

  res.json({
    success: true,
    presets: presets,
  });
});

module.exports = router;
