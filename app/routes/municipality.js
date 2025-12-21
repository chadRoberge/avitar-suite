import AuthenticatedRoute from './authenticated';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';

export default class MunicipalityRoute extends AuthenticatedRoute {
  @service municipality;
  @service session;
  @service router;
  @service('current-user') currentUser;

  async model(params) {
    try {
      const municipality = await this.municipality.loadMunicipality(
        params.municipality_slug,
      );

      // Any authenticated user can access any active municipality
      // Access control is handled at the module level via permissions

      // CRITICAL: Update current user permissions for this municipality
      // This ensures permissions are loaded BEFORE the UI renders
      this.currentUser._updateCurrentPermissions();

      return municipality;
    } catch (error) {
      console.error('Failed to load municipality:', error);

      // Clear any saved default to prevent infinite loop
      localStorage.removeItem('defaultMunicipality');
      this.session.set('defaultMunicipality', null);

      // Redirect to selection if municipality not found or access denied
      this.router.transitionTo('municipality-select');

      // Return null to prevent further processing
      return null;
    }
  }

  setupController(controller, model) {
    super.setupController(controller, model);
    controller.municipality = model;
  }

  redirect(model, transition) {
    // If accessing /m/slug directly, redirect to dashboard
    if (transition.to.name === 'municipality.index') {
      this.router.transitionTo('municipality.dashboard');
    }
  }

  // Global error handling for municipality routes
  @action
  error(error) {
    console.error('Municipality route error:', error);

    if (
      error.message?.includes('Access denied') ||
      error.message?.includes('not available')
    ) {
      // Module access denied - redirect to dashboard with message
      this.router.transitionTo('municipality.dashboard');
      // Flash message could be shown here
      return true;
    }

    // Let other errors bubble up
    return false;
  }

  @action
  loading(transition, originRoute) {
    // Show loading state
    const controller = this.controllerFor('municipality');
    controller.set('isLoading', true);
    return true;
  }

  @action
  didTransition() {
    // Hide loading state
    const controller = this.controllerFor('municipality');
    controller.set('isLoading', false);
  }
}
