import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MunicipalityAssessingSettingsViewRoute extends Route {
  @service assessing;

  async model() {
    const parentModel = this.modelFor('municipality.assessing.settings');
    const municipalityId = parentModel.municipality.id;

    try {
      // Fetch view attributes for this municipality using assessing service
      const viewAttributes =
        await this.assessing.getViewAttributes(municipalityId);
      console.log(
        'Loaded view attributes from assessing service:',
        viewAttributes,
      );

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
