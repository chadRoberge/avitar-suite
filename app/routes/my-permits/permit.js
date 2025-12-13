import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MyPermitsPermitRoute extends Route {
  @service('current-user') currentUser;
  @service('hybrid-api') hybridApi;
  @service notifications;
  @service router;

  async model(params) {
    try {
      const permitId = params.permit_id;

      // Load permit details using local-first strategy
      const permitResponse = await this.hybridApi.get(`/permits/${permitId}`);
      const permit = permitResponse;

      // Extract municipalityId - handle both string and ObjectId
      const municipalityId =
        permit.municipalityId?._id || permit.municipalityId;

      // Load all permit data in parallel using local-first strategy
      const [inspectionsResponse, filesResponse, commentsResponse] =
        await Promise.allSettled([
          this.hybridApi.get(`/permits/${permitId}/inspections`),
          this.hybridApi.get(`/permits/${permitId}/files`),
          this.hybridApi.get(
            `/municipalities/${municipalityId}/permits/${permitId}/comments`,
          ),
        ]);

      const inspections =
        inspectionsResponse.status === 'fulfilled'
          ? inspectionsResponse.value?.inspections || []
          : [];

      const files =
        filesResponse.status === 'fulfilled'
          ? filesResponse.value?.files || []
          : [];

      const comments =
        commentsResponse.status === 'fulfilled'
          ? commentsResponse.value?.comments || []
          : [];

      return {
        permit,
        inspections,
        files,
        comments,
        user: this.currentUser.user,
        isContractor: this.currentUser.isContractor,
      };
    } catch (error) {
      console.error('Error loading permit:', error);
      this.notifications.error('Failed to load permit details');
      this.router.transitionTo('my-permits');
      return {};
    }
  }
}
