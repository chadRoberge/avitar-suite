import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';

export default class PropertyQueryModalComponent extends Component {
  @service assessing;
  @service notifications;

  @tracked isLoading = false;
  @tracked queryParams = {
    bedrooms: '',
    bathrooms: '',
    zone: '',
    buildingSizeMin: '',
    buildingSizeMax: '',
    buildingHeightMin: '',
    buildingHeightMax: '',
    yearBuiltMin: '',
    yearBuiltMax: '',
    assessmentMin: '',
    assessmentMax: '',
    landAreaMin: '',
    landAreaMax: '',
  };

  @tracked availableZones = [];

  constructor() {
    super(...arguments);
    this.loadZones();
  }

  @action
  updateParam(param, event) {
    this.queryParams = {
      ...this.queryParams,
      [param]: event.target.value,
    };
  }

  @action
  clearFilters() {
    this.queryParams = {
      bedrooms: '',
      bathrooms: '',
      zone: '',
      buildingSizeMin: '',
      buildingSizeMax: '',
      buildingHeightMin: '',
      buildingHeightMax: '',
      yearBuiltMin: '',
      yearBuiltMax: '',
      assessmentMin: '',
      assessmentMax: '',
      landAreaMin: '',
      landAreaMax: '',
    };
  }

  @action
  async executeQuery(event) {
    if (event) {
      event.preventDefault();
    }

    // Filter out empty parameters
    const cleanParams = {};
    Object.keys(this.queryParams).forEach((key) => {
      if (
        this.queryParams[key] &&
        this.queryParams[key].toString().trim() !== ''
      ) {
        cleanParams[key] = this.queryParams[key];
      }
    });

    if (Object.keys(cleanParams).length === 0) {
      this.notifications.warning('Please specify at least one search criteria');
      return;
    }

    this.isLoading = true;
    try {
      const response = await this.assessing.queryProperties(cleanParams);

      if (response.success && response.properties) {
        this.args.onQueryResults?.(response.properties);
        this.args.onClose?.();
        this.notifications.success(
          `Found ${response.properties.length} properties matching your criteria`,
        );
      } else {
        this.notifications.error('No properties found matching your criteria');
      }
    } catch (error) {
      console.error('Property query failed:', error);
      this.notifications.error(
        'Failed to search properties. Please try again.',
      );
    } finally {
      this.isLoading = false;
    }
  }

  @action
  async loadZones() {
    try {
      const response = await this.assessing.getPropertyZones();
      this.availableZones = response.zones || [];
    } catch (error) {
      console.error('Failed to load zones:', error);
      this.availableZones = [];
    }
  }

  @action
  closeModal() {
    this.args.onClose?.();
  }

  @action
  stopPropagation(event) {
    event.stopPropagation();
  }

  get hasFilters() {
    return Object.values(this.queryParams).some(
      (value) => value && value.toString().trim() !== '',
    );
  }
}
