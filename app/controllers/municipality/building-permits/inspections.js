import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';

export default class MunicipalityBuildingPermitsInspectionsController extends Controller {
  @service router;

  // Modal state
  @tracked showRescheduleModal = false;
  @tracked selectedInspection = null;

  // Query params
  queryParams = [
    'tab',
    'dateFrom',
    'dateTo',
    'inspector',
    'status',
    'type',
    'search',
    'page',
  ];
  @tracked tab = 'today';
  @tracked dateFrom = '';
  @tracked dateTo = '';
  @tracked inspector = '';
  @tracked status = '';
  @tracked type = '';
  @tracked search = '';
  @tracked page = 1;

  // Inspector options for filter
  get inspectorOptions() {
    const inspectors = this.model.filters?.inspectors || [];
    return [
      { value: '', label: 'All Inspectors' },
      ...inspectors.map((insp) => ({
        value: insp._id,
        label: `${insp.first_name} ${insp.last_name}`,
      })),
    ];
  }

  // Status options for filter
  get statusOptions() {
    return [
      { value: '', label: 'All Statuses' },
      { value: 'scheduled', label: 'Scheduled' },
      { value: 'in_progress', label: 'In Progress' },
      { value: 'completed', label: 'Completed' },
      { value: 'passed', label: 'Passed' },
      { value: 'failed', label: 'Failed' },
      { value: 'cancelled', label: 'Cancelled' },
      { value: 'rescheduled', label: 'Rescheduled' },
    ];
  }

  // Inspection type options for filter
  get typeOptions() {
    const types = this.model.filters?.types || [];
    return [
      { value: '', label: 'All Types' },
      ...types.map((t) => ({
        value: t,
        label: this.formatInspectionType(t),
      })),
    ];
  }

  // Stats for tab badges
  get todayCount() {
    return this.model.stats?.today || 0;
  }

  get allCount() {
    return this.model.stats?.all || 0;
  }

  get myCount() {
    return this.model.stats?.my || 0;
  }

  // Status badge helper
  getStatusBadge(status) {
    const badges = {
      scheduled: 'avitar-badge--primary',
      in_progress: 'avitar-badge--warning',
      completed: 'avitar-badge--info',
      passed: 'avitar-badge--success',
      failed: 'avitar-badge--danger',
      cancelled: 'avitar-badge--secondary',
      rescheduled: 'avitar-badge--warning',
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

  // Format inspection type
  formatInspectionType(type) {
    return type
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  // Format date for display
  formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  // Format time for display
  formatTime(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }

  @action
  selectTab(tab) {
    this.tab = tab;
    this.page = 1;
  }

  @action
  setInspector(event) {
    this.inspector = event.target.value;
    this.page = 1;
  }

  @action
  setStatus(event) {
    this.status = event.target.value;
    this.page = 1;
  }

  @action
  setType(event) {
    this.type = event.target.value;
    this.page = 1;
  }

  @action
  setDateFrom(event) {
    this.dateFrom = event.target.value;
    this.page = 1;
  }

  @action
  setDateTo(event) {
    this.dateTo = event.target.value;
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
  clearFilters() {
    this.dateFrom = '';
    this.dateTo = '';
    this.inspector = '';
    this.status = '';
    this.type = '';
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
  viewInspection(inspection) {
    this.router.transitionTo(
      'municipality.building-permits.inspection',
      inspection._id,
    );
  }

  @action
  viewPermit(permitId) {
    this.router.transitionTo('municipality.building-permits.permit', permitId);
  }

  @action
  openRescheduleModal(inspection) {
    this.selectedInspection = inspection;
    this.showRescheduleModal = true;
  }

  @action
  closeRescheduleModal() {
    this.showRescheduleModal = false;
    this.selectedInspection = null;
  }

  @action
  async handleRescheduleComplete() {
    // Refresh the model data by triggering a route refresh
    this.send('refreshModel');
  }

  @action
  stopPropagation(event) {
    event.stopPropagation();
  }
}
