import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MunicipalityDashboardRoute extends Route {
  @service municipality;
  @service session;
  @service store;

  async model() {
    const municipality = this.municipality.currentMunicipality;
    const user = this.session.data.authenticated.user;

    // Load dashboard data based on user type and available modules
    return {
      municipality,
      user,
      availableModules: this.municipality.enabledModules,
      quickStats: await this.loadQuickStats(),
      recentActivity: await this.loadRecentActivity(),
      notifications: await this.loadNotifications(),
      subscriptionInfo: this.municipality.subscriptionInfo,
    };
  }

  async loadQuickStats() {
    const user = this.session.data.authenticated.user;
    const stats = {};

    try {
      // Load different stats based on user type and available modules
      if (
        this.municipality.hasModule('assessing') &&
        this.municipality.canUserAccessModule('assessing')
      ) {
        stats.totalProperties = 1247; // Would come from API
        stats.pendingRevaluations = 23; // Would come from API
      }

      if (
        this.municipality.hasModule('taxCollection') &&
        this.municipality.canUserAccessModule('taxCollection')
      ) {
        stats.unpaidTaxes = 45632.5; // Would come from API
        stats.collectionRate = 94.2; // Would come from API
      }

      if (
        this.municipality.hasModule('buildingPermits') &&
        this.municipality.canUserAccessModule('buildingPermits')
      ) {
        stats.activePermits = 18; // Would come from API
        stats.pendingInspections = 7; // Would come from API
      }

      // System admin gets municipality-wide stats
      if (user.isSystem) {
        stats.totalUsers = 45;
        stats.systemHealth = 'Good';
        stats.moduleUsage = {
          assessing: 89,
          taxCollection: 92,
          buildingPermits: 76,
        };
      }
    } catch (error) {
      console.error('Failed to load dashboard stats:', error);
    }

    return stats;
  }

  async loadRecentActivity() {
    const user = this.session.data.authenticated.user;
    const activities = [];

    try {
      // Load recent activities based on user permissions
      // This would come from an API endpoint
      activities.push(
        {
          type: 'property_update',
          message: 'Property valuation updated for 123 Main St',
          timestamp: new Date('2024-01-15T10:30:00'),
          module: 'assessing',
        },
        {
          type: 'payment_received',
          message: 'Tax payment received - $2,450.00',
          timestamp: new Date('2024-01-15T09:15:00'),
          module: 'taxCollection',
        },
        {
          type: 'permit_issued',
          message: 'Building permit issued for 456 Oak Ave',
          timestamp: new Date('2024-01-14T16:45:00'),
          module: 'buildingPermits',
        },
      );

      // Filter activities based on module access
      return activities.filter((activity) =>
        this.municipality.canUserAccessModule(activity.module),
      );
    } catch (error) {
      console.error('Failed to load recent activity:', error);
      return [];
    }
  }

  async loadNotifications() {
    const user = this.session.data.authenticated.user;
    const notifications = [];

    try {
      // Check for subscription-related notifications
      const subscriptionInfo = this.municipality.subscriptionInfo;
      if (subscriptionInfo?.isExpired) {
        notifications.push({
          type: 'error',
          title: 'Subscription Expired',
          message:
            'Your subscription expired. Some features may be unavailable.',
          action: 'Renew Subscription',
        });
      } else if (subscriptionInfo?.expiresAt) {
        const daysUntilExpiry = Math.ceil(
          (subscriptionInfo.expiresAt - new Date()) / (1000 * 60 * 60 * 24),
        );

        if (daysUntilExpiry <= 30) {
          notifications.push({
            type: 'warning',
            title: 'Subscription Expiring Soon',
            message: `Your subscription expires in ${daysUntilExpiry} days.`,
            action: 'Renew Subscription',
          });
        }
      }

      // Module-specific notifications
      if (this.municipality.hasFeature('assessing', 'aiAbatementReview')) {
        notifications.push({
          type: 'info',
          title: 'AI Review Complete',
          message: '5 abatement applications have been reviewed.',
          action: 'View Results',
        });
      }

      // User-specific notifications
      if (user.isMunicipal && !user.isEmailVerified) {
        notifications.push({
          type: 'warning',
          title: 'Email Verification Required',
          message: 'Please verify your email address to access all features.',
          action: 'Verify Email',
        });
      }
    } catch (error) {
      console.error('Failed to load notifications:', error);
    }

    return notifications;
  }
}
