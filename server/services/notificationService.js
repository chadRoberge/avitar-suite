const emailService = require('./emailService');
const smsGatewayService = require('./smsGatewayService');
const templateService = require('./templateService');
const User = require('../models/User');

/**
 * Notification Orchestration Service
 *
 * Handles notification delivery across multiple channels (email, SMS)
 * Respects user preferences and resolves templates
 */
class NotificationService {
  /**
   * Send a notification to a user
   * @param {Object} options - Notification options
   * @param {string} options.userId - User ID to notify
   * @param {string} options.notificationType - Type of notification (e.g., 'permit_status_changes')
   * @param {string} options.templateType - Email template type (e.g., 'permit_approved')
   * @param {string} options.municipalityId - Municipality ID (for template resolution)
   * @param {Object} options.data - Template variable data
   * @param {string} options.subject - Email subject (used if no template)
   * @param {string} options.smsMessage - SMS message text
   * @returns {Promise<Object>} - Delivery results
   */
  async sendNotification({
    userId,
    notificationType,
    templateType,
    municipalityId,
    data,
    subject,
    smsMessage,
  }) {
    try {
      // Fetch user
      const user = await User.findById(userId);
      if (!user) {
        throw new Error(`User not found: ${userId}`);
      }

      // Check user preferences for this notification type
      const preferences = this.getUserPreferences(user, notificationType);

      if (!preferences.email && !preferences.sms) {
        console.log(
          `User ${userId} has disabled ${notificationType} notifications`
        );
        return {
          success: true,
          skipped: true,
          reason: 'User preferences disabled',
        };
      }

      const results = {
        email: null,
        sms: null,
      };

      // Send email if enabled
      if (preferences.email && user.email) {
        try {
          const emailContent = await templateService.renderEmailTemplate({
            municipalityId,
            templateType,
            data,
            subject,
          });

          results.email = await emailService.sendEmail({
            to: user.email,
            subject: emailContent.subject,
            html: emailContent.html,
            text: emailContent.text,
          });

          console.log(
            `Email notification sent to ${user.email} (${notificationType})`
          );
        } catch (error) {
          console.error('Email notification failed:', error);
          results.email = {
            success: false,
            error: error.message,
          };
        }
      }

      // Send SMS if enabled and user has SMS configured
      if (preferences.sms && user.sms_phone && user.sms_carrier) {
        try {
          // Use provided SMS message or generate from template
          const message =
            smsMessage ||
            templateService.renderSMSTemplate({
              templateType,
              data,
            });

          results.sms = await smsGatewayService.sendSMS({
            phone: user.sms_phone,
            carrier: user.sms_carrier,
            message,
          });

          console.log(
            `SMS notification sent to ${user.sms_phone} (${notificationType})`
          );
        } catch (error) {
          console.error('SMS notification failed:', error);
          results.sms = {
            success: false,
            error: error.message,
          };
        }
      }

      return {
        success: true,
        userId,
        notificationType,
        results,
      };
    } catch (error) {
      console.error('Notification sending failed:', error);
      throw error;
    }
  }

  /**
   * Send notifications to multiple users
   * @param {Array} notifications - Array of notification objects
   * @returns {Promise<Array>} - Array of results
   */
  async sendBulkNotifications(notifications) {
    const results = await Promise.allSettled(
      notifications.map((notification) =>
        this.sendNotification(notification)
      )
    );

    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          success: false,
          userId: notifications[index].userId,
          error: result.reason.message,
        };
      }
    });
  }

  /**
   * Get user notification preferences for a specific type
   * @param {Object} user - User document
   * @param {string} notificationType - Notification type
   * @returns {Object} - {email: boolean, sms: boolean}
   */
  getUserPreferences(user, notificationType) {
    const preferences = user.preferences?.notifications || {};

    // Get specific preferences for this notification type
    const typePreferences = preferences[notificationType] || {};

    // Fallback to legacy global preferences if specific not set
    return {
      email:
        typePreferences.email !== undefined
          ? typePreferences.email
          : preferences.email !== false,
      sms: typePreferences.sms || false,
    };
  }

  /**
   * Send permit status change notification
   */
  async sendPermitStatusNotification({
    userId,
    municipalityId,
    permitNumber,
    status,
    permitData,
  }) {
    // Map permit status to template type
    const templateTypeMap = {
      approved: 'permit_approved',
      rejected: 'permit_rejected',
      under_review: 'permit_under_review',
      revision_requested: 'permit_revision_requested',
      pending_payment: 'permit_pending_payment',
      issued: 'permit_issued',
    };

    const templateType = templateTypeMap[status];
    if (!templateType) {
      console.warn(`No template for permit status: ${status}`);
      return;
    }

    // Prepare SMS message
    let smsMessage = '';
    if (status === 'approved') {
      smsMessage = `Your permit ${permitNumber} has been approved. Check email for details.`;
    } else if (status === 'rejected') {
      smsMessage = `Your permit ${permitNumber} was rejected. Check email for details.`;
    } else if (status === 'revision_requested') {
      smsMessage = `Revision requested for permit ${permitNumber}. Check email for details.`;
    } else {
      smsMessage = `Permit ${permitNumber} status: ${status}. Check email for details.`;
    }

    return await this.sendNotification({
      userId,
      notificationType: 'permit_status_changes',
      templateType,
      municipalityId,
      data: {
        permitNumber,
        status,
        ...permitData,
      },
      smsMessage,
    });
  }

  /**
   * Send inspection notification
   */
  async sendInspectionNotification({
    userId,
    municipalityId,
    inspectionType,
    inspectionData,
  }) {
    // Map inspection type to template type
    const templateTypeMap = {
      scheduled: 'inspection_scheduled',
      reminder: 'inspection_reminder',
      passed: 'inspection_passed',
      failed: 'inspection_failed',
      cancelled: 'inspection_cancelled',
      rescheduled: 'inspection_rescheduled',
    };

    const templateType = templateTypeMap[inspectionType];
    if (!templateType) {
      console.warn(`No template for inspection type: ${inspectionType}`);
      return;
    }

    // Prepare SMS message
    let smsMessage = '';
    const permitNumber = inspectionData.permitNumber || 'N/A';

    if (inspectionType === 'scheduled' || inspectionType === 'reminder') {
      smsMessage = `Inspection for permit ${permitNumber} scheduled on ${inspectionData.inspectionDate}. Check email for details.`;
    } else if (inspectionType === 'passed') {
      smsMessage = `Inspection passed for permit ${permitNumber}!`;
    } else if (inspectionType === 'failed') {
      smsMessage = `Inspection failed for permit ${permitNumber}. Check email for required corrections.`;
    } else {
      smsMessage = `Inspection update for permit ${permitNumber}. Check email for details.`;
    }

    return await this.sendNotification({
      userId,
      notificationType: 'inspection_notifications',
      templateType,
      municipalityId,
      data: {
        inspectionType,
        ...inspectionData,
      },
      smsMessage,
    });
  }

  /**
   * Send license expiration warning
   */
  async sendLicenseExpirationWarning({
    userId,
    daysUntilExpiration,
    licenseData,
  }) {
    const smsMessage = `Your ${licenseData.licenseType} license expires in ${daysUntilExpiration} days. Renew soon to avoid service interruption.`;

    return await this.sendNotification({
      userId,
      notificationType: 'license_expiration',
      templateType: 'license_expiration',
      municipalityId: null, // Avitar-controlled, no municipality
      data: {
        daysUntilExpiration,
        ...licenseData,
      },
      subject: `License Expiration Warning - ${daysUntilExpiration} Days Remaining`,
      smsMessage,
    });
  }

  /**
   * Send team member added notification
   */
  async sendTeamMemberNotification({
    userId,
    municipalityId,
    teamMemberData,
  }) {
    const smsMessage = `${teamMemberData.teamMemberName} has been added to your team at ${teamMemberData.companyName}.`;

    return await this.sendNotification({
      userId,
      notificationType: 'team_member_changes',
      templateType: 'team_member_added',
      municipalityId,
      data: teamMemberData,
      smsMessage,
    });
  }
}

// Export singleton instance
module.exports = new NotificationService();
