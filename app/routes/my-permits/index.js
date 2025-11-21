import Route from '@ember/routing/route';

export default class MyPermitsIndexRoute extends Route {
  // Use parent route's model
  model() {
    return this.modelFor('my-permits');
  }
}
