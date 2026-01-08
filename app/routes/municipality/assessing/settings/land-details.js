import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MunicipalityAssessingSettingsLandDetailsRoute extends Route {
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
      // Fetch zones, land ladders, and acreage discount settings for this municipality
      // Pass year parameter for year-aware data
      const [zonesResponse, landLaddersResponse, acreageDiscountResponse] =
        await Promise.all([
          this.api.get(`/municipalities/${municipalityId}/zones`),
          this.api.get(
            `/municipalities/${municipalityId}/land-ladders?year=${year}`,
          ),
          this.api.get(
            `/municipalities/${municipalityId}/acreage-discount-settings`,
          ),
        ]);

      const zones = zonesResponse.zones || [];
      const landLadders = landLaddersResponse.landLadders || [];
      const acreageDiscountSettings =
        acreageDiscountResponse.acreageDiscountSettings || null;
      const configYear = landLaddersResponse.year || year;
      const isYearLocked = landLaddersResponse.isYearLocked || false;

      console.log('Loaded zones from API:', zones);
      console.log('Loaded land ladders from API:', landLadders);
      console.log('Config year:', configYear, 'Is locked:', isYearLocked);

      return {
        ...parentModel,
        zones: zones,
        landLadders: landLadders,
        acreageDiscountSettings: acreageDiscountSettings,
        configYear: configYear,
        isYearLocked: isYearLocked,
      };
    } catch (error) {
      console.error('Error loading land details data:', error);
      // Return empty arrays if API calls fail
      return {
        ...parentModel,
        zones: [],
        landLadders: [],
        acreageDiscountSettings: null,
        configYear: year,
        isYearLocked: false,
      };
    }
  }
}
