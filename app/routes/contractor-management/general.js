import Route from '@ember/routing/route';

export default class ContractorManagementGeneralRoute extends Route {
  model() {
    return this.modelFor('contractor-management');
  }
}
