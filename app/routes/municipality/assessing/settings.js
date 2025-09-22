import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MunicipalityAssessingSettingsRoute extends Route {
  @service api;
  @service assessing;
  @service notifications;
  @service router;

  async model() {
    try {
      const municipality = this.modelFor('municipality');

      return {
        municipality,
        // Add any other settings data needed
        assessingSettings: {
          // Placeholder for future settings API
          loaded: true,
        },
      };
    } catch (error) {
      this.notifications.error('Failed to load assessing settings');
      throw error;
    }
  }

  // Redirect to general settings by default
  redirect(model, transition) {
    if (transition.to.name === 'municipality.assessing.settings.index') {
      this.router.transitionTo('municipality.assessing.settings.general');
    }
  }
}
