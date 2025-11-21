import Route from '@ember/routing/route';

export default class MunicipalityAssessingRevaluationIndexRoute extends Route {
  model() {
    // Inherit model from parent revaluation route
    return this.modelFor('municipality.assessing.revaluation');
  }
}
