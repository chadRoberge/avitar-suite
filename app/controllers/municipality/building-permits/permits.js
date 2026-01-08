import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';

export default class MunicipalityBuildingPermitsPermitsController extends Controller {
  @service router;
  @service api;
  @service municipality;
  @service('current-user') currentUser;

  // Query params
  queryParams = ['year', 'permitTypeId', 'status', 'search', 'page', 'tab'];
  @tracked year = '';
  @tracked permitTypeId = '';
  @tracked status = '';
  @tracked search = '';
  @tracked page = 1;
  @tracked tab = 'all'; // 'all', 'my', or 'review'

  // Requires review state
  @tracked requiresReviewPermits = [];
  @tracked isLoadingReviewPermits = false;
  @tracked userDepartment = null;

  // Check if user is residential (contractor or citizen)
  get isResidentialUser() {
    return this.currentUser.isContractorOrCitizen;
  }

  // Get current user ID for filtering (as string for comparison)
  get currentUserId() {
    const id = this.currentUser.user?._id;
    return id ? String(id) : null;
  }

  // Get contractor ID for filtering (as string for comparison)
  get contractorId() {
    const id = this.currentUser.user?.contractor_id;
    return id ? String(id) : null;
  }

  // Helper to safely get ID as string
  _toIdString(id) {
    if (!id) return null;
    // Handle populated objects with _id
    if (typeof id === 'object' && id._id) {
      return String(id._id);
    }
    return String(id);
  }

  // Helper to filter permits owned by the current user (for contractors/citizens)
  _filterUserOwnedPermits(permits) {
    const currentUserId = this.currentUserId;
    const contractorId = this.contractorId;

    return permits.filter((permit) => {
      // Check all possible ownership fields
      const submittedById = this._toIdString(permit.submitted_by);
      const createdById = this._toIdString(permit.createdBy);
      const permitContractorId = this._toIdString(permit.contractor_id);
      const applicantId = this._toIdString(permit.applicantUserId);

      // Match on any ownership field
      if (submittedById === currentUserId) return true;
      if (createdById === currentUserId) return true;
      if (contractorId && permitContractorId === contractorId) return true;
      if (applicantId === currentUserId) return true;

      return false;
    });
  }

  // Filter permits based on active tab
  get displayedPermits() {
    if (this.tab === 'review') {
      // Return the loaded requires review permits
      return this.requiresReviewPermits;
    }

    const permits = this.model.permits || [];

    // "My Permits" tab - filter based on user type
    if (this.tab === 'my') {
      // For residential users (contractors/citizens): show permits they own
      if (this.isResidentialUser) {
        return this._filterUserOwnedPermits(permits);
      }

      // For municipal staff: show permits assigned to them
      const userDepartment =
        this.currentUser.currentMunicipalPermissions?.department;

      return permits.filter((permit) => {
        // Check if assigned as inspector
        const assignedInspectorId = this._toIdString(permit.assignedInspector);
        if (assignedInspectorId === this.currentUserId) {
          return true;
        }
        // Check if assigned as reviewer
        const assignedReviewerId = this._toIdString(permit.assignedReviewer);
        if (assignedReviewerId === this.currentUserId) {
          return true;
        }
        // Check if user's department has a pending review
        if (userDepartment && permit.departmentReviews?.length > 0) {
          const hasPendingReview = permit.departmentReviews.some(
            (r) =>
              r.department === userDepartment &&
              ['pending', 'in_review'].includes(r.status),
          );
          if (hasPendingReview) {
            return true;
          }
        }
        return false;
      });
    }

    // "All" tab - show all permits for the municipality
    return permits;
  }

  // Get count for each tab
  get allPermitsCount() {
    return this.model.permits?.length || 0;
  }

  get myPermitsCount() {
    const permits = this.model.permits || [];

    // For residential users: count permits they own
    if (this.isResidentialUser) {
      return this._filterUserOwnedPermits(permits).length;
    }

    // For municipal staff: count permits assigned to them or pending their review
    const userDepartment =
      this.currentUser.currentMunicipalPermissions?.department;

    return permits.filter((permit) => {
      const assignedInspectorId = this._toIdString(permit.assignedInspector);
      if (assignedInspectorId === this.currentUserId) {
        return true;
      }
      const assignedReviewerId = this._toIdString(permit.assignedReviewer);
      if (assignedReviewerId === this.currentUserId) {
        return true;
      }
      if (userDepartment && permit.departmentReviews?.length > 0) {
        const hasPendingReview = permit.departmentReviews.some(
          (r) =>
            r.department === userDepartment &&
            ['pending', 'in_review'].includes(r.status),
        );
        if (hasPendingReview) {
          return true;
        }
      }
      return false;
    }).length;
  }

  get requiresReviewCount() {
    return this.municipality.pendingReviewsCount || 0;
  }

  // Check if user has a department (for showing Requires Review tab)
  get canSeeReviewTab() {
    return (
      !this.isResidentialUser &&
      this.currentUser.currentMunicipalPermissions?.department
    );
  }

  // Status options for filter
  get statusOptions() {
    return [
      { value: '', label: 'All Statuses' },
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
  reviewPermit(permit) {
    // Get the user's department from the permit's departmentReviews
    const userDepartment =
      this.currentUser.currentMunicipalPermissions?.department;

    // Find the user's department review on this permit
    const review = permit.departmentReviews?.find(
      (r) =>
        r.department === userDepartment &&
        ['pending', 'in_review'].includes(r.status),
    );

    if (review) {
      this.router.transitionTo(
        'municipality.building-permits.review',
        permit._id,
        review.department,
      );
    } else {
      // Fallback to permit view if no reviewable department found
      this.router.transitionTo(
        'municipality.building-permits.permit',
        permit._id,
      );
    }
  }

  @action
  stopPropagation(event) {
    event.stopPropagation();
  }

  @action
  async setTab(tabName) {
    this.tab = tabName;
    this.page = 1; // Reset to first page when switching tabs

    // Load requires review permits when switching to review tab
    if (tabName === 'review') {
      await this.loadRequiresReviewPermits();
    }
  }

  async loadRequiresReviewPermits() {
    this.isLoadingReviewPermits = true;

    try {
      const municipalityId = this.model.municipalityId;
      const response = await this.api.get(
        `/municipalities/${municipalityId}/permits/requires-review`,
      );

      this.requiresReviewPermits = response.permits || [];
      this.userDepartment = response.department;

      // Refresh the badge count in navigation
      await this.municipality.loadPendingReviewsCount();
    } catch (error) {
      console.error('Error loading requires review permits:', error);
      this.requiresReviewPermits = [];
    } finally {
      this.isLoadingReviewPermits = false;
    }
  }
}
