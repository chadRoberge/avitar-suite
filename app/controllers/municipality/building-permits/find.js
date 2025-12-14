import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class MunicipalityBuildingPermitsFindController extends Controller {
  @service('hybrid-api') hybridApi;
  @service('current-user') currentUser;
  @service municipality;
  @service router;

  @tracked searchQuery = '';
  @tracked groupBy = 'pid'; // 'pid', 'street', or 'lastname'
  @tracked selectedProperty = null;
  @tracked permits = [];
  @tracked projects = [];
  @tracked isLoadingPermits = false;

  get filteredProperties() {
    const properties = this.model?.properties || [];
    const query = this.searchQuery.toLowerCase().trim();

    if (!query) {
      return properties;
    }

    return properties.filter((property) => {
      const pid = (property.pid || '').toLowerCase();
      const address = (property.address || '').toLowerCase();
      const owner = (property.owner || '').toLowerCase();

      return (
        pid.includes(query) ||
        address.includes(query) ||
        owner.includes(query)
      );
    });
  }

  get groupedProperties() {
    const properties = this.filteredProperties;
    const grouped = {};

    properties.forEach((property) => {
      let key;

      switch (this.groupBy) {
        case 'pid':
          // Group by map number (first part of PID)
          key = property.pid ? property.pid.split('-')[0] : 'Unknown';
          break;
        case 'street':
          // Group by street name
          if (property.address) {
            const parts = property.address.split(' ');
            key = parts.length > 1 ? parts.slice(1).join(' ') : 'Unknown/Vacant';
          } else {
            key = 'Unknown/Vacant';
          }
          break;
        case 'lastname':
          // Group by owner last name initial
          if (property.owner) {
            key = property.owner.charAt(0).toUpperCase();
          } else {
            key = 'Unknown';
          }
          break;
        default:
          key = 'Unknown';
      }

      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(property);
    });

    return grouped;
  }

  get displayedPermitsAndProjects() {
    // Combine permits and projects, sort by newest first
    const combined = [
      ...this.permits.map(p => ({ ...p, type: 'permit' })),
      ...this.projects.map(p => ({ ...p, type: 'project' })),
    ];

    return combined.sort((a, b) => {
      const dateA = new Date(a.created_at || a.createdAt || 0);
      const dateB = new Date(b.created_at || b.createdAt || 0);
      return dateB - dateA; // Newest first
    });
  }

  @action
  updateSearchQuery(event) {
    this.searchQuery = event.target.value;
  }

  @action
  updateGroupBy(event) {
    this.groupBy = event.target.value;
  }

  @action
  getDisplayName(property) {
    return property.address || property.pid || 'Unknown Property';
  }

  @action
  getSecondaryInfo(property) {
    return property.owner || 'No owner information';
  }

  @action
  async selectProperty(property) {
    this.selectedProperty = property;
    this.isLoadingPermits = true;

    const municipalityId = this.municipality.currentMunicipality?.id;

    try {
      // Load permits and projects for this property
      const [permitsResponse, projectsResponse] = await Promise.allSettled([
        this.hybridApi.get(
          `/municipalities/${municipalityId}/properties/${property.id}/permits`,
        ),
        this.hybridApi.get(
          `/municipalities/${municipalityId}/properties/${property.id}/projects`,
        ),
      ]);

      this.permits = permitsResponse.status === 'fulfilled'
        ? (permitsResponse.value.permits || permitsResponse.value || [])
        : [];

      this.projects = projectsResponse.status === 'fulfilled'
        ? (projectsResponse.value.projects || projectsResponse.value || [])
        : [];
    } catch (error) {
      console.error('Failed to load permits/projects:', error);
      this.permits = [];
      this.projects = [];
    } finally {
      this.isLoadingPermits = false;
    }
  }

  @action
  backToProperties() {
    this.selectedProperty = null;
    this.permits = [];
    this.projects = [];
  }

  @action
  viewPermit(permit) {
    if (permit.type === 'permit') {
      this.router.transitionTo('municipality.building-permits.permit', permit.id);
    } else {
      this.router.transitionTo('municipality.building-permits.project', permit.id);
    }
  }
}
