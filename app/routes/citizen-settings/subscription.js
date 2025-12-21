import Route from '@ember/routing/route';
import { service } from '@ember/service';
import { action } from '@ember/object';

export default class CitizenSettingsSubscriptionRoute extends Route {
  @service api;
  @service('current-user') currentUser;
  @service router;

  async beforeModel() {
    // Citizens and contractors can access subscriptions
    if (!this.currentUser.isContractorOrCitizen) {
      this.router.transitionTo('login');
      return;
    }
  }

  async model() {
    try {
      // Get user from parent route
      const parentModel = this.modelFor('citizen-settings');
      const user = parentModel?.user || this.currentUser.user;
      const isContractor = parentModel?.isContractor || this.currentUser.isContractor;

      // Get subscription plans based on user type
      const plansEndpoint = isContractor ? '/contractors/plans' : '/citizens/plans';
      let plans = [];
      try {
        const plansResponse = await this.api.get(plansEndpoint);
        plans = plansResponse.plans || [];
      } catch (error) {
        console.warn('Could not load plans:', error);
      }

      // Get current subscription details
      let subscriptionData = null;
      try {
        subscriptionData = await this.api.get('/subscriptions/my-subscription');
      } catch (error) {
        console.warn('Could not load subscription data:', error);
        // Don't fail - just show free plan
      }

      // Determine if user needs onboarding
      // Citizens without a citizen_id need to be migrated, but can still see the free plan
      const hasCitizenAccount = !isContractor && user?.citizen_id;
      const hasContractorAccount = isContractor && user?.contractor_id;
      const needsOnboarding = isContractor
        ? !hasContractorAccount
        : false; // Citizens don't need onboarding - they can use free plan

      return {
        user,
        isContractor,
        needsOnboarding,
        plans,
        subscription: subscriptionData?.subscription || {
          plan: 'free',
          status: 'active',
        },
        stripeSubscription: subscriptionData?.stripe_subscription || null,
        upcomingInvoice: subscriptionData?.upcoming_invoice || null,
      };
    } catch (error) {
      console.error('Error loading subscription:', error);
      // Return minimal model with free plan on error
      return {
        user: this.currentUser.user,
        isContractor: this.currentUser.isContractor,
        needsOnboarding: false,
        plans: [],
        subscription: {
          plan: 'free',
          status: 'active',
        },
        stripeSubscription: null,
        upcomingInvoice: null,
      };
    }
  }

  @action
  refreshModel() {
    // Refresh this route's model
    this.refresh();
  }
}
