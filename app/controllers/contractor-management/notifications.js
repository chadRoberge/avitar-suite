import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';

export default class ContractorManagementNotificationsController extends Controller {
  @service api;
  @service notifications;
  @service router;

  @tracked isLoading = false;

  // Email notification settings
  @tracked emailPermitUpdates = true;
  @tracked emailTeamUpdates = true;
  @tracked emailPaymentConfirmations = true;
  @tracked emailSubscriptionUpdates = true;
  @tracked emailLicenseReminders = true;

  // SMS notification settings (premium feature)
  @tracked smsUrgentUpdates = false;
  @tracked smsInspectionReminders = false;

  // Marketing preferences
  @tracked marketingProductUpdates = true;
  @tracked marketingTips = false;
  @tracked marketingPromotions = false;

  get contractor() {
    return this.model.contractor;
  }

  get needsOnboarding() {
    return this.model.needsOnboarding || !this.contractor;
  }

  get currentPlan() {
    return this.contractor?.subscription?.plan || 'free';
  }

  get isFreePlan() {
    return this.currentPlan === 'free';
  }

  get hasSMSAccess() {
    // SMS notifications available on premium, pro, and enterprise plans
    return ['premium', 'pro', 'enterprise'].includes(this.currentPlan);
  }

  @action
  attemptSMSToggle() {
    if (!this.hasSMSAccess) {
      this.notifications.warning(
        'SMS notifications are a premium feature. Please upgrade your plan.',
      );
      this.router.transitionTo('contractor-management.subscription');
      return;
    }
  }

  @action
  toggleEmailNotification(field, event) {
    this[field] = event.target.checked;
    this.saveNotificationSettings();
  }

  @action
  toggleSMSNotification(field, event) {
    if (!this.hasSMSAccess) {
      event.preventDefault();
      this.attemptSMSToggle();
      return;
    }

    this[field] = event.target.checked;
    this.saveNotificationSettings();
  }

  @action
  toggleMarketingPreference(field, event) {
    this[field] = event.target.checked;
    this.saveNotificationSettings();
  }

  async saveNotificationSettings() {
    // TODO: Implement API call to save notification preferences
    // For now, just log the settings
    console.log('Saving notification settings:', {
      email: {
        permitUpdates: this.emailPermitUpdates,
        teamUpdates: this.emailTeamUpdates,
        paymentConfirmations: this.emailPaymentConfirmations,
        subscriptionUpdates: this.emailSubscriptionUpdates,
        licenseReminders: this.emailLicenseReminders,
      },
      sms: {
        urgentUpdates: this.smsUrgentUpdates,
        inspectionReminders: this.smsInspectionReminders,
      },
      marketing: {
        productUpdates: this.marketingProductUpdates,
        tips: this.marketingTips,
        promotions: this.marketingPromotions,
      },
    });

    // Optionally show a success message
    // this.notifications.success('Notification preferences updated');
  }
}
