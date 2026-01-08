import Service from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { inject as service } from '@ember/service';

export default class MunicipalityService extends Service {
  @service api;
  @service session;
  @service router;
  @service('property-selection') propertySelection;
  @service('current-user') currentUser;

  @tracked currentMunicipality = null;
  @tracked availableMunicipalities = [];
  @tracked isLoading = false;
  @tracked inspectionsTodayCount = 0;
  @tracked pendingReviewsCount = 0;
  @tracked selectedAssessmentYear = new Date().getFullYear();

  async loadMunicipality(slug) {
    this.isLoading = true;
    try {
      const response = await this.api.get(`/municipalities/by-slug/${slug}`);
      this.currentMunicipality = this._enhanceMunicipality(
        response.municipality,
      );

      // Store in session
      this.session.set('selectedMunicipality', slug);

      // Load counts for badges (only for municipal staff)
      if (
        this.hasModule('building_permit') &&
        !this.currentUser.isContractorOrCitizen
      ) {
        await this.loadInspectionsTodayCount();
        await this.loadPendingReviewsCount();
      }

      return this.currentMunicipality;
    } catch (error) {
      console.error(`Failed to load municipality ${slug}:`, error);
      this.currentMunicipality = null;

      // Re-throw the error so the route can handle it
      throw error;
    } finally {
      this.isLoading = false;
    }
  }

  async loadUserMunicipalities() {
    const municipalities = await this.api.get('/municipalities/for-user');
    this.availableMunicipalities = municipalities.map((m) =>
      this._enhanceMunicipality(m),
    );
    return this.availableMunicipalities;
  }

  async loadInspectionsTodayCount() {
    if (!this.currentMunicipality) return;

    try {
      const response = await this.api.get(
        `/municipalities/${this.currentMunicipality.id}/inspections/today-count`,
      );
      this.inspectionsTodayCount = response.count || 0;
    } catch (error) {
      console.error('Failed to load today inspection count:', error);
      this.inspectionsTodayCount = 0;
    }
  }

  async loadPendingReviewsCount() {
    console.log('[Municipality] loadPendingReviewsCount called');
    console.log(
      '[Municipality] currentMunicipality:',
      this.currentMunicipality,
    );

    if (!this.currentMunicipality) {
      console.log('[Municipality] No current municipality, returning early');
      return;
    }

    try {
      console.log(
        '[Municipality] Fetching pending reviews count for:',
        this.currentMunicipality.id,
      );
      const response = await this.api.get(
        `/municipalities/${this.currentMunicipality.id}/permits/pending-reviews-count`,
      );
      console.log('[Municipality] Response:', response);
      this.pendingReviewsCount = response.count || 0;
      console.log(
        '[Municipality] Updated pendingReviewsCount to:',
        this.pendingReviewsCount,
      );
    } catch (error) {
      console.error('Failed to load pending reviews count:', error);
      this.pendingReviewsCount = 0;
    }
  }

  async updateModuleConfig(moduleName, config) {
    const updated = await this.api.patch(
      `/municipalities/${this.currentMunicipality.id}/modules/${moduleName}`,
      config,
    );
    this.currentMunicipality = this._enhanceMunicipality(updated);
    return this.currentMunicipality;
  }

  async setDefaultMunicipality(municipalitySlug, rememberMe = false) {
    if (this.session.isAuthenticated) {
      // Always set in session for current session
      this.session.set('defaultMunicipality', municipalitySlug);

      // If rememberMe is true, also save to localStorage for future sessions
      if (rememberMe) {
        localStorage.setItem('defaultMunicipality', municipalitySlug);
      }
    }
  }

  _enhanceMunicipality(municipality) {
    return {
      ...municipality,

      hasModule(moduleName) {
        const modules = municipality.module_config?.modules;
        // When coming from API, Maps are serialized as plain objects
        if (modules && typeof modules === 'object') {
          return modules[moduleName]?.enabled === true;
        }
        return false;
      },

      hasFeature(moduleName, featureName) {
        const modules = municipality.module_config?.modules;
        if (modules && typeof modules === 'object') {
          return modules[moduleName]?.features?.[featureName]?.enabled === true;
        }
        return false;
      },

      hasPermission(moduleName, userRole, permission) {
        const modules = municipality.module_config?.modules;
        if (modules && typeof modules === 'object') {
          const perms = modules[moduleName]?.permissions?.[userRole];
          return Array.isArray(perms) && perms.includes(permission);
        }
        return false;
      },

      getModuleSetting(moduleName, settingName) {
        const modules = municipality.module_config?.modules;
        if (modules && typeof modules === 'object') {
          return modules[moduleName]?.settings?.[settingName];
        }
        return undefined;
      },
    };
  }

  // Convenience methods
  hasModule(moduleName) {
    return this.currentMunicipality?.hasModule(moduleName) || false;
  }

  hasFeature(moduleName, featureName) {
    return (
      this.currentMunicipality?.hasFeature(moduleName, featureName) || false
    );
  }

  get enabledModules() {
    if (!this.currentMunicipality?.module_config?.modules) {
      return {};
    }

    const enabledModules = {};
    const modules = this.currentMunicipality.module_config.modules;

    // When coming from API, modules are serialized as plain objects
    if (modules && typeof modules === 'object') {
      Object.entries(modules).forEach(([moduleName, moduleConfig]) => {
        if (moduleConfig?.enabled) {
          enabledModules[moduleName] = true;
        }
      });
    }

    return enabledModules;
  }

  hasPermission(moduleName, permission) {
    const userRole = this.session.data.authenticated?.user?.role;
    return (
      this.currentMunicipality?.hasPermission(
        moduleName,
        userRole,
        permission,
      ) || false
    );
  }

  canUserAccessModule(moduleName) {
    const user = this.session.data.authenticated?.user;
    if (!user) return false;

    // System users can access everything
    if (user.userType === 'system' || user.role === 'avitar_staff') return true;

    // Check if module is enabled and user has access
    return this.hasModule(moduleName);
  }

  getModuleTier(moduleName) {
    if (!this.hasModule(moduleName)) return null;
    const module =
      this.currentMunicipality?.module_config?.modules?.[moduleName];
    return module?.tier || 'basic';
  }

  getModuleSetting(moduleName, settingName) {
    return this.currentMunicipality?.getModuleSetting(moduleName, settingName);
  }

  // === Navigation Helpers ===

  get moduleNavigation() {
    if (!this.currentMunicipality) return [];

    const nav = [];

    if (this.hasModule('assessing')) {
      const assessingChildren = [
        {
          title: 'Assessment Year',
          component: 'assessing/assessment-year-selector',
        },
        {
          title: 'Add to Queue',
          component: 'assessing/property-queue-button',
        },
        {
          title: 'Print Record Card',
          component: 'assessing/property-print-button',
        },
      ];

      // Add assessment section links - property-aware
      const sections = [
        'general',
        'land',
        'building',
        'features',
        'exemptions',
        'sketch',
      ];
      sections.forEach((section) => {
        const sectionChild = {
          title: section.charAt(0).toUpperCase() + section.slice(1),
          route: this.propertySelection.getAssessmentRoute(section),
        };
        // If we have a selected property, include the property ID as a parameter
        if (this.propertySelection.hasSelectedProperty) {
          sectionChild.models = [this.propertySelection.selectedPropertyId];
        }
        assessingChildren.push(sectionChild);
      });

      nav.push({
        title: 'Assessing',
        route: 'municipality.assessing',
        icon: 'home',
        children: assessingChildren,
      });

      // Add Advanced dropdown with Reports, Revaluation, and AI Review
      const advancedItems = [
        {
          title: 'Reports',
          route: 'municipality.assessing.reports',
          icon: 'file-alt',
        },
        {
          title: 'Revaluation',
          route: 'municipality.assessing.revaluation',
          icon: 'chart-line',
        },
      ];

      // Add AI Review to Advanced dropdown if feature is available
      if (this.hasFeature('assessing', 'aiAbatementReview')) {
        advancedItems.push({
          title: 'AI Review',
          route: 'municipality.assessing.ai-review',
          icon: 'robot',
        });
      }

      nav[nav.length - 1].children.push({
        title: 'Advanced',
        icon: 'flask',
        dropdown: true,
        items: advancedItems,
      });

      // Add Settings at the far right (icon only)
      nav[nav.length - 1].children.push({
        title: 'Settings',
        route: 'municipality.assessing.settings',
        icon: 'cog',
        iconOnly: true,
      });
    }

    if (this.hasModule('taxCollection')) {
      nav.push({
        title: 'Tax Collection',
        route: 'municipality.tax-collection',
        icon: 'dollar-sign',
        children: [
          { title: 'Tax Bills', route: 'municipality.tax-collection.bills' },
          { title: 'Payments', route: 'municipality.tax-collection.payments' },
          {
            title: 'Delinquencies',
            route: 'municipality.tax-collection.delinquencies',
          },
        ],
      });

      // Add Liens Management if feature is available
      if (this.hasFeature('taxCollection', 'liensManagement')) {
        nav[nav.length - 1].children.push({
          title: 'Liens',
          route: 'municipality.tax-collection.liens',
        });
      }
    }

    if (this.hasModule('building_permit')) {
      // Base children for all users
      const buildingPermitChildren = [
        {
          title: 'Dashboard',
          route: 'municipality.building-permits.queue',
          icon: 'tachometer-alt',
        },
        {
          title: 'Find',
          route: 'municipality.building-permits.find',
          icon: 'search',
        },
        {
          title: 'Permits',
          route: 'municipality.building-permits.permits',
          icon: 'file-alt',
          badge: this.pendingReviewsCount > 0 ? this.pendingReviewsCount : null,
          badgeClass: 'avitar-badge--danger',
        },
        {
          title: 'Projects',
          route: 'municipality.building-permits.projects',
          icon: 'folder-open',
        },
      ];

      // Add staff-only navigation items (Inspections, Reports)
      if (!this.currentUser.isContractorOrCitizen) {
        buildingPermitChildren.push(
          {
            title: 'Inspections',
            route: 'municipality.building-permits.inspections',
            icon: 'clipboard-check',
            badge:
              this.inspectionsTodayCount > 0
                ? this.inspectionsTodayCount
                : null,
          },
          {
            title: 'Reports',
            route: 'municipality.building-permits.reports',
            icon: 'chart-bar',
          },
        );
      }

      // Add Settings for all users - menu content differs based on user type
      buildingPermitChildren.push({
        title: 'Settings',
        route: 'municipality.building-permits.settings',
        icon: 'cog',
      });

      nav.push({
        title: 'Building Permits',
        route: 'municipality.building-permits',
        icon: 'construction',
        children: buildingPermitChildren,
      });
    }

    if (this.hasModule('townClerk')) {
      nav.push({
        title: 'Town Clerk',
        route: 'municipality.town-clerk',
        icon: 'file-text',
        children: [
          { title: 'Licenses', route: 'municipality.town-clerk.licenses' },
          { title: 'Records', route: 'municipality.town-clerk.records' },
          {
            title: 'Vital Records',
            route: 'municipality.town-clerk.vital-records',
          },
        ],
      });
    }

    if (this.hasModule('motorVehicle')) {
      nav.push({
        title: 'Motor Vehicle',
        route: 'municipality.motor-vehicle',
        icon: 'truck',
        children: [
          {
            title: 'Registrations',
            route: 'municipality.motor-vehicle.registrations',
          },
          { title: 'Renewals', route: 'municipality.motor-vehicle.renewals' },
        ],
      });
    }

    if (this.hasModule('utilityBilling')) {
      nav.push({
        title: 'Utility Billing',
        route: 'municipality.utility-billing',
        icon: 'droplet',
        children: [
          { title: 'Accounts', route: 'municipality.utility-billing.accounts' },
          { title: 'Billing', route: 'municipality.utility-billing.billing' },
          {
            title: 'Meter Readings',
            route: 'municipality.utility-billing.readings',
          },
        ],
      });
    }

    // Add Account (for residential users) or Settings (for municipal staff)
    if (this.currentUser.isContractorOrCitizen) {
      nav.push({
        title: 'Account',
        route: 'municipality.profile',
        icon: 'user',
      });
    } else {
      nav.push({
        title: 'Settings',
        route: 'municipality.settings',
        icon: 'cog',
      });
    }

    return nav;
  }

  get subscriptionInfo() {
    return this.currentMunicipality?.subscription || null;
  }

  // === Reference Data Methods ===

  async getZones() {
    if (!this.currentMunicipality?.id) {
      throw new Error('No municipality selected');
    }

    const response = await this.api.get(
      `/municipalities/${this.currentMunicipality.id}/zones`,
    );
    // Extract just the zone names for dropdown usage
    return response;
    // return (response.zones || []).map(zone => zone.name);
  }

  async getNeighborhoods() {
    if (!this.currentMunicipality?.id) {
      throw new Error('No municipality selected');
    }

    const response = await this.api.get(
      `/municipalities/${this.currentMunicipality.id}/neighborhood-codes`,
    );
    // Extract descriptions from neighborhood code objects for dropdown usage
    return response;
    // return (response.neighborhoodCodes || []).map(neighborhood => neighborhood.description);
  }

  async getSiteConditions() {
    if (!this.currentMunicipality?.id) {
      throw new Error('No municipality selected');
    }

    const response = await this.api.get(
      `/municipalities/${this.currentMunicipality.id}/site-attributes`,
    );
    // Extract names from site attribute objects for dropdown usage
    return response;
    // return (response.siteAttributes || []).map(siteAttribute => siteAttribute.displayText);
  }

  async getDrivewayTypes() {
    if (!this.currentMunicipality?.id) {
      throw new Error('No municipality selected');
    }

    const response = await this.api.get(
      `/municipalities/${this.currentMunicipality.id}/driveway-attributes`,
    );
    // Extract names from driveway attribute objects for dropdown usage
    return response;
    // return (response.drivewayAttributes || []).map(drivewayAttribute => drivewayAttribute.displayText);
  }

  async getRoadTypes() {
    if (!this.currentMunicipality?.id) {
      throw new Error('No municipality selected');
    }

    const response = await this.api.get(
      `/municipalities/${this.currentMunicipality.id}/road-attributes`,
    );
    // Extract names from road attribute objects for dropdown usage
    return response;
    // return (response.roadAttributes || []).map(roadAttribute => roadAttribute.displayText);
  }
}
