import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MunicipalityAssessingSettingsFeatureDetailsRoute extends Route {
  @service api;
  @service assessing;

  queryParams = {
    year: {
      refreshModel: true,
    },
  };

  async model(params) {
    const parentModel = this.modelFor('municipality.assessing.settings');
    const municipalityId = parentModel.municipality.id;
    const year = params.year || new Date().getFullYear();

    try {
      // Fetch feature codes from API with year parameter
      const featureCodesResponse = await this.api.get(
        `/municipalities/${municipalityId}/feature-codes?year=${year}`,
      );

      // Extract year and lock status from response
      const configYear = featureCodesResponse.year || year;
      const isYearLocked = featureCodesResponse.isYearLocked || false;

      console.log('Loaded feature codes:', featureCodesResponse.featureCodes);
      console.log('Config year:', configYear, 'Is locked:', isYearLocked);

      return {
        ...parentModel,
        featureCodes: featureCodesResponse.featureCodes || [],
        configYear: configYear,
        isYearLocked: isYearLocked,
      };
    } catch (error) {
      console.error('Error loading feature codes:', error);
      return {
        ...parentModel,
        featureCodes: [],
        configYear: year,
        isYearLocked: false,
      };
    }
  }
}
