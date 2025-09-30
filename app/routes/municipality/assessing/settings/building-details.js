import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class BuildingDetailsRoute extends Route {
  @service api;

  async model() {
    const parentModel = this.modelFor('municipality.assessing.settings');
    const municipalityId = parentModel.municipality.id;

    try {
      // Fetch all building-related data in parallel
      const [
        buildingCodesResponse,
        buildingFeatureCodesResponse,
        sketchSubAreaFactorsResponse,
        miscellaneousPointsResponse,
        buildingCalculationConfigResponse,
        buildingTypeStatsResponse,
      ] = await Promise.all([
        this.api
          .get(`/municipalities/${municipalityId}/building-codes`)
          .catch((error) => {
            console.warn('Error fetching building codes:', error);
            return { buildingCodes: [] };
          }),
        this.api
          .get(`/municipalities/${municipalityId}/building-feature-codes`)
          .catch((error) => {
            console.warn('Error fetching building feature codes:', error);
            return [];
          }),
        this.api
          .get(`/municipalities/${municipalityId}/sketch-sub-area-factors`)
          .catch((error) => {
            console.warn('Error fetching sketch sub area factors:', error);
            return { sketchSubAreaFactors: [] };
          }),
        this.api
          .get(
            `/municipalities/${municipalityId}/building-miscellaneous-points`,
          )
          .catch((error) => {
            console.warn(
              'Error fetching building miscellaneous points:',
              error,
            );
            return {
              airConditioningPoints: 0,
              extraKitchenPoints: 0,
              generatorPoints: 0,
            };
          }),
        this.api
          .get(`/municipalities/${municipalityId}/building-calculation-config`)
          .catch((error) => {
            console.warn('Error fetching building calculation config:', error);
            return {
              config: {
                bedroom_bath_config: {
                  base: 5,
                  perBedroom: 3,
                  perFullBath: 2,
                  perHalfBath: 0.8,
                },
                calculation_factors: { pointMultiplier: 1.0, baseRate: 100 },
              },
            };
          }),
        this.api
          .get(`/municipalities/${municipalityId}/building-type-statistics`)
          .catch((error) => {
            console.warn('Error fetching building type statistics:', error);
            return {
              statistics: {
                residential: { median: 0, count: 0, min: 0, max: 0 },
                commercial: { median: 0, count: 0, min: 0, max: 0 },
                industrial: { median: 0, count: 0, min: 0, max: 0 },
                manufactured: { median: 0, count: 0, min: 0, max: 0 },
              },
            };
          }),
      ]);

      console.log(
        'Loaded building codes:',
        buildingCodesResponse.buildingCodes,
      );
      console.log(
        'Loaded building feature codes:',
        buildingFeatureCodesResponse,
      );
      console.log(
        'Loaded sketch sub area factors:',
        sketchSubAreaFactorsResponse.sketchSubAreaFactors,
      );

      return {
        municipality: parentModel.municipality,
        buildingCodes: buildingCodesResponse.buildingCodes || [],
        buildingFeatureCodes: buildingFeatureCodesResponse || [],
        sketchSubAreaFactors:
          sketchSubAreaFactorsResponse.sketchSubAreaFactors || [],
        miscellaneousPoints: miscellaneousPointsResponse || {
          airConditioningPoints: 0,
          extraKitchenPoints: 0,
          generatorPoints: 0,
        },
        buildingCalculationConfig:
          buildingCalculationConfigResponse?.config || {
            bedroom_bath_config: {
              base: 5,
              perBedroom: 3,
              perFullBath: 2,
              perHalfBath: 0.8,
            },
            calculation_factors: { pointMultiplier: 1.0, baseRate: 100 },
          },
        buildingTypeStats: buildingTypeStatsResponse?.statistics || {
          residential: { median: 0, count: 0, min: 0, max: 0 },
          commercial: { median: 0, count: 0, min: 0, max: 0 },
          industrial: { median: 0, count: 0, min: 0, max: 0 },
          manufactured: { median: 0, count: 0, min: 0, max: 0 },
        },
      };
    } catch (error) {
      console.error('Error loading building codes data:', error);

      // Return minimal model to prevent complete failure
      return {
        municipality: parentModel.municipality,
        buildingCodes: [],
        buildingFeatureCodes: [],
        sketchSubAreaFactors: [],
        miscellaneousPoints: {
          airConditioningPoints: 0,
          extraKitchenPoints: 0,
          generatorPoints: 0,
        },
        buildingCalculationConfig: {
          bedroom_bath_config: {
            base: 5,
            perBedroom: 3,
            perFullBath: 2,
            perHalfBath: 0.8,
          },
          calculation_factors: { pointMultiplier: 1.0, baseRate: 100 },
        },
        buildingTypeStats: {
          residential: { median: 0, count: 0, min: 0, max: 0 },
          commercial: { median: 0, count: 0, min: 0, max: 0 },
          industrial: { median: 0, count: 0, min: 0, max: 0 },
          manufactured: { median: 0, count: 0, min: 0, max: 0 },
        },
      };
    }
  }

  setupController(controller, model) {
    super.setupController(controller, model);

    // Initialize miscellaneous points values in controller
    if (model.miscellaneousPoints) {
      controller.airConditioningPoints =
        model.miscellaneousPoints.airConditioningPoints?.toString() || '0';
      controller.extraKitchenPoints =
        model.miscellaneousPoints.extraKitchenPoints?.toString() || '0';
      controller.generatorPoints =
        model.miscellaneousPoints.generatorPoints?.toString() || '0';
    }

    // Initialize building calculation config values in controller
    if (model.buildingCalculationConfig) {
      const config = model.buildingCalculationConfig;
      controller.calculationConfig = {
        base: config.bedroom_bath_config?.base || 5,
        perBedroom: config.bedroom_bath_config?.perBedroom || 3,
        perFullBath: config.bedroom_bath_config?.perFullBath || 2,
        perHalfBath: config.bedroom_bath_config?.perHalfBath || 0.8,
        pointMultiplier: config.calculation_factors?.pointMultiplier || 1.0,
        baseRate: config.calculation_factors?.baseRate || 100,
      };

      // Initialize economies of scale from config if available
      if (config.economies_of_scale) {
        // Store the actual saved database values for graph generation
        controller.savedEconomiesOfScale = {
          residential: {
            median_size:
              config.economies_of_scale.residential?.median_size || 1800,
            smallest_size:
              config.economies_of_scale.residential?.smallest_size || 100,
            smallest_factor:
              config.economies_of_scale.residential?.smallest_factor || 3.0,
            largest_size:
              config.economies_of_scale.residential?.largest_size || 15000,
            largest_factor:
              config.economies_of_scale.residential?.largest_factor || 0.75,
            curve_type:
              config.economies_of_scale.residential?.curve_type || 'linear',
            curve_steepness:
              config.economies_of_scale.residential?.curve_steepness || 1.0,
          },
          commercial: {
            median_size:
              config.economies_of_scale.commercial?.median_size || 5000,
            smallest_size:
              config.economies_of_scale.commercial?.smallest_size || 500,
            smallest_factor:
              config.economies_of_scale.commercial?.smallest_factor || 2.5,
            largest_size:
              config.economies_of_scale.commercial?.largest_size || 50000,
            largest_factor:
              config.economies_of_scale.commercial?.largest_factor || 0.8,
            curve_type:
              config.economies_of_scale.commercial?.curve_type || 'linear',
            curve_steepness:
              config.economies_of_scale.commercial?.curve_steepness || 1.0,
          },
          industrial: {
            median_size:
              config.economies_of_scale.industrial?.median_size || 10000,
            smallest_size:
              config.economies_of_scale.industrial?.smallest_size || 1000,
            smallest_factor:
              config.economies_of_scale.industrial?.smallest_factor || 2.0,
            largest_size:
              config.economies_of_scale.industrial?.largest_size || 100000,
            largest_factor:
              config.economies_of_scale.industrial?.largest_factor || 0.85,
            curve_type:
              config.economies_of_scale.industrial?.curve_type || 'linear',
            curve_steepness:
              config.economies_of_scale.industrial?.curve_steepness || 1.0,
          },
          manufactured: {
            median_size:
              config.economies_of_scale.manufactured?.median_size || 1200,
            smallest_size:
              config.economies_of_scale.manufactured?.smallest_size || 50,
            smallest_factor:
              config.economies_of_scale.manufactured?.smallest_factor || 4.0,
            largest_size:
              config.economies_of_scale.manufactured?.largest_size || 3000,
            largest_factor:
              config.economies_of_scale.manufactured?.largest_factor || 0.7,
            curve_type:
              config.economies_of_scale.manufactured?.curve_type || 'linear',
            curve_steepness:
              config.economies_of_scale.manufactured?.curve_steepness || 1.0,
          },
        };

        // Store form values (these can be edited before saving)
        controller.economiesOfScale = {
          residential: {
            median_size:
              config.economies_of_scale.residential?.median_size || 1800,
            smallest_size:
              config.economies_of_scale.residential?.smallest_size || 100,
            smallest_factor:
              config.economies_of_scale.residential?.smallest_factor || 3.0,
            largest_size:
              config.economies_of_scale.residential?.largest_size || 15000,
            largest_factor:
              config.economies_of_scale.residential?.largest_factor || 0.75,
            curve_type:
              config.economies_of_scale.residential?.curve_type || 'linear',
            curve_steepness:
              config.economies_of_scale.residential?.curve_steepness || 1.0,
          },
          commercial: {
            median_size:
              config.economies_of_scale.commercial?.median_size || 5000,
            smallest_size:
              config.economies_of_scale.commercial?.smallest_size || 500,
            smallest_factor:
              config.economies_of_scale.commercial?.smallest_factor || 2.5,
            largest_size:
              config.economies_of_scale.commercial?.largest_size || 50000,
            largest_factor:
              config.economies_of_scale.commercial?.largest_factor || 0.8,
            curve_type:
              config.economies_of_scale.commercial?.curve_type || 'linear',
            curve_steepness:
              config.economies_of_scale.commercial?.curve_steepness || 1.0,
          },
          industrial: {
            median_size:
              config.economies_of_scale.industrial?.median_size || 10000,
            smallest_size:
              config.economies_of_scale.industrial?.smallest_size || 1000,
            smallest_factor:
              config.economies_of_scale.industrial?.smallest_factor || 2.0,
            largest_size:
              config.economies_of_scale.industrial?.largest_size || 100000,
            largest_factor:
              config.economies_of_scale.industrial?.largest_factor || 0.85,
            curve_type:
              config.economies_of_scale.industrial?.curve_type || 'linear',
            curve_steepness:
              config.economies_of_scale.industrial?.curve_steepness || 1.0,
          },
          manufactured: {
            median_size:
              config.economies_of_scale.manufactured?.median_size || 1200,
            smallest_size:
              config.economies_of_scale.manufactured?.smallest_size || 50,
            smallest_factor:
              config.economies_of_scale.manufactured?.smallest_factor || 4.0,
            largest_size:
              config.economies_of_scale.manufactured?.largest_size || 3000,
            largest_factor:
              config.economies_of_scale.manufactured?.largest_factor || 0.7,
            curve_type:
              config.economies_of_scale.manufactured?.curve_type || 'linear',
            curve_steepness:
              config.economies_of_scale.manufactured?.curve_steepness || 1.0,
          },
        };
      }
    }

    // Initialize building type statistics in controller
    if (model.buildingTypeStats) {
      controller.buildingTypeStats = model.buildingTypeStats;
    }

    // Load initial recalculation status
    controller.refreshRecalculationStatus();
  }
}
