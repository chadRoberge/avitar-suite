import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';

export default class MunicipalityBuildingPermitsPermitsController extends Controller {
  @service router;
  @service('current-user') currentUser;

  // Query params
  queryParams = ['year', 'permitTypeId', 'status', 'search', 'page', 'tab'];
  @tracked year = '';
  @tracked permitTypeId = '';
  @tracked status = '';
  @tracked search = '';
  @tracked page = 1;
  @tracked tab = 'all'; // 'all' or 'my'

  // Check if user is residential (contractor or citizen)
  get isResidentialUser() {
    return this.currentUser.isContractorOrCitizen;
  }

  // Get current user ID for filtering
  get currentUserId() {
    return this.currentUser.user?._id;
  }

  // Get contractor ID for filtering
  get contractorId() {
    return this.currentUser.user?.contractor_id;
  }

  // Filter permits based on active tab
  get displayedPermits() {
    const permits = this.model.permits || [];

    if (this.tab === 'my') {
      // Filter to show only user's permits
      return permits.filter((permit) => {
        // Check if submitted by this user
        if (permit.submitted_by?._id === this.currentUserId) {
          return true;
        }
        // Check if contractor matches (for contractor users)
        if (this.contractorId && permit.contractor_id === this.contractorId) {
          return true;
        }
        // Check applicant user ID
        if (permit.applicantUserId === this.currentUserId) {
          return true;
        }
        return false;
      });
    }

    return permits;
  }

  // Get count for each tab
  get allPermitsCount() {
    return this.model.permits?.length || 0;
  }

  get myPermitsCount() {
    const permits = this.model.permits || [];
    return permits.filter((permit) => {
      if (permit.submitted_by?._id === this.currentUserId) {
        return true;
      }
      if (this.contractorId && permit.contractor_id === this.contractorId) {
        return true;
      }
      if (permit.applicantUserId === this.currentUserId) {
        return true;
      }
      return false;
    }).length;
  }

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

  @action
  setTab(tabName) {
    this.tab = tabName;
    this.page = 1; // Reset to first page when switching tabs
  }
}
