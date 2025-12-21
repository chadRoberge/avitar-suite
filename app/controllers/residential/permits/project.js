import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class ResidentialPermitsProjectController extends Controller {
  @service router;
  @service('current-user') currentUser;

  @tracked filterStatus = 'all';
  @tracked sortBy = 'date_desc';

  // Status options for filtering
  get statusOptions() {
    return [
      { value: 'all', label: 'All Statuses' },
      { value: 'draft', label: 'Draft' },
      { value: 'submitted', label: 'Submitted' },
      { value: 'under_review', label: 'Under Review' },
      { value: 'approved', label: 'Approved' },
      { value: 'denied', label: 'Denied' },
      { value: 'revisions_requested', label: 'Revisions Requested' },
      { value: 'issued', label: 'Issued' },
      { value: 'completed', label: 'Completed' },
      { value: 'cancelled', label: 'Cancelled' },
    ];
  }

  // Filtered child permits
  get filteredChildPermits() {
    let permits = this.model.childPermits || [];

    // Filter by status
    if (this.filterStatus !== 'all') {
      permits = permits.filter((p) => p.status === this.filterStatus);
    }

    // Sort permits
    permits = permits.sort((a, b) => {
      switch (this.sortBy) {
        case 'date_desc':
          return new Date(b.createdAt) - new Date(a.createdAt);
        case 'date_asc':
          return new Date(a.createdAt) - new Date(b.createdAt);
        case 'status':
          return (a.status || '').localeCompare(b.status || '');
        default:
          return 0;
      }
    });

    // Add display properties
    return permits.map((permit) => ({
      ...permit,
      statusBadge: this.getStatusBadge(permit.status),
      canEdit: this.canEditPermit(permit),
    }));
  }

  // Overall project progress
  get projectProgress() {
    return this.model.project.projectStats?.overallProgress || 0;
  }

  // Check if user can edit a permit
  canEditPermit(permit) {
    // User can edit if they own the permit and it's in draft or revisions_requested status
    const isOwner =
      permit.contractor_id === this.currentUser.user.contractor_id ||
      permit.submitted_by === this.currentUser.user._id;
    const canEdit = ['draft', 'revisions_requested'].includes(permit.status);
    return isOwner && canEdit;
  }

  // Get status badge configuration
  getStatusBadge(status) {
    const badges = {
      draft: {
        class: 'avitar-badge avitar-badge--secondary',
        text: 'Draft',
        icon: 'file',
      },
      submitted: {
        class: 'avitar-badge avitar-badge--primary',
        text: 'Submitted',
        icon: 'paper-plane',
      },
      under_review: {
        class: 'avitar-badge avitar-badge--info',
        text: 'Under Review',
        icon: 'search',
      },
      approved: {
        class: 'avitar-badge avitar-badge--success',
        text: 'Approved',
        icon: 'check-circle',
      },
      denied: {
        class: 'avitar-badge avitar-badge--danger',
        text: 'Denied',
        icon: 'times-circle',
      },
      revisions_requested: {
        class: 'avitar-badge avitar-badge--warning',
        text: 'Revisions Requested',
        icon: 'edit',
      },
      issued: {
        class: 'avitar-badge avitar-badge--success',
        text: 'Issued',
        icon: 'certificate',
      },
      completed: {
        class: 'avitar-badge avitar-badge--secondary',
        text: 'Completed',
        icon: 'check-double',
      },
      cancelled: {
        class: 'avitar-badge avitar-badge--secondary',
        text: 'Cancelled',
        icon: 'ban',
      },
    };

    return (
      badges[status] || {
        class: 'avitar-badge',
        text: status || 'Unknown',
        icon: 'question',
      }
    );
  }

  // Get project status badge
  get projectStatusBadge() {
    return this.getStatusBadge(this.model.project.status);
  }

  @action
  setFilterStatus(event) {
    this.filterStatus = event.target.value;
  }

  @action
  setSortBy(event) {
    this.sortBy = event.target.value;
  }

  @action
  viewPermit(permit) {
    this.router.transitionTo('my-permits.permit', permit._id || permit.id);
  }

  @action
  addPermitToProject() {
    // Navigate to create wizard with project pre-selected
    // We could pass query params to pre-fill the project
    this.router.transitionTo('my-permits.create', {
      queryParams: {
        projectId: this.model.project._id || this.model.project.id,
      },
    });
  }

  @action
  goBack() {
    this.router.transitionTo('residential.permits');
  }
}
