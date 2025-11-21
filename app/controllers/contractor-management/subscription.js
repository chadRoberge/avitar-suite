import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import { loadStripe } from '@stripe/stripe-js';

export default class ContractorManagementSubscriptionController extends Controller {
  @service api;
  @service notifications;
  @service router;

  @tracked isLoading = false;
  @tracked showUpgradeModal = false;
  @tracked showCancelModal = false;
  @tracked selectedPlan = null;
  @tracked showPaymentMethodModal = false;

  // Cancel modal options
  @tracked cancelImmediately = false;

  // Lazy-load Stripe promise
  _stripePromise = null;
  get stripePromise() {
    if (!this._stripePromise) {
      const config = this.owner.resolveRegistration('config:environment');
      const stripeKey = config.APP.STRIPE_PUBLISHABLE_KEY;
      this._stripePromise = loadStripe(stripeKey);
    }
    return this._stripePromise;
  }

  get contractor() {
    return this.model.contractor;
  }

  get needsOnboarding() {
    return this.model.needsOnboarding || !this.contractor;
  }

  get currentSubscription() {
    return this.model.subscription;
  }

  get currentPlan() {
    const planId = this.currentSubscription?.plan || 'free';
    return this.model.plans.find((p) => p.id === planId);
  }

  get isFreePlan() {
    return this.currentPlan?.id === 'free';
  }

  get hasActiveSubscription() {
    return (
      this.currentSubscription?.status === 'active' ||
      this.currentSubscription?.status === 'trial'
    );
  }

  get isCanceling() {
    return (
      this.hasActiveSubscription &&
      this.model.stripeSubscription?.cancel_at_period_end === true
    );
  }

  get availablePlans() {
    // Show all plans except the current one
    return this.model.plans.filter((plan) => plan.id !== this.currentPlan?.id);
  }

  get upcomingInvoiceAmount() {
    if (!this.model.upcomingInvoice) return null;
    return (this.model.upcomingInvoice.amount_due / 100).toFixed(2);
  }

  get nextBillingDate() {
    if (!this.currentSubscription?.current_period_end) return null;
    return new Date(this.currentSubscription.current_period_end);
  }

  /**
   * Format feature value for display
   */
  getFeatureDisplay(featureName, value) {
    if (typeof value === 'boolean') {
      return value ? 'Yes' : 'No';
    }

    if (featureName === 'max_team_members') {
      return value === -1 ? 'Unlimited' : value;
    }

    if (featureName === 'max_permits_per_month') {
      return value === -1 ? 'Unlimited' : value;
    }

    if (featureName === 'permit_fee_discount') {
      return value > 0 ? `${value}%` : 'None';
    }

    return value;
  }

  @action
  openUpgradeModal(plan) {
    if (!this.contractor) {
      this.notifications.error('Please complete your profile first');
      this.router.transitionTo('contractor-management.verification');
      return;
    }

    this.selectedPlan = plan;
    this.showUpgradeModal = true;
  }

  @action
  closeUpgradeModal() {
    this.showUpgradeModal = false;
    this.selectedPlan = null;
  }

  @action
  openCancelModal() {
    this.showCancelModal = true;
    this.cancelImmediately = false;
  }

  @action
  closeCancelModal() {
    this.showCancelModal = false;
    this.cancelImmediately = false;
  }

  @action
  toggleCancelImmediately(event) {
    this.cancelImmediately = event.target.checked;
  }

  @action
  async confirmUpgrade() {
    if (!this.selectedPlan) return;

    this.isLoading = true;

    try {
      // If no active subscription, create new one
      if (this.isFreePlan) {
        await this.createNewSubscription();
      } else {
        // Change existing subscription
        await this.changePlan();
      }
    } catch (error) {
      console.error('Error upgrading subscription:', error);
      this.notifications.error(error.message || 'Failed to upgrade subscription');
    } finally {
      this.isLoading = false;
    }
  }

  async createNewSubscription() {
    // For new subscriptions, we need payment method
    this.showPaymentMethodModal = true;
    this.closeUpgradeModal();

    this.notifications.info(
      'Please add a payment method to complete your subscription'
    );
  }

  async changePlan() {
    try {
      const response = await this.api.post('/subscriptions/change-plan', {
        new_plan_id: this.selectedPlan.id,
      });

      this.notifications.success('Subscription plan updated successfully!');
      this.closeUpgradeModal();

      // Refresh the page to update data
      this.send('refreshModel');
    } catch (error) {
      throw error;
    }
  }

  @action
  async cancelSubscription() {
    this.isLoading = true;

    try {
      const response = await this.api.post('/subscriptions/cancel', {
        cancel_immediately: this.cancelImmediately,
      });

      if (this.cancelImmediately) {
        this.notifications.success('Subscription canceled successfully');
      } else {
        this.notifications.success(
          'Subscription will be canceled at the end of the billing period'
        );
      }

      this.closeCancelModal();
      this.send('refreshModel');
    } catch (error) {
      console.error('Error canceling subscription:', error);
      this.notifications.error(error.message || 'Failed to cancel subscription');
    } finally {
      this.isLoading = false;
    }
  }

  @action
  async reactivateSubscription() {
    this.isLoading = true;

    try {
      await this.api.post('/subscriptions/reactivate');

      this.notifications.success('Subscription reactivated successfully!');
      this.send('refreshModel');
    } catch (error) {
      console.error('Error reactivating subscription:', error);
      this.notifications.error(error.message || 'Failed to reactivate subscription');
    } finally {
      this.isLoading = false;
    }
  }

  @action
  openPaymentMethods() {
    this.router.transitionTo('contractor-management.payment-methods');
  }

  @action
  viewBillingHistory() {
    // TODO: Implement billing history page
    this.notifications.info('Billing history coming soon');
  }

  @action
  stopPropagation(event) {
    event.stopPropagation();
  }
}
