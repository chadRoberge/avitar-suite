import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MyPermitsProjectRoute extends Route {
  @service api;
  @service('current-user') currentUser;
  @service router;
  @service notifications;

  async beforeModel() {
    // Only contractors and citizens can access
    if (!this.currentUser.isContractorOrCitizen) {
      this.router.transitionTo('municipality-select');
    }
  }

  async model(params) {
    try {
      // Fetch the project (which is a permit with isProject=true)
      const projectResponse = await this.api.get(
        `/permits/${params.project_id}`,
      );
      const project = projectResponse.permit;

      // Verify this is actually a project
      if (!project.isProject) {
        this.notifications.error('This is not a project');
        this.router.transitionTo('my-permits');
        return;
      }

      // Fetch all child permits for this project
      let childPermits = [];
      if (project.childPermits && project.childPermits.length > 0) {
        // Fetch each child permit
        const childPermitPromises = project.childPermits.map((childPermitId) =>
          this.api
            .get(`/permits/${childPermitId}`)
            .then((response) => response.permit),
        );
        childPermits = await Promise.all(childPermitPromises);
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

      return {
        project,
        childPermits,
        property,
      };
    } catch (error) {
      console.error('Error loading project:', error);
      this.notifications.error('Failed to load project details');
      this.router.transitionTo('my-permits');
    }
  }
}
