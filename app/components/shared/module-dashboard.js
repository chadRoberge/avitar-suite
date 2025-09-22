import Component from '@glimmer/component';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class ModuleDashboardComponent extends Component {
  @service moduleAccess;
  @service store;

  @tracked allModules = [];

  constructor() {
    super(...arguments);
    this.loadModules();
  }

  async loadModules() {
    // Load user's available modules
    await this.moduleAccess.loadUserModules.perform();

    // If system user, load all modules for the municipality
    if (this.args.currentUser?.canManageModules && this.args.municipality) {
      await this.loadAllMunicipalityModules();
    }
  }

  async loadAllMunicipalityModules() {
    try {
      // This would fetch all modules (enabled and disabled) for the municipality
      const response = await fetch(
        `/api/modules/municipalities/${this.args.municipality.id}`,
        {
          headers: {
            Authorization: `Bearer ${this.args.currentUser.token}`,
            'Content-Type': 'application/json',
          },
        },
      );

      if (response.ok) {
        const data = await response.json();
        this.allModules = data.data || [];
      }
    } catch (error) {
      console.error('Failed to load municipality modules:', error);
    }
  }

  get availableModules() {
    if (this.args.currentUser?.canManageModules) {
      // System users see all modules with their actual status
      return this.allModules.filter((module) => module.hasAccess);
    }

    // Regular users see only their available modules
    return this.moduleAccess.availableModules;
  }

  get disabledModules() {
    if (this.args.currentUser?.canManageModules) {
      return this.allModules.filter((module) => !module.hasAccess);
    }
    return [];
  }

  get totalFeatures() {
    return this.availableModules.reduce((total, module) => {
      return total + (module.features?.length || 0);
    }, 0);
  }

  @action
  async refreshModules() {
    await this.moduleAccess.refresh();
    if (this.args.currentUser?.canManageModules) {
      await this.loadAllMunicipalityModules();
    }
  }

  @action
  handleManageModule(module) {
    // Emit event to parent component
    if (this.args.onManageModule) {
      this.args.onManageModule(module);
    }
  }

  @action
  handleConfigureModules() {
    if (this.args.onConfigureModules) {
      this.args.onConfigureModules();
    }
  }
}
