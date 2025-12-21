import Route from '@ember/routing/route';
import { service } from '@ember/service';
import { action } from '@ember/object';

export default class MunicipalityBuildingPermitsSettingsCompanyRoute extends Route {
  @service api;
  @service('current-user') currentUser;
  @service router;

  async beforeModel() {
    // Only contractors can access company settings
    if (!this.currentUser.isContractor) {
      this.router.transitionTo(
        'municipality.building-permits.settings.account',
      );
      return;
    }
  }

  async model() {
    try {
      // Get contractor data
      const contractorId = this.currentUser.user?.contractor_id;
      let contractor = null;
      let isOwner = false;
      let needsOnboarding = false;

      if (contractorId) {
        try {
          const contractorResponse = await this.api.get(
            `/contractors/${contractorId}`,
          );
          contractor = contractorResponse.contractor;
          isOwner = contractor?.owner_user_id === this.currentUser.user._id;
        } catch (error) {
          console.warn('Could not load contractor data:', error);
          needsOnboarding = true;
        }
      } else {
        needsOnboarding = true;
      }

      return {
        contractor,
        user: this.currentUser.user,
        isOwner,
        needsOnboarding,
      };
    } catch (error) {
      console.error('Error loading company data:', error);
      return {
        contractor: null,
        user: this.currentUser.user,
        isOwner: false,
        needsOnboarding: true,
      };
    }
  }

  @action
  setupController(controller, model) {
    super.setupController(controller, model);
    controller.initializeFormData();
  }

  @action
  refreshModel() {
    this.refresh();
  }
}
