import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';

export default class LandDetailsController extends Controller {
  @service api;
  @service assessing;
  @service loading;

  @tracked isZoneModalOpen = false;
  @tracked editingZone = null;
  @tracked isLadderModalOpen = false;
  @tracked editingLadder = null;
  @tracked editingLadderZone = null;
  @tracked isTierModalOpen = false;
  @tracked editingTier = null;
  @tracked editingTierZone = null;
  @tracked tierUpdateCounter = 0; // Simple counter to force reactivity
  @tracked zoneUpdateCounter = 0; // Simple counter to force zone reactivity

  // Computed property to ensure zone data is reactive
  get reactiveZones() {
    // Include the counter to force recalculation when zones change
    this.zoneUpdateCounter;
    return this.model?.zones || [];
  }

  // Computed property to ensure ladder data is reactive
  get laddersByZone() {
    // Include the counter to force recalculation when tiers change
    this.tierUpdateCounter;

    const ladders = {};
    if (this.model?.landLadders) {
      this.model.landLadders.forEach((ladder) => {
        ladders[ladder.zoneId] = ladder;
      });
    }
    return ladders;
  }

  @action
  openNewZoneModal() {
    this.editingZone = null;
    this.isZoneModalOpen = true;
  }

  @action
  openEditZoneModal(zone) {
    this.editingZone = zone;
    this.isZoneModalOpen = true;
  }

  @action
  closeZoneModal() {
    this.isZoneModalOpen = false;
    this.editingZone = null;
  }

  @action
  async saveZone(zoneData) {
    try {
      const municipalityId = this.model.municipality.id;

      if (zoneData.id) {
        // Edit existing zone
        const response = await this.api.put(
          `/municipalities/${municipalityId}/zones/${zoneData.id}`,
          zoneData,
        );
        const updatedZone = response.zone;

        const zoneIndex = this.model.zones.findIndex(
          (z) => z.id === zoneData.id,
        );
        if (zoneIndex !== -1) {
          this.model.zones[zoneIndex] = updatedZone;
          // Force reactivity update
          this.model.zones = [...this.model.zones];
          this.model = { ...this.model };
        }
      } else {
        // Create new zone
        const response = await this.api.post(
          `/municipalities/${municipalityId}/zones`,
          zoneData,
        );
        const newZone = response.zone;
        console.log('Created new zone:', newZone);

        this.model.zones.push(newZone);
        // Force reactivity update
        this.model.zones = [...this.model.zones];
        this.model = { ...this.model };
        console.log('Updated model.zones:', this.model.zones);
      }

      // Increment counter to force UI reactivity
      this.zoneUpdateCounter++;
      console.log('Incremented zone counter to:', this.zoneUpdateCounter);

      this.closeZoneModal();
    } catch (error) {
      console.error('Error saving zone:', error);
      // TODO: Show error message to user
    }
  }

  @action
  async deleteZone(zoneId) {
    if (
      confirm(
        'Are you sure you want to delete this zone? This action cannot be undone.',
      )
    ) {
      try {
        const municipalityId = this.model.municipality.id;
        await this.api.delete(
          `/municipalities/${municipalityId}/zones/${zoneId}`,
        );

        // Remove from local model
        const zoneIndex = this.model.zones.findIndex((z) => z.id === zoneId);
        if (zoneIndex !== -1) {
          this.model.zones.splice(zoneIndex, 1);
        }
        // Also remove associated land ladder
        const ladderIndex = this.model.landLadders.findIndex(
          (l) => l.zoneId === zoneId,
        );
        if (ladderIndex !== -1) {
          this.model.landLadders.splice(ladderIndex, 1);
        }
        // Force reactivity update
        this.model = { ...this.model };
      } catch (error) {
        console.error('Error deleting zone:', error);
        // TODO: Show error message to user
      }
    }
  }

  @action
  openLadderModal(zone) {
    this.editingLadderZone = zone;
    // Find existing ladder for this zone
    this.editingLadder = this.model.landLadders.find(
      (ladder) => ladder.zoneId === zone.id,
    );
    this.isLadderModalOpen = true;
  }

  @action
  closeLadderModal() {
    this.isLadderModalOpen = false;
    this.editingLadder = null;
    this.editingLadderZone = null;
  }

  @action
  async saveLadder(ladderData) {
    try {
      const municipalityId = this.model.municipality.id;
      const { zoneId, tiers } = ladderData;

      const existingLadder = this.model.landLadders.find(
        (ladder) => ladder.zoneId === zoneId,
      );
      const existingTiers = existingLadder?.tiers || [];

      // Track which tiers to keep, update, or create
      const tiersToDelete = [...existingTiers];
      const savedTiers = [];

      // Process each tier from the form
      for (const formTier of tiers) {
        if (formTier.id) {
          // Existing tier - update it
          try {
            const response = await this.api.put(
              `/municipalities/${municipalityId}/zones/${zoneId}/land-ladder/${formTier.id}`,
              {
                acreage: formTier.acreage,
                value: formTier.value,
              },
            );
            savedTiers.push(response.tier);
            // Remove from delete list since we're keeping it
            const deleteIndex = tiersToDelete.findIndex(
              (t) => t.id === formTier.id,
            );
            if (deleteIndex !== -1) {
              tiersToDelete.splice(deleteIndex, 1);
            }
          } catch (error) {
            console.error('Error updating tier:', error);
            throw error;
          }
        } else {
          // New tier - create it
          try {
            const response = await this.api.post(
              `/municipalities/${municipalityId}/zones/${zoneId}/land-ladder`,
              {
                acreage: formTier.acreage,
                value: formTier.value,
              },
            );
            savedTiers.push(response.tier);
          } catch (error) {
            console.error('Error creating tier:', error);
            throw error;
          }
        }
      }

      // Delete tiers that are no longer in the form
      for (const tierToDelete of tiersToDelete) {
        try {
          await this.api.delete(
            `/municipalities/${municipalityId}/zones/${zoneId}/land-ladder/${tierToDelete.id}`,
          );
        } catch (error) {
          console.error('Error deleting tier:', error);
          // Don't throw here, continue with other deletions
        }
      }

      // Update local model
      const existingLadderIndex = this.model.landLadders.findIndex(
        (ladder) => ladder.zoneId === zoneId,
      );
      const newLadder = {
        id: existingLadder?.id || Date.now(), // Keep existing ID or generate new one
        zoneId: zoneId,
        zoneName: ladderData.zoneName,
        tiers: savedTiers.sort((a, b) => a.order - b.order), // Sort by order
      };

      if (existingLadderIndex !== -1) {
        this.model.landLadders[existingLadderIndex] = newLadder;
      } else {
        this.model.landLadders.push(newLadder);
      }

      // Force reactivity update
      this.model = { ...this.model };

      this.closeLadderModal();
    } catch (error) {
      console.error('Error saving land ladder:', error);
      // Re-throw the error so the modal can handle it
      throw error;
    }
  }

  @action
  openTierModal(zone, tier) {
    this.editingTierZone = zone;
    this.editingTier = tier;
    this.isTierModalOpen = true;
  }

  @action
  openNewTierModal(zone) {
    this.editingTierZone = zone;
    this.editingTier = null;
    this.isTierModalOpen = true;
  }

  @action
  closeTierModal() {
    this.isTierModalOpen = false;
    this.editingTier = null;
    this.editingTierZone = null;
  }

  @action
  async saveTier(tierData) {
    try {
      const municipalityId = this.model.municipality.id;
      const zoneId = this.editingTierZone.id;

      console.log('Saving tier:', tierData);
      console.log('Zone ID:', zoneId);

      let savedTier;
      if (tierData.id) {
        // Update existing tier
        const response = await this.api.put(
          `/municipalities/${municipalityId}/zones/${zoneId}/land-ladder/${tierData.id}`,
          tierData,
        );
        console.log('Update response:', response);
        savedTier = response.tier;
      } else {
        // Create new tier
        const response = await this.api.post(
          `/municipalities/${municipalityId}/zones/${zoneId}/land-ladder`,
          tierData,
        );
        console.log('Create response:', response);
        savedTier = response.tier;
      }

      console.log('Saved tier:', savedTier);

      // Update local model with deep copying to ensure reactivity
      const ladderIndex = this.model.landLadders.findIndex(
        (ladder) => ladder.zoneId === zoneId,
      );
      console.log('Found ladder index:', ladderIndex);
      console.log('Current ladders:', this.model.landLadders);

      if (ladderIndex !== -1) {
        const ladder = this.model.landLadders[ladderIndex];
        console.log('Updating ladder:', ladder);

        if (tierData.id) {
          // Update existing tier
          const tierIndex = ladder.tiers.findIndex((t) => t.id === tierData.id);
          console.log('Found tier index:', tierIndex);
          if (tierIndex !== -1) {
            console.log('Old tier:', ladder.tiers[tierIndex]);
            ladder.tiers[tierIndex] = savedTier;
            console.log('New tier:', ladder.tiers[tierIndex]);
          }
        } else {
          // Add new tier
          ladder.tiers.push(savedTier);
          ladder.tiers.sort((a, b) => a.acreage - b.acreage);
        }
        // Create new reference for the ladder to trigger reactivity
        this.model.landLadders[ladderIndex] = {
          ...ladder,
          tiers: [...ladder.tiers],
        };
      } else {
        // Create new ladder for this zone
        const newLadder = {
          id: Date.now(),
          zoneId: zoneId,
          zoneName: this.editingTierZone.name,
          tiers: [savedTier],
        };
        this.model.landLadders.push(newLadder);
      }

      console.log('Updated model:', this.model);

      // Force full reactivity update by setting new references
      this.model.landLadders = [...this.model.landLadders];
      this.model = { ...this.model };

      console.log('Final model after update:', this.model);
      console.log('Final ladders:', this.model.landLadders);

      // Increment counter to force UI reactivity
      this.tierUpdateCounter++;
      console.log('Incremented tier counter to:', this.tierUpdateCounter);

      this.closeTierModal();
    } catch (error) {
      console.error('Error saving tier:', error);
      // TODO: Show error message to user
    }
  }

  @action
  async deleteTier(zone, tier) {
    if (confirm('Are you sure you want to delete this tier?')) {
      try {
        const municipalityId = this.model.municipality.id;
        await this.api.delete(
          `/municipalities/${municipalityId}/zones/${zone.id}/land-ladder/${tier.id}`,
        );

        // Update local model
        const ladderIndex = this.model.landLadders.findIndex(
          (ladder) => ladder.zoneId === zone.id,
        );
        if (ladderIndex !== -1) {
          const ladder = this.model.landLadders[ladderIndex];
          const tierIndex = ladder.tiers.findIndex((t) => t.id === tier.id);
          if (tierIndex !== -1) {
            ladder.tiers.splice(tierIndex, 1);
          }
        }

        // Force reactivity update
        this.model = { ...this.model };
      } catch (error) {
        console.error('Error deleting tier:', error);
        // TODO: Show error message to user
      }
    }
  }

  // === ACREAGE DISCOUNT SETTINGS ===

  @tracked isEditingAcreageDiscounts = false;
  @tracked acreageDiscountMinimum = '';
  @tracked acreageDiscountMaximum = '';
  @tracked acreageDiscountPercentage = '';
  @tracked calculatorAcreage = '';
  @tracked acreageDiscountUpdateCounter = 0;

  // Computed property for reactive acreage discount settings
  get acreageDiscountSettings() {
    this.acreageDiscountUpdateCounter;
    return (
      this.model?.acreageDiscountSettings || {
        minimumQualifyingAcreage: 10,
        maximumQualifyingAcreage: 200,
        maximumDiscountPercentage: 75,
      }
    );
  }

  // Computed property for calculated discount
  get calculatedDiscount() {
    if (!this.calculatorAcreage || isNaN(this.calculatorAcreage)) {
      return null;
    }

    const acreage = parseFloat(this.calculatorAcreage);
    const settings = this.acreageDiscountSettings;

    // If below minimum, no discount
    if (acreage < settings.minimumQualifyingAcreage) {
      return 0;
    }

    // If above maximum, use maximum discount
    if (acreage >= settings.maximumQualifyingAcreage) {
      return settings.maximumDiscountPercentage;
    }

    // Linear interpolation between minimum and maximum
    const acreageRange =
      settings.maximumQualifyingAcreage - settings.minimumQualifyingAcreage;
    const acreageAboveMin = acreage - settings.minimumQualifyingAcreage;
    const discountRatio = acreageAboveMin / acreageRange;

    return (
      Math.round(discountRatio * settings.maximumDiscountPercentage * 100) / 100
    );
  }

  @action
  startEditingAcreageDiscounts() {
    const settings = this.acreageDiscountSettings;
    this.acreageDiscountMinimum = settings.minimumQualifyingAcreage.toString();
    this.acreageDiscountMaximum = settings.maximumQualifyingAcreage.toString();
    this.acreageDiscountPercentage =
      settings.maximumDiscountPercentage.toString();
    this.isEditingAcreageDiscounts = true;
  }

  @action
  cancelEditingAcreageDiscounts() {
    this.isEditingAcreageDiscounts = false;
    this.acreageDiscountMinimum = '';
    this.acreageDiscountMaximum = '';
    this.acreageDiscountPercentage = '';
  }

  @action
  updateAcreageDiscountMinimum(event) {
    this.acreageDiscountMinimum = event.target.value;
  }

  @action
  updateAcreageDiscountMaximum(event) {
    this.acreageDiscountMaximum = event.target.value;
  }

  @action
  updateAcreageDiscountPercentage(event) {
    this.acreageDiscountPercentage = event.target.value;
  }

  @action
  updateCalculatorAcreage(event) {
    this.calculatorAcreage = event.target.value;
  }

  @action
  async saveAcreageDiscountSettings() {
    try {
      const minimum = parseFloat(this.acreageDiscountMinimum);
      const maximum = parseFloat(this.acreageDiscountMaximum);
      const percentage = parseFloat(this.acreageDiscountPercentage);

      // Validation
      if (isNaN(minimum) || minimum < 0.1 || minimum > 1000) {
        alert('Minimum qualifying acreage must be between 0.1 and 1000 acres');
        return;
      }

      if (isNaN(maximum) || maximum < 1 || maximum > 10000) {
        alert('Maximum qualifying acreage must be between 1 and 10,000 acres');
        return;
      }

      if (isNaN(percentage) || percentage < 1 || percentage > 95) {
        alert('Maximum discount percentage must be between 1% and 95%');
        return;
      }

      if (maximum <= minimum) {
        alert(
          'Maximum qualifying acreage must be greater than minimum qualifying acreage',
        );
        return;
      }

      const municipalityId = this.model.municipality.id;
      const settingsData = {
        minimumQualifyingAcreage: minimum,
        maximumQualifyingAcreage: maximum,
        maximumDiscountPercentage: percentage,
      };

      const response = await this.api.put(
        `/municipalities/${municipalityId}/acreage-discount-settings`,
        settingsData,
      );

      // Update local model
      this.model.acreageDiscountSettings = response.acreageDiscountSettings;
      this.model = { ...this.model };

      // Force reactivity
      this.acreageDiscountUpdateCounter++;

      this.cancelEditingAcreageDiscounts();
    } catch (error) {
      console.error('Error saving acreage discount settings:', error);
      alert('Error saving acreage discount settings. Please try again.');
    }
  }

  @action
  formatCurrency(value) {
    return '$' + (value / 1000).toFixed(0) + 'K';
  }

  // === LAND MASS RECALCULATION ===

  @tracked landRecalculationStatus = null;
  @tracked isLandRecalculating = false;
  @tracked landRecalculationResult = null;
  @tracked landMassRecalcYear = new Date().getFullYear().toString();
  @tracked landMassRecalcBatchSize = '500'; // Increased default for optimized version
  @tracked recalcProgress = null; // Real-time progress data
  @tracked recalcJobId = null; // Current job ID
  pollingInterval = null; // Progress polling interval
  loadingRequestId = null; // Loading service request ID

  @action
  updateLandMassRecalcYear(event) {
    this.landMassRecalcYear = event.target.value;
  }

  @action
  updateLandMassRecalcBatchSize(event) {
    this.landMassRecalcBatchSize = event.target.value;
  }

  @action
  async refreshLandRecalculationStatus() {
    try {
      const municipalityId = this.model.municipality.id;
      const year =
        parseInt(this.landMassRecalcYear) || new Date().getFullYear();

      const response = await this.api.get(
        `/municipalities/${municipalityId}/land-assessments/recalculation-status?year=${year}`,
      );

      this.landRecalculationStatus = response.status;
    } catch (error) {
      console.error('Error fetching land recalculation status:', error);
    }
  }

  @action
  async startLandMassRecalculation() {
    if (this.isLandRecalculating) return;

    if (
      !confirm(
        'Are you sure you want to recalculate all land assessments? This uses the OPTIMIZED calculation engine and may take 1-2 minutes for large municipalities.',
      )
    ) {
      return;
    }

    this.isLandRecalculating = true;
    this.landRecalculationResult = null;
    this.recalcProgress = null;

    // Show loading overlay with initial message
    this.loadingRequestId = this.loading.startLoading(
      '⚡ Starting optimized land recalculation...',
    );

    try {
      const municipalityId = this.model.municipality.id;
      const year =
        parseInt(this.landMassRecalcYear) || new Date().getFullYear();
      const batchSize = parseInt(this.landMassRecalcBatchSize) || 500;

      // Start the recalculation (returns immediately with jobId)
      const response = await this.api.post(
        `/municipalities/${municipalityId}/land-assessments/recalculate`,
        {
          effectiveYear: year,
          batchSize: batchSize,
        },
        { showLoading: false }, // Don't show default loading, we're using custom progress
      );

      this.recalcJobId = response.jobId;
      console.log('🚀 Recalculation started, jobId:', this.recalcJobId);

      // Update message
      this.loading.setMessage('⚡ Recalculating land assessments...');

      // Start polling for progress
      this.startProgressPolling();
    } catch (error) {
      console.error('Error starting land mass recalculation:', error);
      this.landRecalculationResult = {
        success: false,
        message:
          error.message || 'Failed to start recalculation. Please try again.',
      };
      this.isLandRecalculating = false;

      // Stop loading on error
      if (this.loadingRequestId) {
        this.loading.stopLoading(this.loadingRequestId);
        this.loadingRequestId = null;
      }
    }
  }

  /**
   * Start polling for progress updates
   */
  startProgressPolling() {
    // Clear any existing polling
    this.stopProgressPolling();

    // Poll every second
    this.pollingInterval = setInterval(async () => {
      try {
        await this.checkProgress();
      } catch (error) {
        console.error('Error checking progress:', error);
      }
    }, 1000);
  }

  /**
   * Stop progress polling
   */
  stopProgressPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  /**
   * Check current progress of recalculation
   */
  async checkProgress() {
    if (!this.recalcJobId) return;

    try {
      const municipalityId = this.model.municipality.id;
      const response = await this.api.get(
        `/municipalities/${municipalityId}/land-assessments/recalculate/progress/${this.recalcJobId}`,
        {},
        { showLoading: false }, // Don't show loading for progress checks
      );

      this.recalcProgress = response.progress;

      // Update loading service with progress data
      if (response.progress) {
        this.loading.setProgress({
          percentage: response.progress.progress || 0,
          processedItems: response.progress.processedCount || 0,
          totalItems: response.progress.totalCount || 0,
          currentPhase: `Processing at ${response.progress.rate || '0'}/sec`,
          estimatedTimeRemaining: response.progress.eta || null,
        });
      }

      // Check if job completed or failed
      if (
        response.progress.status === 'completed' ||
        response.progress.status === 'failed'
      ) {
        this.stopProgressPolling();
        this.isLandRecalculating = false;

        // Stop loading and clear progress
        if (this.loadingRequestId) {
          this.loading.stopLoading(this.loadingRequestId);
          this.loadingRequestId = null;
        }
        this.loading.clearProgress();

        if (response.progress.status === 'completed') {
          this.landRecalculationResult = {
            success: true,
            result: {
              processed: response.progress.processedCount,
              updated: response.progress.updatedCount,
              errors: response.progress.errorCount,
              duration: response.progress.duration,
              rate: response.progress.rate,
            },
          };

          // Clear all land assessment caches
          this.assessing.clearAllLandAssessmentCaches();

          // Refresh status
          await this.refreshLandRecalculationStatus();
        } else {
          this.landRecalculationResult = {
            success: false,
            message:
              response.progress.error ||
              'Recalculation failed. Please try again.',
          };
        }
      }
    } catch (error) {
      console.error('Error fetching progress:', error);
      // Don't stop polling on fetch errors, might be temporary
    }
  }

  @action
  async startLandMassRecalculationWithZoneAdjustments() {
    if (this.isLandRecalculating) return;

    if (
      !confirm(
        'Are you sure you want to recalculate all land assessments with zone minimum acreage adjustments? This will redistribute land above zone minimums to excess acreage lines and may take several minutes.',
      )
    ) {
      return;
    }

    this.isLandRecalculating = true;
    this.landRecalculationResult = null;

    try {
      const municipalityId = this.model.municipality.id;
      const year =
        parseInt(this.landMassRecalcYear) || new Date().getFullYear();
      const batchSize = parseInt(this.landMassRecalcBatchSize) || 50;

      const response = await this.api.post(
        `/municipalities/${municipalityId}/land-assessments/mass-recalculate`,
        {
          effectiveYear: year,
          batchSize: batchSize,
          includeZoneAdjustments: true, // Use zone adjustments for this specific method
        },
      );

      this.landRecalculationResult = {
        success: true,
        result: response.result,
      };

      // Clear all land assessment caches to ensure UI shows updated data
      this.assessing.clearAllLandAssessmentCaches();

      // Refresh status after successful recalculation
      await this.refreshLandRecalculationStatus();
    } catch (error) {
      console.error(
        'Error during land mass recalculation with zone adjustments:',
        error,
      );
      this.landRecalculationResult = {
        success: false,
        message:
          error.message ||
          'Mass recalculation with zone adjustments failed. Please try again.',
      };
    } finally {
      this.isLandRecalculating = false;
    }
  }

  @action
  async recalculateLandOnlyMissing() {
    if (this.isLandRecalculating) return;

    if (
      !confirm(
        'Are you sure you want to recalculate only land assessments with missing values?',
      )
    ) {
      return;
    }

    this.isLandRecalculating = true;
    this.landRecalculationResult = null;

    try {
      const municipalityId = this.model.municipality.id;
      const year =
        parseInt(this.landMassRecalcYear) || new Date().getFullYear();
      const batchSize = parseInt(this.landMassRecalcBatchSize) || 50;

      const response = await this.api.post(
        `/municipalities/${municipalityId}/land-assessments/mass-recalculate`,
        {
          effectiveYear: year,
          batchSize: batchSize,
          includeZoneAdjustments: true,
          onlyMissing: true,
        },
      );

      this.landRecalculationResult = {
        success: true,
        result: response.result,
      };

      // Clear all land assessment caches to ensure UI shows updated data
      this.assessing.clearAllLandAssessmentCaches();

      // Refresh status after successful recalculation
      await this.refreshLandRecalculationStatus();
    } catch (error) {
      console.error('Error during land recalculation (missing only):', error);
      this.landRecalculationResult = {
        success: false,
        message: error.message || 'Recalculation failed. Please try again.',
      };
    } finally {
      this.isLandRecalculating = false;
    }
  }
}
