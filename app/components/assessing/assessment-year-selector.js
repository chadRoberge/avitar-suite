import Component from '@glimmer/component';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class AssessmentYearSelectorComponent extends Component {
  @service router;
  @service api;
  @service municipality;
  @service('current-user') currentUser;

  @tracked selectedYear = null;
  @tracked fetchedYears = null;
  @tracked hiddenYears = [];
  @tracked allYears = [];
  @tracked isLoading = false;
  @tracked fetchError = null;

  constructor() {
    super(...arguments);
    // Set initial year from args or current property tax year
    this.selectedYear =
      this.args.selectedYear ||
      this.args.property?.tax_year ||
      new Date().getFullYear();

    // Also update the municipality service so other components can access the selected year
    this.municipality.selectedAssessmentYear = this.selectedYear;

    // Fetch available years from API if municipality ID is provided
    this.loadAvailableYears();
  }

  async loadAvailableYears() {
    const municipalityId =
      this.args.municipalityId || this.args.property?.municipality_id;
    if (!municipalityId) {
      return; // No municipality, use fallback years
    }

    this.isLoading = true;
    this.fetchError = null;

    try {
      const response = await this.api.get(
        `/municipalities/${municipalityId}/assessing/available-years`,
      );

      if (response.success && response.years?.length > 0) {
        this.fetchedYears = response.years;
        this.hiddenYears = response.hiddenYears || [];
        this.allYears = response.allYears || response.years;

        // If selected year is not in available years, select the most recent
        if (!this.fetchedYears.includes(this.selectedYear)) {
          this.selectedYear = this.fetchedYears[0];
          // Update the municipality service
          this.municipality.selectedAssessmentYear = this.selectedYear;
          // Notify parent of the year change
          if (this.args.onYearChange) {
            this.args.onYearChange(this.selectedYear);
          }
        }
      }
    } catch (error) {
      console.warn('Failed to fetch available years:', error);
      this.fetchError = error;
      // Will fall back to generated years
    } finally {
      this.isLoading = false;
    }
  }

  get availableYears() {
    // Use fetched years if available, otherwise generate fallback
    if (this.fetchedYears?.length > 0) {
      return this.fetchedYears;
    }

    // Fallback: Generate years from current year back to 2000
    const currentYear = new Date().getFullYear();
    const years = [];
    for (let year = currentYear; year >= 2000; year--) {
      years.push(year);
    }
    return years;
  }

  get isStaff() {
    return (
      this.currentUser?.isMunicipalStaff || this.currentUser?.isAvitarStaff
    );
  }

  // Check if a year is hidden (for staff indicator)
  isYearHidden(year) {
    return this.hiddenYears.includes(year);
  }

  @action
  onYearChange(event) {
    const newYear = parseInt(event.target.value);
    this.selectedYear = newYear;

    // Update the municipality service - single source of truth for selected year
    this.municipality.selectedAssessmentYear = newYear;

    // Call parent callback if provided
    if (this.args.onYearChange) {
      this.args.onYearChange(newYear);
    }

    // Refresh the current route to reload data with the new year from service
    try {
      this.router.refresh();
      console.log('📅 Year changed to', newYear);
    } catch (error) {
      console.warn('Failed to refresh route:', error);
    }
  }
}
