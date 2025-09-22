import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MunicipalityAssessingSettingsWaterfrontRoute extends Route {
  @service api;
  @service assessing;

  async model() {
    const parentModel = this.modelFor('municipality.assessing.settings');
    const municipalityId = parentModel.municipality.id;

    try {
      // Fetch water bodies, water body ladders, and waterfront attributes for this municipality
      const [
        waterBodiesResponse,
        waterBodyLaddersResponse,
        waterfrontAttributesResponse,
      ] = await Promise.all([
        this.api.get(`/municipalities/${municipalityId}/water-bodies`),
        this.api.get(`/municipalities/${municipalityId}/water-body-ladders`),
        this.api.get(`/municipalities/${municipalityId}/waterfront-attributes`),
      ]);

      const waterBodies = waterBodiesResponse.waterBodies || [];
      const waterBodyLadders = waterBodyLaddersResponse.ladderEntries || [];
      const waterfrontAttributes =
        waterfrontAttributesResponse.waterfrontAttributes || [];

      console.log('Loaded water bodies from API:', waterBodies);
      console.log('Loaded water body ladders from API:', waterBodyLadders);
      console.log(
        'Loaded waterfront attributes from API:',
        waterfrontAttributes,
      );

      return {
        ...parentModel,
        waterBodies: waterBodies,
        waterBodyLadders: waterBodyLadders,
        waterfrontAttributes: waterfrontAttributes,
      };
    } catch (error) {
      console.error('Error loading waterfront data:', error);
      // Return empty arrays if API calls fail
      return {
        ...parentModel,
        waterBodies: [],
        waterBodyLadders: [],
        waterfrontAttributes: [],
      };
    }
  }
}
