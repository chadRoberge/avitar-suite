import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MunicipalityBuildingPermitsSettingsUsersRoute extends Route {
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

      // Fetch users with building permits access for this municipality
      const usersResponse = await this.api.get(
        `/municipalities/${municipalityId}/users`,
        {
          module: 'building-permits',
        },
      );

      return {
        users: usersResponse.users || [],
        municipalityId,
        currentUser: this.currentUser.user,
      };
    } catch (error) {
      console.error('Error loading users:', error);
      this.notifications.error('Failed to load users');
      return {
        users: [],
        municipalityId: this.municipality.currentMunicipality?.id,
        currentUser: this.currentUser.user,
      };
    }
  }

  setupController(controller, model) {
    super.setupController(controller, model);
    controller.users = model.users;
    controller.municipalityId = model.municipalityId;
    controller.currentUser = model.currentUser;
  }
}
