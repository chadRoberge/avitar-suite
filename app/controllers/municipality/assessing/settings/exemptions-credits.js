import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';

export default class MunicipalityAssessingSettingsExemptionsCreditsController extends Controller {
  @service api;
  @service notifications;
  @service municipality;

  // Tracked properties for each section
  @tracked elderlyExemptions = {};
  @tracked disabilityExemptions = {};
  @tracked veteranCredits = {};
  @tracked institutionalExemptions = {
    religious: [],
    educational: [],
    charitable: [],
  };
  @tracked showRsaModal = false;
  @tracked currentRsaType = '';

  // Initialize tracked properties from model
  @action
  setupController(model) {
    this.elderlyExemptions = {
      elderly6574: model.exemptions.elderly6574,
      elderly7579: model.exemptions.elderly7579,
      elderly80plus: model.exemptions.elderly80plus,
      ...model.limits,
      // Display names and descriptions
      elderly6574DisplayName:
        model.exemptionTypes?.elderly6574DisplayName ||
        'Elderly Exemption (65-74)',
      elderly6574Description:
        model.exemptionTypes?.elderly6574Description ||
        'Property tax exemption for elderly residents aged 65-74',
      elderly7579DisplayName:
        model.exemptionTypes?.elderly7579DisplayName ||
        'Elderly Exemption (75-79)',
      elderly7579Description:
        model.exemptionTypes?.elderly7579Description ||
        'Property tax exemption for elderly residents aged 75-79',
      elderly80plusDisplayName:
        model.exemptionTypes?.elderly80plusDisplayName ||
        'Elderly Exemption (80+)',
      elderly80plusDescription:
        model.exemptionTypes?.elderly80plusDescription ||
        'Property tax exemption for elderly residents aged 80 and above',
    };
    this.disabilityExemptions = {
      blindExemption: model.exemptions.blindExemption,
      physicalHandicapExemption: model.exemptions.physicalHandicapExemption,
      // Display names and descriptions
      blindDisplayName:
        model.exemptionTypes?.blindDisplayName || 'Blind Exemption',
      blindDescription:
        model.exemptionTypes?.blindDescription ||
        'Property tax exemption for legally blind residents',
      physicalHandicapDisplayName:
        model.exemptionTypes?.physicalHandicapDisplayName ||
        'Physical Handicap Exemption',
      physicalHandicapDescription:
        model.exemptionTypes?.physicalHandicapDescription ||
        'Property tax exemption for residents with physical disabilities',
    };
    this.veteranCredits = {
      ...model.credits,
      // Display names and descriptions
      veteranDisplayName:
        model.exemptionTypes?.veteranDisplayName || 'Standard Veteran Credit',
      veteranDescription:
        model.exemptionTypes?.veteranDescription ||
        'Tax credit for qualified veterans',
      allVeteranDisplayName:
        model.exemptionTypes?.allVeteranDisplayName || 'All Veteran Credit',
      allVeteranDescription:
        model.exemptionTypes?.allVeteranDescription ||
        'Enhanced tax credit for veterans who served in multiple conflicts',
      disabledVeteranDisplayName:
        model.exemptionTypes?.disabledVeteranDisplayName ||
        'Disabled Veteran Credit',
      disabledVeteranDescription:
        model.exemptionTypes?.disabledVeteranDescription ||
        'Tax credit for veterans with service-connected disabilities',
      survivingSpouseDisplayName:
        model.exemptionTypes?.survivingSpouseDisplayName ||
        'Surviving Spouse Credit',
      survivingSpouseDescription:
        model.exemptionTypes?.survivingSpouseDescription ||
        'Tax credit for unmarried surviving spouses of qualified veterans',
    };
    this.institutionalExemptions = { ...model.institutionalExemptions };
  }

  @action
  updateElderlySettings(field, event) {
    const value = event.target.value;
    // Determine if field should be treated as number or string
    const isNumericField =
      field.includes('elderly') &&
      !field.includes('DisplayName') &&
      !field.includes('Description');
    this.elderlyExemptions = {
      ...this.elderlyExemptions,
      [field]: isNumericField ? Number(value) || 0 : value,
    };
  }

  @action
  updateDisabilitySettings(field, event) {
    const value = event.target.value;
    // Determine if field should be treated as number or string
    const isNumericField =
      field.includes('Exemption') &&
      !field.includes('DisplayName') &&
      !field.includes('Description');
    this.disabilityExemptions = {
      ...this.disabilityExemptions,
      [field]: isNumericField ? Number(value) || 0 : value,
    };
  }

  @action
  updateVeteranSettings(field, event) {
    const value = event.target.value;
    // Determine if field should be treated as number or string
    const isNumericField =
      field.includes('Credit') &&
      !field.includes('DisplayName') &&
      !field.includes('Description');
    this.veteranCredits = {
      ...this.veteranCredits,
      [field]: isNumericField ? Number(value) || 0 : value,
    };
  }

  @action
  async saveElderlySettings(data) {
    try {
      const municipalityId = this.municipality.currentMunicipality?.id;
      if (!municipalityId) {
        throw new Error('No municipality selected');
      }

      // Use the new ExemptionType-based API
      await this.api.put(
        `/municipalities/${municipalityId}/exemption-types/settings`,
        data,
        {
          loadingMessage: 'Saving elderly exemption settings...',
        },
      );

      if (this.notifications) {
        this.notifications.success(
          'Elderly exemption settings saved successfully',
        );
      }
    } catch (error) {
      console.error('Failed to save elderly settings:', error);
      if (this.notifications) {
        this.notifications.error(
          error.message || 'Failed to save elderly exemption settings',
        );
      }
      throw error;
    }
  }

  @action
  async saveDisabilitySettings(data) {
    try {
      const municipalityId = this.municipality.currentMunicipality?.id;
      if (!municipalityId) {
        throw new Error('No municipality selected');
      }

      // Use the new ExemptionType-based API
      await this.api.put(
        `/municipalities/${municipalityId}/exemption-types/settings`,
        data,
        {
          loadingMessage: 'Saving disability exemption settings...',
        },
      );

      if (this.notifications) {
        this.notifications.success(
          'Disability exemption settings saved successfully',
        );
      }
    } catch (error) {
      console.error('Failed to save disability settings:', error);
      if (this.notifications) {
        this.notifications.error(
          error.message || 'Failed to save disability exemption settings',
        );
      }
      throw error;
    }
  }

  @action
  async saveVeteranSettings(data) {
    try {
      const municipalityId = this.municipality.currentMunicipality?.id;
      if (!municipalityId) {
        throw new Error('No municipality selected');
      }

      // Use the new ExemptionType-based API
      await this.api.put(
        `/municipalities/${municipalityId}/exemption-types/settings`,
        data,
        {
          loadingMessage: 'Saving veteran credit settings...',
        },
      );

      if (this.notifications) {
        this.notifications.success(
          'Veteran credit settings saved successfully',
        );
      }
    } catch (error) {
      console.error('Failed to save veteran settings:', error);
      if (this.notifications) {
        this.notifications.error(
          error.message || 'Failed to save veteran credit settings',
        );
      }
      throw error;
    }
  }

  @action
  resetElderlySettings(originalData) {
    this.elderlyExemptions = { ...originalData };
  }

  @action
  resetDisabilitySettings(originalData) {
    this.disabilityExemptions = { ...originalData };
  }

  @action
  resetVeteranSettings(originalData) {
    this.veteranCredits = { ...originalData };
  }

  // Institutional exemptions actions
  @action
  addCategory(type) {
    const newCategory = { name: '' };
    this.institutionalExemptions = {
      ...this.institutionalExemptions,
      [type]: [...this.institutionalExemptions[type], newCategory],
    };
  }

  @action
  removeCategory(type, index) {
    const updatedCategories = [...this.institutionalExemptions[type]];
    updatedCategories.splice(index, 1);
    this.institutionalExemptions = {
      ...this.institutionalExemptions,
      [type]: updatedCategories,
    };
  }

  @action
  updateCategory(type, index, field, event) {
    const value = event.target.value;
    const updatedCategories = [...this.institutionalExemptions[type]];
    updatedCategories[index] = { ...updatedCategories[index], [field]: value };
    this.institutionalExemptions = {
      ...this.institutionalExemptions,
      [type]: updatedCategories,
    };
  }

  @action
  updateCategoryAndCheck(type, index, field, checkForChanges, event) {
    this.updateCategory(type, index, field, event);
    // Use next tick to ensure the property update is complete
    setTimeout(() => {
      checkForChanges();
    }, 0);
  }

  @action
  async saveInstitutionalSettings(data) {
    try {
      const municipalityId = this.municipality.currentMunicipality?.id;
      if (!municipalityId) {
        throw new Error('No municipality selected');
      }

      // Use the new institutional exemption types API
      await this.api.put(
        `/municipalities/${municipalityId}/exemption-types/institutional`,
        data,
        {
          loadingMessage: 'Saving institutional exemption settings...',
        },
      );

      if (this.notifications) {
        this.notifications.success(
          'Institutional exemption settings saved successfully',
        );
      }
    } catch (error) {
      console.error('Failed to save institutional settings:', error);
      if (this.notifications) {
        this.notifications.error(
          error.message || 'Failed to save institutional exemption settings',
        );
      }
      throw error;
    }
  }

  @action
  resetInstitutionalSettings(originalData) {
    this.institutionalExemptions = { ...originalData };
  }

  @action
  showRsaInfo(type) {
    this.currentRsaType = type;
    this.showRsaModal = true;
  }

  @action
  closeRsaModal() {
    this.showRsaModal = false;
    this.currentRsaType = '';
  }

  @action
  stopPropagation(event) {
    event.stopPropagation();
  }
}
