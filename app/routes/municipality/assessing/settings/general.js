import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MunicipalityAssessingSettingsGeneralRoute extends Route {
  @service api;
  @service assessing;

  async model() {
    const parentModel = this.modelFor('municipality.assessing.settings');

    return {
      ...parentModel,
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
