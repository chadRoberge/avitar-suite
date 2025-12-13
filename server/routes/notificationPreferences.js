const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { authenticateToken } = require('../middleware/auth');

/**
 * Get current user's notification preferences
 * GET /api/users/me/notification-preferences
 */
router.get(
  '/users/me/notification-preferences',
  authenticateToken,
  async (req, res) => {
    try {
      const user = await User.findById(req.user._id);

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found',
        });
      }

      // Return preferences with defaults
      const preferences = {
        sms_phone: user.sms_phone || null,
        sms_carrier: user.sms_carrier || null,
        notifications: user.preferences?.notifications || {
          email: true,
          browser: true,
          permit_status_changes: { email: true, sms: false },
          inspection_notifications: { email: true, sms: false },
          team_member_changes: { email: true, sms: false },
          license_expiration: { email: true, sms: false },
          payment_confirmations: { email: true, sms: false },
          subscription_updates: { email: true, sms: false },
          marketing: {
            product_updates: true,
            tips_and_best_practices: false,
            promotional_offers: false,
          },
        },
      };

      res.json({
        success: true,
        preferences,
      });
    } catch (error) {
      console.error('Error fetching notification preferences:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch notification preferences',
        message: error.message,
      });
    }
  },
);

/**
 * Update current user's notification preferences
 * PATCH /api/users/me/notification-preferences
 */
router.patch(
  '/users/me/notification-preferences',
  authenticateToken,
  async (req, res) => {
    try {
      const user = await User.findById(req.user._id);

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found',
        });
      }

      const { sms_phone, sms_carrier, notifications } = req.body;

      // Update SMS settings
      if (sms_phone !== undefined) {
        // Validate phone format (10 digits)
        if (sms_phone && !/^\d{10}$/.test(sms_phone)) {
          return res.status(400).json({
            success: false,
            error: 'Invalid phone number format. Must be 10 digits.',
          });
        }
        user.sms_phone = sms_phone;
      }

      if (sms_carrier !== undefined) {
        const validCarriers = [
          'verizon',
          'att',
          'tmobile',
          'sprint',
          'us_cellular',
          'boost',
          'cricket',
          'metro_pcs',
          'other',
        ];
        if (sms_carrier && !validCarriers.includes(sms_carrier)) {
          return res.status(400).json({
            success: false,
            error: 'Invalid SMS carrier',
            validCarriers,
          });
        }
        user.sms_carrier = sms_carrier;
      }

      // Update notification preferences
      if (notifications !== undefined) {
        // Ensure preferences object exists
        if (!user.preferences) {
          user.preferences = {};
        }
        if (!user.preferences.notifications) {
          user.preferences.notifications = {};
        }

        // Deep merge notification preferences
        user.preferences.notifications = {
          ...user.preferences.notifications,
          ...notifications,
        };

        // Mark the nested object as modified for Mongoose
        user.markModified('preferences');
      }

      await user.save();

      res.json({
        success: true,
        preferences: {
          sms_phone: user.sms_phone,
          sms_carrier: user.sms_carrier,
          notifications: user.preferences.notifications,
        },
        message: 'Notification preferences updated successfully',
      });
    } catch (error) {
      console.error('Error updating notification preferences:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update notification preferences',
        message: error.message,
      });
    }
  },
);

/**
 * Get available SMS carriers
 * GET /api/notification-preferences/carriers
 */
router.get(
  '/notification-preferences/carriers',
  authenticateToken,
  async (req, res) => {
    try {
      const carriers = [
        { value: 'verizon', label: 'Verizon', gateway: '@vtext.com' },
        { value: 'att', label: 'AT&T', gateway: '@txt.att.net' },
        { value: 'tmobile', label: 'T-Mobile', gateway: '@tmomail.net' },
        {
          value: 'sprint',
          label: 'Sprint',
          gateway: '@messaging.sprintpcs.com',
        },
        {
          value: 'us_cellular',
          label: 'U.S. Cellular',
          gateway: '@email.uscc.net',
        },
        {
          value: 'boost',
          label: 'Boost Mobile',
          gateway: '@smsmyboostmobile.com',
        },
        {
          value: 'cricket',
          label: 'Cricket Wireless',
          gateway: '@sms.cricketwireless.net',
        },
        { value: 'metro_pcs', label: 'Metro PCS', gateway: '@mymetropcs.com' },
        { value: 'other', label: 'Other', gateway: null },
      ];

      res.json({
        success: true,
        carriers,
      });
    } catch (error) {
      console.error('Error fetching carriers:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch carriers',
        message: error.message,
      });
    }
  },
);

/**
 * Test notification sending
 * POST /api/users/me/test-notification
 */
router.post(
  '/users/me/test-notification',
  authenticateToken,
  async (req, res) => {
    try {
      const { type } = req.body; // 'email' or 'sms'

      const user = await User.findById(req.user._id);

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found',
        });
      }

      if (type === 'email') {
        const emailService = require('../services/emailService');

        await emailService.sendTestEmail(user.email);

        return res.json({
          success: true,
          message: `Test email sent to ${user.email}`,
        });
      } else if (type === 'sms') {
        if (!user.sms_phone || !user.sms_carrier) {
          return res.status(400).json({
            success: false,
            error: 'SMS phone and carrier must be configured before testing',
          });
        }

        const smsGatewayService = require('../services/smsGatewayService');

        await smsGatewayService.sendTestSMS(user.sms_phone, user.sms_carrier);

        return res.json({
          success: true,
          message: `Test SMS sent to ${user.sms_phone} via ${user.sms_carrier}`,
        });
      } else {
        return res.status(400).json({
          success: false,
          error: 'Invalid notification type. Must be "email" or "sms"',
        });
      }
    } catch (error) {
      console.error('Error sending test notification:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to send test notification',
        message: error.message,
      });
    }
  },
);

module.exports = router;
