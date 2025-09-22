import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MunicipalityAssessingSettingsFeatureDetailsRoute extends Route {
  @service api;
  @service assessing;

  async model() {
    const parentModel = this.modelFor('municipality.assessing.settings');
    const municipalityId = parentModel.municipality.id;

    try {
      // Fetch feature codes from API
      const featureCodesResponse = await this.api.get(
        `/municipalities/${municipalityId}/feature-codes`,
      );

      return {
        ...parentModel,
        featureCodes: featureCodesResponse.featureCodes || [],
      };
    } catch (error) {
      console.error('Error loading feature codes:', error);
      return {
        ...parentModel,
        featureCodes: [],
      };
    }
  }
}
