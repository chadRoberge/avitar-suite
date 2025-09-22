import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MunicipalityAssessingAiReviewRoute extends Route {
  @service municipality;
  @service router;

  beforeModel() {
    // This is an Enterprise feature - check if available
    if (!this.municipality.hasFeature('assessing', 'aiAbatementReview')) {
      this.router.transitionTo('municipality.assessing.properties');
      throw new Error(
        'AI Abatement Review feature is not available in your current subscription tier',
      );
    }
  }

  model() {
    // Load AI review data
    return {
      pendingReviews: [], // Would load from API
      completedReviews: [], // Would load from API
      aiModelVersion: this.municipality.getModuleSetting(
        'assessing',
        'aiModelVersion',
      ),
      reviewAccuracy: 95.2, // Would come from API
    };
  }
}
