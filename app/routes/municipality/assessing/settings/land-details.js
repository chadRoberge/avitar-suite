import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MunicipalityAssessingSettingsLandDetailsRoute extends Route {
  @service api;
  @service assessing;

  async model() {
    const parentModel = this.modelFor('municipality.assessing.settings');
    const municipalityId = parentModel.municipality.id;

    try {
      // Fetch zones, land ladders, and acreage discount settings for this municipality
      const [zonesResponse, landLaddersResponse, acreageDiscountResponse] =
        await Promise.all([
          this.api.get(`/municipalities/${municipalityId}/zones`),
          this.api.get(`/municipalities/${municipalityId}/land-ladders`),
          this.api.get(
            `/municipalities/${municipalityId}/acreage-discount-settings`,
          ),
        ]);

      const zones = zonesResponse.zones || [];
      const landLadders = landLaddersResponse.landLadders || [];
      const acreageDiscountSettings =
        acreageDiscountResponse.acreageDiscountSettings || null;
      console.log('Loaded zones from API:', zones);
      console.log('Loaded land ladders from API:', landLadders);
      console.log(
        'Loaded acreage discount settings from API:',
        acreageDiscountSettings,
      );

      return {
        ...parentModel,
        zones: zones,
        landLadders: landLadders,
        acreageDiscountSettings: acreageDiscountSettings,
      };
    } catch (error) {
      console.error('Error loading land details data:', error);
      // Return empty arrays if API calls fail
      return {
        ...parentModel,
        zones: [],
        landLadders: [],
        acreageDiscountSettings: null,
      };
    }
  }
}
