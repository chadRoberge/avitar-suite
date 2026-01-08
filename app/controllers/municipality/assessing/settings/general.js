import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';

export default class MunicipalityAssessingSettingsGeneralController extends Controller {
  @service assessing;
  @service notifications;
  @service municipality;

  // Year management state
  @tracked _yearManagementData = null;
  @tracked isLoadingYears = false;
  @tracked isCreatingYear = false;
  @tracked isTogglingYear = false;
  @tracked sourceYear = null;
  @tracked targetYear = null;

  // Use model data by default, tracked data after refresh
  get yearManagementData() {
    return (
      this._yearManagementData ||
      this.model?.yearManagementData || {
        years: [],
        hiddenYears: [],
        currentTaxYear: null,
      }
    );
  }

  // Initialize source/target year when model changes
  get defaultSourceYear() {
    const years = this.yearManagementData.years;
    if (years?.length > 0) {
      return years[0].year;
    }
    return new Date().getFullYear();
  }

  get defaultTargetYear() {
    return this.defaultSourceYear + 1;
  }

  // Ensure source/target are set
  get effectiveSourceYear() {
    return this.sourceYear ?? this.defaultSourceYear;
  }

  get effectiveTargetYear() {
    return this.targetYear ?? this.defaultTargetYear;
  }

  async loadYearManagementData() {
    this.isLoadingYears = true;
    try {
      const response = await this.assessing.getYearManagementData();
      if (response.success) {
        this._yearManagementData = response;
        // Reset source/target to new defaults
        this.sourceYear = null;
        this.targetYear = null;
      }
    } catch (error) {
      console.error('Failed to load year management data:', error);
      this.notifications.error('Failed to load assessment years');
    } finally {
      this.isLoadingYears = false;
    }
  }

  @action
  updateSourceYear(event) {
    this.sourceYear = parseInt(event.target.value);
  }

  @action
  updateTargetYear(event) {
    this.targetYear = parseInt(event.target.value);
  }

  @action
  async createNewYear() {
    const sourceYear = this.effectiveSourceYear;
    const targetYear = this.effectiveTargetYear;

    if (!sourceYear || !targetYear) {
      this.notifications.warning(
        'Please select source year and enter target year',
      );
      return;
    }

    if (targetYear < 2000 || targetYear > 2099) {
      this.notifications.warning('Target year must be between 2000 and 2099');
      return;
    }

    // Check if target year already exists
    const existingYear = this.yearManagementData.years?.find(
      (y) => y.year === targetYear,
    );
    if (existingYear) {
      this.notifications.warning(
        `Assessment year ${targetYear} already exists`,
      );
      return;
    }

    this.isCreatingYear = true;
    try {
      const response = await this.assessing.createAssessmentYear(
        sourceYear,
        targetYear,
      );

      if (response.success) {
        this.notifications.success(
          `Created assessment year ${targetYear} from ${sourceYear}. ` +
            `Copied ${response.stats.copiedParcels} parcels.`,
        );
        // Refresh year data
        await this.loadYearManagementData();
      } else {
        this.notifications.error(
          response.message || 'Failed to create assessment year',
        );
      }
    } catch (error) {
      console.error('Failed to create assessment year:', error);
      this.notifications.error(
        error.message || 'Failed to create assessment year',
      );
    } finally {
      this.isCreatingYear = false;
    }
  }

  @action
  async toggleYearVisibility(year, hidden) {
    this.isTogglingYear = true;
    try {
      const response = await this.assessing.toggleYearVisibility(year, hidden);

      if (response.success) {
        const action = hidden ? 'hidden from' : 'visible to';
        this.notifications.success(
          `Year ${year} is now ${action} public users`,
        );
        // Refresh year data
        await this.loadYearManagementData();
      } else {
        this.notifications.error(
          response.message || 'Failed to update year visibility',
        );
      }
    } catch (error) {
      console.error('Failed to toggle year visibility:', error);
      this.notifications.error(
        error.message || 'Failed to update year visibility',
      );
    } finally {
      this.isTogglingYear = false;
    }
  }
}
