import Route from '@ember/routing/route';
import { service } from '@ember/service';
import { action } from '@ember/object';

export default class MunicipalityBuildingPermitsSettingsSubscriptionRoute extends Route {
  @service api;
  @service('current-user') currentUser;
  @service router;

  async beforeModel() {
    // Only residential users (citizens and contractors) can access subscriptions
    // Municipal staff don't have subscriptions in the building permits context
    if (!this.currentUser.isContractorOrCitizen) {
      this.router.transitionTo(
        'municipality.building-permits.settings.account',
      );
      return;
    }
  }

  async model() {
    try {
      const isContractor = this.currentUser.isContractor;
      const isCitizen = this.currentUser.isCitizen;

      let contractor = null;
      let citizen = null;
      let isOwner = false;
      let needsOnboarding = false;
      let plans = [];

      // Load data based on user type
      if (isContractor) {
        const contractorId = this.currentUser.user?.contractor_id;
        if (contractorId) {
          try {
            const contractorResponse = await this.api.get(
              `/contractors/${contractorId}`,
            );
            contractor = contractorResponse.contractor;
            isOwner = contractor?.owner_user_id === this.currentUser.user._id;
          } catch (error) {
            console.warn('Could not load contractor data:', error);
            needsOnboarding = true;
          }
        } else {
          needsOnboarding = true;
        }

        // Get contractor plans from Stripe
        try {
          const plansResponse = await this.api.get('/contractors/plans');
          plans = plansResponse.plans || [];
        } catch (error) {
          console.warn('Could not load contractor plans:', error);
        }
      } else if (isCitizen) {
        // Citizens don't need onboarding - they always have a free plan available
        needsOnboarding = false;

        // Get citizen plans from Stripe
        try {
          const plansResponse = await this.api.get('/citizens/plans');
          plans = plansResponse.plans || [];
        } catch (error) {
          console.warn('Could not load citizen plans:', error);
        }
      }

      // Get current subscription details
      let subscriptionData = null;
      try {
        subscriptionData = await this.api.get('/subscriptions/my-subscription');
      } catch (error) {
        console.warn('Could not load subscription data:', error);
      }

      return {
        contractor,
        citizen,
        user: this.currentUser.user,
        isOwner,
        isContractor,
        isCitizen,
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
      // Return minimal model on error with free plan
      return {
        contractor: null,
        citizen: null,
        user: this.currentUser.user,
        isOwner: false,
        isContractor: this.currentUser.isContractor,
        isCitizen: this.currentUser.isCitizen,
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
    this.refresh();
  }
}
