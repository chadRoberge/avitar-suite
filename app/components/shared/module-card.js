import Component from '@glimmer/component';
import { inject as service } from '@ember/service';

export default class ModuleCardComponent extends Component {
  @service moduleAccess;
  @service('current-user') currentUser;

  getFeatureDisplayName(featureName) {
    const featureNames = {
      // Assessing features
      aiAbatementReview: 'AI Abatement Review',
      bulkValuationUpdates: 'Bulk Valuation Updates',
      advancedReporting: 'Advanced Reporting',
      gisIntegration: 'GIS Integration',

      // Tax Collection features
      onlinePayments: 'Online Payments',
      paymentPlans: 'Payment Plans',
      automatedReminders: 'Automated Reminders',
      liensManagement: 'Liens Management',

      // Building Permits features
      onlineApplications: 'Online Applications',
      digitalPlanReview: 'Digital Plan Review',
      inspectionScheduling: 'Inspection Scheduling',
      workflowAutomation: 'Workflow Automation',

      // Town Clerk features
      digitalRecords: 'Digital Records',
      onlineLicensing: 'Online Licensing',
      documentGeneration: 'Document Generation',
      meetingManagement: 'Meeting Management',

      // Motor Vehicle features
      onlineRegistration: 'Online Registration',
      plateTracking: 'Plate Tracking',
      inspectionReminders: 'Inspection Reminders',
      titleProcessing: 'Title Processing',

      // Utility Billing features
      smartMeterIntegration: 'Smart Meter Integration',
      tieredRates: 'Tiered Rates',
      usageAnalytics: 'Usage Analytics',
    };

    return featureNames[featureName] || featureName;
  }
}
