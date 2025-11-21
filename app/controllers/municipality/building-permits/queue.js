import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class MunicipalityBuildingPermitsQueueController extends Controller {
  @service notifications;
  @service router;
  @service session;
  @service api;
  @service municipality;

  @tracked queue = [];
  @tracked needingAttention = [];
  @tracked expiringSoon = [];
  @tracked stats = {};
  @tracked myPermits = [];
  @tracked municipalityId = null;

  @tracked selectedTab = 'all'; // all, myPermits, needingAttention, expiringSoon
  @tracked filterStatus = 'all';
  @tracked filterType = 'all';
  @tracked searchText = '';
  @tracked sortBy = 'priority'; // priority, date, type, status

  // Print modal state
  @tracked showPrintModal = false;
  @tracked selectedPermit = null;

  // Filter and sorting options
  statusOptions = [
    { value: 'all', label: 'All Statuses' },
    { value: 'submitted', label: 'Submitted' },
    { value: 'under_review', label: 'Under Review' },
    { value: 'on_hold', label: 'On Hold' },
  ];

  typeOptions = [
    { value: 'all', label: 'All Types' },
    { value: 'building', label: 'Building' },
    { value: 'electrical', label: 'Electrical' },
    { value: 'plumbing', label: 'Plumbing' },
    { value: 'mechanical', label: 'Mechanical' },
    { value: 'demolition', label: 'Demolition' },
    { value: 'zoning', label: 'Zoning' },
  ];

  sortOptions = [
    { value: 'priority', label: 'Priority' },
    { value: 'date', label: 'Application Date' },
    { value: 'type', label: 'Type' },
    { value: 'status', label: 'Status' },
  ];

  get displayedPermits() {
    let permits = [];

    // Select the base list based on selected tab
    switch (this.selectedTab) {
      case 'myPermits':
        permits = this.myPermits;
        break;
      case 'needingAttention':
        permits = this.needingAttention;
        break;
      case 'expiringSoon':
        permits = this.expiringSoon;
        break;
      default:
        permits = this.queue;
    }

    // Apply filters
    if (this.filterStatus !== 'all') {
      permits = permits.filter((p) => p.status === this.filterStatus);
    }

    if (this.filterType !== 'all') {
      permits = permits.filter((p) => p.type === this.filterType);
    }

    // Apply search
    if (this.searchText) {
      const search = this.searchText.toLowerCase();
      permits = permits.filter(
        (p) =>
          p.permitNumber?.toLowerCase().includes(search) ||
          p.description?.toLowerCase().includes(search) ||
          p.applicant?.name?.toLowerCase().includes(search) ||
          p.propertyAddress?.toLowerCase().includes(search),
      );
    }

    // Apply sorting
    permits = this.sortPermits(permits);

    return permits;
  }

  sortPermits(permits) {
    return [...permits].sort((a, b) => {
      switch (this.sortBy) {
        case 'priority':
          // Sort by priority (descending), then by application date (ascending)
          if (b.priorityLevel !== a.priorityLevel) {
            return b.priorityLevel - a.priorityLevel;
          }
          return new Date(a.applicationDate) - new Date(b.applicationDate);

        case 'date':
          return new Date(b.applicationDate) - new Date(a.applicationDate);

        case 'type':
          return (a.type || '').localeCompare(b.type || '');

        case 'status':
          return (a.status || '').localeCompare(b.status || '');

        default:
          return 0;
      }
    });
  }

  get hasFiltersApplied() {
    return (
      this.filterStatus !== 'all' ||
      this.filterType !== 'all' ||
      this.searchText !== ''
    );
  }

  get tabStats() {
    return {
      all: this.queue?.length || 0,
      myPermits: this.myPermits?.length || 0,
      needingAttention: this.needingAttention?.length || 0,
      expiringSoon: this.expiringSoon?.length || 0,
    };
  }

  @action
  selectTab(tab) {
    this.selectedTab = tab;
  }

  @action
  setFilterStatus(event) {
    this.filterStatus = event.target.value;
  }

  @action
  setFilterType(event) {
    this.filterType = event.target.value;
  }

  @action
  setSortBy(event) {
    this.sortBy = event.target.value;
  }

  @action
  updateSearch(event) {
    this.searchText = event.target.value;
  }

  @action
  clearFilters() {
    this.filterStatus = 'all';
    this.filterType = 'all';
    this.searchText = '';
  }

  @action
  viewPermit(permit) {
    this.router.transitionTo('municipality.building-permits.permit', permit._id);
  }

  @action
  editPermit(permit) {
    this.router.transitionTo('municipality.building-permits.edit', permit._id);
  }

  @action
  async assignToMe(permit) {
    try {
      await this.api.put(
        `/municipalities/${this.municipalityId}/permits/${permit._id}`,
        {
          assignedInspector: this.session.currentUser.id,
        },
      );

      this.notifications.success('Permit assigned to you');

      // Refresh the route
      this.send('refreshRoute');
    } catch (error) {
      console.error('Error assigning permit:', error);
      this.notifications.error('Failed to assign permit');
    }
  }

  @action
  async updatePriority(permit, event) {
    const priorityLevel = event.target.value;
    try {
      await this.api.put(
        `/municipalities/${this.municipalityId}/permits/${permit._id}`,
        {
          priorityLevel: parseInt(priorityLevel),
        },
      );

      permit.priorityLevel = parseInt(priorityLevel);
      this.notifications.success('Priority updated');
    } catch (error) {
      console.error('Error updating priority:', error);
      this.notifications.error('Failed to update priority');
    }
  }

  @action
  createNewPermit() {
    this.router.transitionTo('municipality.building-permits.create');
  }

  @action
  refreshQueue() {
    this.send('refreshRoute');
  }

  @action
  stopPropagation(event) {
    event.stopPropagation();
  }

  @action
  async printPermit(permit) {
    // Load full permit data with inspections and property for printing
    try {
      const [permitData, inspections] = await Promise.all([
        this.api.get(`/municipalities/${this.municipalityId}/permits/${permit._id}`),
        this.api.get(`/municipalities/${this.municipalityId}/permits/${permit._id}/inspections`)
          .catch(() => ({ inspections: [] }))
      ]);

      // Load property data if propertyId exists
      let property = null;
      if (permitData.propertyId) {
        try {
          // Convert propertyId to string in case it's an ObjectId object
          const propertyId = typeof permitData.propertyId === 'object'
            ? permitData.propertyId._id || permitData.propertyId.toString()
            : permitData.propertyId;
          const propertyResponse = await this.api.get(`/properties/${propertyId}`);
          property = propertyResponse.property || propertyResponse;
        } catch (error) {
          console.warn('Could not load property data:', error);
        }
      }

      this.selectedPermit = {
        ...permitData,
        inspections: inspections.inspections || [],
        property: property
      };
      this.showPrintModal = true;
    } catch (error) {
      console.error('Error loading permit for printing:', error);
      this.notifications.error('Failed to load permit data');
    }
  }

  @action
  closePrintModal() {
    this.showPrintModal = false;
    this.selectedPermit = null;
  }

  @action
  triggerPrint() {
    window.print();
  }
}
