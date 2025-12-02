import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';

export default class MunicipalitySettingsPaymentSetupController extends Controller {
  @service api;
  @service notifications;
  @service router;
  @service municipality;

  @tracked isLoading = false;
  @tracked isRefreshing = false;

  get municipalityId() {
    return this.municipality.currentMunicipality?.id;
  }

  get municipalitySlug() {
    return this.municipality.currentMunicipality?.slug;
  }

  get account() {
    return this.model.account;
  }

  get status() {
    return this.model.status;
  }

  get hasAccount() {
    return !!this.account?.stripe_account_id;
  }

  get isOnboardingComplete() {
    return this.account?.is_payment_setup_complete === true;
  }

  get isOnboarding() {
    return this.status === 'onboarding' && !this.isOnboardingComplete;
  }

  get isLinkExpired() {
    if (!this.account?.stripe_account_link_expires) return false;
    return new Date(this.account.stripe_account_link_expires) < new Date();
  }

  get statusBadgeClass() {
    if (this.isOnboardingComplete) {
      return 'avitar-badge avitar-badge--success';
    }
    if (this.status === 'onboarding') {
      return 'avitar-badge avitar-badge--warning';
    }
    if (this.status === 'restricted') {
      return 'avitar-badge avitar-badge--danger';
    }
    return 'avitar-badge avitar-badge--secondary';
  }

  get statusText() {
    if (this.isOnboardingComplete) {
      return 'Active';
    }
    if (this.status === 'onboarding') {
      return 'Onboarding Incomplete';
    }
    if (this.status === 'restricted') {
      return 'Restricted';
    }
    return 'Not Started';
  }

  @action
  async startOnboarding() {
    this.isLoading = true;

    try {
      const response = await this.api.post(
        `/municipalities/${this.municipalityId}/stripe-connect/onboarding`,
      );

      if (response.onboarding_url) {
        // Open Stripe onboarding in current window
        window.location.href = response.onboarding_url;
      } else {
        this.notifications.error('Failed to generate onboarding link');
      }
    } catch (error) {
      console.error('Error starting onboarding:', error);
      this.notifications.error(
        error.message || 'Failed to start payment setup',
      );
    } finally {
      this.isLoading = false;
    }
  }

  @action
  async refreshLink() {
    this.isRefreshing = true;

    try {
      const response = await this.api.post(
        `/municipalities/${this.municipalityId}/stripe-connect/refresh-link`,
      );

      if (response.onboarding_url) {
        // Open refreshed Stripe onboarding link
        window.location.href = response.onboarding_url;
      } else {
        this.notifications.error('Failed to refresh onboarding link');
      }
    } catch (error) {
      console.error('Error refreshing link:', error);
      this.notifications.error(
        error.message || 'Failed to refresh onboarding link',
      );
    } finally {
      this.isRefreshing = false;
    }
  }

  @action
  async checkStatus() {
    this.isLoading = true;

    try {
      // Refresh the route to reload data
      this.send('refreshModel');
      this.notifications.success('Status updated');
    } catch (error) {
      console.error('Error checking status:', error);
      this.notifications.error('Failed to update status');
    } finally {
      this.isLoading = false;
    }
  }
}
