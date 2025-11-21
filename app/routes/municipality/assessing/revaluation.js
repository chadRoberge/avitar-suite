import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MunicipalityAssessingRevaluationRoute extends Route {
  @service api;
  @service municipality;
  @service('current-user') currentUser;
  @service router;

  async beforeModel() {
    // Only avitar_assessor, avitar_admin, and avitar_staff can access revaluations
    const allowedRoles = ['avitar_assessor', 'avitar_admin', 'avitar_staff'];
    if (!allowedRoles.includes(this.currentUser.user?.global_role)) {
      this.router.transitionTo('municipality.assessing.properties');
    }
  }

  async model() {
    const municipalityId = this.municipality.currentMunicipality?.id;

    try {
      // Get or create active revaluation
      let revaluationResponse = await this.api.get(
        `/municipalities/${municipalityId}/revaluations/active`,
      );

      let revaluation = revaluationResponse.revaluation;

      // If no active revaluation exists, create one
      if (!revaluation) {
        const currentYear = new Date().getFullYear();
        const createResponse = await this.api.post(
          `/municipalities/${municipalityId}/revaluations`,
          {
            effective_year: currentYear,
            global_settings: {
              base_year: currentYear,
              time_trend: [],
              current_use: {
                max_current_use_acreage: 2.0,
                current_use_rate_multiplier: 1.0,
              },
            },
          },
        );
        revaluation = createResponse.revaluation;
      }

      // Load all analysis sheets for this revaluation
      const sheetsResponse = await this.api.get(
        `/revaluations/${revaluation._id}/sheets`,
      );

      // Fetch sales history for analysis (only qualified/valid sales)
      const salesResponse = await this.api.get(
        `/municipalities/${municipalityId}/sales-history`,
        {
          limit: 100,
          sort: '-sale_date',
          validOnly: 'true',
        },
      );

      // Fetch current land use details for rate analysis
      const landCodesResponse = await this.api.get(
        `/municipalities/${municipalityId}/land-use-details`,
      );

      // Fetch current building codes for rate analysis
      const buildingCodesResponse = await this.api.get(
        `/municipalities/${municipalityId}/building-codes`,
      );

      // Map building codes to include base_rate (alias for rate)
      const buildingCodes = (buildingCodesResponse.buildingCodes || []).map(
        (code) => ({
          ...code,
          base_rate: code.rate,
        }),
      );

      // Map land use details to include base_rate (placeholder - will be calculated)
      const landCodes = (landCodesResponse.landUseDetails || []).map(
        (detail) => ({
          ...detail,
          base_rate: 0, // Land rates are determined through revaluation analysis
        }),
      );

      return {
        revaluation,
        sheets: sheetsResponse.sheets || [],
        sales: salesResponse.sales || [],
        totalSales: salesResponse.total || 0,
        landCodes,
        buildingCodes,
        currentMunicipality: this.municipality.currentMunicipality,
      };
    } catch (error) {
      console.error('Error loading revaluation data:', error);
      return {
        revaluation: null,
        sheets: [],
        sales: [],
        totalSales: 0,
        landCodes: [],
        buildingCodes: [],
        currentMunicipality: this.municipality.currentMunicipality,
      };
    }
  }
}
