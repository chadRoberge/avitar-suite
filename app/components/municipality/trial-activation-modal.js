import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';

export default class MunicipalityTrialActivationModalComponent extends Component {
  @service api;
  @service notifications;
  @service municipality;

  @tracked billingEmail = this.args.billingEmail || '';
  @tracked isLoading = false;
  @tracked isSuccess = false;
  @tracked errorMessage = null;
  @tracked emailError = null;
  @tracked trialEndDate = null;

  get isValid() {
    return this.billingEmail && this.isValidEmail(this.billingEmail);
  }

  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  formatPrice(pricing) {
    if (!pricing || !pricing.amount) return 'Contact for pricing';

    const amount = pricing.amount.toFixed(2);
    const currency = pricing.currency || 'USD';

    if (pricing.interval === 'one_time') {
      return `$${amount} ${currency}`;
    }

    const intervalText =
      pricing.interval_count > 1
        ? `${pricing.interval_count} ${pricing.interval}s`
        : pricing.interval;

    return `$${amount} ${currency}/${intervalText}`;
  }

  @action
  updateBillingEmail(event) {
    this.billingEmail = event.target.value;
    this.emailError = null;
    this.errorMessage = null;
  }

  @action
  stopPropagation(event) {
    event.stopPropagation();
  }

  @action
  async startTrial() {
    // Validate email
    if (!this.billingEmail || !this.isValidEmail(this.billingEmail)) {
      this.emailError = 'Please enter a valid email address';
      return;
    }

    this.isLoading = true;
    this.errorMessage = null;

    try {
      const municipalityId = this.municipality.currentMunicipality?.id;
      const moduleName = this.args.module.module;

      console.log(
        `Starting trial for ${moduleName} in municipality ${municipalityId}`,
      );

      const response = await this.api.post(
        `/municipalities/${municipalityId}/modules/${moduleName}/trial`,
        {
          billingEmail: this.billingEmail,
        },
      );

      console.log('Trial started successfully:', response);

      // Calculate trial end date
      if (response.subscription?.trial_end) {
        this.trialEndDate = new Date(response.subscription.trial_end);
      } else {
        // Fallback: calculate 30 days from now
        this.trialEndDate = new Date();
        this.trialEndDate.setDate(this.trialEndDate.getDate() + 30);
      }

      // Show success state
      this.isSuccess = true;

      // Show notification
      this.notifications.success(
        `Trial activated for ${this.args.module.name}!`,
      );

      // Call success callback after a delay
      setTimeout(() => {
        this.args.onSuccess?.();
      }, 2000);
    } catch (error) {
      console.error('Trial activation error:', error);
      this.errorMessage =
        error.message || 'Failed to start trial. Please try again.';
      this.notifications.error('Failed to activate trial');
    } finally {
      this.isLoading = false;
    }
  }
}
