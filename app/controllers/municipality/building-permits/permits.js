import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';

export default class MunicipalityBuildingPermitsPermitsController extends Controller {
  @service router;

  // Query params
  queryParams = ['year', 'permitTypeId', 'status', 'search', 'page'];
  @tracked year = '';
  @tracked permitTypeId = '';
  @tracked status = '';
  @tracked search = '';
  @tracked page = 1;

  // Status options for filter
  get statusOptions() {
    return [
      { value: '', label: 'Active (Not Completed)' },
      { value: 'all', label: 'All Permits' },
      { value: 'draft', label: 'Draft' },
      { value: 'submitted', label: 'Submitted' },
      { value: 'under_review', label: 'Under Review' },
      { value: 'approved', label: 'Approved' },
      { value: 'issued', label: 'Issued' },
      { value: 'active', label: 'Active' },
      { value: 'inspections', label: 'Inspections' },
      { value: 'completed', label: 'Completed' },
      { value: 'closed', label: 'Closed' },
      { value: 'denied', label: 'Denied' },
      { value: 'cancelled', label: 'Cancelled' },
    ];
  }

  // Year options for filter
  get yearOptions() {
    const years = this.model.filters?.availableYears || [];
    return [
      { value: '', label: 'All Years' },
      ...years.map((year) => ({ value: year, label: year.toString() })),
    ];
  }

  // Permit type options for filter
  get permitTypeOptions() {
    const types = this.model.filters?.permitTypes || [];
    return [
      { value: '', label: 'All Permit Types' },
      ...types.map((type) => ({
        value: type._id,
        label: type.name,
      })),
    ];
  }

  // Status badge helper
  getStatusBadge(status) {
    const badges = {
      draft: 'avitar-badge--secondary',
      submitted: 'avitar-badge--primary',
      under_review: 'avitar-badge--warning',
      approved: 'avitar-badge--success',
      issued: 'avitar-badge--success',
      active: 'avitar-badge--success',
      inspections: 'avitar-badge--info',
      completed: 'avitar-badge--info',
      closed: 'avitar-badge--secondary',
      denied: 'avitar-badge--danger',
      cancelled: 'avitar-badge--secondary',
      on_hold: 'avitar-badge--warning',
    };
    return `avitar-badge ${badges[status] || 'avitar-badge--secondary'}`;
  }

  // Format status text
  formatStatus(status) {
    return status
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  @action
  setYear(event) {
    this.year = event.target.value;
    this.page = 1; // Reset to first page
  }

  @action
  setPermitType(event) {
    this.permitTypeId = event.target.value;
    this.page = 1;
  }

  @action
  setStatus(event) {
    this.status = event.target.value;
    this.page = 1;
  }

  @action
  updateSearch(event) {
    this.search = event.target.value;
  }

  @action
  performSearch() {
    this.page = 1;
  }

  @action
  clearSearch() {
    this.search = '';
    this.page = 1;
  }

  @action
  goToPage(pageNumber) {
    this.page = pageNumber;
  }

  @action
  nextPage() {
    if (this.page < this.model.pagination.totalPages) {
      this.page++;
    }
  }

  @action
  previousPage() {
    if (this.page > 1) {
      this.page--;
    }
  }

  @action
  viewPermit(permit) {
    this.router.transitionTo(
      'municipality.building-permits.permit',
      permit._id,
    );
  }

  @action
  stopPropagation(event) {
    event.stopPropagation();
  }
}
