import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class ContractorManagementRoute extends Route {
  @service('current-user') currentUser;
  @service api;
  @service router;

  async beforeModel() {
    // Only contractors can access this route
    if (!this.currentUser.isContractor) {
      this.router.transitionTo('login');
      return;
    }
  }

  async model() {
    try {
      const contractorId = this.currentUser.user.contractor_id;

      // If contractor doesn't have a contractor_id yet, return a stub model
      if (!contractorId) {
        return {
          contractor: null,
          user: this.currentUser.user,
          isOwner: true,
          needsOnboarding: true,
        };
      }

      const response = await this.api.get(`/contractors/${contractorId}`);

      // Handle owner_user_id being either a string or a populated object
      const ownerId =
        typeof response.contractor.owner_user_id === 'object'
          ? response.contractor.owner_user_id?._id
          : response.contractor.owner_user_id;

      return {
        contractor: response.contractor,
        user: this.currentUser.user,
        isOwner: ownerId === this.currentUser.user._id,
        needsOnboarding: false,
      };
    } catch (error) {
      console.error('Error loading contractor:', error);
      // If contractor not found, return stub model for onboarding
      return {
        contractor: null,
        user: this.currentUser.user,
        isOwner: true,
        needsOnboarding: true,
      };
    }
  }
}
