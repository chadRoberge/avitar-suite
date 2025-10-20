import AuthenticatedRoute from '../../authenticated';
import { inject as service } from '@ember/service';

export default class MunicipalityAssessingReportsRoute extends AuthenticatedRoute {
  @service api;
  @service municipality;
  @service router;

  async model() {
    try {
      const municipalityId = this.municipality.currentMunicipality?.id;

      if (!municipalityId) {
        throw new Error('No municipality selected');
      }

      // Load available reports for this municipality
      const response = await this.api.get(
        `/municipalities/${municipalityId}/assessing-reports`,
        { active_only: 'true' },
      );

      return {
        reports: response.reports || [],
        groupedReports: response.grouped || {},
        municipality: this.municipality.currentMunicipality,
        selectedReport: null,
        reportParameters: {},
        reportOutput: null,
        isGenerating: false,
      };
    } catch (error) {
      console.error('Failed to load assessing reports:', error);
      this.router.transitionTo('municipality.assessing');
    }
  }

  setupController(controller, model) {
    super.setupController(controller, model);
    controller.setupReports(model);
  }
}
