import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action, set } from '@ember/object';

export default class MunicipalityAssessingLandPropertyController extends Controller {
  @service currentUser;
  @service assessing;
  @service municipality;
  @service('property-selection') propertySelection;

  @tracked showLandEditModal = false;
  @tracked showViewEditModal = false;
  @tracked showWaterfrontEditModal = false;
  @tracked selectedView = null;
  @tracked selectedWaterfront = null;
  @tracked viewAttributes = [];
  @tracked waterBodies = [];
  @tracked zoneBaseViewValues = {};

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
      if (this.assessing.clearPropertyViewCaches) {
        // Use the new comprehensive cache clearing method
        this.assessing.clearPropertyViewCaches(propertyId);
      } else if (
        this.assessing.localApi &&
        this.assessing.localApi.clearCache
      ) {
        // Fallback to manual cache clearing
        const cacheKeys = [
          `_properties_${propertyId}_assessment_land_card_1`,
          `_properties_${propertyId}_assessment_land`,
          `property-views-${propertyId}`,
          `_properties_${propertyId}_views`,
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

      // Fetch both land assessment and property views to ensure we have the latest data
      const [landAssessmentResponse, viewsResponse] = await Promise.all([
        this.assessing.getLandAssessment(propertyId),
        this.assessing.getPropertyViews(propertyId),
      ]);

      // Update the model with new land assessment data - keep original object references
      const landAssessment =
        landAssessmentResponse.assessment || landAssessmentResponse;

      // Use the property views from the dedicated endpoint, fallback to land assessment views
      let views = [];
      if (viewsResponse && Array.isArray(viewsResponse.views)) {
        views = viewsResponse.views;
      } else if (viewsResponse && Array.isArray(viewsResponse)) {
        views = viewsResponse;
      } else {
        views = landAssessmentResponse?.views || [];
      }
      const viewsArray = Array.isArray(views) ? views : [];

      console.log('Updated land assessment data:', landAssessment);
      console.log('Updated views data:', viewsArray);

      // Use Ember's set method to ensure proper reactivity
      set(this, 'model.landAssessment', landAssessment);
      set(this, 'model.landHistory', landAssessmentResponse.history || []);
      set(this, 'model.comparables', landAssessmentResponse.comparables || []);
      set(this, 'model.views', [...viewsArray]);

      // Force template recomputation by updating a dummy property
      this.notifyPropertyChange('model');

      // Also refresh the assessment totals in the property header
      await this.propertySelection.refreshCurrentAssessmentTotals(
        null,
        this.model,
      );

      console.log('Land property data refreshed successfully');
    } catch (error) {
      console.error('Failed to refresh land assessment:', error);
      // Fallback to route refresh if API call fails
      if (this.landRoute) {
        this.landRoute.refresh();
      }
    }
  }

  // View Management Actions
  @action
  async openViewEditModal() {
    if (this.currentUser.hasModulePermission('assessing', 'update')) {
      console.log('openViewEditModal - loading view data...');
      await this.loadViewData();
      console.log(
        'openViewEditModal - viewAttributes loaded:',
        this.viewAttributes,
      );
      console.log(
        'openViewEditModal - viewAttributes length:',
        this.viewAttributes?.length,
      );
      console.log(
        'openViewEditModal - zoneBaseViewValues:',
        this.zoneBaseViewValues,
      );
      this.selectedView = null;
      this.showViewEditModal = true;
    }
  }

  @action
  closeViewEditModal() {
    this.showViewEditModal = false;
    this.selectedView = null;
  }

  @action
  async editView(view) {
    if (this.currentUser.hasModulePermission('assessing', 'update')) {
      await this.loadViewData();
      this.selectedView = view;
      this.showViewEditModal = true;
    }
  }

  @action
  async deleteView(view) {
    if (this.currentUser.hasModulePermission('assessing', 'update')) {
      if (confirm('Are you sure you want to delete this view?')) {
        try {
          await this.assessing.deletePropertyView(
            this.model.property.id,
            view.id,
          );
          await this.refreshLandProperty();
        } catch (error) {
          console.error('Failed to delete view:', error);
        }
      }
    }
  }

  @action
  async saveView(viewData) {
    try {
      // Add municipality ID to the view data
      const dataWithMunicipality = {
        ...viewData,
        municipalityId: this.municipality.currentMunicipality?.id,
      };

      if (this.selectedView) {
        await this.assessing.updatePropertyView(
          this.model.property.id,
          this.selectedView.id,
          dataWithMunicipality,
        );
      } else {
        await this.assessing.addPropertyView(
          this.model.property.id,
          dataWithMunicipality,
        );
      }
      await this.refreshLandProperty();
      this.closeViewEditModal();
    } catch (error) {
      console.error('Failed to save view:', error);
    }
  }

  async loadViewData() {
    try {
      // Use view attributes and zones from the model (loaded from land assessment API)
      if (this.model.viewAttributes && this.model.zones) {
        // Store all view attributes (filtering will be done in the component)
        this.viewAttributes = this.model.viewAttributes;

        // Create zone base view values map using zone codes (not IDs)
        const zoneViewValues = {};
        this.model.zones.forEach((zone) => {
          // Use zone name as the key since zones don't have a separate 'code' field
          const zoneCode = zone.name;
          if (zone.baseViewValue && zoneCode) {
            zoneViewValues[zoneCode] = zone.baseViewValue;
          }
        });
        this.zoneBaseViewValues = zoneViewValues;

        console.log('loadViewData - using data from model');
        console.log(
          'loadViewData - viewAttributes count:',
          this.viewAttributes?.length,
        );
        console.log('loadViewData - zones count:', this.model.zones?.length);
        console.log(
          'loadViewData - zoneBaseViewValues:',
          this.zoneBaseViewValues,
        );
      } else {
        console.warn(
          'loadViewData - viewAttributes or zones not found in model, falling back to API calls',
        );

        // Fallback to API calls if data not in model
        const municipalityId = this.municipality.currentMunicipality?.id;
        if (municipalityId) {
          const [viewAttributes, zones] = await Promise.all([
            this.assessing.getViewAttributes(municipalityId),
            this.assessing.getZones(municipalityId),
          ]);

          this.viewAttributes = viewAttributes;

          const zoneViewValues = {};
          zones.forEach((zone) => {
            const zoneCode = zone.name;
            if (zone.baseViewValue && zoneCode) {
              zoneViewValues[zoneCode] = zone.baseViewValue;
            }
          });
          this.zoneBaseViewValues = zoneViewValues;
        }
      }
    } catch (error) {
      console.error('Failed to load view data:', error);
    }
  }

  // Waterfront Management Actions
  @action
  async openWaterfrontEditModal() {
    if (this.currentUser.hasModulePermission('assessing', 'update')) {
      await this.loadWaterfrontData();
      this.selectedWaterfront = null;
      this.showWaterfrontEditModal = true;
    }
  }

  @action
  closeWaterfrontEditModal() {
    this.showWaterfrontEditModal = false;
    this.selectedWaterfront = null;
  }

  @action
  async editWaterfront(waterfront) {
    if (this.currentUser.hasModulePermission('assessing', 'update')) {
      await this.loadWaterfrontData();
      this.selectedWaterfront = waterfront;
      this.showWaterfrontEditModal = true;
    }
  }

  @action
  async deleteWaterfront(waterfront) {
    if (this.currentUser.hasModulePermission('assessing', 'update')) {
      if (confirm('Are you sure you want to delete this waterfront?')) {
        try {
          await this.assessing.deleteWaterfront(
            this.model.property.id,
            waterfront.id,
          );
          await this.refreshLandProperty();
        } catch (error) {
          console.error('Failed to delete waterfront:', error);
        }
      }
    }
  }

  @action
  async saveWaterfront(waterfrontData) {
    try {
      if (this.selectedWaterfront) {
        await this.assessing.updateWaterfront(
          this.model.property.id,
          this.selectedWaterfront.id,
          waterfrontData,
        );
      } else {
        await this.assessing.addWaterfront(
          this.model.property.id,
          waterfrontData,
        );
      }
      await this.refreshLandProperty();
      this.closeWaterfrontEditModal();
    } catch (error) {
      console.error('Failed to save waterfront:', error);
    }
  }

  async loadWaterfrontData() {
    try {
      const municipalityId = this.municipality.currentMunicipality?.id;
      if (municipalityId) {
        const waterBodies = await this.assessing.getWaterBodies(municipalityId);
        this.waterBodies = waterBodies;
      }
    } catch (error) {
      console.error('Failed to load waterfront data:', error);
    }
  }
}
