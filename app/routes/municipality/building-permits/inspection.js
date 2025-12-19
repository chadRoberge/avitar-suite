import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MunicipalityBuildingPermitsInspectionRoute extends Route {
  @service municipality;
  @service api;

  async model(params) {
    const municipalityId = this.municipality.currentMunicipality?.id;
    const { inspection_id } = params;

    // Fetch inspection and linked issues in parallel
    const [inspectionResponse, issuesResponse] = await Promise.all([
      this.api.get(
        `/municipalities/${municipalityId}/inspections/${inspection_id}`,
      ),
      this.api
        .get(
          `/municipalities/${municipalityId}/inspections/${inspection_id}/issues`,
        )
        .catch(() => ({ issues: [] })), // Gracefully handle if no issues
    ]);

    return {
      inspection: inspectionResponse.inspection,
      linkedIssues: issuesResponse.issues || [],
      municipalityId,
    };
  }
}
