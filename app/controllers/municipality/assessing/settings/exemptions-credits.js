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
    };
    this.disabilityExemptions = {
      blindExemption: model.exemptions.blindExemption,
      physicalHandicapExemption: model.exemptions.physicalHandicapExemption,
    };
    this.veteranCredits = { ...model.credits };
    this.institutionalExemptions = { ...model.institutionalExemptions };
  }

  @action
  updateElderlySettings(field, event) {
    const value = event.target.value;
    this.elderlyExemptions = {
      ...this.elderlyExemptions,
      [field]: Number(value) || 0,
    };
  }

  @action
  updateDisabilitySettings(field, event) {
    const value = event.target.value;
    this.disabilityExemptions = {
      ...this.disabilityExemptions,
      [field]: Number(value) || 0,
    };
  }

  @action
  updateVeteranSettings(field, event) {
    const value = event.target.value;
    this.veteranCredits = {
      ...this.veteranCredits,
      [field]: Number(value) || 0,
    };
  }

  @action
  async saveElderlySettings(data) {
    try {
      const municipalityId = this.municipality.currentMunicipality?.id;
      if (!municipalityId) {
        throw new Error('No municipality selected');
      }

      await this.api.put(
        `/municipalities/${municipalityId}/exemptions-credits-settings/elderly`,
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

      await this.api.put(
        `/municipalities/${municipalityId}/exemptions-credits-settings/disability`,
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

      await this.api.put(
        `/municipalities/${municipalityId}/exemptions-credits-settings/veteran`,
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

      await this.api.put(
        `/municipalities/${municipalityId}/exemptions-credits-settings/institutional`,
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
