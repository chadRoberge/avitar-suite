import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MunicipalityBuildingPermitsReviewRoute extends Route {
  @service api;
  @service router;
  @service('current-user') currentUser;

  async model(params) {
    try {
      const { permit_id, department_name } = params;
      const municipalitySlug = this.paramsFor('municipality').municipality_slug;

      // Fetch municipality to get ID
      const municipalityResponse = await this.api.get(
        `/municipalities/${municipalitySlug}`,
      );
      const municipalityId = municipalityResponse.municipality.id;

      // Fetch permit details
      const permit = await this.api.get(
        `/municipalities/${municipalityId}/permits/${permit_id}`,
      );

      // Find the specific department review
      const departmentReview = permit.departmentReviews?.find(
        (r) => r.department === department_name,
      );

      if (!departmentReview) {
        throw new Error(`No review found for department: ${department_name}`);
      }

      // Fetch permit comments (filter by department if needed)
      let comments = [];
      try {
        const commentsResponse = await this.api.get(
          `/municipalities/${municipalityId}/permits/${permit_id}/comments`,
        );
        comments = commentsResponse.comments || [];

        // Filter comments for this department only
        comments = comments.filter(
          (c) => c.department === department_name || !c.department,
        );
      } catch (error) {
        console.error('Failed to load comments:', error);
      }

      // Fetch permit documents
      let documents = [];
      try {
        const documentsResponse = await this.api.get(
          `/municipalities/${municipalityId}/files?permitId=${permit_id}`,
        );
        documents = documentsResponse.files || [];
      } catch (error) {
        console.error('Failed to load documents:', error);
      }

      // Track that user viewed this permit
      try {
        await this.api.post(`/permits/${permit_id}/view`);
      } catch (error) {
        console.error('Failed to track permit view:', error);
      }

      return {
        permit,
        departmentReview,
        departmentName: department_name,
        municipalityId,
        municipalitySlug,
        comments,
        documents,
      };
    } catch (error) {
      console.error('Error loading permit review:', error);
      this.router.transitionTo('municipality.building-permits.queue');
      throw error;
    }
  }
}
