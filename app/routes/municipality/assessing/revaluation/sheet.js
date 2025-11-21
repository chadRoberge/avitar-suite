import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MunicipalityAssessingRevaluationSheetRoute extends Route {
  @service api;
  @service router;

  async model(params) {
    const parentModel = this.modelFor('municipality.assessing.revaluation');
    const { sheet_id } = params;

    try {
      // Always fetch fresh sheet data from API to ensure settings are up-to-date
      // (Don't use cached parent model data as it may be stale after edits)
      const sheetResponse = await this.api.get(
        `/revaluations/${parentModel.revaluation._id}/sheets/${sheet_id}`,
      );
      const sheet = sheetResponse.sheet;

      // Fetch sales for this sheet using the dedicated endpoint
      const salesResponse = await this.api.get(
        `/revaluations/${parentModel.revaluation._id}/sheets/${sheet_id}/sales`,
      );

      return {
        ...parentModel,
        sheet,
        sheetSales: salesResponse.sales || [],
      };
    } catch (error) {
      console.error('Error loading sheet:', error);
      // Redirect to index on error
      this.router.transitionTo('municipality.assessing.revaluation.index');
    }
  }

  setupController(controller, model) {
    super.setupController(controller, model);
    // Set current sheet ID in parent controller for sidebar highlighting
    const parentController = this.controllerFor('municipality.assessing.revaluation');
    parentController.currentSheetId = model.sheet._id;
  }

  resetController(controller, isExiting) {
    super.resetController(controller, isExiting);
    if (isExiting) {
      // Clear current sheet ID when leaving the route
      const parentController = this.controllerFor('municipality.assessing.revaluation');
      parentController.currentSheetId = null;
    }
  }
}
