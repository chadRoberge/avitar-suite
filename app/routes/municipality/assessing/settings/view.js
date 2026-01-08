import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MunicipalityAssessingSettingsViewRoute extends Route {
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
      // Fetch view attributes for this municipality using assessing service
      // Pass year parameter for year-aware data
      const response = await this.assessing.getViewAttributes(
        municipalityId,
        year,
      );

      // Handle both array response (legacy) and object response with year info
      const viewAttributes = Array.isArray(response)
        ? response
        : response.viewAttributes || [];
      const configYear = response.year || year;
      const isYearLocked = response.isYearLocked || false;

      console.log(
        'Loaded view attributes from assessing service:',
        viewAttributes,
      );
      console.log('Config year:', configYear, 'Is locked:', isYearLocked);

      return {
        ...parentModel,
        viewAttributes: viewAttributes,
        configYear: configYear,
        isYearLocked: isYearLocked,
      };
    } catch (error) {
      console.error('Error loading view attributes data:', error);
      // Return empty array if API call fails
      return {
        ...parentModel,
        viewAttributes: [],
        configYear: year,
        isYearLocked: false,
      };
    }
  }
}
