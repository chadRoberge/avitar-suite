import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class PrintInspectionBatchRoute extends Route {
  @service api;

  async model(params) {
    const { municipality_slug, batch_id } = params;

    try {
      // First, get the municipality info by slug
      const municipalityResponse = await this.api.get(
        `/municipalities/by-slug/${municipality_slug}`,
      );
      const municipality = municipalityResponse.municipality;
      const municipalityId = municipality.id || municipality._id;

      // Then get the batch details
      const batchResponse = await this.api.get(
        `/municipalities/${municipalityId}/inspection-issue-batches/${batch_id}`,
      );

      return {
        batch: batchResponse.batch,
        municipalityId,
        municipality,
      };
    } catch (error) {
      console.error('Error loading batch for printing:', error);
      throw error;
    }
  }
}
