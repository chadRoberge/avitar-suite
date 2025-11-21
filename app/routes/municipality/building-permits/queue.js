import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MunicipalityBuildingPermitsQueueRoute extends Route {
  @service session;
  @service('current-user') currentUser;
  @service municipality;
  @service notifications;
  @service router;
  @service api;

  async model() {
    try {
      const municipalityId = this.municipality.currentMunicipality?.id;

      if (!municipalityId) {
        throw new Error('No municipality selected');
      }

      // Fetch the permits queue from the backend using API service
      const queueData = await this.api.get(
        `/municipalities/${municipalityId}/permits/queue?assignedToMe=false`,
      );

      // Also fetch permits assigned to current user
      let myPermits = [];
      const userId = this.currentUser.user?._id || this.currentUser.user?.id;
      if (userId) {
        try {
          const myData = await this.api.get(
            `/municipalities/${municipalityId}/permits?assignedInspector=${userId}&status=under_review`,
          );
          myPermits = myData.permits || [];
        } catch (error) {
          // Silently fail if user permits can't be loaded
          console.warn('Could not load user permits:', error);
        }
      }

      return {
        queue: queueData.queue || [],
        needingAttention: queueData.needingAttention || [],
        expiringSoon: queueData.expiringSoon || [],
        stats: queueData.stats || {},
        myPermits,
        municipalityId,
      };
    } catch (error) {
      console.error('Error loading permits queue:', error);
      this.notifications.error('Failed to load permits queue');
      throw error;
    }
  }

  setupController(controller, model) {
    super.setupController(controller, model);
    controller.queue = model.queue;
    controller.needingAttention = model.needingAttention;
    controller.expiringSoon = model.expiringSoon;
    controller.stats = model.stats;
    controller.myPermits = model.myPermits;
    controller.municipalityId = model.municipalityId;
  }
}
