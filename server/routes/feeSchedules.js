const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const FeeSchedule = require('../models/FeeSchedule');
const PermitType = require('../models/PermitType');
const Municipality = require('../models/Municipality');

/**
 * Fee Schedules API Routes
 *
 * Provides versioned fee schedule management for building permits
 * with full audit trail and scheduled activation support.
 */

// ============================================================================
// Middleware
// ============================================================================

/**
 * Verify user has access to the municipality
 */
const verifyMunicipalityAccess = async (req, res, next) => {
  try {
    const { municipalityId } = req.params;

    const municipality = await Municipality.findById(municipalityId);
    if (!municipality) {
      return res.status(404).json({ error: 'Municipality not found' });
    }

    // Check if user has access to this municipality
    const user = req.user;
    const hasAccess =
      user.role === 'avitar_admin' ||
      user.role === 'avitar_staff' ||
      (user.municipalities &&
        user.municipalities.some(
          (m) => m.municipalityId?.toString() === municipalityId,
        ));

    if (!hasAccess) {
      return res
        .status(403)
        .json({ error: 'Access denied to this municipality' });
    }

    req.municipality = municipality;
    next();
  } catch (error) {
    console.error('Error verifying municipality access:', error);
    res.status(500).json({ error: 'Failed to verify access' });
  }
};

/**
 * Verify permit type belongs to municipality
 */
const verifyPermitType = async (req, res, next) => {
  try {
    const { municipalityId, permitTypeId } = req.params;

    const permitType = await PermitType.findOne({
      _id: permitTypeId,
      municipalityId,
    });

    if (!permitType) {
      return res.status(404).json({ error: 'Permit type not found' });
    }

    req.permitType = permitType;
    next();
  } catch (error) {
    console.error('Error verifying permit type:', error);
    res.status(500).json({ error: 'Failed to verify permit type' });
  }
};

/**
 * Check user has municipal admin privileges
 */
const requireMunicipalAdmin = (req, res, next) => {
  const user = req.user;

  // Avitar staff always have access
  if (user.role === 'avitar_admin' || user.role === 'avitar_staff') {
    return next();
  }

  // Check municipality-specific role
  const { municipalityId } = req.params;
  const municipalityAccess = user.municipalities?.find(
    (m) => m.municipalityId?.toString() === municipalityId,
  );

  if (
    !municipalityAccess ||
    !['admin', 'manager'].includes(municipalityAccess.role)
  ) {
    return res
      .status(403)
      .json({ error: 'Admin privileges required for fee schedule management' });
  }

  next();
};

// ============================================================================
// Routes
// ============================================================================

/**
 * GET /municipalities/:municipalityId/permit-types/:permitTypeId/fee-schedules
 * List all fee schedule versions for a permit type
 */
router.get(
  '/municipalities/:municipalityId/permit-types/:permitTypeId/fee-schedules',
  authenticateToken,
  verifyMunicipalityAccess,
  verifyPermitType,
  async (req, res) => {
    try {
      const { permitTypeId } = req.params;
      const { includeArchived = 'false', limit, skip } = req.query;

      const options = {
        includeArchived: includeArchived === 'true',
        limit: limit ? parseInt(limit, 10) : undefined,
        skip: skip ? parseInt(skip, 10) : undefined,
      };

      const schedules = await FeeSchedule.getVersionHistory(
        permitTypeId,
        options,
      );

      // Get count for pagination
      const query = { permitTypeId };
      if (!options.includeArchived) {
        query.status = { $ne: 'archived' };
      }
      const total = await FeeSchedule.countDocuments(query);

      res.json({
        schedules,
        total,
        permitType: {
          id: req.permitType._id,
          name: req.permitType.name,
        },
      });
    } catch (error) {
      console.error('Error fetching fee schedules:', error);
      res.status(500).json({ error: 'Failed to fetch fee schedules' });
    }
  },
);

/**
 * GET /municipalities/:municipalityId/permit-types/:permitTypeId/fee-schedules/active
 * Get the currently active fee schedule for a permit type
 */
router.get(
  '/municipalities/:municipalityId/permit-types/:permitTypeId/fee-schedules/active',
  authenticateToken,
  verifyMunicipalityAccess,
  verifyPermitType,
  async (req, res) => {
    try {
      const { permitTypeId } = req.params;
      const { asOfDate } = req.query;

      const date = asOfDate ? new Date(asOfDate) : new Date();
      const activeSchedule = await FeeSchedule.getActiveSchedule(
        permitTypeId,
        date,
      );

      if (!activeSchedule) {
        return res.json({
          schedule: null,
          message: 'No active fee schedule found for this permit type',
        });
      }

      res.json({ schedule: activeSchedule });
    } catch (error) {
      console.error('Error fetching active fee schedule:', error);
      res.status(500).json({ error: 'Failed to fetch active fee schedule' });
    }
  },
);

/**
 * GET /municipalities/:municipalityId/permit-types/:permitTypeId/fee-schedules/:feeScheduleId
 * Get a specific fee schedule version
 */
router.get(
  '/municipalities/:municipalityId/permit-types/:permitTypeId/fee-schedules/:feeScheduleId',
  authenticateToken,
  verifyMunicipalityAccess,
  verifyPermitType,
  async (req, res) => {
    try {
      const { permitTypeId, feeScheduleId } = req.params;

      const schedule = await FeeSchedule.findOne({
        _id: feeScheduleId,
        permitTypeId,
      })
        .populate('createdBy', 'first_name last_name email')
        .populate('activatedBy', 'first_name last_name')
        .populate('archivedBy', 'first_name last_name')
        .populate('previousVersionId', 'version effectiveDate');

      if (!schedule) {
        return res.status(404).json({ error: 'Fee schedule not found' });
      }

      res.json({ schedule });
    } catch (error) {
      console.error('Error fetching fee schedule:', error);
      res.status(500).json({ error: 'Failed to fetch fee schedule' });
    }
  },
);

/**
 * POST /municipalities/:municipalityId/permit-types/:permitTypeId/fee-schedules
 * Create a new fee schedule draft
 */
router.post(
  '/municipalities/:municipalityId/permit-types/:permitTypeId/fee-schedules',
  authenticateToken,
  verifyMunicipalityAccess,
  verifyPermitType,
  requireMunicipalAdmin,
  async (req, res) => {
    try {
      const { municipalityId, permitTypeId } = req.params;
      const user = req.user;
      const {
        name,
        effectiveDate,
        feeConfiguration,
        changeNotes,
        changeReason,
        copyFromVersionId,
      } = req.body;

      let newSchedule;

      if (copyFromVersionId) {
        // Create by copying from existing version
        newSchedule = await FeeSchedule.createNewVersion(
          copyFromVersionId,
          user._id,
          `${user.first_name} ${user.last_name}`,
        );

        // Update with any overrides
        if (name) newSchedule.name = name;
        if (effectiveDate) newSchedule.effectiveDate = new Date(effectiveDate);
        if (feeConfiguration) {
          Object.assign(newSchedule.feeConfiguration, feeConfiguration);
        }
        if (changeNotes) newSchedule.changeNotes = changeNotes;
        if (changeReason) newSchedule.changeReason = changeReason;

        await newSchedule.save();
      } else {
        // Create new from scratch
        const nextVersion = await FeeSchedule.getNextVersion(permitTypeId);

        newSchedule = new FeeSchedule({
          municipalityId,
          permitTypeId,
          version: nextVersion,
          status: 'draft',
          name: name || `Version ${nextVersion}`,
          effectiveDate: effectiveDate ? new Date(effectiveDate) : new Date(),
          feeConfiguration: feeConfiguration || {
            baseAmount: 0,
            calculationType: 'flat',
          },
          changeNotes,
          changeReason: changeReason || 'initial_setup',
          createdBy: user._id,
          createdByName: `${user.first_name} ${user.last_name}`,
        });

        await newSchedule.save();
      }

      // Populate for response
      await newSchedule.populate('createdBy', 'first_name last_name email');

      res.status(201).json({
        schedule: newSchedule,
        message: 'Fee schedule draft created successfully',
      });
    } catch (error) {
      console.error('Error creating fee schedule:', error);
      res.status(500).json({ error: 'Failed to create fee schedule' });
    }
  },
);

/**
 * PUT /municipalities/:municipalityId/permit-types/:permitTypeId/fee-schedules/:feeScheduleId
 * Update a draft fee schedule
 */
router.put(
  '/municipalities/:municipalityId/permit-types/:permitTypeId/fee-schedules/:feeScheduleId',
  authenticateToken,
  verifyMunicipalityAccess,
  verifyPermitType,
  requireMunicipalAdmin,
  async (req, res) => {
    try {
      const { permitTypeId, feeScheduleId } = req.params;
      const { name, effectiveDate, feeConfiguration, changeNotes, changeReason } =
        req.body;

      const schedule = await FeeSchedule.findOne({
        _id: feeScheduleId,
        permitTypeId,
      });

      if (!schedule) {
        return res.status(404).json({ error: 'Fee schedule not found' });
      }

      // Only drafts can be edited
      if (schedule.status !== 'draft') {
        return res.status(400).json({
          error: `Cannot edit fee schedule with status '${schedule.status}'. Only drafts can be modified.`,
        });
      }

      // Update fields
      if (name !== undefined) schedule.name = name;
      if (effectiveDate) schedule.effectiveDate = new Date(effectiveDate);
      if (changeNotes !== undefined) schedule.changeNotes = changeNotes;
      if (changeReason) schedule.changeReason = changeReason;

      // Deep merge fee configuration
      if (feeConfiguration) {
        if (feeConfiguration.baseAmount !== undefined) {
          schedule.feeConfiguration.baseAmount = feeConfiguration.baseAmount;
        }
        if (feeConfiguration.calculationType) {
          schedule.feeConfiguration.calculationType =
            feeConfiguration.calculationType;
        }
        if (feeConfiguration.perSqftRate !== undefined) {
          schedule.feeConfiguration.perSqftRate = feeConfiguration.perSqftRate;
        }
        if (feeConfiguration.percentageRate !== undefined) {
          schedule.feeConfiguration.percentageRate =
            feeConfiguration.percentageRate;
        }
        if (feeConfiguration.minimumFee !== undefined) {
          schedule.feeConfiguration.minimumFee = feeConfiguration.minimumFee;
        }
        if (feeConfiguration.maximumFee !== undefined) {
          schedule.feeConfiguration.maximumFee = feeConfiguration.maximumFee;
        }
        if (feeConfiguration.formula !== undefined) {
          schedule.feeConfiguration.formula = feeConfiguration.formula;
        }
        if (feeConfiguration.tiers) {
          schedule.feeConfiguration.tiers = feeConfiguration.tiers;
        }
        if (feeConfiguration.additionalFees) {
          schedule.feeConfiguration.additionalFees =
            feeConfiguration.additionalFees;
        }
      }

      await schedule.save();
      await schedule.populate('createdBy', 'first_name last_name email');

      res.json({
        schedule,
        message: 'Fee schedule updated successfully',
      });
    } catch (error) {
      console.error('Error updating fee schedule:', error);
      res.status(500).json({ error: 'Failed to update fee schedule' });
    }
  },
);

/**
 * POST /municipalities/:municipalityId/permit-types/:permitTypeId/fee-schedules/:feeScheduleId/activate
 * Activate a fee schedule immediately or schedule for future activation
 */
router.post(
  '/municipalities/:municipalityId/permit-types/:permitTypeId/fee-schedules/:feeScheduleId/activate',
  authenticateToken,
  verifyMunicipalityAccess,
  verifyPermitType,
  requireMunicipalAdmin,
  async (req, res) => {
    try {
      const { permitTypeId, feeScheduleId } = req.params;
      const user = req.user;
      const { scheduleFor } = req.body; // Optional future date

      const schedule = await FeeSchedule.findOne({
        _id: feeScheduleId,
        permitTypeId,
      });

      if (!schedule) {
        return res.status(404).json({ error: 'Fee schedule not found' });
      }

      // Only drafts or scheduled can be activated
      if (!['draft', 'scheduled'].includes(schedule.status)) {
        return res.status(400).json({
          error: `Cannot activate fee schedule with status '${schedule.status}'`,
        });
      }

      const userName = `${user.first_name} ${user.last_name}`;

      if (scheduleFor) {
        // Schedule for future activation
        const futureDate = new Date(scheduleFor);
        if (futureDate <= new Date()) {
          return res.status(400).json({
            error: 'Schedule date must be in the future',
          });
        }

        await schedule.schedule(futureDate, user._id, userName);

        res.json({
          schedule,
          message: `Fee schedule scheduled for activation on ${futureDate.toLocaleDateString()}`,
        });
      } else {
        // Activate immediately
        await schedule.activate(user._id, userName);

        // Update permit type to reference this schedule
        await PermitType.findByIdAndUpdate(permitTypeId, {
          'feeSchedule.linkedScheduleId': schedule._id,
          updatedBy: user._id,
        });

        res.json({
          schedule,
          message: 'Fee schedule activated successfully',
        });
      }
    } catch (error) {
      console.error('Error activating fee schedule:', error);
      res.status(500).json({ error: error.message || 'Failed to activate fee schedule' });
    }
  },
);

/**
 * POST /municipalities/:municipalityId/permit-types/:permitTypeId/fee-schedules/:feeScheduleId/cancel-schedule
 * Cancel a scheduled activation (return to draft)
 */
router.post(
  '/municipalities/:municipalityId/permit-types/:permitTypeId/fee-schedules/:feeScheduleId/cancel-schedule',
  authenticateToken,
  verifyMunicipalityAccess,
  verifyPermitType,
  requireMunicipalAdmin,
  async (req, res) => {
    try {
      const { permitTypeId, feeScheduleId } = req.params;

      const schedule = await FeeSchedule.findOne({
        _id: feeScheduleId,
        permitTypeId,
      });

      if (!schedule) {
        return res.status(404).json({ error: 'Fee schedule not found' });
      }

      if (schedule.status !== 'scheduled') {
        return res.status(400).json({
          error: 'Only scheduled fee schedules can be cancelled',
        });
      }

      schedule.status = 'draft';
      schedule.activatedBy = null;
      schedule.activatedByName = null;
      await schedule.save();

      res.json({
        schedule,
        message: 'Scheduled activation cancelled',
      });
    } catch (error) {
      console.error('Error cancelling scheduled activation:', error);
      res.status(500).json({ error: 'Failed to cancel scheduled activation' });
    }
  },
);

/**
 * DELETE /municipalities/:municipalityId/permit-types/:permitTypeId/fee-schedules/:feeScheduleId
 * Delete a draft fee schedule
 */
router.delete(
  '/municipalities/:municipalityId/permit-types/:permitTypeId/fee-schedules/:feeScheduleId',
  authenticateToken,
  verifyMunicipalityAccess,
  verifyPermitType,
  requireMunicipalAdmin,
  async (req, res) => {
    try {
      const { permitTypeId, feeScheduleId } = req.params;

      const schedule = await FeeSchedule.findOne({
        _id: feeScheduleId,
        permitTypeId,
      });

      if (!schedule) {
        return res.status(404).json({ error: 'Fee schedule not found' });
      }

      // Only drafts can be deleted
      if (schedule.status !== 'draft') {
        return res.status(400).json({
          error: `Cannot delete fee schedule with status '${schedule.status}'. Only drafts can be deleted.`,
        });
      }

      await schedule.deleteOne();

      res.json({
        message: 'Fee schedule deleted successfully',
      });
    } catch (error) {
      console.error('Error deleting fee schedule:', error);
      res.status(500).json({ error: 'Failed to delete fee schedule' });
    }
  },
);

/**
 * POST /municipalities/:municipalityId/permit-types/:permitTypeId/fee-schedules/:feeScheduleId/calculate
 * Calculate fees using this schedule (preview)
 */
router.post(
  '/municipalities/:municipalityId/permit-types/:permitTypeId/fee-schedules/:feeScheduleId/calculate',
  authenticateToken,
  verifyMunicipalityAccess,
  verifyPermitType,
  async (req, res) => {
    try {
      const { permitTypeId, feeScheduleId } = req.params;
      const permitData = req.body;

      const schedule = await FeeSchedule.findOne({
        _id: feeScheduleId,
        permitTypeId,
      });

      if (!schedule) {
        return res.status(404).json({ error: 'Fee schedule not found' });
      }

      const calculation = schedule.calculateFees(permitData);

      res.json({
        calculation,
        schedule: {
          id: schedule._id,
          version: schedule.version,
          status: schedule.status,
        },
      });
    } catch (error) {
      console.error('Error calculating fees:', error);
      res.status(500).json({ error: 'Failed to calculate fees' });
    }
  },
);

/**
 * GET /municipalities/:municipalityId/fee-schedules/summary
 * Get a summary of fee schedules across all permit types for a municipality
 */
router.get(
  '/municipalities/:municipalityId/fee-schedules/summary',
  authenticateToken,
  verifyMunicipalityAccess,
  async (req, res) => {
    try {
      const { municipalityId } = req.params;

      // Get all permit types for municipality
      const permitTypes = await PermitType.find({
        municipalityId,
        isActive: true,
      }).select('name categories');

      // Get fee schedule stats for each
      const summary = await Promise.all(
        permitTypes.map(async (pt) => {
          const activeSchedule = await FeeSchedule.getActiveSchedule(pt._id);
          const scheduledCount = await FeeSchedule.countDocuments({
            permitTypeId: pt._id,
            status: 'scheduled',
          });
          const draftCount = await FeeSchedule.countDocuments({
            permitTypeId: pt._id,
            status: 'draft',
          });
          const totalVersions = await FeeSchedule.countDocuments({
            permitTypeId: pt._id,
          });

          return {
            permitType: {
              id: pt._id,
              name: pt.name,
              categories: pt.categories,
            },
            activeSchedule: activeSchedule
              ? {
                  id: activeSchedule._id,
                  version: activeSchedule.version,
                  effectiveDate: activeSchedule.effectiveDate,
                  baseFee: activeSchedule.feeConfiguration?.baseAmount || 0,
                }
              : null,
            scheduledCount,
            draftCount,
            totalVersions,
          };
        }),
      );

      res.json({ summary });
    } catch (error) {
      console.error('Error fetching fee schedule summary:', error);
      res.status(500).json({ error: 'Failed to fetch fee schedule summary' });
    }
  },
);

module.exports = router;
