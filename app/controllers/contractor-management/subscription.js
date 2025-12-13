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
  @tracked showPaymentModal = false;
  @tracked showBillingHistoryModal = false;
  @tracked billingInvoices = [];
  @tracked isLoadingInvoices = false;

  // Cancel modal options
  @tracked cancelImmediately = false;

  // Payment modal data
  @tracked paymentTitle = '';
  @tracked paymentDescription = '';
  @tracked paymentAmount = 0;

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

  get billingEmail() {
    return this.contractor?.owner_user_id?.email || '';
  }

  get billingName() {
    return this.contractor?.company_name || '';
  }

  get currentSubscription() {
    return this.model.subscription;
  }

  get currentPlan() {
    const planKey = this.currentSubscription?.plan || 'free';
    return this.model.plans.find((p) => p.plan_key === planKey);
  }

  get isFreePlan() {
    return this.currentPlan?.plan_key === 'free';
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
    return this.model.plans.filter(
      (plan) => plan.plan_key !== this.currentPlan?.plan_key,
    );
  }

  // Transform plans for display (similar to verification controller)
  get displayPlans() {
    return this.model.plans.map((plan) => {
      // Determine icon and color based on plan key
      let icon = 'gift';
      let color = 'blue';

      if (plan.plan_key === 'free') {
        icon = 'gift';
        color = 'blue';
      } else if (plan.plan_key === 'premium') {
        icon = 'star';
        color = 'purple';
      } else if (plan.plan_key === 'pro') {
        icon = 'rocket';
        color = 'gold';
      }

      // Build pricing display
      let pricingText = 'Free';
      if (plan.pricing && plan.pricing.amount > 0) {
        const amount = plan.pricing.amount.toFixed(2);
        const interval = plan.pricing.interval || 'month';
        pricingText = `$${amount}/${interval}`;
      }

      // Extract feature list (server already extracted from marketing_features)
      const featureList = plan.features || [];

      return {
        ...plan,
        icon,
        color,
        pricingText,
        featureList,
        isCurrent: plan.plan_key === this.currentPlan?.plan_key,
      };
    });
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
    // Don't clear selectedPlan here - we need it for the payment flow
    // It will be cleared in closePaymentModal or after successful plan change
  }

  @action
  cancelUpgrade() {
    this.showUpgradeModal = false;
    this.selectedPlan = null; // Clear when user cancels
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
    if (!this.selectedPlan) {
      console.error('No plan selected for upgrade');
      this.notifications.error('Please select a plan to upgrade');
      return;
    }

    // Store the plan reference before closing modal
    const planToUpgrade = this.selectedPlan;

    // Close upgrade confirmation modal
    this.closeUpgradeModal();

    // Check if upgrading from Free to a paid plan
    // In this case, we need to collect/confirm payment method first
    const isUpgradingToPaid =
      this.isFreePlan && planToUpgrade.pricing?.amount > 0;

    if (isUpgradingToPaid) {
      // Show payment modal to collect payment method
      this.paymentTitle = `Add Payment Method for ${planToUpgrade.name}`;
      this.paymentDescription = `Please add a payment method to upgrade to ${planToUpgrade.name} (${planToUpgrade.pricingText})`;
      this.paymentAmount = planToUpgrade.pricing?.amount || 0;
      this.showPaymentModal = true;
    } else {
      // All other plan changes: directly update subscription
      await this.changePlan();
    }
  }

  @action
  async handlePaymentMethodReady(paymentMethod) {
    // This is called when user submits payment in the modal
    this.isLoading = true;

    try {
      // Attach payment method and update subscription
      // This is used when upgrading from Free to a paid plan
      await this.changePlan(paymentMethod.id);

      // Close payment modal
      this.closePaymentModal();

      // Refresh the route to reload subscription data from server
      await this.send('refreshModel');
    } catch (error) {
      console.error('Error processing payment:', error);
      this.notifications.error(error.message || 'Payment failed');
      throw error; // Re-throw so modal shows error
    } finally {
      this.isLoading = false;
    }
  }

  async createNewSubscription(paymentMethodId) {
    try {
      const response = await this.api.post('/subscriptions/subscribe', {
        plan_key: this.selectedPlan.plan_key,
        stripe_price_id: this.selectedPlan.pricing?.price_id,
        stripe_product_id: this.selectedPlan.id,
        features: this.selectedPlan.feature_flags,
        payment_method_id: paymentMethodId,
      });

      console.log('Subscription response:', response);

      // If there's a client secret, confirm the payment (required for default_incomplete behavior)
      if (response.client_secret) {
        console.log('Confirming payment with client secret...');
        const stripe = await this.stripePromise;
        const { error } = await stripe.confirmCardPayment(
          response.client_secret,
        );

        if (error) {
          console.error('Payment confirmation error:', error);
          throw new Error(error.message);
        }
        console.log('Payment confirmed successfully');
      }

      this.notifications.success('Subscription created successfully!');
    } catch (error) {
      console.error('Create subscription error:', error);
      throw error;
    }
  }

  async changePlan(paymentMethodId = null) {
    try {
      // All plans (including Free) now require Stripe IDs
      const payload = {
        plan_key: this.selectedPlan.plan_key,
        stripe_price_id: this.selectedPlan.pricing?.price_id,
        stripe_product_id: this.selectedPlan.id,
        features: this.selectedPlan.feature_flags,
      };

      // Include payment method if provided (for Free → Paid upgrades)
      if (paymentMethodId) {
        payload.payment_method_id = paymentMethodId;
      }

      console.log(
        'Changing plan to:',
        payload.plan_key,
        'Price ID:',
        payload.stripe_price_id,
        'Payment method:',
        paymentMethodId ? 'provided' : 'none',
      );

      const response = await this.api.post(
        '/subscriptions/change-plan',
        payload,
      );

      this.notifications.success('Subscription plan updated successfully!');

      // Clear selected plan after successful change
      this.selectedPlan = null;

      // Refresh the route to reload subscription data
      await this.send('refreshModel');
    } catch (error) {
      throw error;
    }
  }

  @action
  closePaymentModal() {
    this.showPaymentModal = false;
    this.paymentTitle = '';
    this.paymentDescription = '';
    this.paymentAmount = 0;
    this.selectedPlan = null; // Clear selected plan after payment modal closes
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
          'Subscription will be canceled at the end of the billing period',
        );
      }

      this.closeCancelModal();
      await this.send('refreshModel');
    } catch (error) {
      console.error('Error canceling subscription:', error);
      this.notifications.error(
        error.message || 'Failed to cancel subscription',
      );
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
      await this.send('refreshModel');
    } catch (error) {
      console.error('Error reactivating subscription:', error);
      this.notifications.error(
        error.message || 'Failed to reactivate subscription',
      );
    } finally {
      this.isLoading = false;
    }
  }

  @action
  openPaymentMethods() {
    this.router.transitionTo('contractor-management.payment-methods');
  }

  @action
  async viewBillingHistory() {
    this.showBillingHistoryModal = true;
    this.isLoadingInvoices = true;

    try {
      const response = await this.api.get(
        `/contractors/${this.contractor._id}/billing-history`,
      );
      this.billingInvoices = response.invoices || [];
    } catch (error) {
      console.error('Error loading billing history:', error);
      this.notifications.error('Failed to load billing history');
      this.closeBillingHistoryModal();
    } finally {
      this.isLoadingInvoices = false;
    }
  }

  @action
  closeBillingHistoryModal() {
    this.showBillingHistoryModal = false;
    this.billingInvoices = [];
  }

  @action
  downloadInvoice(invoice) {
    if (invoice.invoice_pdf) {
      window.open(invoice.invoice_pdf, '_blank');
    } else {
      this.notifications.warning('Invoice PDF not available');
    }
  }

  @action
  viewInvoiceOnline(invoice) {
    if (invoice.hosted_invoice_url) {
      window.open(invoice.hosted_invoice_url, '_blank');
    } else {
      this.notifications.warning('Online invoice not available');
    }
  }

  @action
  stopPropagation(event) {
    event.stopPropagation();
  }
}
