import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MunicipalityProfileRoute extends Route {
  @service('current-user') currentUser;
  @service api;

  async model() {
    const user = this.currentUser.user;

    // If user is a contractor, load contractor details
    let contractor = null;
    if (user?.contractor_id) {
      try {
        const response = await this.api.get(
          `/contractors/${user.contractor_id}`,
        );
        contractor = response.contractor;
      } catch (error) {
        console.error('Failed to load contractor details:', error);
      }
    }

    return {
      user,
      contractor,
      isContractor: this.currentUser.isContractor,
      isCitizen: this.currentUser.isCitizen,
    };
  }
}
