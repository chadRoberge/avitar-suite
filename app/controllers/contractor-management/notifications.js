import Controller from '@ember/controller';
import { action } from '@ember/object';
import { service } from '@ember/service';

export default class ContractorManagementNotificationsController extends Controller {
  @service api;
  @service notifications;

  get contractor() {
    return this.model.contractor;
  }

  get currentPlan() {
    return this.contractor?.subscription?.plan || 'free';
  }

  @action
  async handleSave(settings) {
    // TODO: Implement API call to save notification preferences
    console.log('Saving contractor notification settings:', settings);

    // Uncomment when API is ready:
    // try {
    //   await this.api.put(`/contractors/${this.contractor._id}/notifications`, settings);
    //   this.notifications.success('Notification preferences updated');
    // } catch (error) {
    //   console.error('Failed to save notifications:', error);
    //   this.notifications.error('Failed to save notification preferences');
    // }
  }
}
