import Route from '@ember/routing/route';

export default class ContractorManagementPaymentMethodsRoute extends Route {
  model() {
    return this.modelFor('contractor-management');
  }
}
