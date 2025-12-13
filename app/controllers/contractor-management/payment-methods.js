import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';

export default class ContractorManagementPaymentMethodsController extends Controller {
  @service api;
  @service notifications;
  @service router;

  @tracked isLoading = false;
  @tracked showAddPaymentModal = false;

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

  get hasPremiumAccess() {
    // Premium, pro, enterprise plans have payment methods access
    return ['premium', 'pro', 'enterprise'].includes(this.currentPlan);
  }

  get paymentMethods() {
    // TODO: Fetch from API when backend is ready
    return this.contractor?.payment_methods || [];
  }

  @action
  openAddPaymentModal() {
    if (!this.hasPremiumAccess) {
      this.notifications.warning(
        'Payment methods are a premium feature. Please upgrade your plan.',
      );
      this.router.transitionTo('contractor-management.subscription');
      return;
    }

    this.showAddPaymentModal = true;
  }

  @action
  closeAddPaymentModal() {
    this.showAddPaymentModal = false;
  }

  @action
  stopPropagation(event) {
    event.stopPropagation();
  }

  @action
  async addPaymentMethod() {
    // TODO: Implement Stripe payment method addition
    this.notifications.info('Payment method integration coming soon');
    this.closeAddPaymentModal();
  }

  @action
  async removePaymentMethod(paymentMethodId) {
    if (!confirm('Are you sure you want to remove this payment method?')) {
      return;
    }

    this.isLoading = true;
    try {
      await this.api.delete(
        `/contractors/${this.contractor._id}/payment-methods/${paymentMethodId}`,
      );
      this.notifications.success('Payment method removed successfully');
      // Refresh model
      this.router.transitionTo('contractor-management.payment-methods');
    } catch (error) {
      console.error('Error removing payment method:', error);
      this.notifications.error(
        error.message || 'Failed to remove payment method',
      );
    } finally {
      this.isLoading = false;
    }
  }

  @action
  async setDefaultPaymentMethod(paymentMethodId) {
    this.isLoading = true;
    try {
      await this.api.post(
        `/contractors/${this.contractor._id}/payment-methods/${paymentMethodId}/set-default`,
      );
      this.notifications.success('Default payment method updated');
      // Refresh model
      this.router.transitionTo('contractor-management.payment-methods');
    } catch (error) {
      console.error('Error setting default payment method:', error);
      this.notifications.error(
        error.message || 'Failed to set default payment method',
      );
    } finally {
      this.isLoading = false;
    }
  }
}
