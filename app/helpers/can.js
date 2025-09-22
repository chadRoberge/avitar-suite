import Helper from '@ember/component/helper';
import { inject as service } from '@ember/service';
import { observer } from '@ember/object';

export default class CanHelper extends Helper {
  @service('current-user') currentUser;

  init() {
    super.init(...arguments);

    // Set up observers to recompute when user or permissions change
    this.currentUser.addObserver('user', this, this.recompute);
    this.currentUser.addObserver(
      'currentMunicipalPermissions',
      this,
      this.recompute,
    );
  }

  willDestroy() {
    // Clean up observers
    this.currentUser.removeObserver('user', this, this.recompute);
    this.currentUser.removeObserver(
      'currentMunicipalPermissions',
      this,
      this.recompute,
    );
    super.willDestroy();
  }

  compute([action, module]) {
    if (!this.currentUser || !this.currentUser.user) {
      return false;
    }

    switch (action) {
      case 'access-module':
        return this.currentUser.hasModuleAccess(module);
      case 'create':
      case 'read':
      case 'update':
      case 'delete':
      case 'approve':
      case 'inspect':
        return this.currentUser.hasModulePermission(module, action);
      default:
        return false;
    }
  }
}
