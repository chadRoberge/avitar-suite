import Route from '@ember/routing/route';

export default class ContractorManagementTeamRoute extends Route {
  model() {
    return this.modelFor('contractor-management');
  }
}
