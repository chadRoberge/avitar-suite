import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';

/**
 * PID Bottom Sheet Component
 *
 * Mobile-optimized property selection interface that slides up from the bottom.
 * Provides search, grouping, and property list for Assessing and Tax modules.
 *
 * @argument {boolean} isOpen - Whether the sheet is open
 * @argument {Function} onClose - Called when sheet should close
 * @argument {Function} onPropertySelect - Called when a property is selected (optional)
 */
export default class PidBottomSheetComponent extends Component {
  @service municipality;
  @service router;
  @service('property-selection') propertySelection;
  @service('property-cache') propertyCache;
  @service assessing;

  @tracked properties = [];
  @tracked groupBy = 'pid';
  @tracked searchTerm = '';
  @tracked isLoading = true;
  @tracked expandedGroups = new Set();

  constructor() {
    super(...arguments);
    this.loadProperties();
  }

  /**
   * Load properties from cache or API
   */
  async loadProperties() {
    this.isLoading = true;
    try {
      const municipalityId = this.municipality.currentMunicipality?.id;
      if (!municipalityId) {
        this.properties = [];
        return;
      }

      // Try cache first for instant display
      const cached = this.propertyCache.getProperties(municipalityId);
      if (cached && cached.length > 0) {
        this.properties = cached;
        this.isLoading = false;
        // Refresh in background
        this.refreshPropertiesInBackground(municipalityId);
      } else {
        // Load from API
        const response = await this.assessing.getProperties();
        this.properties = response.properties || response || [];
        this.propertyCache.setProperties(municipalityId, this.properties);
      }
    } catch (error) {
      console.error('Failed to load properties:', error);
      this.properties = [];
    } finally {
      this.isLoading = false;
    }
  }

  async refreshPropertiesInBackground(municipalityId) {
    try {
      const response = await this.assessing.getProperties();
      const fresh = response.properties || response || [];
      this.properties = fresh;
      this.propertyCache.setProperties(municipalityId, fresh);
    } catch {
      // Silent fail - we have cached data
    }
  }

  /**
   * Filter properties based on search term
   */
  get filteredProperties() {
    if (!this.searchTerm) {
      return this.properties;
    }

    const term = this.searchTerm.toLowerCase();
    return this.properties.filter((prop) => {
      const pid = (prop.pid_formatted || prop.pid || '').toLowerCase();
      const address = (prop.location?.address || '').toLowerCase();
      const owner = (prop.primary_name || '').toLowerCase();
      return (
        pid.includes(term) || address.includes(term) || owner.includes(term)
      );
    });
  }

  /**
   * Group filtered properties by selected criteria
   */
  get groupedProperties() {
    const filtered = this.filteredProperties;
    const groups = {};

    filtered.forEach((prop) => {
      let key;
      switch (this.groupBy) {
        case 'street':
          key = this.getStreetName(prop) || 'Unknown';
          break;
        case 'lastname':
          key = this.getLastName(prop) || 'Unknown';
          break;
        case 'pid':
        default:
          key = this.getMapNumber(prop) || 'Unknown';
          break;
      }

      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(prop);
    });

    // Sort groups alphabetically, with numbers first
    const sortedKeys = Object.keys(groups).sort((a, b) => {
      const aNum = parseInt(a, 10);
      const bNum = parseInt(b, 10);
      if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
      if (!isNaN(aNum)) return -1;
      if (!isNaN(bNum)) return 1;
      return a.localeCompare(b);
    });

    const sorted = {};
    sortedKeys.forEach((key) => {
      sorted[key] = groups[key];
    });

    return sorted;
  }

  get groupKeys() {
    return Object.keys(this.groupedProperties);
  }

  get propertyCount() {
    return this.filteredProperties.length;
  }

  get selectedPropertyId() {
    return this.propertySelection.selectedProperty?._id;
  }

  /**
   * Extract map number from PID (first part before dash)
   */
  getMapNumber(property) {
    const pid = property.pid_formatted || property.pid || '';
    const parts = pid.split('-');
    return parts[0] || 'Unknown';
  }

  /**
   * Extract street name from address
   */
  getStreetName(property) {
    const address = property.location?.address || '';
    // Remove street number at the beginning
    const match = address.match(/^\d+\s+(.+)/);
    return match ? match[1] : address || 'Unknown';
  }

  /**
   * Extract last name from owner name
   */
  getLastName(property) {
    const name = property.primary_name || '';
    // Try to get last name (first word for "LASTNAME, FIRSTNAME" format)
    const parts = name.split(/[,\s]+/);
    return parts[0] || 'Unknown';
  }

  /**
   * Get display name for property based on grouping
   */
  getDisplayName(property) {
    switch (this.groupBy) {
      case 'street': {
        // Show street number
        const address = property.location?.address || '';
        const numMatch = address.match(/^(\d+)/);
        return numMatch ? numMatch[1] : property.pid_formatted || property.pid;
      }
      case 'lastname':
        return property.primary_name || 'Unknown Owner';
      case 'pid':
      default:
        return property.lotSubDisplay || property.pid_formatted || property.pid;
    }
  }

  /**
   * Get secondary info for property based on grouping
   */
  getSecondaryInfo(property) {
    switch (this.groupBy) {
      case 'street':
        return property.primary_name || '';
      case 'lastname':
        return property.location?.address || '';
      case 'pid':
      default:
        return property.location?.address || '';
    }
  }

  /**
   * Get group title based on grouping type
   */
  getGroupTitle(key) {
    switch (this.groupBy) {
      case 'street':
        return key === 'Unknown' ? 'No Street' : key;
      case 'lastname':
        return key === 'Unknown' ? 'Unknown Owner' : key;
      case 'pid':
      default:
        return `Map ${key}`;
    }
  }

  /**
   * Get icon for group based on grouping type
   */
  getGroupIcon() {
    switch (this.groupBy) {
      case 'street':
        return 'map-marker';
      case 'lastname':
        return 'user';
      case 'pid':
      default:
        return 'layers';
    }
  }

  @action
  setGroupBy(groupBy) {
    this.groupBy = groupBy;
    // Collapse all groups when switching
    this.expandedGroups = new Set();
  }

  @action
  updateSearch(event) {
    this.searchTerm = event.target.value;
  }

  @action
  clearSearch() {
    this.searchTerm = '';
  }

  @action
  toggleGroup(key) {
    const newSet = new Set(this.expandedGroups);
    if (newSet.has(key)) {
      newSet.delete(key);
    } else {
      newSet.add(key);
    }
    this.expandedGroups = newSet;
  }

  @action
  isGroupExpanded(key) {
    return this.expandedGroups.has(key);
  }

  @action
  async selectProperty(property) {
    // Update the property selection service
    this.propertySelection.setSelectedProperty(property);

    // Call optional callback
    this.args.onPropertySelect?.(property);

    // Close the sheet
    this.args.onClose?.();

    // Navigate to the property view
    const currentRoute = this.router.currentRouteName;

    // Determine which module we're in and navigate appropriately
    if (currentRoute.includes('assessing')) {
      // Stay in assessing, go to general tab
      this.router.transitionTo(
        'municipality.assessing.property.general',
        property._id,
      );
    } else if (currentRoute.includes('tax-collection')) {
      // Go to tax collection property view
      this.router.transitionTo(
        'municipality.tax-collection.property',
        property._id,
      );
    } else if (currentRoute.includes('building-permits')) {
      // Update query param for property
      this.router.transitionTo({ queryParams: { property: property._id } });
    }
  }

  @action
  isPropertySelected(property) {
    return this.selectedPropertyId === property._id;
  }
}
