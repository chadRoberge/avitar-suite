import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MunicipalityAssessingSettingsGeneralRoute extends Route {
  @service api;
  @service assessing;

  async model() {
    const parentModel = this.modelFor('municipality.assessing.settings');

    // Load year management data
    let yearManagementData = {
      years: [],
      hiddenYears: [],
      currentTaxYear: null,
    };
    try {
      const response = await this.assessing.getYearManagementData();
      if (response.success) {
        yearManagementData = response;
      }
    } catch (error) {
      console.error('Failed to load year management data:', error);
    }

    return {
      ...parentModel,
      yearManagementData,
      generalSettings: {
        // Default assessment year
        assessmentYear: new Date().getFullYear(),
        // Default property tax rate
        propertyTaxRate: 2.5,
        // Assessment ratio (percentage of market value)
        assessmentRatio: 100,
        // Exemption threshold
        exemptionThreshold: 0,
        // Enable sketch module
        enableSketch: true,
        // Enable AI review
        enableAIReview: false,
        // Default building type
        defaultBuildingType: 'residential',
        // State reporting configuration
        stateId: '',
        stateUrl: '',
      },
    };
  }
}
