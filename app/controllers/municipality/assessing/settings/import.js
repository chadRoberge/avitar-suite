import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';

export default class ImportController extends Controller {
  @service api;
  @service municipality;
  @service notifications;
  @service loading;
  @service('indexed-db') indexedDb;
  @service('property-selection') propertySelection;
  @service('property-cache') propertyCache;

  // Wizard step tracking
  @tracked currentStep = 1; // 1: Select System, 2: Upload File, 3: Building Codes, 4: Reference Data, 5: Property Data

  // Step 1: CAMA System Selection
  @tracked selectedSystem = null;

  // Step 2: File Upload
  @tracked uploadedFile = null;
  @tracked parsedData = null;
  @tracked isUploading = false;
  @tracked permitHandling = 'remap'; // 'remap' or 'delete'

  // Step 2: Land Codes Import
  @tracked landCodesFile = null;
  @tracked isValidatingLandCodes = false;
  @tracked landCodesValidationResults = null;
  @tracked isExecutingLandCodes = false;
  @tracked landCodesImportResults = null;

  // Step 3: Building Codes Import
  @tracked buildingCodesFile = null;
  @tracked isExecutingBuildingCodes = false;
  @tracked buildingCodesImportResults = null;

  // Step 4: Phase 2 (Reference Data)
  @tracked phase1ValidationResults = null;
  @tracked isValidatingPhase1 = false;
  @tracked isExecutingPhase1 = false;
  @tracked phase1Complete = false;

  // Step 5: Phase 2 (Reference Data)
  @tracked phase2ValidationResults = null;
  @tracked isValidatingPhase2 = false;
  @tracked isExecutingPhase2 = false;
  @tracked phase2Complete = false;

  // Step 6: Phase 3 (Property Data)
  @tracked phase3ValidationResults = null;
  @tracked isValidatingPhase3 = false;
  @tracked isExecutingPhase3 = false;
  @tracked phase3Complete = false;

  // Progress tracking
  @tracked importProgress = null;
  @tracked progressData = null;
  @tracked importId = null;

  // VDF Sketch Import
  @tracked vdfFiles = [];
  @tracked isUploadingVDF = false;
  @tracked vdfImportResults = null;

  // Step 1: System Selection Actions
  @action
  selectSystem(systemValue) {
    this.selectedSystem = systemValue;
  }

  @action
  proceedToUpload() {
    if (!this.selectedSystem) {
      this.notifications.error('Please select a CAMA system');
      return;
    }
    this.currentStep = 2;
  }

  // Permit Handling Action
  @action
  setPermitHandling(value) {
    this.permitHandling = value;
  }

  // Step 2: File Upload Actions
  @action
  async handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file type
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      this.notifications.error('Please select an Excel file (.xlsx or .xls)');
      return;
    }

    this.uploadedFile = file;
  }

  @action
  async uploadAndParse() {
    if (!this.uploadedFile) {
      this.notifications.error('Please select a file');
      return;
    }

    this.isUploading = true;
    try {
      const formData = new FormData();
      formData.append('file', this.uploadedFile);
      formData.append('systemKey', this.selectedSystem);

      const municipalityId = this.municipality.currentMunicipality?.id;

      // Use fetch directly for FormData upload (api service JSON.stringifies everything)
      const token = localStorage.getItem('authToken');
      const response = await fetch(
        `${this.api.baseURL}/municipalities/${municipalityId}/import/parse`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            // Don't set Content-Type - browser sets it with boundary
          },
          body: formData,
        },
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error ||
            `Upload failed: ${response.status} ${response.statusText}`,
        );
      }

      this.parsedData = await response.json();
      this.notifications.success('File parsed successfully');
      this.currentStep = 5; // Proceed to Reference Data Import (Phase 2)
    } catch (error) {
      console.error('Error parsing file:', error);
      this.notifications.error(
        error.message ||
          'Failed to parse Excel file. Please check the file format.',
      );
    } finally {
      this.isUploading = false;
    }
  }

  // Step 2: Land Codes Import Actions
  @action
  async handleLandCodesFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file type
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      this.notifications.error('Please select an Excel file (.xlsx or .xls)');
      return;
    }

    this.landCodesFile = file;
    // Clear validation results when a new file is selected
    this.landCodesValidationResults = null;
  }

  @action
  async validateLandCodes() {
    if (!this.landCodesFile) {
      this.notifications.error('Please select a land codes file');
      return;
    }

    this.isValidatingLandCodes = true;
    try {
      const formData = new FormData();
      formData.append('file', this.landCodesFile);

      const municipalityId = this.municipality.currentMunicipality?.id;
      const token = localStorage.getItem('authToken');

      const response = await fetch(
        `${this.api.baseURL}/municipalities/${municipalityId}/import/land-codes/validate`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        },
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error ||
            `Validation failed: ${response.status} ${response.statusText}`,
        );
      }

      const result = await response.json();
      this.landCodesValidationResults = result;

      this.notifications.success('Land codes file validated successfully');
    } catch (error) {
      console.error('Error validating land codes:', error);
      this.notifications.error(
        error.message || 'Failed to validate land codes file',
      );
    } finally {
      this.isValidatingLandCodes = false;
    }
  }

  @action
  async executeLandCodesImport() {
    if (!this.landCodesFile) {
      this.notifications.error('Please select a land codes file');
      return;
    }

    this.isExecutingLandCodes = true;
    try {
      const formData = new FormData();
      formData.append('file', this.landCodesFile);

      const municipalityId = this.municipality.currentMunicipality?.id;
      const token = localStorage.getItem('authToken');

      const response = await fetch(
        `${this.api.baseURL}/municipalities/${municipalityId}/import/land-codes`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        },
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error ||
            `Upload failed: ${response.status} ${response.statusText}`,
        );
      }

      const result = await response.json();
      this.landCodesImportResults = result.results;

      // Calculate totals for success message
      const totalZones =
        result.results.zones.created + result.results.zones.updated;
      const totalLadders =
        result.results.landLadders.created + result.results.landLadders.updated;
      const totalLandUseCodes =
        result.results.landUseCodes.created +
        result.results.landUseCodes.updated;
      const totalNeighborhoodCodes =
        result.results.neighborhoodCodes.created +
        result.results.neighborhoodCodes.updated;
      const totalSiteConditions =
        result.results.siteAttributes.created +
        result.results.siteAttributes.updated;
      const totalRoadTypes =
        result.results.roadAttributes.created +
        result.results.roadAttributes.updated;
      const totalDrivewayTypes =
        result.results.drivewayAttributes.created +
        result.results.drivewayAttributes.updated;
      const totalCurrentUseCodes =
        result.results.currentUseCodes.created +
        result.results.currentUseCodes.updated;
      const totalViewAttributes =
        result.results.viewAttributes.created +
        result.results.viewAttributes.updated;
      const totalWaterBodies =
        result.results.waterBodies.created + result.results.waterBodies.updated;
      const totalWaterBodyLadders =
        result.results.waterBodyLadders.created +
        result.results.waterBodyLadders.updated;
      const totalWaterfrontAttributes =
        result.results.waterfrontAttributes.created +
        result.results.waterfrontAttributes.updated;

      // Show warnings if any categories had errors
      if (result.warnings && result.warnings.length > 0) {
        result.warnings.forEach((warning) => {
          this.notifications.warning(warning);
        });
      }

      // Show errors if present
      if (result.hasErrors && result.totalErrors > 0) {
        this.notifications.error(
          `Import completed with ${result.totalErrors} errors. Check console for details.`,
        );
        console.error('Land codes import errors:', result.results);
      }

      // Build detailed success message
      const importedItems = [];
      if (totalZones > 0) importedItems.push(`${totalZones} zones`);
      if (totalLadders > 0)
        importedItems.push(`${totalLadders} land ladder tiers`);
      if (totalLandUseCodes > 0)
        importedItems.push(`${totalLandUseCodes} land use codes`);
      if (totalNeighborhoodCodes > 0)
        importedItems.push(`${totalNeighborhoodCodes} neighborhood codes`);
      if (totalSiteConditions > 0)
        importedItems.push(`${totalSiteConditions} site/topography modifiers`);
      if (totalRoadTypes > 0)
        importedItems.push(`${totalRoadTypes} road types`);
      if (totalDrivewayTypes > 0)
        importedItems.push(`${totalDrivewayTypes} driveway types`);
      if (totalCurrentUseCodes > 0)
        importedItems.push(`${totalCurrentUseCodes} current use codes`);
      if (totalViewAttributes > 0)
        importedItems.push(`${totalViewAttributes} view attributes`);
      if (totalWaterBodies > 0)
        importedItems.push(`${totalWaterBodies} water bodies`);
      if (totalWaterBodyLadders > 0)
        importedItems.push(`${totalWaterBodyLadders} water body ladder tiers`);
      if (totalWaterfrontAttributes > 0)
        importedItems.push(
          `${totalWaterfrontAttributes} waterfront attributes`,
        );

      // Show success message
      if (importedItems.length > 0) {
        this.notifications.success(
          `Land codes imported: ${importedItems.join(', ')}`,
        );
      } else {
        this.notifications.warning(
          'No land codes were imported. Check validation results and server logs.',
        );
      }
    } catch (error) {
      console.error('Error importing land codes:', error);
      this.notifications.error(error.message || 'Failed to import land codes');
    } finally {
      this.isExecutingLandCodes = false;
    }
  }

  // Step 3: Building Codes Import Actions
  @tracked isValidatingBuildingCodes = false;
  @tracked buildingCodesValidationResults = null;

  @action
  async handleBuildingCodesFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file type
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      this.notifications.error('Please select an Excel file (.xlsx or .xls)');
      return;
    }

    this.buildingCodesFile = file;
    // Clear validation results when a new file is selected
    this.buildingCodesValidationResults = null;
  }

  @action
  async validateBuildingCodes() {
    if (!this.buildingCodesFile) {
      this.notifications.error('Please select a building codes file');
      return;
    }

    this.isValidatingBuildingCodes = true;
    try {
      const formData = new FormData();
      formData.append('file', this.buildingCodesFile);

      const municipalityId = this.municipality.currentMunicipality?.id;
      const token = localStorage.getItem('authToken');

      const response = await fetch(
        `${this.api.baseURL}/municipalities/${municipalityId}/import/building-codes/validate`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        },
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error ||
            `Validation failed: ${response.status} ${response.statusText}`,
        );
      }

      const result = await response.json();
      this.buildingCodesValidationResults = result;

      this.notifications.success('Building codes file validated successfully');
    } catch (error) {
      console.error('Error validating building codes:', error);
      this.notifications.error(
        error.message || 'Failed to validate building codes file',
      );
    } finally {
      this.isValidatingBuildingCodes = false;
    }
  }

  @action
  async executeBuildingCodesImport() {
    if (!this.buildingCodesFile) {
      this.notifications.error('Please select a building codes file');
      return;
    }

    this.isExecutingBuildingCodes = true;
    try {
      const formData = new FormData();
      formData.append('file', this.buildingCodesFile);

      const municipalityId = this.municipality.currentMunicipality?.id;
      const token = localStorage.getItem('authToken');

      const response = await fetch(
        `${this.api.baseURL}/municipalities/${municipalityId}/import/building-codes`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        },
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error ||
            `Upload failed: ${response.status} ${response.statusText}`,
        );
      }

      const result = await response.json();
      this.buildingCodesImportResults = {
        ...result.results,
        stats: result.stats, // Include the stats for detailed breakdown
      };

      this.notifications.success(
        `Building codes imported: ${result.results.buildingCodesCreated + result.results.buildingCodesUpdated} building codes, ` +
          `${result.results.featureCodesCreated + result.results.featureCodesUpdated} feature codes`,
      );
    } catch (error) {
      console.error('Error importing building codes:', error);
      this.notifications.error(
        error.message || 'Failed to import building codes',
      );
    } finally {
      this.isExecutingBuildingCodes = false;
    }
  }

  // Step 4: Phase 2 (Reference Data) Actions
  @action
  async validatePhase1() {
    this.isValidatingPhase1 = true;
    try {
      const municipalityId = this.municipality.currentMunicipality?.id;
      const response = await this.api.post(
        `/municipalities/${municipalityId}/import/validate-reference`,
        {
          systemKey: this.selectedSystem,
          parsedData: this.parsedData,
        },
      );

      this.phase1ValidationResults = response;
      this.notifications.success('Phase 1 validation complete');
    } catch (error) {
      console.error('Error validating Phase 1:', error);
      this.notifications.error(error.message || 'Phase 1 validation failed');
    } finally {
      this.isValidatingPhase1 = false;
    }
  }

  @action
  async executePhase1() {
    if (!this.phase1ValidationResults?.isValid) {
      this.notifications.error(
        'Please fix validation errors before proceeding',
      );
      return;
    }

    this.isExecutingPhase1 = true;
    try {
      const municipalityId = this.municipality.currentMunicipality?.id;

      // Clear local storage before import
      console.log('Clearing local storage for municipality...');
      this.clearMunicipalityCache(municipalityId);

      const response = await this.api.post(
        `/municipalities/${municipalityId}/import/execute-reference`,
        {
          systemKey: this.selectedSystem,
          parsedData: this.parsedData,
        },
      );

      this.phase1Complete = true;
      this.notifications.success(
        `Phase 2 complete: ${response.summary.totalCreated} records created`,
      );
      this.currentStep = 5; // Proceed to Phase 3
    } catch (error) {
      console.error('Error executing Phase 1:', error);
      this.notifications.error(error.message || 'Phase 1 import failed');
    } finally {
      this.isExecutingPhase1 = false;
    }
  }

  clearMunicipalityCache(municipalityId) {
    // Clear all localStorage keys related to this municipality
    const keysToRemove = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      // Remove keys that contain the municipality ID or are property/assessment related
      if (
        key &&
        (key.includes(municipalityId) ||
          key.includes('property-') ||
          key.includes('assessment-') ||
          key.includes('building-') ||
          key.includes('land-') ||
          key.includes('parcel-'))
      ) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => {
      console.log(`Removing localStorage key: ${key}`);
      localStorage.removeItem(key);
    });

    console.log(`Cleared ${keysToRemove.length} localStorage keys`);
  }

  async clearLocalCacheForImport(municipalityId) {
    // Clear in-memory property cache first (most important!)
    console.log('🧹 Clearing in-memory property cache...');
    this.propertyCache.clear();

    // Clear IndexedDB data for this municipality
    if (this.indexedDb.db) {
      const tables = this.indexedDb.db.tables;
      let totalRecordsDeleted = 0;

      for (const table of tables) {
        try {
          // Delete all records for this municipality
          const count = await table
            .where('municipalityId')
            .equals(municipalityId)
            .delete();
          totalRecordsDeleted += count;
          if (count > 0) {
            console.log(
              `  ✅ Deleted ${count} records from IndexedDB table: ${table.name}`,
            );
          }
        } catch (error) {
          console.warn(
            `  ⚠️  Could not clear IndexedDB table ${table.name}:`,
            error,
          );
        }
      }

      // Clear sync queue, deltas, conflicts, changeLog (not municipality-specific)
      try {
        await this.indexedDb.db.table('syncQueue').clear();
        await this.indexedDb.db.table('deltas').clear();
        await this.indexedDb.db.table('conflicts').clear();
        await this.indexedDb.db.table('changeLog').clear();
        console.log(
          '  ✅ Cleared sync queue, deltas, conflicts, and changeLog',
        );
      } catch (error) {
        console.warn('  ⚠️  Could not clear sync tables:', error);
      }

      console.log(`🧹 Cleared ${totalRecordsDeleted} records from IndexedDB`);
    }

    // Clear municipality-specific localStorage keys
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (
        key &&
        (key.includes('property-cache') ||
          key.includes('assessment-cache') ||
          key.includes(`municipality-${municipalityId}`) ||
          key.includes('property-') ||
          key.includes('assessment-') ||
          key.includes('building-') ||
          key.includes('land-') ||
          key.includes('parcel-'))
      ) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));
    console.log(`🧹 Cleared ${keysToRemove.length} localStorage keys`);

    // Clear session storage
    const sessionKeysToRemove = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (
        key &&
        (key.includes('currentProperty') ||
          key.includes('propertyView') ||
          key.includes('assessmentView'))
      ) {
        sessionKeysToRemove.push(key);
      }
    }
    sessionKeysToRemove.forEach((key) => sessionStorage.removeItem(key));
    console.log(`🧹 Cleared ${sessionKeysToRemove.length} sessionStorage keys`);
  }

  // Step 4: Phase 2 (Property Data) Actions
  @action
  async validatePhase2() {
    this.isValidatingPhase2 = true;
    try {
      const municipalityId = this.municipality.currentMunicipality?.id;
      const response = await this.api.post(
        `/municipalities/${municipalityId}/import/validate-properties`,
        {
          systemKey: this.selectedSystem,
          parsedData: this.parsedData,
        },
      );

      this.phase2ValidationResults = response;
      this.notifications.success('Phase 2 validation complete');
    } catch (error) {
      console.error('Error validating Phase 2:', error);
      this.notifications.error(error.message || 'Phase 2 validation failed');
    } finally {
      this.isValidatingPhase2 = false;
    }
  }

  @tracked importId = null;
  @tracked progressData = null;
  progressPollInterval = null;

  pollProgress(importId) {
    const municipalityId = this.municipality.currentMunicipality?.id;

    this.progressPollInterval = setInterval(async () => {
      try {
        const progress = await this.api.get(
          `/municipalities/${municipalityId}/import/progress/${importId}`,
        );

        this.progressData = progress;

        // Update the global loading service with progress data
        this.loading.setProgress(progress);
        this.loading.setMessage('Importing Properties');

        // Stop polling if import is complete or failed
        if (progress.status === 'completed' || progress.status === 'failed') {
          clearInterval(this.progressPollInterval);
          this.progressPollInterval = null;
          this.loading.clearProgress();
          this.loading.stopAllLoading();

          if (progress.status === 'completed') {
            this.phase2Complete = true;
            this.importProgress = progress.results;
            this.notifications.success(
              `Import complete: ${progress.results.properties} properties imported`,
            );
          } else {
            this.notifications.error(progress.error || 'Import failed');
          }

          this.isExecutingPhase2 = false;
        }
      } catch (error) {
        console.error('Error polling progress:', error);
      }
    }, 1000); // Poll every second
  }

  @action
  async executePhase2() {
    if (!this.phase2ValidationResults?.isValid) {
      this.notifications.error(
        'Please fix validation errors before proceeding',
      );
      return;
    }

    this.isExecutingPhase2 = true;
    this.progressData = null;

    // Start the loading overlay
    this.loading.startLoading('Importing Properties...');

    try {
      const municipalityId = this.municipality.currentMunicipality?.id;

      // Start the import (returns immediately with importId)
      const response = await this.api.post(
        `/municipalities/${municipalityId}/import/execute-properties`,
        {
          systemKey: this.selectedSystem,
          parsedData: this.parsedData,
        },
      );

      // Store the importId and start polling for progress
      this.importId = response.importId;

      if (response.importId) {
        this.pollProgress(response.importId);
      } else {
        // Import completed immediately (fallback for old behavior)
        this.phase2Complete = true;
        this.importProgress = response.results;
        this.notifications.success(
          `Import complete: ${response.results.properties} properties imported`,
        );
        this.isExecutingPhase2 = false;
        this.loading.stopAllLoading();
      }
    } catch (error) {
      console.error('Error executing Phase 2:', error);
      this.notifications.error(error.message || 'Phase 2 import failed');
      this.isExecutingPhase2 = false;
      this.loading.stopAllLoading();
    }
  }

  // Step 6: Phase 3 (Property Data) Actions
  @action
  async validatePhase3() {
    this.isValidatingPhase3 = true;
    try {
      const municipalityId = this.municipality.currentMunicipality?.id;
      const response = await this.api.post(
        `/municipalities/${municipalityId}/import/validate-properties`,
        {
          systemKey: this.selectedSystem,
          parsedData: this.parsedData,
        },
      );

      this.phase3ValidationResults = response;

      if (response.isValid) {
        this.notifications.success('Phase 3 validation successful!');
      } else {
        this.notifications.warning(
          `Phase 3 validation found ${response.errors?.length || 0} errors`,
        );
      }
    } catch (error) {
      console.error('Error validating Phase 3:', error);
      this.notifications.error(error.message || 'Phase 3 validation failed');
      this.phase3ValidationResults = {
        isValid: false,
        errors: [{ message: error.message }],
      };
    } finally {
      this.isValidatingPhase3 = false;
    }
  }

  @action
  async executePhase3() {
    // Use phase3 state variables but same backend endpoints
    if (!this.phase3ValidationResults?.isValid) {
      this.notifications.error(
        'Please fix validation errors before proceeding',
      );
      return;
    }

    this.isExecutingPhase3 = true;
    this.progressData = null;

    // Start the loading overlay
    this.loading.startLoading('Clearing local cache...');

    try {
      const municipalityId = this.municipality.currentMunicipality?.id;

      // ===== Clear local cache before import =====
      console.log('🧹 Clearing local cache before property import...');
      await this.clearLocalCacheForImport(municipalityId);

      // Update loading message
      this.loading.setMessage('Importing Property Data...');

      // Start the import (returns immediately with importId)
      const response = await this.api.post(
        `/municipalities/${municipalityId}/import/execute-properties`,
        {
          systemKey: this.selectedSystem,
          parsedData: this.parsedData,
          permitHandling: this.permitHandling, // 'remap' or 'delete'
        },
      );

      // Store the importId and start polling for progress
      this.importId = response.importId;

      if (response.importId) {
        this.pollProgressPhase3(response.importId);
      } else {
        // Import completed immediately (fallback for old behavior)
        this.phase3Complete = true;
        this.importProgress = response.results;
        this.notifications.success(
          `Import complete: ${response.results.properties} properties imported`,
        );
        this.isExecutingPhase3 = false;
        this.loading.stopAllLoading();
      }
    } catch (error) {
      console.error('Error executing Phase 3:', error);
      this.notifications.error(error.message || 'Phase 3 import failed');
      this.isExecutingPhase3 = false;
      this.loading.stopAllLoading();
    }
  }

  pollProgressPhase3(importId) {
    const municipalityId = this.municipality.currentMunicipality?.id;

    this.progressPollInterval = setInterval(async () => {
      try {
        const progress = await this.api.get(
          `/municipalities/${municipalityId}/import/progress/${importId}`,
        );

        this.progressData = progress;

        // Update the global loading service with progress data
        this.loading.setProgress(progress);

        // Update the global loading message with progress
        if (progress.percentage !== undefined) {
          this.loading.setMessage(
            `Importing properties: ${progress.processedItems}/${progress.totalItems} (${progress.percentage}%)`,
          );
        }

        // Stop polling if import is complete or failed
        if (progress.status === 'completed' || progress.status === 'failed') {
          clearInterval(this.progressPollInterval);
          this.progressPollInterval = null;
          this.loading.clearProgress();
          this.loading.stopAllLoading();

          if (progress.status === 'completed') {
            this.phase3Complete = true;
            this.importProgress = progress.results;

            // Clear property selection to avoid stale references
            this.propertySelection.clearSelectedProperty();

            this.notifications.success(
              `Import complete: ${progress.results.properties} properties imported. Clearing cache and logging out...`,
            );

            // Clear ALL cache (including auth) after import completes
            // This ensures no stale PropertyTreeNode references remain
            setTimeout(() => {
              console.log('🧹 Clearing ALL cache after import completion...');

              // Clear IndexedDB
              if (this.indexedDb.db) {
                this.indexedDb.db.tables.forEach((table) => {
                  table
                    .clear()
                    .catch((err) =>
                      console.warn(`Could not clear ${table.name}:`, err),
                    );
                });
              }

              // Clear ALL localStorage (including auth - will log user out)
              localStorage.clear();

              // Clear ALL sessionStorage
              sessionStorage.clear();

              console.log('✅ Cache cleared. Reloading application...');

              // Reload the page
              window.location.reload();
            }, 2000);
          } else {
            this.notifications.error(progress.error || 'Import failed');
          }

          this.isExecutingPhase3 = false;
        }
      } catch (error) {
        console.error('Error polling progress:', error);
      }
    }, 1000); // Poll every second
  }

  willDestroy() {
    super.willDestroy();
    if (this.progressPollInterval) {
      clearInterval(this.progressPollInterval);
    }
  }

  // Navigation Actions
  @action
  goToStep(step) {
    // Prevent skipping steps
    if (step > this.currentStep + 1) {
      this.notifications.error('Please complete the current step first');
      return;
    }
    this.currentStep = step;
  }

  @action
  resetWizard() {
    this.currentStep = 1;
    this.selectedSystem = null;
    this.uploadedFile = null;
    this.parsedData = null;
    this.buildingCodesFile = null;
    this.buildingCodesImportResults = null;
    this.phase1ValidationResults = null;
    this.phase1Complete = false;
    this.phase2ValidationResults = null;
    this.phase2Complete = false;
    this.importProgress = null;
  }

  // VDF Sketch Import Actions
  @action
  async handleVDFFileSelect(event) {
    const files = Array.from(event.target.files || []);

    // Filter for .vdf files only
    const vdfFiles = files.filter((file) =>
      file.name.toLowerCase().endsWith('.vdf'),
    );

    if (vdfFiles.length === 0) {
      this.notifications.error('Please select VDF files (.vdf extension)');
      return;
    }

    if (vdfFiles.length !== files.length) {
      this.notifications.warning(
        `${files.length - vdfFiles.length} non-VDF files were ignored`,
      );
    }

    this.vdfFiles = vdfFiles;
    this.notifications.success(`${vdfFiles.length} VDF file(s) selected`);
  }

  @action
  async uploadVDFFiles() {
    if (this.vdfFiles.length === 0) {
      this.notifications.error('Please select VDF files to import');
      return;
    }

    this.isUploadingVDF = true;
    this.vdfImportResults = null;

    try {
      const formData = new FormData();

      // Add all VDF files
      this.vdfFiles.forEach((file) => {
        formData.append('files', file);
      });

      // Add assessment year (default to current year)
      const currentYear = new Date().getFullYear();
      formData.append('assessmentYear', currentYear);

      const municipalityId = this.municipality.currentMunicipality?.id;
      const token = localStorage.getItem('authToken');

      const response = await fetch(
        `${this.api.baseURL}/municipalities/${municipalityId}/import/sketches`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        },
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error ||
            `Upload failed: ${response.status} ${response.statusText}`,
        );
      }

      const result = await response.json();
      this.vdfImportResults = result.results;

      // Show success message
      const successCount = result.results.success.length;
      const errorCount = result.results.errors.length;
      const skippedCount = result.results.skipped.length;

      if (successCount > 0) {
        this.notifications.success(
          `Successfully imported ${successCount} sketch(es)` +
            (errorCount > 0 ? ` (${errorCount} errors)` : '') +
            (skippedCount > 0 ? ` (${skippedCount} skipped)` : ''),
        );
      } else if (errorCount > 0 || skippedCount > 0) {
        this.notifications.warning('No sketches were imported');
      }

      // Show info about newly created description codes
      if (result.results.newDescriptionCodes?.length > 0) {
        this.notifications.info(
          `Created ${result.results.newDescriptionCodes.length} new description code(s): ${result.results.newDescriptionCodes.join(', ')}`,
        );
      }

      // Clear the file input
      this.vdfFiles = [];
      const fileInput = document.querySelector(
        'input[type="file"][accept=".vdf"]',
      );
      if (fileInput) {
        fileInput.value = '';
      }
    } catch (error) {
      console.error('Error uploading VDF files:', error);
      this.notifications.error(error.message || 'Failed to import VDF files');
    } finally {
      this.isUploadingVDF = false;
    }
  }

  @action
  clearVDFResults() {
    this.vdfImportResults = null;
  }
}
