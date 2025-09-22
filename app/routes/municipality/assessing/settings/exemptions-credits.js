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
      // Fetch exemptions and credits settings from API
      const response = await this.api.get(
        `/municipalities/${municipalityId}/exemptions-credits-settings`,
        {},
        { showLoading: false },
      );

      const apiSettings = response.settings || {};

      return {
        ...parentModel,
        exemptions: {
          elderly6574: apiSettings.elderlyExemptions?.elderly6574 || 0,
          elderly7579: apiSettings.elderlyExemptions?.elderly7579 || 0,
          elderly80plus: apiSettings.elderlyExemptions?.elderly80plus || 0,
          blindExemption: apiSettings.disabilityExemptions?.blindExemption || 0,
          physicalHandicapExemption:
            apiSettings.disabilityExemptions?.physicalHandicapExemption || 0,
        },
        limits: {
          singleIncomeLimit: apiSettings.elderlyLimits?.singleIncomeLimit || 0,
          marriedIncomeLimit:
            apiSettings.elderlyLimits?.marriedIncomeLimit || 0,
          singleAssetLimit: apiSettings.elderlyLimits?.singleAssetLimit || 0,
          marriedAssetLimit: apiSettings.elderlyLimits?.marriedAssetLimit || 0,
        },
        credits: {
          veteranCredit: apiSettings.veteranCredits?.veteranCredit || 0,
          allVeteranCredit: apiSettings.veteranCredits?.allVeteranCredit || 0,
          disabledVeteranCredit:
            apiSettings.veteranCredits?.disabledVeteranCredit || 0,
          survivingSpouseCredit:
            apiSettings.veteranCredits?.survivingSpouseCredit || 0,
        },
        institutionalExemptions: {
          religious: apiSettings.institutionalExemptions?.religious || [],
          educational: apiSettings.institutionalExemptions?.educational || [],
          charitable: apiSettings.institutionalExemptions?.charitable || [],
        },
      };
    } catch (error) {
      console.error('Error loading exemptions/credits settings:', error);

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
      };
    }
  }

  setupController(controller, model) {
    super.setupController(controller, model);
    controller.setupController(model);
  }
}
