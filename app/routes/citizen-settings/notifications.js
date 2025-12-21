import Route from '@ember/routing/route';
import { service } from '@ember/service';

export default class CitizenSettingsNotificationsRoute extends Route {
  @service('current-user') currentUser;
  @service api;

  async model() {
    // Get user from parent route
    const parentModel = this.modelFor('citizen-settings');

    // Load notification preferences
    let preferences = null;
    try {
      const preferencesData = await this.api.get(
        '/users/me/notification-preferences',
      );
      preferences = preferencesData?.preferences || null;
    } catch (error) {
      console.warn('Could not load notification preferences:', error);
    }

    return {
      user: parentModel.user,
      subscription: parentModel.subscription,
      isContractor: parentModel.isContractor,
      preferences,
    };
  }
}
