import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MunicipalityBuildingPermitsSettingsProjectTypesRoute extends Route {
  @service api;
  @service municipality;
  @service notifications;
  @service('current-user') currentUser;

  async model() {
    try {
      const municipalityId = this.municipality.currentMunicipality?.id;

      if (!municipalityId) {
        throw new Error('No municipality selected');
      }

      // Fetch project types and permit types (needed for configuring default permits)
      const [projectTypesData, permitTypesData] = await Promise.all([
        this.api.get(
          `/municipalities/${municipalityId}/project-types?status=all`,
        ),
        this.api.get(
          `/municipalities/${municipalityId}/permit-types?status=active`,
        ),
      ]);

      return {
        projectTypes: projectTypesData.projectTypes || [],
        permitTypes: permitTypesData.permitTypes || [],
        municipalityId,
      };
    } catch (error) {
      console.error('Error loading project types:', error);
      this.notifications.error('Failed to load project types');
      return {
        projectTypes: [],
        permitTypes: [],
        municipalityId: this.municipality.currentMunicipality?.id,
      };
    }
  }

  setupController(controller, model) {
    super.setupController(controller, model);
    controller.projectTypes = model.projectTypes;
    controller.permitTypes = model.permitTypes;
    controller.municipalityId = model.municipalityId;
  }
}
