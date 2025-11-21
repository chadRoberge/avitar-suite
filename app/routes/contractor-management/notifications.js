import Route from '@ember/routing/route';

export default class ContractorManagementNotificationsRoute extends Route {
  model() {
    return this.modelFor('contractor-management');
  }
}
