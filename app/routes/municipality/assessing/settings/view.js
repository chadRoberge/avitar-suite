import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MunicipalityAssessingSettingsViewRoute extends Route {
  @service api;
  @service assessing;

  async model() {
    const parentModel = this.modelFor('municipality.assessing.settings');
    const municipalityId = parentModel.municipality.id;

    try {
      // Fetch view attributes for this municipality
      const viewAttributesResponse = await this.api.get(
        `/municipalities/${municipalityId}/view-attributes`,
      );

      const viewAttributes = viewAttributesResponse.viewAttributes || [];
      console.log('Loaded view attributes from API:', viewAttributes);

      return {
        ...parentModel,
        viewAttributes: viewAttributes,
      };
    } catch (error) {
      console.error('Error loading view attributes data:', error);
      // Return empty array if API call fails
      return {
        ...parentModel,
        viewAttributes: [],
      };
    }
  }
}
