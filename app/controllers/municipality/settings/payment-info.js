import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';

export default class MunicipalitySettingsPaymentInfoController extends Controller {
  @service notifications;
  @service router;

  /**
   * Get fiscal year from dashboard data
   */
  get fiscalYear() {
    return this.model.dashboard?.fiscal_year || new Date().getFullYear();
  }

  /**
   * Get current year payment totals
   */
  get currentYearTotals() {
    return (
      this.model.dashboard?.current_year || {
        property_tax: 0,
        building_permits: 0,
        total: 0,
      }
    );
  }

  /**
   * Get year-over-year comparison data
   */
  get yearOverYearChanges() {
    return (
      this.model.dashboard?.year_over_year || {
        property_tax_change: 0,
        building_permits_change: 0,
        total_change: 0,
      }
    );
  }

  /**
   * Get recent transactions
   */
  get recentTransactions() {
    return this.model.dashboard?.recent_transactions || [];
  }

  /**
   * Get payout account information
   */
  get payoutAccount() {
    return this.model.dashboard?.payout_account || null;
  }

  /**
   * Get Stripe dashboard URL
   */
  get stripeDashboardUrl() {
    return this.model.dashboard?.stripe_dashboard_url || null;
  }

  /**
   * Format currency values
   */
  formatCurrency(amount) {
    if (amount === null || amount === undefined) {
      return '$0.00';
    }
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  }

  /**
   * Format percentage with + or - sign
   */
  formatPercentage(percentage) {
    if (percentage === null || percentage === undefined || percentage === 0) {
      return '0%';
    }
    const sign = percentage > 0 ? '+' : '';
    return `${sign}${percentage.toFixed(1)}%`;
  }

  /**
   * Get badge class for percentage change
   */
  getPercentageBadgeClass(percentage) {
    if (percentage > 0) {
      return 'avitar-badge avitar-badge--success';
    } else if (percentage < 0) {
      return 'avitar-badge avitar-badge--danger';
    }
    return 'avitar-badge avitar-badge--secondary';
  }

  /**
   * Get status badge class for transaction status
   */
  getStatusBadgeClass(status) {
    const badges = {
      succeeded: 'avitar-badge avitar-badge--success',
      pending: 'avitar-badge avitar-badge--warning',
      failed: 'avitar-badge avitar-badge--danger',
      refunded: 'avitar-badge avitar-badge--secondary',
    };
    return badges[status] || 'avitar-badge avitar-badge--secondary';
  }

  /**
   * Get display label for payment type
   */
  getPaymentTypeLabel(type) {
    const labels = {
      property_tax: 'Property Tax',
      building_permit: 'Building Permit',
      other: 'Other',
    };
    return labels[type] || type;
  }

  /**
   * Format date
   */
  formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  /**
   * Open Stripe Express Dashboard in new window
   */
  @action
  openStripeDashboard() {
    if (this.stripeDashboardUrl) {
      window.open(this.stripeDashboardUrl, '_blank', 'noopener,noreferrer');
    } else {
      this.notifications.error('Unable to access Stripe dashboard');
    }
  }

  /**
   * Refresh dashboard data
   */
  @action
  async refreshDashboard() {
    try {
      // Trigger model refresh
      this.send('refreshModel');
      this.notifications.success('Dashboard data refreshed');
    } catch (error) {
      console.error('Error refreshing dashboard:', error);
      this.notifications.error('Failed to refresh dashboard data');
    }
  }

  /**
   * View transaction details (future feature)
   */
  @action
  viewTransaction(transaction) {
    // Future: Navigate to transaction detail page or show modal
    console.log('View transaction:', transaction);
    this.notifications.info('Transaction details coming soon');
  }
}
