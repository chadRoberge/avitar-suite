import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import { loadStripe } from '@stripe/stripe-js';

export default class MunicipalityBuildingPermitsSettingsSubscriptionController extends Controller {
  @service api;
  @service notifications;
  @service router;
  @service municipality;

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

  get isContractor() {
    return this.model.isContractor;
  }

  get isCitizen() {
    return this.model.isCitizen;
  }

  get needsOnboarding() {
    // Citizens don't need onboarding - they can use the free plan immediately
    if (this.isCitizen) {
      return false;
    }
    return this.model.needsOnboarding || !this.contractor;
  }

  get billingEmail() {
    if (this.isContractor) {
      return this.contractor?.owner_user_id?.email || this.model.user?.email || '';
    }
    return this.model.user?.email || '';
  }

  get billingName() {
    if (this.isContractor) {
      return this.contractor?.company_name || '';
    }
    return `${this.model.user?.first_name || ''} ${this.model.user?.last_name || ''}`.trim();
  }

  get currentSubscription() {
    return this.model.subscription;
  }

  // Default free plan for users without a subscription
  get defaultFreePlan() {
    return {
      plan_key: 'free',
      name: 'Free',
      description: 'Basic access to submit and track building permits',
      pricing: { amount: 0, interval: 'month' },
      features: [
        'Submit and track building permits',
        'View permit status and inspection results',
        'Upload supporting documents',
        'Email notifications for permit updates',
      ],
      feature_flags: {},
    };
  }

  get currentPlan() {
    const planKey = this.currentSubscription?.plan || 'free';
    const foundPlan = this.model.plans.find((p) => p.plan_key === planKey);

    // If no plan found in the plans list, return the default free plan
    if (!foundPlan) {
      return this.defaultFreePlan;
    }

    return foundPlan;
  }

  get isFreePlan() {
    return (
      !this.currentSubscription ||
      this.currentPlan?.plan_key === 'free' ||
      this.currentSubscription?.plan === 'free'
    );
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
    return this.model.plans.filter(
      (plan) => plan.plan_key !== this.currentPlan?.plan_key,
    );
  }

  get displayPlans() {
    return this.model.plans.map((plan) => {
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

      let pricingText = 'Free';
      if (plan.pricing && plan.pricing.amount > 0) {
        const amount = plan.pricing.amount.toFixed(2);
        const interval = plan.pricing.interval || 'month';
        pricingText = `$${amount}/${interval}`;
      }

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
    // Contractors need a contractor profile before upgrading
    if (this.isContractor && !this.contractor) {
      this.notifications.error('Please complete your profile first');
      this.router.transitionTo(
        'municipality.building-permits.settings.account',
      );
      return;
    }

    this.selectedPlan = plan;
    this.showUpgradeModal = true;
  }

  @action
  closeUpgradeModal() {
    this.showUpgradeModal = false;
  }

  @action
  cancelUpgrade() {
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
    if (!this.selectedPlan) {
      console.error('No plan selected for upgrade');
      this.notifications.error('Please select a plan to upgrade');
      return;
    }

    const planToUpgrade = this.selectedPlan;
    this.closeUpgradeModal();

    const isUpgradingToPaid =
      this.isFreePlan && planToUpgrade.pricing?.amount > 0;

    if (isUpgradingToPaid) {
      this.paymentTitle = `Add Payment Method for ${planToUpgrade.name}`;
      this.paymentDescription = `Please add a payment method to upgrade to ${planToUpgrade.name} (${planToUpgrade.pricingText})`;
      this.paymentAmount = planToUpgrade.pricing?.amount || 0;
      this.showPaymentModal = true;
    } else {
      await this.changePlan();
    }
  }

  @action
  async handlePaymentMethodReady(paymentMethod) {
    this.isLoading = true;

    try {
      await this.changePlan(paymentMethod.id);
      this.closePaymentModal();
      await this.send('refreshModel');
    } catch (error) {
      console.error('Error processing payment:', error);
      this.notifications.error(error.message || 'Payment failed');
      throw error;
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
      const payload = {
        plan_key: this.selectedPlan.plan_key,
        stripe_price_id: this.selectedPlan.pricing?.price_id,
        stripe_product_id: this.selectedPlan.id,
        features: this.selectedPlan.feature_flags,
      };

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

      await this.api.post('/subscriptions/change-plan', payload);

      this.notifications.success('Subscription plan updated successfully!');
      this.selectedPlan = null;
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
    this.selectedPlan = null;
  }

  @action
  async cancelSubscription() {
    this.isLoading = true;

    try {
      await this.api.post('/subscriptions/cancel', {
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
    this.router.transitionTo(
      'municipality.building-permits.settings.payment-methods',
    );
  }

  @action
  async viewBillingHistory() {
    this.showBillingHistoryModal = true;
    this.isLoadingInvoices = true;

    try {
      // Use appropriate endpoint based on user type
      let endpoint;
      if (this.isContractor && this.contractor?._id) {
        endpoint = `/contractors/${this.contractor._id}/billing-history`;
      } else {
        endpoint = `/users/${this.model.user._id}/billing-history`;
      }

      const response = await this.api.get(endpoint);
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
