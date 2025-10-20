import Service from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { inject as service } from '@ember/service';

export default class PropertySelectionService extends Service {
  @service router;
  @service assessing;

  @tracked selectedProperty = null;

  constructor() {
    super(...arguments);
    // Clear selected property when navigating to non-property routes
    this.router.on('routeDidChange', () => {
      const currentRoute = this.router.currentRouteName;
      // Only clear property selection if we're navigating to routes that definitely don't need it
      // Keep property selection when navigating between modules that support property views
      if (currentRoute && this.shouldClearPropertySelection(currentRoute)) {
        this.clearSelectedProperty();
      }
    });
  }

  shouldClearPropertySelection(routeName) {
    // Don't clear if we're on a property route
    if (routeName.includes('.property')) {
      return false;
    }

    // Don't clear if we're on module index routes that support property navigation
    const propertyAwareModules = [
      'municipality.assessing',
      'municipality.building-permits',
      'municipality.tax-collection',
      'municipality.town-clerk',
      'municipality.motor-vehicle',
      'municipality.utility-billing',
    ];

    // Check if we're on a property-aware module (including sub-routes like land, general, etc.)
    const isPropertyAwareModule = propertyAwareModules.some((module) =>
      routeName.startsWith(module),
    );

    if (isPropertyAwareModule) {
      return false; // Keep property selection for property-aware modules
    }

    // Clear for other routes like dashboard, settings, etc.
    return true;
  }

  setSelectedProperty(property) {
    this.selectedProperty = property;
  }

  clearSelectedProperty() {
    this.selectedProperty = null;
  }

  get hasSelectedProperty() {
    return !!this.selectedProperty;
  }

  get selectedPropertyId() {
    return this.selectedProperty?.id;
  }

  // Get the appropriate route for an assessment section
  getAssessmentRoute(section) {
    if (!this.selectedProperty) {
      // No property selected, go to section index
      return `municipality.assessing.${section}`;
    }

    // Property selected, go to property route for that section
    return `municipality.assessing.${section}.property`;
  }

  // Refresh the current assessment totals for the selected property
  async refreshCurrentAssessmentTotals(
    assessmentYear = null,
    routeModel = null,
  ) {
    if (!this.selectedProperty) {
      return;
    }

    try {
      // Small delay to ensure backend has finished updating PropertyTreeNode.assessment_summary
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Fetch the property with network-first to get the latest assessment_summary with parcel totals
      const propertyData = await this.assessing.getProperty(
        this.selectedProperty.id,
        { strategy: 'network-first' },
      );

      if (propertyData) {
        const property = propertyData.property || propertyData;

        // Use assessment_summary which contains parcel totals (sum of all cards)
        const newAssessedValue =
          property.assessment_summary?.total_value ||
          property.assessed_value ||
          this.selectedProperty.assessed_value;

        // Update the selected property with fresh assessment totals
        // Force reactivity by creating a new object reference
        this.selectedProperty = {
          ...this.selectedProperty,
          assessed_value: newAssessedValue,
          assessment_summary: property.assessment_summary,
        };

        // Also update the route model's property if provided
        if (routeModel && routeModel.property) {
          routeModel.property.assessed_value = newAssessedValue;
          routeModel.property.assessment_summary = property.assessment_summary;

          if (assessmentYear) {
            routeModel.property.tax_year = assessmentYear;
          }
        }

        if (assessmentYear) {
          this.selectedProperty = {
            ...this.selectedProperty,
            tax_year: assessmentYear,
          };
        }

        console.log('Updated property assessment total (parcel):', newAssessedValue);
      }
    } catch (error) {
      console.warn('Could not refresh assessment totals:', error);
    }
  }
}
