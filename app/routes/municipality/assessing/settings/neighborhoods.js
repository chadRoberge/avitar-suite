import BaseRoute from '../../../base';
import { inject as service } from '@ember/service';

export default class NeighborhoodsRoute extends BaseRoute {
  @service api;

  queryParams = {
    year: {
      refreshModel: true,
    },
  };

  async model(params) {
    const parentModel = this.modelFor('municipality.assessing.settings');
    const municipalityId = parentModel.municipality.id;
    const year = params.year || new Date().getFullYear();

    // Return optimistic model immediately
    const optimisticModel = {
      municipality: parentModel.municipality,
      neighborhoodCodes: [],
      landUseDetails: [],
      siteAttributes: [],
      drivewayAttributes: [],
      roadAttributes: [],
      topologyAttributes: [],
      landTaxationCategories: [],
      configYear: year,
      isYearLocked: false,
    };

    // Use optimistic loading to fetch data in background
    return this.optimisticModel(
      this.fetchNeighborhoodsData(municipalityId, year, optimisticModel),
    );
  }

  async fetchNeighborhoodsData(municipalityId, year, optimisticModel) {
    try {
      // Fetch all neighborhood-related data in parallel
      const [
        neighborhoodCodesResponse,
        landUseDetailsResponse,
        siteAttributesResponse,
        drivewayAttributesResponse,
        roadAttributesResponse,
        topologyAttributesResponse,
        landTaxationCategoriesResponse,
      ] = await Promise.all([
        // Fetch neighborhood codes (year-aware)
        this.api
          .get(
            `/municipalities/${municipalityId}/neighborhood-codes?year=${year}`,
            {},
            {
              showLoading: false, // Don't show loading for individual requests since we have global loading
              loadingMessage: 'Loading neighborhood codes...',
            },
          )
          .catch((error) => {
            console.warn('Error fetching neighborhood codes:', error);
            return { neighborhoodCodes: [] };
          }),

        // Fetch land use details
        this.api
          .get(
            `/municipalities/${municipalityId}/land-use-details`,
            {},
            {
              showLoading: false,
            },
          )
          .catch((error) => {
            console.warn('Error fetching land use details:', error);
            return { landUseDetails: [] };
          }),

        // Fetch site attributes
        this.api
          .get(
            `/municipalities/${municipalityId}/site-attributes`,
            {},
            {
              showLoading: false,
            },
          )
          .catch((error) => {
            console.warn('Error fetching site attributes:', error);
            return { siteAttributes: [] };
          }),

        // Fetch driveway attributes
        this.api
          .get(
            `/municipalities/${municipalityId}/driveway-attributes`,
            {},
            {
              showLoading: false,
            },
          )
          .catch((error) => {
            console.warn('Error fetching driveway attributes:', error);
            return { drivewayAttributes: [] };
          }),

        // Fetch road attributes
        this.api
          .get(
            `/municipalities/${municipalityId}/road-attributes`,
            {},
            {
              showLoading: false,
            },
          )
          .catch((error) => {
            console.warn('Error fetching road attributes:', error);
            return { roadAttributes: [] };
          }),

        // Fetch topology attributes
        this.api
          .get(
            `/municipalities/${municipalityId}/topology-attributes`,
            {},
            {
              showLoading: false,
            },
          )
          .catch((error) => {
            console.warn('Error fetching topology attributes:', error);
            return { topologyAttributes: [] };
          }),

        // Fetch land taxation categories
        this.api
          .get(
            `/municipalities/${municipalityId}/land-taxation-categories`,
            {},
            {
              showLoading: false,
            },
          )
          .catch((error) => {
            console.warn('Error fetching land taxation categories:', error);
            return { landTaxationCategories: [] };
          }),
      ]);

      // Extract year and lock status from neighborhood codes response
      const configYear =
        neighborhoodCodesResponse.year || optimisticModel.configYear;
      const isYearLocked = neighborhoodCodesResponse.isYearLocked || false;

      return {
        ...optimisticModel,
        neighborhoodCodes: neighborhoodCodesResponse.neighborhoodCodes || [],
        landUseDetails: landUseDetailsResponse.landUseDetails || [],
        siteAttributes: siteAttributesResponse.siteAttributes || [],
        drivewayAttributes: drivewayAttributesResponse.drivewayAttributes || [],
        roadAttributes: roadAttributesResponse.roadAttributes || [],
        topologyAttributes: topologyAttributesResponse.topologyAttributes || [],
        landTaxationCategories:
          landTaxationCategoriesResponse.landTaxationCategories || [],
        configYear: configYear,
        isYearLocked: isYearLocked,
      };
    } catch (error) {
      console.error('Error loading neighborhoods data:', error);
      return optimisticModel; // Return optimistic model on error
    }
  }
}
