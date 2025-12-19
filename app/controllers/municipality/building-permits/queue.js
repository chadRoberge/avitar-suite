import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class MunicipalityBuildingPermitsQueueController extends Controller {
  @service notifications;
  @service router;
  @service session;
  @service api;
  @service municipality;
  @service('current-user') currentUser;

  @tracked stats = {};
  @tracked myPermits = [];
  @tracked municipalityId = null;

  @action
  goToAllPermits() {
    this.router.transitionTo('municipality.building-permits.permits');
  }

  @action
  goToInspections() {
    this.router.transitionTo('municipality.building-permits.inspections');
  }

  @action
  goToMyAssignments() {
    // Navigate to all permits filtered by current user
    this.router.transitionTo('municipality.building-permits.permits');
  }

  @action
  viewPermit(permit) {
    this.router.transitionTo(
      'municipality.building-permits.permit',
      permit._id,
    );
  }

  @action
  refreshDashboard() {
    this.send('refreshRoute');
  }
}
