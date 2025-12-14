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
  @tracked _lastPropertyId = null;

  get selectedProperty() {
    const property = this.propertySelection.selectedProperty;

    // Auto-load permits when property changes
    if (property && property.id !== this._lastPropertyId) {
      this._lastPropertyId = property.id;
      this.property_id = property.id;
      this.loadPermitsForProperty(property.id);
    } else if (!property && this._lastPropertyId) {
      this._lastPropertyId = null;
      this.property_id = null;
      this.permits = [];
      this.projects = [];
    }

    return property;
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

  async loadPermitsForProperty(propertyId) {
    if (!propertyId) {
      this.permits = [];
      this.projects = [];
      return;
    }

    this.isLoadingPermits = true;
    const municipalityId = this.municipality.currentMunicipality?.id;

    try {
      // Load permits and projects for this property
      const [permitsResponse, projectsResponse] = await Promise.allSettled([
        this.hybridApi.get(
          `/municipalities/${municipalityId}/properties/${propertyId}/permits`,
        ),
        this.hybridApi.get(
          `/municipalities/${municipalityId}/properties/${propertyId}/projects`,
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
  viewPermit(permit) {
    if (permit.type === 'permit') {
      this.router.transitionTo('municipality.building-permits.permit', permit.id);
    } else {
      this.router.transitionTo('municipality.building-permits.project', permit.id);
    }
  }
}
