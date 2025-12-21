import Component from '@glimmer/component';
import { inject as service } from '@ember/service';

export default class BuildingPermitsSettingsMenuComponent extends Component {
  @service('current-user') currentUser;
  @service api;

  get isResidentialUser() {
    return this.currentUser.isContractorOrCitizen;
  }

  get isContractor() {
    return this.currentUser.isContractor;
  }

  get user() {
    return this.currentUser.user;
  }
}
