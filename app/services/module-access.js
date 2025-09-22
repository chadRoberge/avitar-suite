import Service, { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { task } from 'ember-concurrency';

export default class ModuleAccessService extends Service {
  @service store;
  @service('current-user') currentUser;
  @service municipality; // Your municipality service

  @tracked availableModules = [];
  @tracked moduleNavigation = [];
  @tracked isLoading = false;

  // Module constants (should match backend)
  MODULES = {
    ASSESSING: 'assessing',
    TAX_COLLECTION: 'taxCollection',
    BUILDING_PERMITS: 'buildingPermits',
    TOWN_CLERK: 'townClerk',
    MOTOR_VEHICLE: 'motorVehicle',
    UTILITY_BILLING: 'utilityBilling',
  };

  MODULE_FEATURES = {
    assessing: {
      AI_ABATEMENT_REVIEW: 'aiAbatementReview',
      BULK_VALUATION_UPDATES: 'bulkValuationUpdates',
      ADVANCED_REPORTING: 'advancedReporting',
      GIS_INTEGRATION: 'gisIntegration',
    },
    taxCollection: {
      ONLINE_PAYMENTS: 'onlinePayments',
      PAYMENT_PLANS: 'paymentPlans',
      AUTOMATED_REMINDERS: 'automatedReminders',
      LIENS_MANAGEMENT: 'liensManagement',
    },
    buildingPermits: {
      ONLINE_APPLICATIONS: 'onlineApplications',
      DIGITAL_PLAN_REVIEW: 'digitalPlanReview',
      INSPECTION_SCHEDULING: 'inspectionScheduling',
      WORKFLOW_AUTOMATION: 'workflowAutomation',
    },
    // ... other modules
  };

  // === Initialization ===

  @task
  *loadUserModules() {
    this.isLoading = true;

    try {
      const user = this.currentUser.user;
      if (!user) return;

      // Load user's available modules and navigation
      const moduleData = yield this.getModuleNavigation.perform();

      this.availableModules = moduleData.modules || [];
      this.moduleNavigation = moduleData.navigation || [];
    } catch (error) {
      console.error('Failed to load user modules:', error);
      this.availableModules = [];
      this.moduleNavigation = [];
    } finally {
      this.isLoading = false;
    }
  }

  @task
  *getModuleNavigation() {
    // Make API call to get user's module navigation
    const response = yield fetch('/api/auth/modules', {
      headers: {
        Authorization: `Bearer ${this.currentUser.user.token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch module navigation');
    }

    const data = yield response.json();
    return data.data;
  }

  // === Module Access Checks ===

  hasModule(moduleName) {
    return this.availableModules.some((module) => module.name === moduleName);
  }

  hasFeature(moduleName, featureName) {
    const module = this.availableModules.find((m) => m.name === moduleName);
    return module?.features?.includes(featureName) || false;
  }

  getModuleTier(moduleName) {
    const module = this.availableModules.find((m) => m.name === moduleName);
    return module?.tier || null;
  }

  getModuleVersion(moduleName) {
    const module = this.availableModules.find((m) => m.name === moduleName);
    return module?.version || null;
  }

  // === Navigation Helpers ===

  getNavigationForModule(moduleName) {
    return this.moduleNavigation.find((nav) => nav.name === moduleName);
  }

  get primaryNavigation() {
    // Filter to main navigation modules
    const primaryModules = [
      this.MODULES.ASSESSING,
      this.MODULES.TAX_COLLECTION,
      this.MODULES.BUILDING_PERMITS,
      this.MODULES.TOWN_CLERK,
    ];

    return this.moduleNavigation.filter((nav) =>
      primaryModules.includes(nav.name),
    );
  }

  get secondaryNavigation() {
    // Additional modules in secondary nav
    const secondaryModules = [
      this.MODULES.MOTOR_VEHICLE,
      this.MODULES.UTILITY_BILLING,
    ];

    return this.moduleNavigation.filter((nav) =>
      secondaryModules.includes(nav.name),
    );
  }

  // === Feature Access API Calls ===

  @task
  *checkModuleAccess(moduleName) {
    try {
      const response = yield fetch(`/api/modules/access/${moduleName}`, {
        headers: {
          Authorization: `Bearer ${this.currentUser.user.token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to check module access');
      }

      const data = yield response.json();
      return data.data;
    } catch (error) {
      console.error('Error checking module access:', error);
      return { hasAccess: false };
    }
  }

  @task
  *checkFeatureAccess(moduleName, featureName) {
    try {
      const response = yield fetch(
        `/api/modules/feature/${moduleName}/${featureName}`,
        {
          headers: {
            Authorization: `Bearer ${this.currentUser.user.token}`,
            'Content-Type': 'application/json',
          },
        },
      );

      if (!response.ok) {
        throw new Error('Failed to check feature access');
      }

      const data = yield response.json();
      return data.data;
    } catch (error) {
      console.error('Error checking feature access:', error);
      return { hasFeature: false };
    }
  }

  // === Utility Methods ===

  canUserAccessModule(moduleName) {
    const user = this.currentUser.user;
    if (!user) return false;

    // System users can access everything
    if (user.userType === 'system') return true;

    // Check if module is in user's available modules
    return this.hasModule(moduleName);
  }

  getModuleDisplayInfo(moduleName) {
    const moduleInfo = {
      assessing: {
        name: 'Property Assessment',
        description: 'Manage property valuations, assessments, and appeals',
        icon: 'home',
        color: 'blue',
      },
      taxCollection: {
        name: 'Tax Collection',
        description: 'Property tax billing, collection, and payment processing',
        icon: 'dollar-sign',
        color: 'green',
      },
      buildingPermits: {
        name: 'Building Permits',
        description: 'Building permits, inspections, and code enforcement',
        icon: 'tool',
        color: 'orange',
      },
      townClerk: {
        name: 'Town Clerk',
        description: 'Records management, licensing, and municipal services',
        icon: 'file-text',
        color: 'purple',
      },
      motorVehicle: {
        name: 'Motor Vehicle',
        description: 'Vehicle registration, licensing, and renewals',
        icon: 'truck',
        color: 'red',
      },
      utilityBilling: {
        name: 'Utility Billing',
        description: 'Water, sewer, and utility billing management',
        icon: 'droplet',
        color: 'cyan',
      },
    };

    return (
      moduleInfo[moduleName] || {
        name: moduleName,
        description: 'Municipal service module',
        icon: 'settings',
        color: 'gray',
      }
    );
  }

  // === Permission Guards for Routes ===

  async requireModuleAccess(moduleName) {
    if (!this.canUserAccessModule(moduleName)) {
      throw new Error(`Access denied to ${moduleName} module`);
    }
  }

  async requireFeatureAccess(moduleName, featureName) {
    if (!this.hasFeature(moduleName, featureName)) {
      throw new Error(
        `Access denied to ${featureName} feature in ${moduleName} module`,
      );
    }
  }

  // === Refresh Methods ===

  async refresh() {
    return this.loadUserModules.perform();
  }

  clearCache() {
    this.availableModules = [];
    this.moduleNavigation = [];
  }
}
