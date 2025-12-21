import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class CitizenSettingsRoute extends Route {
  @service('current-user') currentUser;
  @service api;
  @service router;

  async beforeModel() {
    // Citizens and contractors can access this route
    if (!this.currentUser.isContractorOrCitizen) {
      this.router.transitionTo('login');
      return;
    }
  }

  async model() {
    try {
      const user = this.currentUser.user;
      const isContractor = this.currentUser.isContractor;

      let accountData = null;
      let subscription = null;
      let paymentMethods = [];

      if (isContractor && user.contractor_id) {
        // For contractors, fetch from Contractor model
        const response = await this.api.get(
          `/contractors/${user.contractor_id}`,
        );
        accountData = response.contractor;
        subscription = accountData?.subscription || null;
        paymentMethods = accountData?.payment_methods || [];
      } else if (user.citizen_id) {
        // For citizens, fetch from Citizen model
        const response = await this.api.get(`/citizens/${user.citizen_id}`);
        accountData = response.citizen;
        subscription = accountData?.subscription || null;
        paymentMethods = accountData?.payment_methods || [];
      }

      return {
        user,
        accountData,
        subscription,
        paymentMethods,
        isContractor,
        needsOnboarding: !accountData?.subscription?.stripe_customer_id,
      };
    } catch (error) {
      console.error('Error loading citizen settings:', error);
      return {
        user: this.currentUser.user,
        accountData: null,
        subscription: null,
        paymentMethods: [],
        isContractor: this.currentUser.isContractor,
        needsOnboarding: true,
      };
    }
  }
}
