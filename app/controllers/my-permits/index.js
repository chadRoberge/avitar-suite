import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class MyPermitsIndexController extends Controller {
  @service router;
  @service('current-user') currentUser;

  @tracked selectedTab = 'all';
  @tracked searchText = '';
  @tracked filterStatus = 'all';
  @tracked filterMunicipality = 'all';
  @tracked sortBy = 'date_desc';

  // Filter options
  get statusOptions() {
    return [
      { value: 'all', label: 'All Statuses' },
      { value: 'draft', label: 'Draft' },
      { value: 'submitted', label: 'Submitted' },
      { value: 'under_review', label: 'Under Review' },
      { value: 'approved', label: 'Approved' },
      { value: 'on_hold', label: 'On Hold' },
      { value: 'denied', label: 'Denied' },
      { value: 'closed', label: 'Closed' },
    ];
  }

  get municipalityOptions() {
    const options = [{ value: 'all', label: 'All Municipalities' }];

    if (this.model.byMunicipality) {
      this.model.byMunicipality.forEach((mun) => {
        options.push({
          value: mun.municipality.id,
          label: mun.municipality.name,
        });
      });
    }

    return options;
  }

  get sortOptions() {
    return [
      { value: 'date_desc', label: 'Newest First' },
      { value: 'date_asc', label: 'Oldest First' },
      { value: 'status', label: 'Status' },
      { value: 'municipality', label: 'Municipality' },
    ];
  }

  // Stats for display
  get stats() {
    return this.model.stats || {};
  }

  get tabStats() {
    const permits = this.model.permits || [];
    return {
      all: permits.length,
      active: permits.filter((p) =>
        ['submitted', 'under_review', 'approved'].includes(p.status)
      ).length,
      draft: permits.filter((p) => p.status === 'draft').length,
      completed: permits.filter((p) => p.status === 'closed').length,
    };
  }

  // Filtered and sorted permits
  get displayedPermits() {
    let permits = this.model.permits || [];

    // Tab filter
    if (this.selectedTab === 'active') {
      permits = permits.filter((p) =>
        ['submitted', 'under_review', 'approved'].includes(p.status)
      );
    } else if (this.selectedTab === 'draft') {
      permits = permits.filter((p) => p.status === 'draft');
    } else if (this.selectedTab === 'completed') {
      permits = permits.filter((p) => p.status === 'closed');
    }

    // Status filter
    if (this.filterStatus !== 'all') {
      permits = permits.filter((p) => p.status === this.filterStatus);
    }

    // Municipality filter
    if (this.filterMunicipality !== 'all') {
      permits = permits.filter(
        (p) => p.municipalityId?._id?.toString() === this.filterMunicipality
      );
    }

    // Search filter
    if (this.searchText) {
      const search = this.searchText.toLowerCase();
      permits = permits.filter(
        (p) =>
          p.permitNumber?.toLowerCase().includes(search) ||
          p.propertyAddress?.toLowerCase().includes(search) ||
          p.applicant?.name?.toLowerCase().includes(search) ||
          p.description?.toLowerCase().includes(search)
      );
    }

    // Sort
    permits = this.sortPermits(permits);

    // Add computed status badge to each permit
    permits = permits.map((p) => ({
      ...p,
      statusBadge: this.getStatusBadge(p.status),
    }));

    return permits;
  }

  sortPermits(permits) {
    const sorted = [...permits];

    switch (this.sortBy) {
      case 'date_desc':
        sorted.sort((a, b) => new Date(b.applicationDate) - new Date(a.applicationDate));
        break;
      case 'date_asc':
        sorted.sort((a, b) => new Date(a.applicationDate) - new Date(b.applicationDate));
        break;
      case 'status':
        sorted.sort((a, b) => a.status.localeCompare(b.status));
        break;
      case 'municipality':
        sorted.sort((a, b) =>
          (a.municipalityId?.name || '').localeCompare(b.municipalityId?.name || '')
        );
        break;
    }

    return sorted;
  }

  get hasFiltersApplied() {
    return (
      this.searchText ||
      this.filterStatus !== 'all' ||
      this.filterMunicipality !== 'all'
    );
  }

  // Helper to get status badge styling
  getStatusBadge(status) {
    const badges = {
      draft: { class: 'avitar-badge avitar-badge--secondary', text: 'Draft' },
      submitted: { class: 'avitar-badge avitar-badge--primary', text: 'Submitted' },
      under_review: { class: 'avitar-badge avitar-badge--info', text: 'Under Review' },
      approved: { class: 'avitar-badge avitar-badge--success', text: 'Approved' },
      denied: { class: 'avitar-badge avitar-badge--danger', text: 'Denied' },
      on_hold: { class: 'avitar-badge avitar-badge--warning', text: 'On Hold' },
      expired: { class: 'avitar-badge avitar-badge--danger', text: 'Expired' },
      closed: { class: 'avitar-badge avitar-badge--secondary', text: 'Closed' },
      cancelled: { class: 'avitar-badge avitar-badge--secondary', text: 'Cancelled' },
    };
    return badges[status] || { class: 'avitar-badge', text: status };
  }

  get isContractor() {
    return this.currentUser.user?.global_role === 'contractor';
  }

  @action
  selectTab(tab) {
    this.selectedTab = tab;
  }

  @action
  updateSearch(event) {
    this.searchText = event.target.value;
  }

  @action
  setFilterStatus(event) {
    this.filterStatus = event.target.value;
  }

  @action
  setFilterMunicipality(event) {
    this.filterMunicipality = event.target.value;
  }

  @action
  setSortBy(event) {
    this.sortBy = event.target.value;
  }

  @action
  clearFilters() {
    this.searchText = '';
    this.filterStatus = 'all';
    this.filterMunicipality = 'all';
  }

  @action
  viewPermit(permit) {
    // Navigate to municipal building permit detail route
    // Store that we came from contractor dashboard for breadcrumb
    sessionStorage.setItem('contractorDashboardReturn', 'true');

    const municipalityId = permit.municipalityId?._id || permit.municipalityId;
    this.router.transitionTo('municipality.building-permits.permit', municipalityId, permit._id);
  }

  @action
  createNewPermit() {
    this.router.transitionTo('my-permits.create');
  }

  @action
  refreshPermits() {
    // Reload the route
    this.send('refreshModel');
  }

  @action
  stopPropagation(event) {
    event.stopPropagation();
  }
}
