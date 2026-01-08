import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';

/**
 * Shared Notification Preferences Component
 *
 * Usage:
 * <Shared::NotificationPreferences
 *   @userType="contractor" or "citizen"
 *   @currentPlan="free" or "premium" etc
 *   @subscriptionRoute="contractor-management.subscription" or "citizen-settings.subscription"
 *   @onSave={{this.handleSave}} />
 */
export default class SharedNotificationPreferencesComponent extends Component {
  @service api;
  @service notifications;
  @service router;

  @tracked isLoading = false;

  // Track local overrides - null means use initial value from args
  @tracked _emailPermitUpdates = null;
  @tracked _emailTeamUpdates = null;
  @tracked _emailPaymentConfirmations = null;
  @tracked _emailSubscriptionUpdates = null;
  @tracked _emailLicenseReminders = null;
  @tracked _smsUrgentUpdates = null;
  @tracked _smsInspectionReminders = null;
  @tracked _marketingProductUpdates = null;
  @tracked _marketingTips = null;
  @tracked _marketingPromotions = null;

  // Helper to get initial preferences
  get _initialPrefs() {
    return this.args.initialPreferences?.notifications || {};
  }

  // Email notification getters - use local override or initial value
  get emailPermitUpdates() {
    if (this._emailPermitUpdates !== null) return this._emailPermitUpdates;
    return this._initialPrefs.permit_status_changes?.email ?? true;
  }
  set emailPermitUpdates(value) {
    this._emailPermitUpdates = value;
  }

  get emailTeamUpdates() {
    if (this._emailTeamUpdates !== null) return this._emailTeamUpdates;
    return this._initialPrefs.team_member_changes?.email ?? true;
  }
  set emailTeamUpdates(value) {
    this._emailTeamUpdates = value;
  }

  get emailPaymentConfirmations() {
    if (this._emailPaymentConfirmations !== null)
      return this._emailPaymentConfirmations;
    return this._initialPrefs.payment_confirmations?.email ?? true;
  }
  set emailPaymentConfirmations(value) {
    this._emailPaymentConfirmations = value;
  }

  get emailSubscriptionUpdates() {
    if (this._emailSubscriptionUpdates !== null)
      return this._emailSubscriptionUpdates;
    return this._initialPrefs.subscription_updates?.email ?? true;
  }
  set emailSubscriptionUpdates(value) {
    this._emailSubscriptionUpdates = value;
  }

  get emailLicenseReminders() {
    if (this._emailLicenseReminders !== null)
      return this._emailLicenseReminders;
    return this._initialPrefs.license_expiration?.email ?? true;
  }
  set emailLicenseReminders(value) {
    this._emailLicenseReminders = value;
  }

  // SMS notification getters
  get smsUrgentUpdates() {
    if (this._smsUrgentUpdates !== null) return this._smsUrgentUpdates;
    return this._initialPrefs.permit_status_changes?.sms ?? false;
  }
  set smsUrgentUpdates(value) {
    this._smsUrgentUpdates = value;
  }

  get smsInspectionReminders() {
    if (this._smsInspectionReminders !== null)
      return this._smsInspectionReminders;
    return this._initialPrefs.inspection_notifications?.sms ?? false;
  }
  set smsInspectionReminders(value) {
    this._smsInspectionReminders = value;
  }

  // Marketing getters
  get marketingProductUpdates() {
    if (this._marketingProductUpdates !== null)
      return this._marketingProductUpdates;
    return this._initialPrefs.marketing?.product_updates ?? true;
  }
  set marketingProductUpdates(value) {
    this._marketingProductUpdates = value;
  }

  get marketingTips() {
    if (this._marketingTips !== null) return this._marketingTips;
    return this._initialPrefs.marketing?.tips_and_best_practices ?? false;
  }
  set marketingTips(value) {
    this._marketingTips = value;
  }

  get marketingPromotions() {
    if (this._marketingPromotions !== null) return this._marketingPromotions;
    return this._initialPrefs.marketing?.promotional_offers ?? false;
  }
  set marketingPromotions(value) {
    this._marketingPromotions = value;
  }

  get userType() {
    return this.args.userType || 'citizen';
  }

  get isContractor() {
    return this.userType === 'contractor';
  }

  get currentPlan() {
    return this.args.currentPlan || 'free';
  }

  get isFreePlan() {
    return this.currentPlan === 'free';
  }

  get hasSMSAccess() {
    // SMS notifications available on premium, pro, and enterprise plans
    return ['premium', 'pro', 'enterprise'].includes(this.currentPlan);
  }

  get subscriptionRoute() {
    return this.args.subscriptionRoute || 'citizen-settings.subscription';
  }

  // Email notification options based on user type
  get emailNotificationOptions() {
    const commonOptions = [
      {
        key: 'emailPermitUpdates',
        label: 'Permit Status Updates',
        description: 'Get notified when permit status changes',
        value: this.emailPermitUpdates,
      },
      {
        key: 'emailPaymentConfirmations',
        label: 'Payment Confirmations',
        description: 'Receipts and payment confirmations',
        value: this.emailPaymentConfirmations,
      },
      {
        key: 'emailSubscriptionUpdates',
        label: 'Subscription Updates',
        description: 'Billing cycle and plan changes',
        value: this.emailSubscriptionUpdates,
      },
    ];

    // Contractor-specific options
    if (this.isContractor) {
      return [
        ...commonOptions,
        {
          key: 'emailTeamUpdates',
          label: 'New Team Member Added',
          description: 'Notification when someone joins your team',
          value: this.emailTeamUpdates,
        },
        {
          key: 'emailLicenseReminders',
          label: 'License Expiration Reminders',
          description: 'Get reminded before licenses expire',
          value: this.emailLicenseReminders,
        },
      ];
    }

    return commonOptions;
  }

  // SMS notification options
  get smsNotificationOptions() {
    return [
      {
        key: 'smsUrgentUpdates',
        label: 'Urgent Permit Updates',
        description: 'Critical status changes requiring immediate attention',
        value: this.smsUrgentUpdates,
      },
      {
        key: 'smsInspectionReminders',
        label: 'Inspection Reminders',
        description: 'Day-before inspection reminders',
        value: this.smsInspectionReminders,
      },
    ];
  }

  // Marketing options
  get marketingOptions() {
    return [
      {
        key: 'marketingProductUpdates',
        label: 'Product Updates',
        description: 'New features and improvements',
        value: this.marketingProductUpdates,
      },
      {
        key: 'marketingTips',
        label: 'Tips & Best Practices',
        description: 'Weekly tips to get the most out of the platform',
        value: this.marketingTips,
      },
      {
        key: 'marketingPromotions',
        label: 'Promotional Offers',
        description: 'Special deals and discounts',
        value: this.marketingPromotions,
      },
    ];
  }

  @action
  attemptSMSToggle() {
    if (!this.hasSMSAccess) {
      this.notifications.warning(
        'SMS notifications are a premium feature. Please upgrade your plan.',
      );
      this.router.transitionTo(this.subscriptionRoute);
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

  @action
  goToSubscription() {
    this.router.transitionTo(this.subscriptionRoute);
  }

  async saveNotificationSettings() {
    const settings = {
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
    };

    // Call parent save handler if provided
    if (this.args.onSave) {
      await this.args.onSave(settings);
    }

    // TODO: Implement API call to save notification preferences
    console.log('Saving notification settings:', settings);
  }
}
