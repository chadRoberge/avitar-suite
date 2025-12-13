import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class MunicipalityAssessingRevaluationIndexController extends Controller {
  @service api;
  @service municipality;
  @service notifications;
  @service router;
  @service('property-selection') propertySelection;
  @service assessing;

  // View state
  @tracked currentSheetId = null;
  @tracked selectedSales = [];

  // Modals
  @tracked showCreateSheetModal = false;
  @tracked showGlobalSettingsModal = false;
  @tracked showAnalysisModal = false;
  @tracked showPropertyCardModal = false;

  // Create sheet form
  @tracked newSheetName = '';
  @tracked newSheetType = 'excess_acreage';
  @tracked newSheetDepreciationRate = '';
  @tracked newSheetMinAcreage = '';
  @tracked newSheetBuildingCodeId = null;
  @tracked newSheetLandUseCode = null;

  // Global settings form
  @tracked baseYear = null;
  @tracked timeTrendEntries = [];
  @tracked currentUseMaxAcreage = null;

  // Loading states
  @tracked isCreatingSheet = false;
  @tracked isSavingSettings = false;
  @tracked isRecalculating = false;

  // Print state
  @tracked showPrintAll = false;

  // Filter state (for sales table)
  @tracked salesFilter = 'all'; // all, valid, excluded
  @tracked dateFrom = this.getDefaultFromDate();
  @tracked dateTo = this.getDefaultToDate();
  @tracked propertyTypeFilter = 'all'; // all, improved, vacant
  @tracked minAcreage = '';
  @tracked maxAcreage = '';
  @tracked landUseCategoryFilter = 'all'; // RES, COM, IND, etc.
  @tracked landUseCodeFilter = 'all'; // R1, R1A, R2, CI, etc.
  @tracked buildingRateFilter = 'all';

  getDefaultFromDate() {
    // Default to April 1st, 2 years prior to current date
    const today = new Date();
    const twoYearsAgo = new Date(today.getFullYear() - 2, 3, 1); // Month is 0-indexed, so 3 = April
    return twoYearsAgo.toISOString().split('T')[0];
  }

  getDefaultToDate() {
    // Default to current date
    const today = new Date();
    return today.toISOString().split('T')[0];
  }

  // Land rate development
  @tracked selectedLandCode = null;
  @tracked newLandBaseRate = '';

  // Building rate development
  @tracked selectedBuildingCode = null;
  @tracked newBuildingBaseRate = '';

  get filteredSales() {
    let sales = this.model.sales || [];

    // Filter based on the selected tab
    if (this.selectedTab === 'excess-land') {
      // For excess acreage/land rate analysis, only include vacant land sales
      sales = sales.filter((s) => s.is_vacant);
    } else if (this.selectedTab === 'building-rates') {
      // For building rate analysis, only include improved property sales
      sales = sales.filter((s) => !s.is_vacant);
    }
    // For 'sales' tab, show all sales (no vacant/improved filter)

    // Filter by property type (improved/vacant)
    if (this.propertyTypeFilter === 'improved') {
      sales = sales.filter((s) => !s.is_vacant);
    } else if (this.propertyTypeFilter === 'vacant') {
      sales = sales.filter((s) => s.is_vacant);
    }

    // Filter by validity
    if (this.salesFilter === 'valid') {
      sales = sales.filter((s) => s.is_valid_sale);
    } else if (this.salesFilter === 'excluded') {
      sales = sales.filter((s) => !s.is_valid_sale);
    }

    // Filter by date range
    if (this.dateFrom) {
      sales = sales.filter(
        (s) => new Date(s.sale_date) >= new Date(this.dateFrom),
      );
    }
    if (this.dateTo) {
      sales = sales.filter(
        (s) => new Date(s.sale_date) <= new Date(this.dateTo),
      );
    }

    // Filter by acreage range
    if (this.minAcreage) {
      sales = sales.filter((s) => s.acreage >= parseFloat(this.minAcreage));
    }
    if (this.maxAcreage) {
      sales = sales.filter((s) => s.acreage <= parseFloat(this.maxAcreage));
    }

    // Filter by property use category (RES, COM, IND, etc.)
    if (this.landUseCategoryFilter !== 'all') {
      sales = sales.filter(
        (s) => s.property_use_category === this.landUseCategoryFilter,
      );
    }

    // Filter by specific land use code (R1, R1A, R2, CI, etc.)
    if (this.landUseCodeFilter !== 'all') {
      sales = sales.filter(
        (s) => s.property_use_code === this.landUseCodeFilter,
      );
    }

    // Filter by building rate (base type code)
    if (this.buildingRateFilter !== 'all') {
      sales = sales.filter(
        (s) => s.base_type?.code === this.buildingRateFilter,
      );
    }

    return sales;
  }

  get vacantLandSales() {
    let sales = this.model.sales || [];

    // Only include vacant land sales (all sales are already qualified from the API)
    sales = sales.filter((s) => s.is_vacant);

    // Filter by date range
    if (this.dateFrom) {
      sales = sales.filter(
        (s) => new Date(s.sale_date) >= new Date(this.dateFrom),
      );
    }
    if (this.dateTo) {
      sales = sales.filter(
        (s) => new Date(s.sale_date) <= new Date(this.dateTo),
      );
    }

    return sales;
  }

  get improvedPropertySales() {
    let sales = this.model.sales || [];

    // Only include improved property sales (all sales are already qualified from the API)
    sales = sales.filter((s) => !s.is_vacant);

    // Filter by date range
    if (this.dateFrom) {
      sales = sales.filter(
        (s) => new Date(s.sale_date) >= new Date(this.dateFrom),
      );
    }
    if (this.dateTo) {
      sales = sales.filter(
        (s) => new Date(s.sale_date) <= new Date(this.dateTo),
      );
    }

    return sales;
  }

  get salesStatistics() {
    const sales = this.filteredSales;
    if (!sales.length) {
      return {
        count: 0,
        totalValue: 0,
        averagePrice: 0,
        medianPrice: 0,
        minPrice: 0,
        maxPrice: 0,
      };
    }

    const prices = sales.map((s) => s.sale_price).sort((a, b) => a - b);
    const totalValue = prices.reduce((sum, price) => sum + price, 0);

    return {
      count: sales.length,
      totalValue,
      averagePrice: totalValue / sales.length,
      medianPrice: prices[Math.floor(prices.length / 2)],
      minPrice: prices[0],
      maxPrice: prices[prices.length - 1],
    };
  }

  get selectedSalesCount() {
    return this.selectedSales.length;
  }

  get landUseCategoryOptions() {
    return [
      { value: 'all', label: 'All Categories' },
      { value: 'RES', label: 'Residential' },
      { value: 'COM', label: 'Commercial' },
      { value: 'IND', label: 'Industrial' },
      { value: 'MXU', label: 'Mixed Use' },
      { value: 'AG', label: 'Agricultural' },
      { value: 'EX', label: 'Exempt' },
      { value: 'UTL', label: 'Utility' },
    ];
  }

  get landUseCodeOptions() {
    if (!this.model || !Array.isArray(this.model.landCodes)) {
      return [{ value: 'all', label: 'All Land Use Codes' }];
    }
    const landCodes = this.model.landCodes;
    return [
      { value: 'all', label: 'All Land Use Codes' },
      ...landCodes.map((land) => ({
        value: land.code,
        label: `${land.code} - ${land.displayText || land.landUseType || ''}`,
      })),
    ];
  }

  get buildingRateOptions() {
    if (!this.model || !Array.isArray(this.model.buildingCodes)) {
      return [{ value: 'all', label: 'All Building Codes' }];
    }
    const buildingCodes = this.model.buildingCodes;
    return [
      { value: 'all', label: 'All Building Codes' },
      ...buildingCodes.map((building) => ({
        value: building.code,
        label: `${building.code} - ${building.description || ''}`,
      })),
    ];
  }

  @action
  selectTab(tab) {
    this.selectedTab = tab;
  }

  @action
  setSalesFilter(event) {
    this.salesFilter = event.target.value;
  }

  @action
  updateDateFrom(event) {
    this.dateFrom = event.target.value;
  }

  @action
  updateDateTo(event) {
    this.dateTo = event.target.value;
  }

  @action
  setPropertyTypeFilter(event) {
    this.propertyTypeFilter = event.target.value;
  }

  @action
  updateMinAcreage(event) {
    this.minAcreage = event.target.value;
  }

  @action
  updateMaxAcreage(event) {
    this.maxAcreage = event.target.value;
  }

  @action
  setLandUseCategoryFilter(event) {
    this.landUseCategoryFilter = event.target.value;
  }

  @action
  setLandUseCodeFilter(event) {
    this.landUseCodeFilter = event.target.value;
  }

  @action
  setBuildingRateFilter(event) {
    this.buildingRateFilter = event.target.value;
  }

  @action
  async viewProperty(sale) {
    if (sale.property_id) {
      try {
        // Fetch the property from the assessing service
        const propertyData = await this.assessing.getProperty(sale.property_id);
        const property = propertyData.property || propertyData;

        // Set the property in the property-selection service
        // The PropertyRecordCardModal component uses this service to get the property
        this.propertySelection.setSelectedProperty(property);
        this.showPropertyCardModal = true;
      } catch (error) {
        console.error('Error loading property:', error);
        this.notifications.error('Failed to load property details');
      }
    }
  }

  @action
  async editProperty(sale) {
    if (sale.property_id) {
      try {
        // Fetch the property from the assessing service
        const propertyData = await this.assessing.getProperty(sale.property_id);
        const property = propertyData.property || propertyData;

        // Set the property in the property-selection service
        this.propertySelection.setSelectedProperty(property);

        // Navigate to the general tab for this property
        this.router.transitionTo(
          'municipality.assessing.general.property',
          sale.property_id,
        );
      } catch (error) {
        console.error('Error loading property:', error);
        this.notifications.error('Failed to load property details');
      }
    }
  }

  @action
  closePropertyCardModal() {
    this.showPropertyCardModal = false;
  }

  @action
  stopPropagation(event) {
    event.stopPropagation();
  }

  @action
  toggleSaleSelection(sale) {
    const index = this.selectedSales.findIndex((s) => s._id === sale._id);
    if (index > -1) {
      this.selectedSales = this.selectedSales.filter((s) => s._id !== sale._id);
    } else {
      this.selectedSales = [...this.selectedSales, sale];
    }
  }

  @action
  selectAllSales() {
    this.selectedSales = [...this.filteredSales];
  }

  @action
  clearSelection() {
    this.selectedSales = [];
  }

  @action
  openAnalysisModal() {
    if (this.selectedSales.length === 0) {
      this.notifications.warning('Please select at least one sale to analyze');
      return;
    }
    this.showAnalysisModal = true;
  }

  @action
  closeAnalysisModal() {
    this.showAnalysisModal = false;
  }

  @action
  exportToSpreadsheet() {
    this.notifications.info('Spreadsheet export functionality coming soon');
  }

  @action
  viewSaleDetail(sale) {
    // Navigate to property to view sale details
    this.notifications.info(
      `Viewing sale for ${sale.property_address} (Detail view coming soon)`,
    );
  }

  @action
  toggleSaleValidity(sale) {
    // Toggle whether sale is considered valid for analysis
    this.notifications.info(
      `Sale validity toggle coming soon for ${sale.property_address}`,
    );
  }

  // Land rate actions
  @action
  selectLandCode(landCode) {
    this.selectedLandCode = landCode;
    this.newLandBaseRate = landCode.base_rate || '';
  }

  @action
  updateLandBaseRate(event) {
    this.newLandBaseRate = event.target.value;
  }

  @action
  async saveLandRate() {
    if (!this.selectedLandCode || !this.newLandBaseRate) {
      this.notifications.error('Please select a land code and enter a rate');
      return;
    }

    // TODO: Land rates are more complex in this system and depend on
    // neighborhood codes, land use types, and various factors.
    // For now, this functionality is disabled until a proper land rate
    // update mechanism is implemented.
    this.notifications.info(
      'Land rate updates through revaluation analysis coming soon',
    );

    /* try {
      const municipalityId = this.municipality.currentMunicipality?.id;
      await this.api.put(
        `/municipalities/${municipalityId}/land-use-details/${this.selectedLandCode._id}`,
        {
          // Land rates need to be updated through neighborhood codes and land use types
        },
      );

      this.notifications.success('Land base rate updated successfully');
      this.router.refresh();
    } catch (error) {
      console.error('Error updating land rate:', error);
      this.notifications.error('Failed to update land rate');
    } */
  }

  // Building rate actions
  @action
  selectBuildingCode(buildingCode) {
    this.selectedBuildingCode = buildingCode;
    this.newBuildingBaseRate = buildingCode.base_rate || '';
  }

  @action
  updateBuildingBaseRate(event) {
    this.newBuildingBaseRate = event.target.value;
  }

  @action
  async saveBuildingRate() {
    if (!this.selectedBuildingCode || !this.newBuildingBaseRate) {
      this.notifications.error(
        'Please select a building code and enter a rate',
      );
      return;
    }

    try {
      const municipalityId = this.municipality.currentMunicipality?.id;
      await this.api.put(
        `/municipalities/${municipalityId}/building-codes/${this.selectedBuildingCode._id}`,
        {
          rate: parseFloat(this.newBuildingBaseRate),
        },
      );

      this.notifications.success('Building base rate updated successfully');
      this.router.refresh();
    } catch (error) {
      console.error('Error updating building rate:', error);
      this.notifications.error('Failed to update building rate');
    }
  }

  // Sheet management computed properties
  get currentSheet() {
    if (!this.currentSheetId) return null;
    return this.model.sheets?.find((s) => s._id === this.currentSheetId);
  }

  get sheetOptions() {
    return (this.model.sheets || []).map((sheet) => ({
      value: sheet._id,
      label: sheet.sheet_name,
    }));
  }

  get sheetTypeOptions() {
    return [
      { value: 'excess_acreage', label: 'Excess Acreage' },
      { value: 'vacant_land', label: 'Vacant Land' },
      { value: 'developed_land', label: 'Developed Land' },
      { value: 'building_rate', label: 'Building Rate' },
      { value: 'view_base_rate', label: 'View Base Rate' },
      { value: 'waterfront_base_rate', label: 'Waterfront Base Rate' },
      { value: 'amenity_rate', label: 'Amenity Rate' },
    ];
  }

  get hasSheets() {
    return this.model.sheets?.length > 0;
  }

  get currentSheetSales() {
    if (!this.currentSheetId) return [];

    // Filter sales that belong to the current sheet
    // This would need to be populated from the API with sheet_ids
    // For now, return all sales as placeholder
    return this.model.sales || [];
  }

  // Sheet management actions
  @action
  openCreateSheetModal() {
    if (this.selectedSales.length === 0) {
      this.notifications.warning(
        'Please select at least one sale to create a sheet',
      );
      return;
    }
    this.showCreateSheetModal = true;
  }

  @action
  closeCreateSheetModal() {
    this.showCreateSheetModal = false;
    this.newSheetName = '';
    this.newSheetType = 'excess_acreage';
    this.newSheetDepreciationRate = '';
    this.newSheetMinAcreage = '';
    this.newSheetBuildingCodeId = null;
    this.newSheetLandUseCode = null;
  }

  @action
  updateNewSheetName(event) {
    this.newSheetName = event.target.value;
  }

  @action
  updateNewSheetType(event) {
    this.newSheetType = event.target.value;
  }

  @action
  updateNewSheetDepreciationRate(event) {
    this.newSheetDepreciationRate = event.target.value;
  }

  @action
  updateNewSheetMinAcreage(event) {
    this.newSheetMinAcreage = event.target.value;
  }

  @action
  updateNewSheetBuildingCodeId(event) {
    this.newSheetBuildingCodeId = event.target.value;
  }

  @action
  updateNewSheetLandUseCode(event) {
    this.newSheetLandUseCode = event.target.value;
  }

  @action
  async createSheet() {
    if (!this.newSheetName || !this.newSheetType) {
      this.notifications.error('Please provide a sheet name and type');
      return;
    }

    this.isCreatingSheet = true;

    try {
      const revaluationId = this.model.revaluation._id;
      const saleIds = this.selectedSales.map((s) => s._id);

      const sheetData = {
        sheet_name: this.newSheetName,
        sheet_type: this.newSheetType,
        sales: saleIds,
        sheet_settings: {},
      };

      // Add sheet-specific settings based on type
      if (this.newSheetDepreciationRate) {
        sheetData.sheet_settings.depreciation_rate = parseFloat(
          this.newSheetDepreciationRate,
        );
      }
      if (this.newSheetMinAcreage) {
        sheetData.sheet_settings.min_acreage = parseFloat(
          this.newSheetMinAcreage,
        );
      }
      if (this.newSheetBuildingCodeId) {
        sheetData.sheet_settings.building_code_id = this.newSheetBuildingCodeId;
      }
      if (this.newSheetLandUseCode) {
        sheetData.sheet_settings.land_use_code = this.newSheetLandUseCode;
      }

      const response = await this.api.post(
        `/revaluations/${revaluationId}/sheets`,
        sheetData,
      );

      this.notifications.success(
        `Sheet "${this.newSheetName}" created successfully with ${saleIds.length} sales`,
      );

      // Refresh the current route to get updated sheets list
      this.router.refresh();

      // Select the newly created sheet
      this.currentSheetId = response.sheet._id;

      // Close modal and clear form
      this.closeCreateSheetModal();
      this.selectedSales = [];
    } catch (error) {
      console.error('Error creating sheet:', error);
      this.notifications.error(
        error.message || 'Failed to create analysis sheet',
      );
    } finally {
      this.isCreatingSheet = false;
    }
  }

  // Global settings management
  @action
  openGlobalSettingsModal() {
    // Pre-populate form with current global settings
    const settings = this.model.revaluation?.global_settings;
    if (settings) {
      this.baseYear = settings.base_year;
      this.timeTrendEntries = settings.time_trend || [];
      this.currentUseMaxAcreage =
        settings.current_use?.max_current_use_acreage || 2.0;
    }
    this.showGlobalSettingsModal = true;
  }

  @action
  closeGlobalSettingsModal() {
    this.showGlobalSettingsModal = false;
  }

  @action
  updateBaseYear(event) {
    this.baseYear = parseInt(event.target.value);
  }

  @action
  updateCurrentUseMaxAcreage(event) {
    this.currentUseMaxAcreage = parseFloat(event.target.value);
  }

  @action
  addTimeTrendEntry() {
    this.timeTrendEntries = [
      ...this.timeTrendEntries,
      {
        from_date: '',
        to_date: '',
        adjustment_factor: 1.0,
      },
    ];
  }

  @action
  removeTimeTrendEntry(index) {
    this.timeTrendEntries = this.timeTrendEntries.filter((_, i) => i !== index);
  }

  @action
  updateTimeTrendEntry(index, field, event) {
    const updatedEntries = [...this.timeTrendEntries];
    updatedEntries[index] = {
      ...updatedEntries[index],
      [field]:
        field === 'adjustment_factor'
          ? parseFloat(event.target.value)
          : event.target.value,
    };
    this.timeTrendEntries = updatedEntries;
  }

  @action
  async saveGlobalSettings() {
    if (!this.baseYear) {
      this.notifications.error('Base year is required');
      return;
    }

    this.isSavingSettings = true;

    try {
      const revaluationId = this.model.revaluation._id;
      const municipalityId = this.municipality.currentMunicipality?.id;

      await this.api.put(
        `/municipalities/${municipalityId}/revaluations/${revaluationId}/settings`,
        {
          global_settings: {
            base_year: this.baseYear,
            time_trend: this.timeTrendEntries,
            current_use: {
              max_current_use_acreage: this.currentUseMaxAcreage,
              current_use_rate_multiplier: 1.0,
            },
          },
        },
      );

      this.notifications.success('Global settings updated successfully');

      // Trigger recalculation of all sheets
      await this.recalculateAllSheets();

      this.closeGlobalSettingsModal();
      this.router.refresh();
    } catch (error) {
      console.error('Error updating global settings:', error);
      this.notifications.error('Failed to update global settings');
    } finally {
      this.isSavingSettings = false;
    }
  }

  @action
  async recalculateAllSheets() {
    this.isRecalculating = true;

    try {
      const revaluationId = this.model.revaluation._id;
      await this.api.post(`/revaluations/${revaluationId}/recalculate-all`);

      this.notifications.success(
        'All analysis sheets recalculated successfully',
      );
    } catch (error) {
      console.error('Error recalculating sheets:', error);
      this.notifications.error('Failed to recalculate sheets');
    } finally {
      this.isRecalculating = false;
    }
  }

  @action
  async deleteSheet(sheet) {
    if (
      !confirm(
        `Are you sure you want to delete "${sheet.sheet_name}"? This cannot be undone.`,
      )
    ) {
      return;
    }

    try {
      const revaluationId = this.model.revaluation._id;
      await this.api.delete(
        `/revaluations/${revaluationId}/sheets/${sheet._id}`,
      );

      this.notifications.success(`Sheet "${sheet.sheet_name}" deleted`);

      // Clear current sheet if it was deleted
      if (this.currentSheetId === sheet._id) {
        this.currentSheetId = null;
      }

      this.router.refresh();
    } catch (error) {
      console.error('Error deleting sheet:', error);
      this.notifications.error('Failed to delete sheet');
    }
  }

  @action
  printAll() {
    // Open print all view in new window
    this.showPrintAll = true;

    // Wait for component to render, then trigger print
    setTimeout(() => {
      window.print();
      this.showPrintAll = false;
    }, 500);
  }

  @action
  selectSheet(event) {
    this.currentSheetId = event.target.value;
  }
}
