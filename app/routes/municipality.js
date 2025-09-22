import AuthenticatedRoute from './authenticated';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';

export default class MunicipalityRoute extends AuthenticatedRoute {
  @service municipality;
  @service session;
  @service router;

  async model(params) {
    try {
      const municipality = await this.municipality.loadMunicipality(
        params.municipality_slug,
      );

      // Verify user has access to this municipality
      if (!this.canUserAccessMunicipality(municipality)) {
        this.router.transitionTo('municipality-select');
        return;
      }

      return municipality;
    } catch (error) {
      console.error('Failed to load municipality:', error);
      // Redirect to selection if municipality not found
      this.router.transitionTo('municipality-select');
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

  canUserAccessMunicipality(municipality) {
    const user = this.session.data.authenticated.user;
    if (!user) return false;

    // System users can access any municipality
    if (user.userType === 'system' || user.role === 'avitar_staff') return true;

    // Other users must belong to this municipality
    return (
      user.municipality === municipality.id ||
      user.municipality === municipality._id
    );
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
