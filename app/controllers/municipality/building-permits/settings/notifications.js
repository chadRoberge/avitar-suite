import Controller from '@ember/controller';
import { action } from '@ember/object';
import { service } from '@ember/service';

export default class MunicipalityBuildingPermitsSettingsNotificationsController extends Controller {
  @service api;
  @service notifications;

  @action
  async handleSave(settings) {
    try {
      // Transform settings to match the API format
      const notificationPayload = {
        notifications: {
          email: true,
          browser: true,
          permit_status_changes: {
            email: settings.email?.permitUpdates ?? true,
            sms: settings.sms?.urgentUpdates ?? false,
          },
          inspection_notifications: {
            email: settings.email?.permitUpdates ?? true,
            sms: settings.sms?.inspectionReminders ?? false,
          },
          team_member_changes: {
            email: settings.email?.teamUpdates ?? true,
            sms: false,
          },
          license_expiration: {
            email: settings.email?.licenseReminders ?? true,
            sms: false,
          },
          payment_confirmations: {
            email: settings.email?.paymentConfirmations ?? true,
            sms: false,
          },
          subscription_updates: {
            email: settings.email?.subscriptionUpdates ?? true,
            sms: false,
          },
          marketing: {
            product_updates: settings.marketing?.productUpdates ?? true,
            tips_and_best_practices: settings.marketing?.tips ?? false,
            promotional_offers: settings.marketing?.promotions ?? false,
          },
        },
      };

      // Use the existing API endpoint
      await this.api.patch(
        '/users/me/notification-preferences',
        notificationPayload,
      );

      this.notifications.success('Notification preferences saved');
    } catch (error) {
      console.error('Error saving notification preferences:', error);
      this.notifications.error('Failed to save notification preferences');
    }
  }
}
