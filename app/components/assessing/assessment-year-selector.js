import Component from '@glimmer/component';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class AssessmentYearSelectorComponent extends Component {
  @service router;

  @tracked selectedYear = null;

  constructor() {
    super(...arguments);
    // Set initial year from args or current property tax year
    this.selectedYear =
      this.args.selectedYear ||
      this.args.property?.tax_year ||
      new Date().getFullYear();
  }

  get availableYears() {
    // Generate years from current year back to 2000
    const currentYear = new Date().getFullYear();
    const years = [];
    for (let year = currentYear; year >= 2000; year--) {
      years.push(year);
    }
    return years;
  }

  @action
  onYearChange(event) {
    const newYear = parseInt(event.target.value);
    this.selectedYear = newYear;

    // Call parent callback if provided
    if (this.args.onYearChange) {
      this.args.onYearChange(newYear);
    }

    // Only navigate if we're in a property route with proper context
    const currentRoute = this.router.currentRouteName;
    const currentParams = this.router.currentRoute?.params;
    const currentQueryParams = this.router.currentRoute?.queryParams;

    if (
      currentRoute &&
      currentRoute.includes('.property') &&
      currentParams?.property_id
    ) {
      try {
        this.router.transitionTo(currentRoute, currentParams.property_id, {
          queryParams: {
            ...currentQueryParams,
            assessment_year: newYear,
          },
        });
      } catch (error) {
        console.warn('Failed to navigate with assessment year:', error);
        // Silently fail navigation but still update the year
      }
    }
  }
}
