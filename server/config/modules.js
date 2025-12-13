const MODULES = {
  ASSESSING: 'assessing',
  TAX_COLLECTION: 'taxCollection',
  BUILDING_PERMITS: 'building_permit', // Updated to match Stripe metadata
  TOWN_CLERK: 'townClerk',
  MOTOR_VEHICLE: 'motorVehicle',
  UTILITY_BILLING: 'utilityBilling',
};

const MODULE_TIERS = {
  BASIC: 'basic',
  PROFESSIONAL: 'professional',
  ENTERPRISE: 'enterprise',
};

const MODULE_FEATURES = {
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
  building_permit: {
    ONLINE_APPLICATIONS: 'onlineApplications',
    DIGITAL_PLAN_REVIEW: 'digitalPlanReview',
    INSPECTION_SCHEDULING: 'inspectionScheduling',
    WORKFLOW_AUTOMATION: 'workflowAutomation',
  },
  townClerk: {
    DIGITAL_RECORDS: 'digitalRecords',
    ONLINE_LICENSING: 'onlineLicensing',
    DOCUMENT_GENERATION: 'documentGeneration',
    MEETING_MANAGEMENT: 'meetingManagement',
  },
  motorVehicle: {
    ONLINE_REGISTRATION: 'onlineRegistration',
    PLATE_TRACKING: 'plateTracking',
    INSPECTION_REMINDERS: 'inspectionReminders',
    TITLE_PROCESSING: 'titleProcessing',
  },
  utilityBilling: {
    SMART_METER_INTEGRATION: 'smartMeterIntegration',
    TIERED_RATES: 'tieredRates',
    ONLINE_PAYMENTS: 'onlinePayments',
    USAGE_ANALYTICS: 'usageAnalytics',
  },
};

// Tier feature maps - defines which features are available at each tier
const TIER_FEATURES = {
  [MODULE_TIERS.BASIC]: {
    [MODULES.ASSESSING]: [],
    [MODULES.TAX_COLLECTION]: [MODULE_FEATURES.taxCollection.ONLINE_PAYMENTS],
    [MODULES.BUILDING_PERMITS]: [
      MODULE_FEATURES.building_permit.ONLINE_APPLICATIONS,
    ],
    [MODULES.TOWN_CLERK]: [MODULE_FEATURES.townClerk.DIGITAL_RECORDS],
    [MODULES.MOTOR_VEHICLE]: [MODULE_FEATURES.motorVehicle.ONLINE_REGISTRATION],
    [MODULES.UTILITY_BILLING]: [MODULE_FEATURES.utilityBilling.ONLINE_PAYMENTS],
  },
  [MODULE_TIERS.PROFESSIONAL]: {
    [MODULES.ASSESSING]: [
      MODULE_FEATURES.assessing.BULK_VALUATION_UPDATES,
      MODULE_FEATURES.assessing.ADVANCED_REPORTING,
    ],
    [MODULES.TAX_COLLECTION]: [
      MODULE_FEATURES.taxCollection.ONLINE_PAYMENTS,
      MODULE_FEATURES.taxCollection.PAYMENT_PLANS,
      MODULE_FEATURES.taxCollection.AUTOMATED_REMINDERS,
    ],
    [MODULES.BUILDING_PERMITS]: [
      MODULE_FEATURES.building_permit.ONLINE_APPLICATIONS,
      MODULE_FEATURES.building_permit.DIGITAL_PLAN_REVIEW,
      MODULE_FEATURES.building_permit.INSPECTION_SCHEDULING,
    ],
    [MODULES.TOWN_CLERK]: [
      MODULE_FEATURES.townClerk.DIGITAL_RECORDS,
      MODULE_FEATURES.townClerk.ONLINE_LICENSING,
      MODULE_FEATURES.townClerk.DOCUMENT_GENERATION,
    ],
    [MODULES.MOTOR_VEHICLE]: [
      MODULE_FEATURES.motorVehicle.ONLINE_REGISTRATION,
      MODULE_FEATURES.motorVehicle.PLATE_TRACKING,
      MODULE_FEATURES.motorVehicle.INSPECTION_REMINDERS,
    ],
    [MODULES.UTILITY_BILLING]: [
      MODULE_FEATURES.utilityBilling.ONLINE_PAYMENTS,
      MODULE_FEATURES.utilityBilling.TIERED_RATES,
      MODULE_FEATURES.utilityBilling.SMART_METER_INTEGRATION,
    ],
  },
  [MODULE_TIERS.ENTERPRISE]: {
    [MODULES.ASSESSING]: [
      MODULE_FEATURES.assessing.AI_ABATEMENT_REVIEW,
      MODULE_FEATURES.assessing.BULK_VALUATION_UPDATES,
      MODULE_FEATURES.assessing.ADVANCED_REPORTING,
      MODULE_FEATURES.assessing.GIS_INTEGRATION,
    ],
    [MODULES.TAX_COLLECTION]: [
      MODULE_FEATURES.taxCollection.ONLINE_PAYMENTS,
      MODULE_FEATURES.taxCollection.PAYMENT_PLANS,
      MODULE_FEATURES.taxCollection.AUTOMATED_REMINDERS,
      MODULE_FEATURES.taxCollection.LIENS_MANAGEMENT,
    ],
    [MODULES.BUILDING_PERMITS]: [
      MODULE_FEATURES.building_permit.ONLINE_APPLICATIONS,
      MODULE_FEATURES.building_permit.DIGITAL_PLAN_REVIEW,
      MODULE_FEATURES.building_permit.INSPECTION_SCHEDULING,
      MODULE_FEATURES.building_permit.WORKFLOW_AUTOMATION,
    ],
    [MODULES.TOWN_CLERK]: [
      MODULE_FEATURES.townClerk.DIGITAL_RECORDS,
      MODULE_FEATURES.townClerk.ONLINE_LICENSING,
      MODULE_FEATURES.townClerk.DOCUMENT_GENERATION,
      MODULE_FEATURES.townClerk.MEETING_MANAGEMENT,
    ],
    [MODULES.MOTOR_VEHICLE]: [
      MODULE_FEATURES.motorVehicle.ONLINE_REGISTRATION,
      MODULE_FEATURES.motorVehicle.PLATE_TRACKING,
      MODULE_FEATURES.motorVehicle.INSPECTION_REMINDERS,
      MODULE_FEATURES.motorVehicle.TITLE_PROCESSING,
    ],
    [MODULES.UTILITY_BILLING]: [
      MODULE_FEATURES.utilityBilling.ONLINE_PAYMENTS,
      MODULE_FEATURES.utilityBilling.TIERED_RATES,
      MODULE_FEATURES.utilityBilling.SMART_METER_INTEGRATION,
      MODULE_FEATURES.utilityBilling.USAGE_ANALYTICS,
    ],
  },
};

// Module display information
const MODULE_INFO = {
  [MODULES.ASSESSING]: {
    name: 'Property Assessment',
    description: 'Manage property valuations, assessments, and appeals',
    icon: 'home',
    color: 'blue',
  },
  [MODULES.TAX_COLLECTION]: {
    name: 'Tax Collection',
    description: 'Property tax billing, collection, and payment processing',
    icon: 'dollar-sign',
    color: 'green',
  },
  [MODULES.BUILDING_PERMITS]: {
    name: 'Building Permits',
    description: 'Building permits, inspections, and code enforcement',
    icon: 'tool',
    color: 'orange',
  },
  [MODULES.TOWN_CLERK]: {
    name: 'Town Clerk',
    description: 'Records management, licensing, and municipal services',
    icon: 'file-text',
    color: 'purple',
  },
  [MODULES.MOTOR_VEHICLE]: {
    name: 'Motor Vehicle',
    description: 'Vehicle registration, licensing, and renewals',
    icon: 'truck',
    color: 'red',
  },
  [MODULES.UTILITY_BILLING]: {
    name: 'Utility Billing',
    description: 'Water, sewer, and utility billing management',
    icon: 'droplet',
    color: 'cyan',
  },
};

// Feature display information
const FEATURE_INFO = {
  // Assessing features
  [MODULE_FEATURES.assessing.AI_ABATEMENT_REVIEW]: {
    name: 'AI Abatement Review',
    description:
      'Automated review and recommendations for tax abatement applications',
    requiresTier: MODULE_TIERS.ENTERPRISE,
  },
  [MODULE_FEATURES.assessing.BULK_VALUATION_UPDATES]: {
    name: 'Bulk Valuation Updates',
    description: 'Mass update property valuations with spreadsheet imports',
    requiresTier: MODULE_TIERS.PROFESSIONAL,
  },
  [MODULE_FEATURES.assessing.ADVANCED_REPORTING]: {
    name: 'Advanced Reporting',
    description: 'Detailed analytics and custom reports for assessment data',
    requiresTier: MODULE_TIERS.PROFESSIONAL,
  },
  [MODULE_FEATURES.assessing.GIS_INTEGRATION]: {
    name: 'GIS Integration',
    description: 'Integration with Geographic Information Systems',
    requiresTier: MODULE_TIERS.ENTERPRISE,
  },
  // Tax Collection features
  [MODULE_FEATURES.taxCollection.ONLINE_PAYMENTS]: {
    name: 'Online Payments',
    description: 'Accept tax payments online via credit card and ACH',
    requiresTier: MODULE_TIERS.BASIC,
  },
  [MODULE_FEATURES.taxCollection.PAYMENT_PLANS]: {
    name: 'Payment Plans',
    description: 'Set up and manage installment payment plans',
    requiresTier: MODULE_TIERS.PROFESSIONAL,
  },
  [MODULE_FEATURES.taxCollection.AUTOMATED_REMINDERS]: {
    name: 'Automated Reminders',
    description: 'Automatic email and SMS reminders for due dates',
    requiresTier: MODULE_TIERS.PROFESSIONAL,
  },
  [MODULE_FEATURES.taxCollection.LIENS_MANAGEMENT]: {
    name: 'Liens Management',
    description: 'Track and manage tax liens and foreclosures',
    requiresTier: MODULE_TIERS.ENTERPRISE,
  },
};

class ModuleHelpers {
  static getAllModules() {
    return Object.values(MODULES);
  }

  static getModuleInfo(moduleName) {
    return MODULE_INFO[moduleName] || null;
  }

  static getModuleFeatures(moduleName) {
    return MODULE_FEATURES[moduleName] || {};
  }

  static getTierFeatures(tier, moduleName) {
    return TIER_FEATURES[tier]?.[moduleName] || [];
  }

  static isFeatureAvailableInTier(moduleName, featureName, tier) {
    const tierFeatures = this.getTierFeatures(tier, moduleName);
    return tierFeatures.includes(featureName);
  }

  static getFeatureInfo(featureName) {
    return FEATURE_INFO[featureName] || null;
  }

  static validateModuleConfiguration(moduleName, tier, features) {
    const errors = [];

    if (!Object.values(MODULES).includes(moduleName)) {
      errors.push(`Invalid module: ${moduleName}`);
    }

    if (!Object.values(MODULE_TIERS).includes(tier)) {
      errors.push(`Invalid tier: ${tier}`);
    }

    const availableFeatures = this.getTierFeatures(tier, moduleName);
    for (const feature of features) {
      if (!availableFeatures.includes(feature)) {
        errors.push(
          `Feature ${feature} not available in ${tier} tier for ${moduleName}`,
        );
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  static getNavigationForModules(enabledModules) {
    return enabledModules.map((module) => ({
      ...this.getModuleInfo(module.name),
      path: `/${module.name}`,
      tier: module.tier,
      version: module.version,
      features: module.features || [],
    }));
  }

  // Helper to create default module configuration
  static createDefaultModuleConfig(moduleName, tier = 'basic', features = {}) {
    const moduleInfo = this.getModuleInfo(moduleName);
    const tierFeatures = this.getTierFeatures(tier, moduleName);

    const featureMap = new Map();

    // Add tier-based features
    tierFeatures.forEach((feature) => {
      const featureInfo = this.getFeatureInfo(feature);
      featureMap.set(feature, {
        enabled: features[feature] !== undefined ? features[feature] : true,
        tier_required: featureInfo?.requiresTier || tier,
        config: {},
      });
    });

    // Add custom features
    Object.keys(features).forEach((featureName) => {
      if (!featureMap.has(featureName)) {
        featureMap.set(featureName, {
          enabled: features[featureName],
          tier_required: tier,
          config: {},
        });
      }
    });

    return {
      enabled: true,
      version: '1.0.0',
      tier,
      features: featureMap,
      settings: new Map(),
      permissions: new Map(),
      activated_date: new Date(),
    };
  }

  // Helper to migrate legacy module data to Map format
  static migrateToMapFormat(legacyModules) {
    const moduleMap = new Map();

    Object.keys(legacyModules).forEach((moduleName) => {
      const legacyModule = legacyModules[moduleName];

      if (legacyModule && typeof legacyModule === 'object') {
        const featureMap = new Map();

        // Convert legacy features
        if (legacyModule.features) {
          Object.keys(legacyModule.features).forEach((featureName) => {
            featureMap.set(featureName, {
              enabled: legacyModule.features[featureName] === true,
              tier_required: legacyModule.tier || 'basic',
              config: {},
            });
          });
        }

        moduleMap.set(moduleName, {
          enabled: legacyModule.enabled || false,
          version: legacyModule.version || '1.0.0',
          tier: legacyModule.tier || 'basic',
          features: featureMap,
          settings: new Map(),
          permissions: new Map(),
          activated_date:
            legacyModule.activatedDate || legacyModule.activated_date,
          expiration_date:
            legacyModule.expirationDate || legacyModule.expiration_date,
          disabled_reason: legacyModule.disabled_reason,
        });
      }
    });

    return moduleMap;
  }
}

module.exports = {
  MODULES,
  MODULE_TIERS,
  MODULE_FEATURES,
  TIER_FEATURES,
  MODULE_INFO,
  FEATURE_INFO,
  ModuleHelpers,
};
