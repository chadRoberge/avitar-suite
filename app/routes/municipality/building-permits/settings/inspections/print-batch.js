import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MunicipalityBuildingPermitsSettingsInspectionsPrintBatchRoute extends Route {
  @service api;

  async model(params) {
    const { batch_id } = params;

    // Get municipality_slug from parent route params
    const parentParams = this.paramsFor('municipality');
    const { municipality_slug } = parentParams;

    try {
      // First, get the municipality info by slug
      const municipalityResponse = await this.api.get(
        `/municipalities/slug/${municipality_slug}`,
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
