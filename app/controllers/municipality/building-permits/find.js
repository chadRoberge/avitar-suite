import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class MunicipalityBuildingPermitsFindController extends Controller {
  @service('hybrid-api') hybridApi;
  @service('current-user') currentUser;
  @service municipality;
  @service router;
  @service('property-selection') propertySelection;

  queryParams = ['property_id'];

  @tracked property_id = null;
  @tracked permits = [];
  @tracked projects = [];
  @tracked isLoadingPermits = false;

  get selectedProperty() {
    return this.propertySelection.selectedProperty;
  }

  @action
  onPropertyChanged(element, [property]) {
    // Called when property selection changes
    if (property) {
      this.property_id = property.id;
      this.loadPermitsForProperty(property.id);
    } else {
      this.property_id = null;
      this.permits = [];
      this.projects = [];
    }
  }

  get displayedPermitsAndProjects() {
    // Combine permits and projects, sort by newest first
    const combined = [
      ...this.permits.map((p) => ({ ...p, type: 'permit' })),
      ...this.projects.map((p) => ({ ...p, type: 'project' })),
    ];

    return combined.sort((a, b) => {
      const dateA = new Date(a.created_at || a.createdAt || 0);
      const dateB = new Date(b.created_at || b.createdAt || 0);
      return dateB - dateA; // Newest first
    });
  }

  async loadPermitsForProperty(propertyId) {
    if (!propertyId) {
      this.permits = [];
      this.projects = [];
      return;
    }

    this.isLoadingPermits = true;
    const municipalityId = this.municipality.currentMunicipality?.id;

    try {
      // Load permits for this property using query parameter
      // Note: Projects endpoint doesn't support propertyId filtering yet
      const [permitsResponse, projectsResponse] = await Promise.allSettled([
        this.hybridApi.get(
          `/municipalities/${municipalityId}/permits?propertyId=${propertyId}`,
        ),
        this.hybridApi.get(
          `/municipalities/${municipalityId}/projects?propertyId=${propertyId}`,
        ),
      ]);

      // Extract permits array from response, ensuring it's always an array
      if (permitsResponse.status === 'fulfilled') {
        const response = permitsResponse.value;
        this.permits = Array.isArray(response)
          ? response
          : Array.isArray(response?.permits)
            ? response.permits
            : [];
      } else {
        console.warn('Failed to load permits:', permitsResponse.reason);
        this.permits = [];
      }

      // Extract projects array from response, ensuring it's always an array
      if (projectsResponse.status === 'fulfilled') {
        const response = projectsResponse.value;
        this.projects = Array.isArray(response)
          ? response
          : Array.isArray(response?.projects)
            ? response.projects
            : [];
      } else {
        console.warn('Failed to load projects:', projectsResponse.reason);
        this.projects = [];
      }
    } catch (error) {
      console.error('Failed to load permits/projects:', error);
      this.permits = [];
      this.projects = [];
    } finally {
      this.isLoadingPermits = false;
    }
  }

  @action
  viewPermit(permit) {
    if (permit.type === 'permit') {
      this.router.transitionTo(
        'municipality.building-permits.permit',
        permit._id,
      );
    } else {
      this.router.transitionTo(
        'municipality.building-permits.project',
        permit._id,
      );
    }
  }
}
