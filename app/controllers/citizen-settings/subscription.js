import Controller from '@ember/controller';
import { action } from '@ember/object';
import { service } from '@ember/service';

/**
 * Citizen Subscription Controller
 *
 * This controller uses the Shared::SubscriptionManager component
 * for subscription logic. It just provides the data and refresh action.
 */
export default class CitizenSettingsSubscriptionController extends Controller {
  @service api;
  @service notifications;
  @service router;

  get user() {
    return this.model.user;
  }

  get needsOnboarding() {
    return this.model.needsOnboarding || false;
  }

  get billingEmail() {
    return this.user?.email || '';
  }

  get billingName() {
    return `${this.user?.first_name || ''} ${this.user?.last_name || ''}`.trim();
  }

  @action
  async refreshModel() {
    // Refresh the route to reload subscription data from server
    await this.send('refreshModel');
  }
}
