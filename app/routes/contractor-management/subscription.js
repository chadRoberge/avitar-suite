import Route from '@ember/routing/route';
import { service } from '@ember/service';

export default class ContractorManagementSubscriptionRoute extends Route {
  @service api;
  @service('current-user') currentUser;
  @service router;

  async beforeModel() {
    // Only contractors can access subscriptions
    if (!this.currentUser.isContractor) {
      this.router.transitionTo('login');
      return;
    }
  }

  async model() {
    try {
      // Get contractor from parent route
      const parentModel = this.modelFor('contractor-management');

      // Get subscription plans
      const plansResponse = await this.api.get('/subscriptions/plans');

      // Get current subscription details if contractor exists
      let subscriptionData = null;
      if (parentModel.contractor) {
        try {
          subscriptionData = await this.api.get('/subscriptions/my-subscription');
        } catch (error) {
          console.warn('Could not load subscription data:', error);
        }
      }

      return {
        contractor: parentModel.contractor,
        user: parentModel.user,
        isOwner: parentModel.isOwner,
        needsOnboarding: parentModel.needsOnboarding,
        plans: plansResponse.plans,
        subscription: subscriptionData?.subscription || null,
        stripeSubscription: subscriptionData?.stripe_subscription || null,
        upcomingInvoice: subscriptionData?.upcoming_invoice || null,
      };
    } catch (error) {
      console.error('Error loading subscription:', error);
      // Return minimal model on error
      return {
        contractor: null,
        user: this.currentUser.user,
        isOwner: false,
        needsOnboarding: true,
        plans: [],
        subscription: null,
        stripeSubscription: null,
        upcomingInvoice: null,
      };
    }
  }
}
