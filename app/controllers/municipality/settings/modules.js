import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';

export default class MunicipalitySettingsModulesController extends Controller {
  @service api;
  @service notifications;
  @service router;

  @tracked searchText = '';
  @tracked filterStatus = 'all'; // 'all', 'active', 'available'
  @tracked showTrialModal = false;
  @tracked selectedModule = null;

  get filteredModules() {
    let modules = this.model.modules || [];

    // Filter by status
    if (this.filterStatus === 'active') {
      modules = modules.filter((module) => module.is_active);
    } else if (this.filterStatus === 'available') {
      modules = modules.filter((module) => !module.is_active);
    }

    // Filter by search text
    if (this.searchText && this.searchText.trim().length > 0) {
      const search = this.searchText.toLowerCase();
      modules = modules.filter(
        (module) =>
          module.name?.toLowerCase().includes(search) ||
          module.description?.toLowerCase().includes(search) ||
          module.module?.toLowerCase().includes(search),
      );
    }

    return modules;
  }

  get modulesByType() {
    const modules = this.filteredModules;
    const grouped = {};

    modules.forEach((module) => {
      const moduleType = module.module || 'other';
      if (!grouped[moduleType]) {
        grouped[moduleType] = [];
      }
      grouped[moduleType].push(module);
    });

    // Convert to array of objects for template iteration
    return Object.keys(grouped).map((type) => ({
      type: type,
      displayName: this.formatModuleName(type),
      modules: grouped[type],
    }));
  }

  get activeModules() {
    return (this.model.modules || []).filter((module) => module.is_active);
  }

  get availableModules() {
    return (this.model.modules || []).filter((module) => !module.is_active);
  }

  getModuleIcon = (moduleName) => {
    const iconMap = {
      building_permit: 'hammer',
      assessing: 'home',
      tax_collect: 'dollar-sign',
      town_clerk: 'file-text',
      motor_vehicle: 'car',
    };
    return iconMap[moduleName] || 'package';
  };

  getModuleBadgeClass = (module) => {
    if (!module.is_active) {
      return 'avitar-badge avitar-badge--secondary';
    }

    // Module is active, check subscription status
    switch (module.access_level) {
      case 'trial':
        return 'avitar-badge avitar-badge--warning';
      case 'full':
        return 'avitar-badge avitar-badge--success';
      case 'read-only':
        return 'avitar-badge avitar-badge--danger';
      default:
        return 'avitar-badge avitar-badge--secondary';
    }
  };

  getModuleStatusText = (module) => {
    if (!module.is_active) {
      return 'Available';
    }

    // Module is active, show subscription status
    switch (module.access_level) {
      case 'trial':
        const daysRemaining = module.trial_days_remaining || 0;
        return `Trial (${daysRemaining} days left)`;
      case 'full':
        return 'Active';
      case 'read-only':
        return 'Read-Only (Expired)';
      default:
        return 'Active';
    }
  };

  getSubscriptionStatusBadge = (module) => {
    const status = module.subscription_status;
    const badges = {
      trialing: {
        class: 'avitar-badge avitar-badge--warning avitar-badge--sm',
        text: 'Trial',
        icon: 'clock',
      },
      active: {
        class: 'avitar-badge avitar-badge--success avitar-badge--sm',
        text: 'Active',
        icon: 'check-circle',
      },
      past_due: {
        class: 'avitar-badge avitar-badge--danger avitar-badge--sm',
        text: 'Past Due',
        icon: 'alert-circle',
      },
      cancelled: {
        class: 'avitar-badge avitar-badge--secondary avitar-badge--sm',
        text: 'Cancelled',
        icon: 'x-circle',
      },
      unpaid: {
        class: 'avitar-badge avitar-badge--danger avitar-badge--sm',
        text: 'Unpaid',
        icon: 'alert-triangle',
      },
      none: {
        class: 'avitar-badge avitar-badge--secondary avitar-badge--sm',
        text: 'No Subscription',
        icon: 'package',
      },
    };
    return badges[status] || badges.none;
  };

  formatModuleName = (moduleName) => {
    if (!moduleName) return '';
    // Convert 'building_permit' to 'Building Permit'
    return moduleName
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  formatPrice = (pricing) => {
    if (!pricing || !pricing.amount) return 'Contact for pricing';

    const amount = pricing.amount.toFixed(2);
    const currency = pricing.currency || 'USD';

    if (pricing.interval === 'one_time') {
      return `$${amount} ${currency}`;
    }

    const intervalText =
      pricing.interval_count > 1
        ? `${pricing.interval_count} ${pricing.interval}s`
        : pricing.interval;

    return `$${amount} ${currency}/${intervalText}`;
  };

  @action
  updateSearch(event) {
    this.searchText = event.target.value;
  }

  @action
  setFilterStatus(event) {
    this.filterStatus = event.target.value;
  }

  @action
  viewModuleDetails(module) {
    // TODO: Navigate to module details or activation page
    console.log('View module details:', module);
    this.notifications.info(`Module management for ${module.name} coming soon`);
  }

  @action
  activateModule(module) {
    console.log('Activate module:', module);
    this.selectedModule = module;
    this.showTrialModal = true;
  }

  @action
  closeTrialModal() {
    this.showTrialModal = false;
    this.selectedModule = null;
  }

  @action
  handleTrialSuccess() {
    console.log('Trial activated successfully, refreshing modules...');
    // Close modal
    this.closeTrialModal();
    // Refresh the route to show updated module status
    this.send('refreshModel');
  }

  @action
  manageModule(module) {
    // TODO: Navigate to module management page
    console.log('Manage module:', module);
    this.notifications.info(`Module management for ${module.name} coming soon`);
  }
}
