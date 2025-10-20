import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MunicipalityAssessingSettingsExemptionsCreditsRoute extends Route {
  @service api;
  @service assessing;

  async model() {
    const parentModel = this.modelFor('municipality.assessing.settings');
    const municipalityId = parentModel.municipality?.id;

    if (!municipalityId) {
      throw new Error('Municipality not found');
    }

    try {
      // Fetch exemption types directly (new approach)
      let response = await this.api.get(
        `/municipalities/${municipalityId}/exemption-types`,
        {},
        { showLoading: false },
      );

      let exemptionTypes = response.exemptionTypes || [];

      // If no exemption types exist, initialize the base ones
      if (exemptionTypes.length === 0) {
        console.log(
          'No exemption types found, initializing base exemption types...',
        );
        try {
          await this.api.post(
            `/municipalities/${municipalityId}/exemption-types/initialize`,
          );
          // Fetch again after initialization
          response = await this.api.get(
            `/municipalities/${municipalityId}/exemption-types`,
            {},
            { showLoading: false },
          );
          exemptionTypes = response.exemptionTypes || [];
        } catch (initError) {
          console.warn('Failed to initialize exemption types:', initError);
        }
      }

      const grouped = response.grouped || {};

      // Transform exemption types data for the UI
      const exemptions = {};
      const limits = {};
      const credits = {};
      const exemptionTypesData = {};

      exemptionTypes.forEach((exemptionType) => {
        switch (exemptionType.name) {
          case 'elderly_65_74':
            exemptions.elderly6574 = exemptionType.default_exemption_value || 0;
            exemptionTypesData.elderly6574DisplayName =
              exemptionType.display_name;
            exemptionTypesData.elderly6574Description =
              exemptionType.description;
            if (exemptionType.income_requirements) {
              limits.singleIncomeLimit =
                exemptionType.income_requirements.single_income_limit || 0;
              limits.marriedIncomeLimit =
                exemptionType.income_requirements.married_income_limit || 0;
            }
            if (exemptionType.asset_requirements) {
              limits.singleAssetLimit =
                exemptionType.asset_requirements.single_asset_limit || 0;
              limits.marriedAssetLimit =
                exemptionType.asset_requirements.married_asset_limit || 0;
            }
            break;
          case 'elderly_75_79':
            exemptions.elderly7579 = exemptionType.default_exemption_value || 0;
            exemptionTypesData.elderly7579DisplayName =
              exemptionType.display_name;
            exemptionTypesData.elderly7579Description =
              exemptionType.description;
            break;
          case 'elderly_80_plus':
            exemptions.elderly80plus =
              exemptionType.default_exemption_value || 0;
            exemptionTypesData.elderly80plusDisplayName =
              exemptionType.display_name;
            exemptionTypesData.elderly80plusDescription =
              exemptionType.description;
            break;
          case 'blind_exemption':
            exemptions.blindExemption =
              exemptionType.default_exemption_value || 0;
            exemptionTypesData.blindDisplayName = exemptionType.display_name;
            exemptionTypesData.blindDescription = exemptionType.description;
            break;
          case 'disabled_exemption':
            exemptions.physicalHandicapExemption =
              exemptionType.default_exemption_value || 0;
            exemptionTypesData.physicalHandicapDisplayName =
              exemptionType.display_name;
            exemptionTypesData.physicalHandicapDescription =
              exemptionType.description;
            break;
          case 'veteran_standard':
            credits.veteranCredit = exemptionType.default_credit_value || 0;
            exemptionTypesData.veteranDisplayName = exemptionType.display_name;
            exemptionTypesData.veteranDescription = exemptionType.description;
            break;
          case 'veteran_all':
            credits.allVeteranCredit = exemptionType.default_credit_value || 0;
            exemptionTypesData.allVeteranDisplayName =
              exemptionType.display_name;
            exemptionTypesData.allVeteranDescription =
              exemptionType.description;
            break;
          case 'veteran_disabled':
            credits.disabledVeteranCredit =
              exemptionType.default_credit_value || 0;
            exemptionTypesData.disabledVeteranDisplayName =
              exemptionType.display_name;
            exemptionTypesData.disabledVeteranDescription =
              exemptionType.description;
            break;
          case 'veteran_surviving_spouse':
            credits.survivingSpouseCredit =
              exemptionType.default_credit_value || 0;
            exemptionTypesData.survivingSpouseDisplayName =
              exemptionType.display_name;
            exemptionTypesData.survivingSpouseDescription =
              exemptionType.description;
            break;
        }
      });

      // Load institutional exemptions from exemption types
      const institutionalExemptions = {
        religious: [],
        educational: [],
        charitable: [],
      };

      exemptionTypes.forEach((exemptionType) => {
        if (exemptionType.category === 'institutional') {
          const item = {
            name: exemptionType.display_name,
            amount: exemptionType.default_exemption_value || 0,
          };

          switch (exemptionType.subcategory) {
            case 'religious':
              institutionalExemptions.religious.push(item);
              break;
            case 'educational':
              institutionalExemptions.educational.push(item);
              break;
            case 'charitable':
              institutionalExemptions.charitable.push(item);
              break;
          }
        }
      });

      return {
        ...parentModel,
        exemptions,
        limits,
        credits,
        institutionalExemptions,
        exemptionTypes: exemptionTypesData,
        exemptionTypesRaw: exemptionTypes,
        exemptionTypesGrouped: grouped,
      };
    } catch (error) {
      console.error('Error loading exemption types:', error);

      // Return default values if API call fails
      return {
        ...parentModel,
        exemptions: {
          elderly6574: 0,
          elderly7579: 0,
          elderly80plus: 0,
          blindExemption: 0,
          physicalHandicapExemption: 0,
        },
        limits: {
          singleIncomeLimit: 0,
          marriedIncomeLimit: 0,
          singleAssetLimit: 0,
          marriedAssetLimit: 0,
        },
        credits: {
          veteranCredit: 0,
          allVeteranCredit: 0,
          disabledVeteranCredit: 0,
          survivingSpouseCredit: 0,
        },
        institutionalExemptions: {
          religious: [],
          educational: [],
          charitable: [],
        },
        exemptionTypes: {},
        exemptionTypesRaw: [],
        exemptionTypesGrouped: {},
      };
    }
  }

  setupController(controller, model) {
    super.setupController(controller, model);
    controller.setupController(model);
  }
}
