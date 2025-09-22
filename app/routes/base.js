import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class BaseRoute extends Route {
  @service loading;
  @service api;

  beforeModel(transition) {
    // Start loading for route transitions
    const routeName = transition.to.name;
    const loadingMessage = this.getLoadingMessage(routeName);
    this.loadingId = this.loading.startLoading(loadingMessage);

    return super.beforeModel(...arguments);
  }

  afterModel() {
    // Stop loading after model is resolved
    if (this.loadingId) {
      this.loading.stopLoading(this.loadingId);
      this.loadingId = null;
    }

    return super.afterModel(...arguments);
  }

  getLoadingMessage(routeName) {
    const loadingMessages = {
      'municipality.assessing.settings.neighborhoods':
        'Loading neighborhoods...',
      'municipality.assessing.settings.land-details': 'Loading land details...',
      'municipality.assessing.settings.building-details':
        'Loading building details...',
      'municipality.assessing.settings.feature-details':
        'Loading feature details...',
      'municipality.assessing.settings.current-use':
        'Loading current use settings...',
      'municipality.assessing': 'Loading assessing module...',
      municipality: 'Loading municipality data...',
    };

    return loadingMessages[routeName] || 'Loading...';
  }

  // Override to provide optimistic loading
  async optimisticModel(modelPromise) {
    try {
      return await modelPromise;
    } catch (error) {
      console.error('Error loading model:', error);
      throw error;
    }
  }

  // Error handling
  error(error, transition) {
    if (this.loadingId) {
      this.loading.stopLoading(this.loadingId);
      this.loadingId = null;
    }

    console.error('Route error:', error);
    return super.error(error, transition);
  }
}
