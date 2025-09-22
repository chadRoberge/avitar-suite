import Component from '@glimmer/component';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { cached } from '@glimmer/tracking';
import LandAssessmentCalculator from 'avitar-suite/utils/land-assessment-calculator';

export default class AssessingLandEditModalComponent extends Component {
  @service api;
  @service municipality;

  @tracked isLoading = false;
  @tracked isSaving = false;
  @tracked isDataLoaded = false;
  @tracked landAssessment = {};
  @tracked landUseEntries = [];
  @tracked availableZones = [];
  @tracked availableNeighborhoods = [];
  @tracked availableSites = [];
  @tracked availableDriveways = [];
  @tracked availableRoads = [];
  @tracked availableTopology = [];
  @tracked availableLandUseDetails = [];
  @tracked availableTaxationCategories = [];
  @tracked availableCurrentUseCategories = [];
  @tracked acreageDiscountSettings = null;
  @tracked landLadders = {}; // Grouped by zone ID
  @tracked calculator = null;

  // Cache reference data to prevent loss during local-first sync
  _cachedReferenceData = null;

  constructor(owner, args) {
    super(owner, args);
    this.initializeData();
  }

  // Use cached getter to ensure data loads when modal opens
  @cached
  get modalData() {
    if (this.args.isOpen && !this.isDataLoaded) {
      // Start loading data asynchronously
      this.loadMunicipalityOptions();
    }
    return {
      isOpen: this.args.isOpen,
      isDataLoaded: this.isDataLoaded,
      hasCalculator: !!this.calculator,
    };
  }

  initializeData() {
    if (this.args.landAssessment) {
      this.landAssessment = { ...this.args.landAssessment };
      this.landUseEntries = this.args.landAssessment.land_use_details || [];
    }
  }

  async loadMunicipalityOptions() {
    try {
      // Load all reference data in parallel - handle each individually
      const results = await Promise.allSettled([
        this.municipality.getZones(),
        this.municipality.getNeighborhoods(),
        this.municipality.getSiteConditions(),
        this.municipality.getDrivewayTypes(),
        this.municipality.getRoadTypes(),
        this.api.get(
          `/municipalities/${this.municipality.currentMunicipality?.id}/topology-attributes`,
        ),
        this.api.get(
          `/municipalities/${this.municipality.currentMunicipality?.id}/land-ladders`,
        ),
        this.api.get(
          `/municipalities/${this.municipality.currentMunicipality?.id}/land-use-details`,
        ),
        this.api.get(
          `/municipalities/${this.municipality.currentMunicipality?.id}/land-taxation-categories`,
        ),
        this.api.get(
          `/municipalities/${this.municipality.currentMunicipality?.id}/current-use`,
        ),
        this.api.get(
          `/municipalities/${this.municipality.currentMunicipality?.id}/acreage-discount-settings`,
        ),
      ]);

      // Only set data from successful API calls
      if (results[0].status === 'fulfilled') {
        this.availableZones = results[0].value.zones;
      }
      if (results[1].status === 'fulfilled') {
        this.availableNeighborhoods = results[1].value.neighborhoodCodes;
      }
      if (results[2].status === 'fulfilled') {
        this.availableSites = results[2].value.siteAttributes;
      }
      if (results[3].status === 'fulfilled') {
        this.availableDriveways = results[3].value.drivewayAttributes;
      }
      if (results[4].status === 'fulfilled') {
        this.availableRoads = results[4].value.roadAttributes;
      }
      if (results[5].status === 'fulfilled') {
        this.availableTopology = results[5].value.topologyAttributes;
      }
      if (results[6].status === 'fulfilled') {
        // Land ladders should be grouped by zone for easy lookup
        const landLaddersData =
          results[6].value.landLadders || results[6].value;
        this.landLadders = {};
        if (Array.isArray(landLaddersData)) {
          // Group by zone ID
          landLaddersData.forEach((ladder) => {
            const zoneId = ladder.zoneId || ladder.id;
            if (!this.landLadders[zoneId]) {
              this.landLadders[zoneId] = [];
            }
            this.landLadders[zoneId] = ladder.tiers || [ladder];
          });
        }
      }
      if (results[7].status === 'fulfilled') {
        this.availableLandUseDetails = results[7].value.landUseDetails;
      }
      if (results[8].status === 'fulfilled') {
        this.availableTaxationCategories =
          results[8].value.landTaxationCategories || [];
      }
      if (results[9].status === 'fulfilled') {
        this.availableCurrentUseCategories =
          results[9].value.currentUseCategories || [];
      }
      if (results[10].status === 'fulfilled') {
        this.acreageDiscountSettings =
          results[10].value.acreageDiscountSettings || null;
      }
      // Log any failed requests
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          const names = [
            'zones',
            'neighborhoods',
            'site conditions',
            'driveway types',
            'road types',
            'topology attributes',
            'land ladders',
            'land use details',
            'land taxation categories',
            'current use categories',
            'acreage discount settings',
          ];
          console.warn(`Failed to load ${names[index]}:`, result.reason);
        }
      });

      // Cache reference data to prevent loss during local-first sync
      this._cachedReferenceData = {
        availableZones: [...this.availableZones],
        availableNeighborhoods: [...this.availableNeighborhoods],
        availableSites: [...this.availableSites],
        availableDriveways: [...this.availableDriveways],
        availableRoads: [...this.availableRoads],
        availableTopology: [...this.availableTopology],
        availableLandUseDetails: [...this.availableLandUseDetails],
        availableTaxationCategories: [...this.availableTaxationCategories],
        availableCurrentUseCategories: [...this.availableCurrentUseCategories],
        acreageDiscountSettings: this.acreageDiscountSettings
          ? { ...this.acreageDiscountSettings }
          : null,
        landLadders: { ...this.landLadders },
      };

      // Initialize shared calculator with reference data
      this.initializeCalculator();

      // Mark data as loaded
      this.isDataLoaded = true;
    } catch (error) {
      console.warn('Failed to load municipality reference data:', error);
    }
  }

  // Initialize the shared calculator with current reference data
  initializeCalculator() {
    if (!this.availableZones?.length) {
      console.warn('Calculator initialization failed - no zones available');
      this.calculator = null;
      return;
    }

    const referenceData = {
      landLadders: this.landLadders,
      topologyAttributes: this.availableTopology || [],
      currentUseCategories: this.availableCurrentUseCategories || [],
      landTaxationCategories: this.availableTaxationCategories || [],
      neighborhoodCodes: this.availableNeighborhoods || [],
      siteAttributes: this.availableSites || [],
      drivewayAttributes: this.availableDriveways || [],
      roadAttributes: this.availableRoads || [],
      zones: this.availableZones || [],
      acreageDiscountSettings: this.acreageDiscountSettings,
    };

    this.calculator = new LandAssessmentCalculator(referenceData);
  }

  // Get complete property assessment with calculated land lines and totals
  get propertyAssessment() {
    if (!this.calculator) {
      // Return default structure while calculator initializes
      return {
        land_use_details: this.landUseEntries,
        calculated_totals: {
          totalAcreage: 0,
          totalFrontage: 0,
          totalMarketValue: 0,
          totalCurrentUseValue: 0,
          totalAssessedValue: 0,
          totalCurrentUseCredit: 0,
        },
      };
    }

    // Force dependency tracking on the tracked properties
    const landAssessmentData = {
      ...this.landAssessment,
      land_use_details: this.landUseEntries,
    };

    return this.calculator.calculatePropertyAssessment(landAssessmentData);
  }

  // Get calculated totals from property assessment
  get calculatedTotals() {
    return this.propertyAssessment.calculated_totals;
  }

  // Get calculated land lines with all values
  get calculatedLandLines() {
    return this.propertyAssessment.land_use_details;
  }

  get totalAcreage() {
    return this.calculatedTotals.totalAcreage;
  }

  get totalMarketValue() {
    return this.calculatedTotals.totalMarketValue;
  }

  get totalAssessedValue() {
    return this.calculatedTotals.totalAssessedValue;
  }

  get totalCurrentUseCredit() {
    return this.calculatedTotals.totalCurrentUseCredit;
  }

  // Context-safe getter for market value calculation
  getMarketValue = (entry, index) => {
    if (!this || !this.calculatedLandLines) {
      return 0;
    }
    // Use the same approach as totals - get calculated lines from propertyAssessment
    const calculatedLines = this.calculatedLandLines;
    if (calculatedLines && calculatedLines[index]) {
      const value = calculatedLines[index].marketValue || 0;
      return value;
    }
    return 0;
  };

  // Context-safe getter for current use value calculation
  getCurrentUseValue = (entry, index) => {
    if (!this || !this.calculatedLandLines) {
      return 0;
    }
    // Use the same approach as totals - get calculated lines from propertyAssessment
    const calculatedLines = this.calculatedLandLines;
    if (calculatedLines && calculatedLines[index]) {
      const value = calculatedLines[index].currentUseValue || 0;
      return value;
    }
    return 0;
  };

  // Context-safe getter for assessed value calculation
  getAssessedValue = (entry, index) => {
    if (!this || !this.calculatedLandLines) {
      return 0;
    }
    // Use the same approach as totals - get calculated lines from propertyAssessment
    const calculatedLines = this.calculatedLandLines;
    if (calculatedLines && calculatedLines[index]) {
      const value = calculatedLines[index].assessedValue || 0;
      return value;
    }
    return 0;
  };

  _restoreFromCache() {
    if (!this._cachedReferenceData) {
      return false;
    }

    try {
      this.availableZones = [...this._cachedReferenceData.availableZones];
      this.availableNeighborhoods = [
        ...this._cachedReferenceData.availableNeighborhoods,
      ];
      this.availableSites = [...this._cachedReferenceData.availableSites];
      this.availableDriveways = [
        ...this._cachedReferenceData.availableDriveways,
      ];
      this.availableRoads = [...this._cachedReferenceData.availableRoads];
      this.availableTopology = [...this._cachedReferenceData.availableTopology];
      this.availableLandUseDetails = [
        ...this._cachedReferenceData.availableLandUseDetails,
      ];
      this.availableTaxationCategories = [
        ...this._cachedReferenceData.availableTaxationCategories,
      ];
      this.availableCurrentUseCategories = [
        ...this._cachedReferenceData.availableCurrentUseCategories,
      ];
      this.acreageDiscountSettings = this._cachedReferenceData
        .acreageDiscountSettings
        ? { ...this._cachedReferenceData.acreageDiscountSettings }
        : null;
      this.landLadders = { ...this._cachedReferenceData.landLadders };

      // Reinitialize calculator with restored data
      this.initializeCalculator();

      this.isDataLoaded = true;
      return true;
    } catch (error) {
      console.error('Failed to restore from cache:', error);
      return false;
    }
  }

  // Helper methods for factor calculations (used by both old and new systems)
  getSiteFactor(siteConditionsId) {
    const siteAttribute = this.availableSites?.find(
      (s) => s._id === siteConditionsId || s.id === siteConditionsId,
    );
    return siteAttribute
      ? siteAttribute.rate
        ? siteAttribute.rate / 100
        : 1
      : 1.0;
  }

  getDrivewayFactor(drivewayTypeId) {
    const drivewayAttribute = this.availableDriveways?.find(
      (d) => d._id === drivewayTypeId || d.id === drivewayTypeId,
    );
    return drivewayAttribute
      ? drivewayAttribute.rate
        ? drivewayAttribute.rate / 100
        : 1
      : 1.0;
  }

  getRoadFactor(roadTypeId) {
    const roadAttribute = this.availableRoads?.find(
      (r) => r._id === roadTypeId || r.id === roadTypeId,
    );
    return roadAttribute
      ? roadAttribute.rate
        ? roadAttribute.rate / 100
        : 1
      : 1.0;
  }

  @action
  updateLandAssessment(field, value) {
    this.landAssessment = { ...this.landAssessment, [field]: value };
  }

  @action
  updateLandAssessmentFromEvent(field, event) {
    this.updateLandAssessment(field, event.target.value);
  }

  @action
  addLandUseEntry() {
    this.landUseEntries = [
      ...this.landUseEntries,
      {
        land_use_type: '',
        size: '',
        size_unit: 'AC',
        topography: '',
        condition: '',
        spi: '',
        is_excess_acreage: false,
        notes: '',
      },
    ];
  }

  @action
  removeLandUseEntry(index) {
    this.landUseEntries = this.landUseEntries.filter((_, i) => i !== index);
  }

  @action
  updateLandUseEntry(index, field, value) {
    this.landUseEntries = this.landUseEntries.map((entry, i) => {
      if (i === index) {
        return { ...entry, [field]: value };
      }
      return entry;
    });
  }

  @action
  updateLandUseEntryFromEvent(index, field, event) {
    const value =
      event.target.type === 'checkbox'
        ? event.target.checked
        : event.target.value;
    this.updateLandUseEntry(index, field, value);
  }

  @action
  async saveLandAssessment() {
    if (this.isSaving) return;

    try {
      this.isSaving = true;

      const propertyId = this.args.property.id;
      const municipalityId = this.municipality.currentMunicipality?.id;

      // Ensure reference data is loaded before calculating values
      if (
        !this.availableZones ||
        !this.availableNeighborhoods ||
        !this.landLadders
      ) {
        if (!this._restoreFromCache()) {
          await this.loadMunicipalityOptions();
        }
      }

      // Ensure calculator is initialized before saving
      if (!this.calculator) {
        this.initializeCalculator();
      }

      // Use the complete calculated property assessment
      const propertyAssessment = this.propertyAssessment;

      const payload = {
        ...this.landAssessment,
        land_use_details: propertyAssessment.land_use_details, // Includes all calculated values
        calculated_totals: propertyAssessment.calculated_totals,
        market_value: this.totalMarketValue,
        taxable_value: this.totalAssessedValue,
      };

      // Land assessment is parcel-level, not card-specific
      await this.api.put(
        `/municipalities/${municipalityId}/properties/${propertyId}/land-assessment`,
        { assessment: payload },
      );

      this.args.onSave?.();
      this.args.onClose?.();
    } catch (error) {
      console.error('Failed to save land assessment:', error);
      alert('Failed to save land assessment');
    } finally {
      this.isSaving = false;
    }
  }

  @action
  cancelEdit() {
    this.args.onClose?.();
  }

  @action
  stopPropagation(event) {
    event.stopPropagation();
  }
}
