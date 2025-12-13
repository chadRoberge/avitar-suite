import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MyPermitsPermitRoute extends Route {
  @service('current-user') currentUser;
  @service api;
  @service notifications;
  @service router;

  async model(params) {
    try {
      const permitId = params.permit_id;

      // Load permit details
      const permitResponse = await this.api.get(`/permits/${permitId}`);
      const permit = permitResponse;

      // Extract municipalityId - handle both string and ObjectId
      const municipalityId =
        permit.municipalityId?._id || permit.municipalityId;

      // Load inspections if any
      let inspections = [];
      try {
        const inspectionsResponse = await this.api.get(
          `/municipalities/${municipalityId}/permits/${permitId}/inspections`,
        );
        inspections = inspectionsResponse.inspections || [];
      } catch (error) {
        console.log('No inspections found or error loading:', error.message);
      }

      // Load documents/files
      let files = [];
      try {
        const filesResponse = await this.api.get(`/permits/${permitId}/files`);
        files = filesResponse.files || [];
      } catch (error) {
        console.log('No files found or error loading:', error.message);
      }

      // Load comments/communications
      let comments = [];
      try {
        const commentsResponse = await this.api.get(
          `/municipalities/${municipalityId}/permits/${permitId}/comments`,
        );
        comments = commentsResponse.comments || [];
      } catch (error) {
        console.log('No comments found or error loading:', error.message);
      }

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
