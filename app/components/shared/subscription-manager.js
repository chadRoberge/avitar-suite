import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import { getOwner } from '@ember/application';
import { loadStripe } from '@stripe/stripe-js';

/**
 * Shared Subscription Manager Component
 *
 * Usage:
 * <Shared::SubscriptionManager
 *   @userType="contractor" or "citizen"
 *   @plans={{this.model.plans}}
 *   @subscription={{this.model.subscription}}
 *   @stripeSubscription={{this.model.stripeSubscription}}
 *   @upcomingInvoice={{this.model.upcomingInvoice}}
 *   @billingEmail={{this.billingEmail}}
 *   @billingName={{this.billingName}}
 *   @entityId={{this.contractor._id}} or {{this.user._id}}
 *   @paymentMethodsRoute="contractor-management.payment-methods"
 *   @onboardingRoute="contractor-management.verification"
 *   @needsOnboarding={{this.needsOnboarding}}
 *   @onRefresh={{this.refreshModel}} />
 */
export default class SharedSubscriptionManagerComponent extends Component {
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
      const owner = getOwner(this);
      const config = owner.resolveRegistration('config:environment');
      const stripeKey = config.APP.STRIPE_PUBLISHABLE_KEY;
      this._stripePromise = loadStripe(stripeKey);
    }
    return this._stripePromise;
  }

  get userType() {
    return this.args.userType || 'citizen';
  }

  get isContractor() {
    return this.userType === 'contractor';
  }

  get needsOnboarding() {
    return this.args.needsOnboarding || false;
  }

  get onboardingRoute() {
    return this.args.onboardingRoute || 'citizen-settings.subscription';
  }

  get paymentMethodsRoute() {
    return this.args.paymentMethodsRoute || 'citizen-settings.payment-methods';
  }

  get billingEmail() {
    return this.args.billingEmail || '';
  }

  get billingName() {
    return this.args.billingName || '';
  }

  get entityId() {
    return this.args.entityId;
  }

  get currentSubscription() {
    return this.args.subscription;
  }

  get plans() {
    return this.args.plans || [];
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
    const foundPlan = this.plans.find((p) => p.plan_key === planKey);

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

  // Check if user has no Stripe customer (truly new user)
  get hasNoStripeCustomer() {
    return !this.currentSubscription?.stripe_customer_id;
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
      this.args.stripeSubscription?.cancel_at_period_end === true
    );
  }

  get availablePlans() {
    // Show all plans except the current one
    return this.plans.filter(
      (plan) => plan.plan_key !== this.currentPlan?.plan_key,
    );
  }

  // Transform plans for display
  get displayPlans() {
    return this.plans.map((plan) => {
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
    if (!this.args.upcomingInvoice) return null;
    return (this.args.upcomingInvoice.amount_due / 100).toFixed(2);
  }

  get nextBillingDate() {
    if (!this.currentSubscription?.current_period_end) return null;
    return new Date(this.currentSubscription.current_period_end);
  }

  get billingHistoryEndpoint() {
    if (this.isContractor) {
      return `/contractors/${this.entityId}/billing-history`;
    }
    return `/users/${this.entityId}/billing-history`;
  }

  @action
  goToOnboarding() {
    this.router.transitionTo(this.onboardingRoute);
  }

  @action
  openUpgradeModal(plan) {
    if (this.needsOnboarding) {
      this.notifications.error('Please complete your profile first');
      this.router.transitionTo(this.onboardingRoute);
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

      if (this.args.onRefresh) {
        await this.args.onRefresh();
      }
    } catch (error) {
      console.error('Error processing payment:', error);
      this.notifications.error(error.message || 'Payment failed');
      throw error;
    } finally {
      this.isLoading = false;
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

      if (this.args.onRefresh) {
        await this.args.onRefresh();
      }
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

      if (this.args.onRefresh) {
        await this.args.onRefresh();
      }
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

      if (this.args.onRefresh) {
        await this.args.onRefresh();
      }
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
    this.router.transitionTo(this.paymentMethodsRoute);
  }

  @action
  async viewBillingHistory() {
    this.showBillingHistoryModal = true;
    this.isLoadingInvoices = true;

    try {
      const response = await this.api.get(this.billingHistoryEndpoint);
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
