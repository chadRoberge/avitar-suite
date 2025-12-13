import Component from '@glimmer/component';
import { inject as service } from '@ember/service';
import { action } from '@ember/object';

export default class SharedAccessDeniedComponent extends Component {
  @service notifications;
  @service('current-user') currentUser;
  @service municipality;
  @service router;

  get canRequestAccess() {
    // Check if custom handler provided or if we should show default request button
    return this.args.canRequestAccess !== false;
  }

  @action
  async requestAccess() {
    if (this.args.onRequestAccess) {
      // Use custom handler if provided
      this.args.onRequestAccess();
      return;
    }

    // Default behavior: Create an access request
    try {
      const response = await fetch(
        `/api/municipalities/${this.municipality.currentMunicipality?.id}/access-requests`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${localStorage.getItem('authToken')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            moduleName: this.args.moduleName,
            requiredPermission: this.args.requiredPermission,
            requestedBy: this.currentUser.user._id,
            reason: `Requesting access to ${this.args.moduleName} module`,
          }),
        },
      );

      if (response.ok) {
        this.notifications.success(
          'Access request submitted. Your administrator will be notified.',
        );
      } else {
        // Fallback if API endpoint doesn't exist yet
        this.notifications.info(
          'Please contact your administrator to request access to this module.',
        );
      }
    } catch (error) {
      console.error('Error requesting access:', error);
      this.notifications.info(
        'Please contact your administrator to request access to this module.',
      );
    }
  }

  @action
  goBack() {
    if (this.args.onGoBack) {
      this.args.onGoBack();
    } else {
      this.router.transitionTo('municipality.dashboard');
    }
  }
}
