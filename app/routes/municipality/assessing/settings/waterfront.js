import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MunicipalityAssessingSettingsWaterfrontRoute extends Route {
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
      // Fetch water bodies, water body ladders, and waterfront attributes for this municipality
      // Pass year parameter to year-aware endpoints
      const [
        waterBodiesResponse,
        waterBodyLaddersResponse,
        waterfrontAttributesResponse,
      ] = await Promise.all([
        this.api.get(`/municipalities/${municipalityId}/water-bodies`),
        this.api.get(
          `/municipalities/${municipalityId}/water-body-ladders?year=${year}`,
        ),
        this.api.get(`/municipalities/${municipalityId}/waterfront-attributes`),
      ]);

      const waterBodies = waterBodiesResponse.waterBodies || [];
      const waterBodyLadders = waterBodyLaddersResponse.ladderEntries || [];
      const waterfrontAttributes =
        waterfrontAttributesResponse.waterfrontAttributes || [];

      // Extract year and lock status from water body ladders response
      const configYear = waterBodyLaddersResponse.year || year;
      const isYearLocked = waterBodyLaddersResponse.isYearLocked || false;

      console.log('Loaded water bodies from API:', waterBodies);
      console.log('Loaded water body ladders from API:', waterBodyLadders);
      console.log(
        'Loaded waterfront attributes from API:',
        waterfrontAttributes,
      );
      console.log('Config year:', configYear, 'Is locked:', isYearLocked);

      return {
        ...parentModel,
        waterBodies: waterBodies,
        waterBodyLadders: waterBodyLadders,
        waterfrontAttributes: waterfrontAttributes,
        configYear: configYear,
        isYearLocked: isYearLocked,
      };
    } catch (error) {
      console.error('Error loading waterfront data:', error);
      // Return empty arrays if API calls fail
      return {
        ...parentModel,
        waterBodies: [],
        waterBodyLadders: [],
        waterfrontAttributes: [],
        configYear: year,
        isYearLocked: false,
      };
    }
  }
}
