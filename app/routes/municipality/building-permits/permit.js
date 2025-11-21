import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MunicipalityBuildingPermitsPermitRoute extends Route {
  @service api;
  @service municipality;
  @service('current-user') currentUser;
  @service router;

  async model(params) {
    const { permit_id } = params;
    const municipalityId = this.municipality.currentMunicipality?.id;

    // Check if we came from contractor dashboard
    const fromContractorDashboard = sessionStorage.getItem('contractorDashboardReturn') === 'true';

    try {
      // Load permit with all related data
      const [permit, files, inspections, comments] = await Promise.all([
        this.api.get(`/municipalities/${municipalityId}/permits/${permit_id}`),
        this.api.get(`/municipalities/${municipalityId}/files?permitId=${permit_id}`),
        this.api.get(`/municipalities/${municipalityId}/permits/${permit_id}/inspections`).catch(() => ({ inspections: [] })),
        this.api.get(`/municipalities/${municipalityId}/permits/${permit_id}/comments`).catch(() => ({ comments: [] }))
      ]);

      // Load property data if propertyId exists
      let property = null;
      if (permit.propertyId) {
        try {
          // Convert propertyId to string in case it's an ObjectId object
          const propertyId = typeof permit.propertyId === 'object'
            ? permit.propertyId._id || permit.propertyId.toString()
            : permit.propertyId;
          const propertyResponse = await this.api.get(`/properties/${propertyId}`);
          property = propertyResponse.property || propertyResponse;
        } catch (error) {
          console.warn('Could not load property data for permit:', error);
        }
      }

      // Load municipality name for breadcrumb
      const municipality = this.municipality.currentMunicipality;

      return {
        permit: {
          ...permit,
          property: property
        },
        files: files.files || [],
        inspections: inspections.inspections || [],
        comments: comments.comments || [],
        municipalityId,
        permitId: permit_id,
        fromContractorDashboard,
        municipality: {
          id: municipality?.id,
          name: municipality?.name || 'Municipality'
        },
      };
    } catch (error) {
      console.error('Error loading permit:', error);
      this.router.transitionTo('municipality.building-permits.queue');
      throw error;
    }
  }

  setupController(controller, model) {
    super.setupController(controller, model);
    // Initialize tracked arrays
    controller.files = model.files || [];
    controller.comments = model.comments || [];
  }

  deactivate() {
    // Clear the contractor dashboard return flag when leaving this route
    sessionStorage.removeItem('contractorDashboardReturn');
  }

  beforeModel() {
    // Allow contractors to view their own permits
    if (this.currentUser.isContractor || this.currentUser.isCitizen) {
      return; // Skip module permission check for contractors/citizens
    }

    // For municipal staff, check module permissions
    if (!this.currentUser.hasModulePermission('buildingPermits', 'read')) {
      this.router.transitionTo('municipality.dashboard');
      throw new Error('You do not have permission to view building permits');
    }
  }
}
