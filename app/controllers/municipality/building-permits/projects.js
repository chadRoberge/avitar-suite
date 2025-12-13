import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';

export default class MunicipalityBuildingPermitsProjectsController extends Controller {
  @service router;
  @service api;
  @service notifications;
  @service municipality;

  @tracked projects = [];
  @tracked stats = {};
  @tracked municipalityId = null;

  // Filters
  @tracked searchText = '';
  @tracked filterStatus = 'all';
  @tracked filterType = 'all';
  @tracked sortBy = 'date_desc';

  // UI State
  @tracked selectedTab = 'all';

  get statusOptions() {
    return [
      { value: 'all', label: 'All Statuses' },
      { value: 'draft', label: 'Draft' },
      { value: 'submitted', label: 'Submitted' },
      { value: 'under_review', label: 'Under Review' },
      { value: 'approved', label: 'Approved' },
      { value: 'in_progress', label: 'In Progress' },
      { value: 'completed', label: 'Completed' },
      { value: 'on_hold', label: 'On Hold' },
      { value: 'rejected', label: 'Rejected' },
    ];
  }

  get sortOptions() {
    return [
      { value: 'date_desc', label: 'Newest First' },
      { value: 'date_asc', label: 'Oldest First' },
      { value: 'name_asc', label: 'Name A-Z' },
      { value: 'name_desc', label: 'Name Z-A' },
      { value: 'value_desc', label: 'Highest Value' },
      { value: 'value_asc', label: 'Lowest Value' },
    ];
  }

  get displayedProjects() {
    let projects = this.projects || [];

    // Filter by status
    if (this.filterStatus !== 'all') {
      projects = projects.filter((p) => p.status === this.filterStatus);
    }

    // Filter by search text
    if (this.searchText) {
      const search = this.searchText.toLowerCase();
      projects = projects.filter(
        (p) =>
          p.permitNumber?.toLowerCase().includes(search) ||
          p.projectName?.toLowerCase().includes(search) ||
          p.propertyId?.location?.address?.toLowerCase().includes(search) ||
          p.propertyId?.pid_formatted?.toLowerCase().includes(search),
      );
    }

    // Sort projects
    projects = this.sortProjects(projects);

    // Add computed display properties
    projects = projects.map((p) => ({
      ...p,
      statusBadge: this.getStatusBadge(p.status),
      typeIcon: p.projectTypeId?.icon || 'folder-open',
      typeDisplay: p.projectTypeId?.name || 'Unknown Type',
      propertyAddress: p.propertyId?.location?.address || 'Unknown',
      pidFormatted: p.propertyId?.pid_formatted || 'N/A',
      creatorName:
        p.createdBy?.first_name && p.createdBy?.last_name
          ? `${p.createdBy.first_name} ${p.createdBy.last_name}`
          : 'Unknown',
    }));

    return projects;
  }

  sortProjects(projects) {
    const sorted = [...projects];

    switch (this.sortBy) {
      case 'date_desc':
        return sorted.sort(
          (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
        );
      case 'date_asc':
        return sorted.sort(
          (a, b) => new Date(a.createdAt) - new Date(b.createdAt),
        );
      case 'name_asc':
        return sorted.sort((a, b) =>
          (a.projectName || '').localeCompare(b.projectName || ''),
        );
      case 'name_desc':
        return sorted.sort((a, b) =>
          (b.projectName || '').localeCompare(a.projectName || ''),
        );
      case 'value_desc':
        return sorted.sort(
          (a, b) => (b.estimatedValue || 0) - (a.estimatedValue || 0),
        );
      case 'value_asc':
        return sorted.sort(
          (a, b) => (a.estimatedValue || 0) - (b.estimatedValue || 0),
        );
      default:
        return sorted;
    }
  }

  getStatusBadge(status) {
    const badges = {
      draft: {
        class: 'avitar-badge avitar-badge--secondary',
        text: 'Draft',
      },
      submitted: {
        class: 'avitar-badge avitar-badge--primary',
        text: 'Submitted',
      },
      under_review: {
        class: 'avitar-badge avitar-badge--info',
        text: 'Under Review',
      },
      approved: {
        class: 'avitar-badge avitar-badge--success',
        text: 'Approved',
      },
      in_progress: {
        class: 'avitar-badge avitar-badge--info',
        text: 'In Progress',
      },
      completed: {
        class: 'avitar-badge avitar-badge--success',
        text: 'Completed',
      },
      on_hold: {
        class: 'avitar-badge avitar-badge--warning',
        text: 'On Hold',
      },
      rejected: {
        class: 'avitar-badge avitar-badge--danger',
        text: 'Rejected',
      },
    };
    return badges[status] || { class: 'avitar-badge', text: status };
  }

  get hasFiltersApplied() {
    return this.searchText || this.filterStatus !== 'all';
  }

  get tabStats() {
    return {
      all: this.stats.total || 0,
      active: this.stats.active || 0,
      completed: this.stats.completed || 0,
      onHold: this.stats.onHold || 0,
    };
  }

  @action
  selectTab(tab) {
    this.selectedTab = tab;

    // Update status filter based on tab
    if (tab === 'active') {
      this.filterStatus = 'in_progress';
    } else if (tab === 'completed') {
      this.filterStatus = 'completed';
    } else if (tab === 'onHold') {
      this.filterStatus = 'on_hold';
    } else {
      this.filterStatus = 'all';
    }
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
  setSortBy(event) {
    this.sortBy = event.target.value;
  }

  @action
  clearFilters() {
    this.searchText = '';
    this.filterStatus = 'all';
    this.filterType = 'all';
  }

  @action
  viewProject(project) {
    this.router.transitionTo(
      'municipality.building-permits.project',
      project._id,
    );
  }

  @action
  async refreshProjects() {
    try {
      const response = await this.api.get(
        `/municipalities/${this.municipalityId}/projects`,
      );

      this.projects = response.projects || [];
      this.stats = response.stats || {};

      this.notifications.success('Projects refreshed');
    } catch (error) {
      console.error('Error refreshing projects:', error);
      this.notifications.error('Failed to refresh projects');
    }
  }

  @action
  stopPropagation(event) {
    event.stopPropagation();
  }
}
