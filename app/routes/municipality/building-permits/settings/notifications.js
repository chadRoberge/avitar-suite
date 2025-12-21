import Route from '@ember/routing/route';
import { service } from '@ember/service';

export default class MunicipalityBuildingPermitsSettingsNotificationsRoute extends Route {
  @service('current-user') currentUser;
  @service api;

  async model() {
    const user = this.currentUser.user;
    const isContractor = this.currentUser.isContractor;
    const isCitizen = this.currentUser.isCitizen;

    // Load subscription and notification preferences in parallel
    const [subscriptionData, preferencesData] = await Promise.all([
      this.api.get('/subscriptions/my-subscription').catch((error) => {
        console.warn('Could not load subscription data:', error);
        return { subscription: { plan: 'free' } };
      }),
      this.api.get('/users/me/notification-preferences').catch((error) => {
        console.warn('Could not load notification preferences:', error);
        return { preferences: null };
      }),
    ]);

    const subscription = subscriptionData?.subscription || { plan: 'free' };
    const preferences = preferencesData?.preferences || null;

    return {
      user,
      isContractor,
      isCitizen,
      subscription,
      currentPlan: subscription?.plan || 'free',
      preferences,
    };
  }
}
