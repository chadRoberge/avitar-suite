import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MunicipalityBuildingPermitsProjectRoute extends Route {
  @service api;
  @service municipality;
  @service router;
  @service notifications;

  async model(params) {
    try {
      const municipalityId = this.municipality.currentMunicipality?.id;

      if (!municipalityId) {
        throw new Error('No municipality selected');
      }

      // Fetch the project (which is a permit with isProject=true)
      const projectResponse = await this.api.get(
        `/permits/${params.project_id}`,
      );
      const project = projectResponse.permit;

      // Verify this is actually a project
      if (!project.isProject) {
        this.notifications.error('This is not a project');
        this.router.transitionTo('municipality.building-permits.queue');
        return;
      }

      // Verify project belongs to this municipality
      if (project.municipalityId !== municipalityId) {
        this.notifications.error('Project not found in this municipality');
        this.router.transitionTo('municipality.building-permits.queue');
        return;
      }

      // Fetch all child permits for this project
      let childPermits = [];
      if (project.childPermits && project.childPermits.length > 0) {
        // Fetch each child permit
        const childPermitPromises = project.childPermits.map((childPermitId) =>
          this.api
            .get(`/permits/${childPermitId}`)
            .then((response) => response.permit)
            .catch((error) => {
              console.error(`Error loading permit ${childPermitId}:`, error);
              return null;
            }),
        );
        const results = await Promise.all(childPermitPromises);
        childPermits = results.filter((p) => p !== null);
      }

      // Fetch property details
      let property = null;
      if (project.propertyId) {
        try {
          const propertyResponse = await this.api.get(
            `/municipalities/${project.municipalityId}/properties/${project.propertyId}`,
          );
          property = propertyResponse.property;
        } catch (error) {
          console.error('Error loading property:', error);
        }
      }

      // Fetch project type details if available
      let projectType = null;
      if (project.projectTypeId) {
        try {
          const projectTypeResponse = await this.api.get(
            `/municipalities/${municipalityId}/project-types/${project.projectTypeId}`,
          );
          projectType = projectTypeResponse;
        } catch (error) {
          console.error('Error loading project type:', error);
        }
      }

      return {
        project,
        childPermits,
        property,
        projectType,
        municipalityId,
      };
    } catch (error) {
      console.error('Error loading project:', error);
      this.notifications.error('Failed to load project details');
      this.router.transitionTo('municipality.building-permits.queue');
    }
  }
}
