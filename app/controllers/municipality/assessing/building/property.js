import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class MunicipalityAssessingBuildingPropertyController extends Controller {
  @service currentUser;
  @service assessing;

  @tracked showBuildingEditModal = false;
  @tracked showDepreciationEditModal = false;

  @action
  openBuildingEditModal() {
    if (this.currentUser.hasModulePermission('assessing', 'update')) {
      this.showBuildingEditModal = true;
    }
  }

  @action
  closeBuildingEditModal() {
    this.showBuildingEditModal = false;
  }

  @action
  openDepreciationEditModal() {
    if (this.currentUser.hasModulePermission('assessing', 'update')) {
      this.showDepreciationEditModal = true;
    }
  }

  @action
  closeDepreciationEditModal() {
    this.showDepreciationEditModal = false;
  }

  @action
  async refreshBuildingProperty() {
    try {
      // Clear cached data for this property to ensure fresh data on refresh
      const propertyId = this.model.property.id;
      const cardNumber = this.model.property.current_card || 1;

      if (this.assessing.localApi && this.assessing.localApi.clearCache) {
        const cacheKeys = [
          `_properties_${propertyId}_card_${cardNumber}`,
          `_properties_${propertyId}_assessment_building_card_${cardNumber}`,
          `_properties_${propertyId}_assessment_building`,
        ];
        cacheKeys.forEach((key) => {
          try {
            this.assessing.localApi.clearCache(key);
          } catch (e) {
            console.warn('Failed to clear cache key:', key, e);
          }
        });
      }

      // Use the route reference to refresh
      if (this.buildingRoute) {
        this.buildingRoute.refresh();
      }
    } catch (error) {
      console.error('Failed to refresh building property:', error);
    }
  }
}
