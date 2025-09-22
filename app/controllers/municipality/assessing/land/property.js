import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action, set } from '@ember/object';

export default class MunicipalityAssessingLandPropertyController extends Controller {
  @service currentUser;
  @service assessing;

  @tracked showLandEditModal = false;

  @action
  openLandEditModal() {
    if (this.currentUser.hasModulePermission('assessing', 'update')) {
      this.showLandEditModal = true;
    }
  }

  @action
  closeLandEditModal() {
    this.showLandEditModal = false;
  }

  @action
  async refreshLandProperty() {
    try {
      console.log('Refreshing land property data...');
      // Refresh just the land assessment data instead of the entire route
      const propertyId = this.model.property.id;

      // Clear any cached data for this property first
      if (this.assessing.localApi && this.assessing.localApi.clearCache) {
        const cacheKeys = [
          `_properties_${propertyId}_assessment_land_card_1`,
          `_properties_${propertyId}_assessment_land`,
        ];
        cacheKeys.forEach((key) => {
          try {
            this.assessing.localApi.clearCache(key);
            console.log(`Cleared cache for key: ${key}`);
          } catch (e) {
            console.warn('Failed to clear cache key:', key, e);
          }
        });
      }

      const landAssessmentResponse =
        await this.assessing.getLandAssessment(propertyId);

      // Update the model with new land assessment data - keep original object references
      const landAssessment =
        landAssessmentResponse.assessment || landAssessmentResponse;

      console.log('Updated land assessment data:', landAssessment);

      // Use Ember's set method to ensure proper reactivity
      set(this, 'model.landAssessment', landAssessment);
      set(this, 'model.landHistory', landAssessmentResponse.history || []);
      set(this, 'model.comparables', landAssessmentResponse.comparables || []);

      // Force template recomputation by updating a dummy property
      this.notifyPropertyChange('model');

      console.log('Land property data refreshed successfully');
    } catch (error) {
      console.error('Failed to refresh land assessment:', error);
      // Fallback to route refresh if API call fails
      if (this.landRoute) {
        this.landRoute.refresh();
      }
    }
  }
}
