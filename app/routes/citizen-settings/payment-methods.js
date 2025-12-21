import Route from '@ember/routing/route';
import { service } from '@ember/service';

export default class CitizenSettingsPaymentMethodsRoute extends Route {
  @service api;
  @service('current-user') currentUser;

  async model() {
    try {
      // Get user from parent route
      const parentModel = this.modelFor('citizen-settings');

      // Load payment methods for the user
      const paymentMethodsResponse = await this.api.get(
        `/users/${parentModel.user._id}/payment-methods`,
      );

      return {
        user: parentModel.user,
        paymentMethods: paymentMethodsResponse.payment_methods || [],
      };
    } catch (error) {
      console.error('Error loading payment methods:', error);
      const parentModel = this.modelFor('citizen-settings');
      return {
        user: parentModel.user,
        paymentMethods: [],
      };
    }
  }
}
