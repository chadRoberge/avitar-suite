const User = require('../models/User');
const Municipality = require('../models/Municipality');
const Contractor = require('../models/Contractor');

/**
 * Notification Permission Service
 *
 * Determines if users can receive notifications based on:
 * 1. User preferences (opt-out always blocks)
 * 2. Municipality subscription features (per-module)
 * 3. Contractor subscription features
 * 4. OR logic: if EITHER municipality OR contractor has feature, allow
 * 5. Paused subscriptions = read-only (no notifications)
 */

/**
 * Get user preferences for a notification type
 * @param {Object} user - User object
 * @param {String} notificationType - Type of notification (e.g., 'inspection_notifications')
 * @returns {Object} { email: boolean, sms: boolean }
 */
function getUserPreferences(user, notificationType) {
  // Default preferences if not set
  const defaultPrefs = { email: true, sms: false };

  if (!user.preferences?.notifications) {
    return defaultPrefs;
  }

  // Get specific notification type preferences
  const typePrefs = user.preferences.notifications[notificationType];

  if (!typePrefs) {
    // Fall back to legacy global settings if specific type not defined
    return {
      email: user.preferences.notifications.email !== false,
      sms: false, // Legacy didn't have SMS
    };
  }

  return {
    email: typePrefs.email !== false,
    sms: typePrefs.sms === true,
  };
}

/**
 * Get active subscription sources for a user
 * @param {Object} user - User object
 * @param {Object} context - Context object with municipalityId, moduleName, etc.
 * @returns {Array} Array of { type, entity, moduleName, features }
 */
async function getActiveSubscriptionSources(user, context = {}) {
  const sources = [];

  try {
    // 1. Check Contractor subscription
    if (user.contractor_id) {
      const contractor = await Contractor.findById(user.contractor_id);

      if (contractor && contractor.isSubscriptionActive()) {
        sources.push({
          type: 'contractor',
          entity: contractor,
          moduleName: null,
          features: contractor.getFeatures(),
        });
      }
    }

    // 2. Check Municipality module subscriptions
    if (context.municipalityId) {
      const municipality = await Municipality.findById(context.municipalityId);

      if (municipality) {
        // If specific module specified, check only that module
        if (context.moduleName) {
          if (municipality.isModuleActive(context.moduleName)) {
            sources.push({
              type: 'municipality',
              entity: municipality,
              moduleName: context.moduleName,
              features: municipality.getModuleFeatures(context.moduleName),
            });
          }
        } else {
          // Check all enabled modules
          for (const [moduleName, moduleConfig] of municipality.module_config
            .modules) {
            if (
              moduleConfig.enabled &&
              municipality.isModuleActive(moduleName)
            ) {
              sources.push({
                type: 'municipality',
                entity: municipality,
                moduleName,
                features: municipality.getModuleFeatures(moduleName),
              });
            }
          }
        }
      }
    }

    return sources;
  } catch (error) {
    console.error('❌ Error getting active subscription sources:', error);
    return [];
  }
}

/**
 * Check if user can receive a notification
 * @param {String} userId - User ID
 * @param {String} notificationType - Type of notification (e.g., 'inspection_notifications')
 * @param {Object} context - Context object { municipalityId, moduleName }
 * @returns {Object} { allowed: boolean, channels: { email: boolean, sms: boolean }, userOptOut: boolean, reason: string, payingSources: Array }
 */
async function canUserReceiveNotification(
  userId,
  notificationType,
  context = {},
) {
  try {
    // 1. Get user
    const user = await User.findById(userId);
    if (!user) {
      return {
        allowed: false,
        channels: { email: false, sms: false },
        userOptOut: false,
        reason: 'User not found',
        payingSources: [],
      };
    }

    // 2. Check user preferences (BLOCKING - user opt-out always wins)
    const userPrefs = getUserPreferences(user, notificationType);

    // If user has opted out of ALL channels, block immediately
    if (!userPrefs.email && !userPrefs.sms) {
      return {
        allowed: false,
        channels: { email: false, sms: false },
        userOptOut: true,
        reason: 'User opted out of all notification channels',
        payingSources: [],
      };
    }

    // 3. Get active subscription sources
    const sources = await getActiveSubscriptionSources(user, context);

    if (sources.length === 0) {
      return {
        allowed: false,
        channels: { email: false, sms: false },
        userOptOut: false,
        reason: 'No active subscriptions found',
        payingSources: [],
      };
    }

    // 4. Check if ANY source has the required features (OR logic)
    const allowedChannels = {
      email: false,
      sms: false,
    };

    const payingSources = [];

    // Map notification types to required features
    const featureMap = {
      inspection_notifications: 'email_notifications',
      permit_status_changes: 'email_notifications',
      team_member_changes: 'email_notifications',
      sms_notifications: 'sms_notifications',
    };

    const emailFeature = featureMap[notificationType] || 'email_notifications';
    const smsFeature = 'sms_notifications';

    // Check each source for features
    for (const source of sources) {
      // Check email notifications
      if (userPrefs.email && source.features.includes(emailFeature)) {
        allowedChannels.email = true;
        payingSources.push({
          type: source.type,
          name:
            source.type === 'contractor'
              ? source.entity.company_name
              : `${source.entity.name} - ${source.moduleName}`,
          tier:
            source.type === 'contractor'
              ? source.entity.subscription?.plan
              : source.entity.module_config.modules.get(source.moduleName)
                  ?.tier,
        });
      }

      // Check SMS notifications
      if (userPrefs.sms && source.features.includes(smsFeature)) {
        allowedChannels.sms = true;
        // Add to payingSources if not already there
        const existing = payingSources.find(
          (s) =>
            s.type === source.type &&
            (source.type === 'contractor' ||
              s.name.includes(source.moduleName)),
        );
        if (!existing) {
          payingSources.push({
            type: source.type,
            name:
              source.type === 'contractor'
                ? source.entity.company_name
                : `${source.entity.name} - ${source.moduleName}`,
            tier:
              source.type === 'contractor'
                ? source.entity.subscription?.plan
                : source.entity.module_config.modules.get(source.moduleName)
                    ?.tier,
          });
        }
      }
    }

    // 5. Return result
    const allowed = allowedChannels.email || allowedChannels.sms;

    return {
      allowed,
      channels: allowedChannels,
      userOptOut: false,
      reason: allowed
        ? 'Permission granted by active subscription'
        : 'No subscription includes required notification features',
      payingSources,
    };
  } catch (error) {
    console.error('❌ Error checking notification permission:', error);
    return {
      allowed: false,
      channels: { email: false, sms: false },
      userOptOut: false,
      reason: `Error checking permissions: ${error.message}`,
      payingSources: [],
    };
  }
}

/**
 * Check if municipality can send notifications for a module
 * @param {String} municipalityId - Municipality ID
 * @param {String} moduleName - Module name (e.g., 'building_permit')
 * @param {String} featureName - Feature name (e.g., 'email_notifications')
 * @returns {Object} { allowed: boolean, reason: string }
 */
async function canMunicipalitySendNotifications(
  municipalityId,
  moduleName,
  featureName = 'email_notifications',
) {
  try {
    const municipality = await Municipality.findById(municipalityId);

    if (!municipality) {
      return {
        allowed: false,
        reason: 'Municipality not found',
      };
    }

    if (!municipality.isModuleActive(moduleName)) {
      return {
        allowed: false,
        reason: 'Module subscription is not active or is paused',
      };
    }

    if (!municipality.hasModuleFeature(moduleName, featureName)) {
      return {
        allowed: false,
        reason: `Municipality subscription does not include ${featureName}`,
      };
    }

    return {
      allowed: true,
      reason: 'Municipality has active subscription with notification features',
    };
  } catch (error) {
    console.error(
      '❌ Error checking municipality notification permission:',
      error,
    );
    return {
      allowed: false,
      reason: `Error: ${error.message}`,
    };
  }
}

/**
 * Check if contractor can send notifications
 * @param {String} contractorId - Contractor ID
 * @param {String} featureName - Feature name (e.g., 'email_notifications')
 * @returns {Object} { allowed: boolean, reason: string }
 */
async function canContractorSendNotifications(
  contractorId,
  featureName = 'email_notifications',
) {
  try {
    const contractor = await Contractor.findById(contractorId);

    if (!contractor) {
      return {
        allowed: false,
        reason: 'Contractor not found',
      };
    }

    if (!contractor.isSubscriptionActive()) {
      return {
        allowed: false,
        reason: 'Contractor subscription is not active or is paused',
      };
    }

    if (!contractor.hasFeature(featureName)) {
      return {
        allowed: false,
        reason: `Contractor subscription does not include ${featureName}`,
      };
    }

    return {
      allowed: true,
      reason: 'Contractor has active subscription with notification features',
    };
  } catch (error) {
    console.error(
      '❌ Error checking contractor notification permission:',
      error,
    );
    return {
      allowed: false,
      reason: `Error: ${error.message}`,
    };
  }
}

module.exports = {
  canUserReceiveNotification,
  canMunicipalitySendNotifications,
  canContractorSendNotifications,
  getUserPreferences,
  getActiveSubscriptionSources,
};
