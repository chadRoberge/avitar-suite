/**
 * Fee Schedule Activator Job
 *
 * This job runs on a schedule to automatically activate fee schedules
 * that have reached their effective date. It:
 * 1. Finds fee schedules with status 'scheduled' and effectiveDate <= now
 * 2. Archives the current active schedule for each permit type
 * 3. Activates the scheduled schedule
 * 4. Updates the permit type reference
 *
 * Usage:
 *   const { startFeeScheduleActivator, stopFeeScheduleActivator } = require('./jobs/feeScheduleActivator');
 *   startFeeScheduleActivator(); // Call on server startup
 *   stopFeeScheduleActivator(); // Call on graceful shutdown
 */

const FeeSchedule = require('../models/FeeSchedule');
const PermitType = require('../models/PermitType');

let activatorInterval = null;
const ACTIVATION_CHECK_INTERVAL = 60 * 60 * 1000; // Check every hour

/**
 * Process scheduled fee schedules and activate them if their effective date has passed
 */
async function processScheduledActivations() {
  const now = new Date();
  console.log(
    `[FeeScheduleActivator] Checking for scheduled activations at ${now.toISOString()}`,
  );

  try {
    // Find all scheduled fee schedules ready to activate
    const schedulesToActivate =
      await FeeSchedule.getScheduledToActivate(now);

    if (schedulesToActivate.length === 0) {
      console.log('[FeeScheduleActivator] No scheduled activations to process');
      return { processed: 0, errors: [] };
    }

    console.log(
      `[FeeScheduleActivator] Found ${schedulesToActivate.length} schedule(s) to activate`,
    );

    const results = {
      processed: 0,
      errors: [],
    };

    for (const schedule of schedulesToActivate) {
      try {
        console.log(
          `[FeeScheduleActivator] Activating schedule v${schedule.version} for permit type ${schedule.permitTypeId?.name || schedule.permitTypeId}`,
        );

        // Archive current active schedule
        const currentActive = await FeeSchedule.findOne({
          permitTypeId: schedule.permitTypeId._id || schedule.permitTypeId,
          status: 'active',
        });

        if (currentActive) {
          currentActive.status = 'archived';
          currentActive.endDate = now;
          currentActive.archivedAt = now;
          currentActive.archivedReason = `Superseded by scheduled version ${schedule.version}`;
          await currentActive.save();
          console.log(
            `[FeeScheduleActivator] Archived previous active schedule v${currentActive.version}`,
          );
        }

        // Activate the scheduled schedule
        schedule.status = 'active';
        schedule.activatedAt = now;
        await schedule.save();

        // Update permit type to reference this schedule
        await PermitType.findByIdAndUpdate(
          schedule.permitTypeId._id || schedule.permitTypeId,
          {
            'feeSchedule.linkedScheduleId': schedule._id,
          },
        );

        console.log(
          `[FeeScheduleActivator] Successfully activated schedule v${schedule.version}`,
        );
        results.processed++;
      } catch (error) {
        console.error(
          `[FeeScheduleActivator] Error activating schedule ${schedule._id}:`,
          error,
        );
        results.errors.push({
          scheduleId: schedule._id,
          version: schedule.version,
          error: error.message,
        });
      }
    }

    console.log(
      `[FeeScheduleActivator] Completed: ${results.processed} activated, ${results.errors.length} errors`,
    );
    return results;
  } catch (error) {
    console.error(
      '[FeeScheduleActivator] Error in processScheduledActivations:',
      error,
    );
    return { processed: 0, errors: [{ error: error.message }] };
  }
}

/**
 * Start the fee schedule activator job
 * @param {number} intervalMs - Interval in milliseconds (default: 1 hour)
 */
function startFeeScheduleActivator(intervalMs = ACTIVATION_CHECK_INTERVAL) {
  if (activatorInterval) {
    console.log(
      '[FeeScheduleActivator] Activator already running, stopping existing one',
    );
    stopFeeScheduleActivator();
  }

  console.log(
    `[FeeScheduleActivator] Starting fee schedule activator (interval: ${intervalMs / 1000}s)`,
  );

  // Run immediately on startup
  processScheduledActivations().catch((error) => {
    console.error(
      '[FeeScheduleActivator] Error in initial activation check:',
      error,
    );
  });

  // Then run on interval
  activatorInterval = setInterval(() => {
    processScheduledActivations().catch((error) => {
      console.error(
        '[FeeScheduleActivator] Error in scheduled activation check:',
        error,
      );
    });
  }, intervalMs);

  console.log('[FeeScheduleActivator] Fee schedule activator started');
}

/**
 * Stop the fee schedule activator job
 */
function stopFeeScheduleActivator() {
  if (activatorInterval) {
    clearInterval(activatorInterval);
    activatorInterval = null;
    console.log('[FeeScheduleActivator] Fee schedule activator stopped');
  }
}

/**
 * Manually trigger activation check (for testing or admin purposes)
 */
async function manualActivationCheck() {
  return processScheduledActivations();
}

module.exports = {
  startFeeScheduleActivator,
  stopFeeScheduleActivator,
  manualActivationCheck,
  processScheduledActivations,
};
