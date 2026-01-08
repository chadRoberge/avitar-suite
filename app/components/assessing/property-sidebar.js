import Component from '@glimmer/component';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class PropertySidebarComponent extends Component {
  @service router;
  @service municipality;
  @service('current-user') currentUser;
  @service assessing;
  @service('property-selection') propertySelection;
  @service('property-queue') propertyQueue;
  @service('property-prefetch') propertyPrefetch;
  @service('property-cache') propertyCache;
  @service('hybrid-api') hybridApi;

  @tracked isOpen = true;
  @tracked groupBy = 'pid'; // 'pid', 'street', 'lastname'
  @tracked properties = [];
  @tracked groupedProperties = {};
  @tracked selectedPropertyId = null;
  @tracked isLoading = false;
  @tracked searchTerm = '';
  @tracked isQueryModalOpen = false;
  @tracked isQueryMode = false;
  @tracked originalProperties = []; // Store original properties for clearing query
  @tracked lastMunicipalityId = null;

  _hasInitialized = false;

  constructor() {
    super(...arguments);

    // Initialize selected property from current route if viewing a property
    const currentRoute = this.router.currentRoute;
    if (currentRoute?.params?.property_id) {
      this.selectedPropertyId = currentRoute.params.property_id;
      console.log(
        '🎯 Initialized selected property from route:',
        this.selectedPropertyId,
      );
    }

    // Don't load properties in constructor - use lazy loading via shouldInitialize getter
    // This prevents unnecessary API calls if component is briefly instantiated

    // Listen for background refresh completion
    this.hybridApi.on(
      'propertiesRefreshed',
      this,
      this.handlePropertiesRefreshed,
    );
  }

  /**
   * Check if we should load properties on the current route
   * Only load on assessing routes and building-permits.find
   */
  get shouldLoadOnCurrentRoute() {
    const routeName = this.router.currentRouteName;
    if (!routeName) return false;

    // Only load on assessing routes (except settings/reports/revaluation)
    const isAssessingRoute =
      routeName.startsWith('municipality.assessing') &&
      !routeName.startsWith('municipality.assessing.settings') &&
      !routeName.startsWith('municipality.assessing.reports') &&
      !routeName.startsWith('municipality.assessing.revaluation');

    // Or on building-permits.find specifically
    const isBuildingPermitsFind =
      routeName === 'municipality.building-permits.find';

    return isAssessingRoute || isBuildingPermitsFind;
  }

  /**
   * Lazy initialize properties when component is rendered
   * Called from template to trigger loading
   */
  get shouldInitialize() {
    console.log(
      '🔍 [PropertySidebar] shouldInitialize called, _hasInitialized:',
      this._hasInitialized,
      'route:',
      this.router.currentRouteName,
    );

    // Skip loading if we're not on an appropriate route
    if (!this.shouldLoadOnCurrentRoute) {
      console.log(
        '🔍 [PropertySidebar] Skipping load - not on assessing route',
      );
      return false;
    }

    if (!this._hasInitialized) {
      this._hasInitialized = true;
      const currentMunicipalityId = this.municipality.currentMunicipality?.id;
      console.log(
        '🔍 [PropertySidebar] Initializing for municipality:',
        currentMunicipalityId,
      );
      if (
        !this.properties.length ||
        this.lastMunicipalityId !== currentMunicipalityId
      ) {
        this.lastMunicipalityId = currentMunicipalityId;
        // Use setTimeout to avoid triggering during render
        console.log('🔍 [PropertySidebar] Scheduling loadProperties');
        setTimeout(() => this.loadProperties(), 0);
      }
    }
    return this._hasInitialized;
  }

  @action
  handlePropertiesRefreshed() {
    // Silently reload properties from cache (which now has fresh data)
    console.log('📢 Received propertiesRefreshed event - reloading silently');
    this.loadProperties(true); // Pass true for silent reload
  }

  get activeModule() {
    const currentRoute = this.router.currentRouteName;
    if (currentRoute.includes('assessing')) return 'assessing';
    if (currentRoute.includes('building-permits')) return 'building_permit';
    if (currentRoute.includes('tax-collection')) return 'taxCollection';
    return null;
  }

  get activeModuleRoute() {
    const module = this.activeModule;
    return module
      ? `municipality.${module.replace(/([A-Z])/g, '-$1').toLowerCase()}`
      : null;
  }

  get filteredGroupedProperties() {
    if (!this.searchTerm) return this.groupedProperties;

    const filtered = {};
    const searchLower = this.searchTerm.toLowerCase();

    Object.keys(this.groupedProperties).forEach((groupKey) => {
      const group = this.groupedProperties[groupKey];
      const filteredGroup = group.filter((property) => {
        const formattedPid = property.pid_formatted || '';
        const address = property.location?.address || '';
        const ownerName = property.owner?.primary_name || '';

        return (
          formattedPid.toLowerCase().includes(searchLower) ||
          address.toLowerCase().includes(searchLower) ||
          ownerName.toLowerCase().includes(searchLower)
        );
      });

      if (filteredGroup.length > 0) {
        filtered[groupKey] = filteredGroup;
      }
    });

    return filtered;
  }

  @action
  toggleSidebar() {
    this.isOpen = !this.isOpen;
  }

  @action
  setGroupBy(groupBy) {
    this.groupBy = groupBy;
    this.groupProperties();
  }

  @action
  selectProperty(property) {
    this.selectedPropertyId = property.id;

    // Start background prefetching immediately
    this.startPropertyPrefetching(property);

    // Update the global property selection service
    // Preserve cards data if re-selecting the same property
    const currentProperty = this.propertySelection.selectedProperty;
    const isSameProperty =
      currentProperty && currentProperty.id === property.id;

    let propertyToSet = property;
    if (isSameProperty && currentProperty.cards && !property.cards) {
      // Preserve cards data and current_card when re-selecting same property
      console.log('🃏 Preserving cards data for property', property.id);
      propertyToSet = {
        ...property,
        cards: currentProperty.cards,
        current_card: currentProperty.current_card,
      };
    }

    this.propertySelection.setSelectedProperty(propertyToSet);

    // Get the current route name
    const currentRouteName = this.router.currentRouteName;

    if (currentRouteName) {
      // If we're already in a property route, update the property ID
      if (currentRouteName.includes('.property')) {
        this.router.transitionTo(currentRouteName, property.id);
      } else {
        // Check if current module has a property route and navigate there
        const routeParts = currentRouteName.split('.');
        if (routeParts.length >= 2 && routeParts[0] === 'municipality') {
          const moduleName = routeParts[1];

          // Try to navigate to the property route for the current module
          if (moduleName === 'assessing') {
            // Check if we're in a specific assessment view
            const assessmentViews = ['general', 'land', 'building', 'features'];
            const currentView = routeParts[2]; // e.g., 'general' from 'municipality.assessing.general'

            if (assessmentViews.includes(currentView)) {
              // Navigate to the property route under the same assessment section
              this.router.transitionTo(
                `municipality.assessing.${currentView}.property`,
                property.id,
                { queryParams: this.router.currentRoute.queryParams },
              );
            } else if (routeParts[2] === 'properties') {
              // If in properties list view, go to general assessment view for the property
              this.router.transitionTo(
                'municipality.assessing.general.property',
                property.id,
                { queryParams: this.router.currentRoute.queryParams },
              );
            } else {
              // Default to general assessment view for the property
              this.router.transitionTo(
                'municipality.assessing.general.property',
                property.id,
                { queryParams: this.router.currentRoute.queryParams },
              );
            }
          } else if (moduleName === 'building_permit') {
            // Check if we're in a specific building permits view
            const propertyViews = [
              'property-permits',
              'inspections',
              'documents',
              'certificates',
            ];
            const currentView = routeParts[2];

            if (propertyViews.includes(currentView)) {
              // Navigate to the property route under the same section
              this.router.transitionTo(
                `municipality.building-permits.${currentView}.property`,
                property.id,
              );
            } else if (
              ['queue', 'permits', 'applications'].includes(currentView)
            ) {
              // If in list views (non-property), stay there - just update selected property
              console.log(
                `Selected property ${property.id} while in ${currentView} view`,
              );
            } else {
              // Default to property permits view
              this.router.transitionTo(
                'municipality.building-permits.property-permits.property',
                property.id,
              );
            }
          } else {
            // For other modules that don't have property routes, just select visually
            // The property will be highlighted but no navigation occurs
            console.log(
              `Selected property ${property.id} in ${moduleName} module`,
            );
          }
        }
      }
    }
  }

  @action
  updateSearch(event) {
    this.searchTerm = event.target.value;
  }

  @action
  openQueryModal() {
    this.isQueryModalOpen = true;
  }

  @action
  closeQueryModal() {
    this.isQueryModalOpen = false;
  }

  @action
  handleQueryResults(queryResults) {
    // Store original properties if this is the first query
    if (!this.isQueryMode) {
      this.originalProperties = [...this.properties];
    }

    // Update properties with query results
    this.properties = queryResults;
    this.isQueryMode = true;
    this.groupProperties();
  }

  @action
  clearQuery() {
    // Restore original properties
    this.properties = [...this.originalProperties];
    this.isQueryMode = false;
    this.originalProperties = [];
    this.groupProperties();
  }

  @action
  loadQueue() {
    // Load properties from queue
    const queuedProperties = this.propertyQueue.getQueuedProperties();
    if (queuedProperties.length > 0) {
      // Store original properties if not already in query mode
      if (!this.isQueryMode) {
        this.originalProperties = [...this.properties];
      }

      this.properties = queuedProperties;
      this.isQueryMode = true;
      this.groupProperties();
      console.log(`Loaded ${queuedProperties.length} properties from queue`);
    }
  }

  @action
  clearAll() {
    // Clear both query and queue
    this.clearQuery();
    this.propertyQueue.clearQueue();
  }

  async loadProperties(silent = false) {
    if (!this.municipality.currentMunicipality) return;

    // Preserve selected property ID during reload
    const previousSelectedId = this.selectedPropertyId;

    // Only show loading indicator if not a silent refresh
    if (!silent) {
      this.isLoading = true;
    }

    try {
      // Use assessing service which implements local-first caching
      const response = await this.assessing.getProperties();

      // Handle different response formats (cached vs server)
      if (response?.properties) {
        // Server format: { success: true, properties: [...] }
        this.properties = response.properties;
      } else if (Array.isArray(response)) {
        // Direct array (cached format)
        this.properties = response;
      } else {
        this.properties = [];
      }

      // Only log on silent refresh to confirm background updates
      if (silent) {
        console.log(
          `🏘️ Background refresh: ${this.properties.length} properties`,
        );
      }

      // Reset query mode when loading fresh properties (only if not silent)
      if (!silent) {
        this.isQueryMode = false;
        this.originalProperties = [];
      }

      this.groupProperties();

      // Restore selected property ID after reload
      if (previousSelectedId) {
        this.selectedPropertyId = previousSelectedId;
        console.log('🎯 Restored selected property ID:', previousSelectedId);
      }
    } catch (error) {
      console.error('Failed to load properties:', error);
      this.properties = [];
    } finally {
      if (!silent) {
        this.isLoading = false;
      }
    }
  }

  groupProperties() {
    // Removed debug logging - uncomment if needed for troubleshooting
    // console.log(`🗂️ Starting groupProperties with ${this.properties.length} properties`);
    // console.log(`🗂️ Group by: ${this.groupBy}`);

    const grouped = {};

    switch (this.groupBy) {
      case 'pid':
        this.properties.forEach((property, index) => {
          const map = property.mapNumber || 'Unknown';
          // Removed debug logging for individual properties
          if (!grouped[map]) grouped[map] = [];
          grouped[map].push(property);
        });

        // Removed debug logging for grouped maps

        // Sort each map group by lot-sub display (server already formatted)
        Object.keys(grouped).forEach((map) => {
          // Removed debug logging for map property counts

          grouped[map].sort((a, b) => {
            // Use the lotSubDisplay from server or fallback to string comparison
            const displayA = a.lotSubDisplay || a.pid_formatted || '';
            const displayB = b.lotSubDisplay || b.pid_formatted || '';
            return displayA.localeCompare(displayB, undefined, {
              numeric: true,
            });
          });
        });
        break;

      case 'street':
        this.properties.forEach((property) => {
          const street = property.location?.street || 'Unknown/Vacant';
          if (!grouped[street]) grouped[street] = [];
          grouped[street].push(property);
        });

        // Sort each street group by street number
        Object.keys(grouped).forEach((street) => {
          grouped[street].sort((a, b) => {
            const numA = parseInt(a.location?.street_number) || 0;
            const numB = parseInt(b.location?.street_number) || 0;
            if (numA === 0 && numB > 0) return -1; // Unknown/vacant at top
            if (numB === 0 && numA > 0) return 1;
            return numA - numB;
          });
        });
        break;

      case 'lastname':
        this.properties.forEach((property) => {
          const lastName =
            this.extractLastName(property.owner?.primary_name) || 'Unknown';
          const initial = lastName.charAt(0).toUpperCase();
          if (!grouped[initial]) grouped[initial] = [];
          grouped[initial].push(property);
        });

        // Sort each letter group by last name, first name
        Object.keys(grouped).forEach((letter) => {
          grouped[letter].sort((a, b) => {
            const nameA = a.owner?.primary_name || '';
            const nameB = b.owner?.primary_name || '';
            return nameA.localeCompare(nameB);
          });
        });
        break;
    }

    // Sort the grouped object keys alphabetically for consistent display order
    const sortedGrouped = {};
    const sortedKeys = Object.keys(grouped).sort((a, b) => {
      // Handle special cases for street sorting
      if (this.groupBy === 'street') {
        // Always put 'Unknown/Vacant' at the end
        if (a === 'Unknown/Vacant') return 1;
        if (b === 'Unknown/Vacant') return -1;
        // Sort street names alphabetically
        return a.localeCompare(b, undefined, { numeric: true });
      }

      // Handle special cases for lastname sorting
      if (this.groupBy === 'lastname') {
        // Always put 'Unknown' at the end
        if (a === 'Unknown') return 1;
        if (b === 'Unknown') return -1;
        // Sort letter initials alphabetically
        return a.localeCompare(b);
      }

      // For PID grouping, sort map numbers numerically
      if (this.groupBy === 'pid') {
        // Always put 'Unknown' at the end
        if (a === 'Unknown') return 1;
        if (b === 'Unknown') return -1;
        // Sort map numbers numerically
        return a.localeCompare(b, undefined, { numeric: true });
      }

      // Default alphabetical sort
      return a.localeCompare(b, undefined, { numeric: true });
    });

    // Rebuild grouped object with sorted keys
    sortedKeys.forEach((key) => {
      sortedGrouped[key] = grouped[key];
    });

    this.groupedProperties = sortedGrouped;

    // Removed debug logging for final grouped properties
  }

  extractLastName(ownerName) {
    if (!ownerName) return 'Unknown';

    // Handle "Last, First" format
    if (ownerName.includes(',')) {
      return ownerName.split(',')[0].trim();
    }

    // Handle "First Last" format - take the last word
    const parts = ownerName.trim().split(' ');
    return parts[parts.length - 1];
  }

  getPropertyDisplayName = (property) => {
    if (!this.groupBy) return property.pid_formatted || property.id;

    switch (this.groupBy) {
      case 'pid':
        return property.lotSubDisplay || property.pid_formatted || 'Unknown';
      case 'street':
        const num = property.location?.street_number || 'Vacant';
        const unit = property.location?.unit
          ? ` Unit ${property.location.unit}`
          : '';
        return `${num}${unit}`;
      case 'lastname':
        return property.owner?.primary_name || 'Unknown Owner';
      default:
        return property.pid_formatted || property.id;
    }
  };

  getPropertySecondaryInfo = (property) => {
    if (!this.groupBy) return '';

    switch (this.groupBy) {
      case 'pid':
        return property.location?.address || 'No address';
      case 'street':
        return property.owner?.primary_name || 'Unknown Owner';
      case 'lastname':
        return property.location?.address || 'No address';
      default:
        return '';
    }
  };

  /**
   * Start intelligent prefetching when a property is selected
   */
  startPropertyPrefetching(property) {
    console.log('🔄 Starting prefetching for property:', property.id);

    // Prefetch adjacent properties in the list
    this.propertyPrefetch.prefetchAdjacentProperties(
      property.id,
      this.properties,
      1, // Default card
      null, // Current year
    );

    // Smart prefetch other cards for this property
    this.propertyPrefetch.smartPrefetch(property.id);

    // Prefetch frequently accessed properties if this property is popular
    if (this.propertyCache.shouldPrefetch(property.id)) {
      const frequentProperties = this.propertyCache.getFrequentlyAccessed(5);
      this.propertyPrefetch.prefetchProperties(frequentProperties);
    }
  }

  /**
   * Setup intersection observer for viewport-based prefetching
   */
  setupViewportPrefetching() {
    if (!window.IntersectionObserver) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const propertyElement = entry.target;
            const propertyId = propertyElement.dataset.propertyId;

            if (propertyId && !this.propertyCache.get(propertyId)) {
              // Prefetch property that's becoming visible
              this.propertyPrefetch.prefetchProperty(propertyId);
            }
          }
        });
      },
      {
        rootMargin: '100px', // Start prefetching 100px before element is visible
        threshold: 0.1,
      },
    );

    // Observe property elements (would need to be called after render)
    this.intersectionObserver = observer;
  }

  /**
   * Cleanup prefetching when component is destroyed
   */
  willDestroy() {
    super.willDestroy();

    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
    }

    // Clear prefetch queue to avoid unnecessary requests
    this.propertyPrefetch.clearPrefetchQueue();

    // Remove event listener
    this.hybridApi.off(
      'propertiesRefreshed',
      this,
      this.handlePropertiesRefreshed,
    );
  }
}
