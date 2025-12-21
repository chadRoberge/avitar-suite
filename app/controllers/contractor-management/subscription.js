import Controller from '@ember/controller';
import { action } from '@ember/object';
import { service } from '@ember/service';

/**
 * Contractor Subscription Controller
 *
 * This controller now uses the Shared::SubscriptionManager component
 * for most subscription logic. It just provides the data and refresh action.
 */
export default class ContractorManagementSubscriptionController extends Controller {
  @service api;
  @service notifications;
  @service router;

  get contractor() {
    return this.model.contractor;
  }

  get needsOnboarding() {
    return this.model.needsOnboarding || !this.contractor;
  }

  get billingEmail() {
    return this.contractor?.owner_user_id?.email || '';
  }

  get billingName() {
    return this.contractor?.company_name || '';
  }

  @action
  async refreshModel() {
    // Refresh the route to reload subscription data from server
    await this.send('refreshModel');
  }
}
