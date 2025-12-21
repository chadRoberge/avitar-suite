import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';

export default class CitizenSettingsPaymentMethodsController extends Controller {
  @service api;
  @service notifications;
  @service router;

  @tracked isLoading = false;
  @tracked showAddPaymentModal = false;

  get user() {
    return this.model.user;
  }

  get paymentMethods() {
    return this.model.paymentMethods || [];
  }

  get hasPaymentMethods() {
    return this.paymentMethods.length > 0;
  }

  @action
  openAddPaymentModal() {
    this.showAddPaymentModal = true;
  }

  @action
  closeAddPaymentModal() {
    this.showAddPaymentModal = false;
  }

  @action
  async handlePaymentMethodAdded(paymentMethod) {
    this.isLoading = true;

    try {
      await this.api.post(`/users/${this.user._id}/payment-methods`, {
        payment_method_id: paymentMethod.id,
      });

      this.notifications.success('Payment method added successfully');
      this.closeAddPaymentModal();
      this.send('refreshModel');
    } catch (error) {
      console.error('Error adding payment method:', error);
      this.notifications.error(error.message || 'Failed to add payment method');
    } finally {
      this.isLoading = false;
    }
  }

  @action
  async setDefaultPaymentMethod(paymentMethod) {
    this.isLoading = true;

    try {
      await this.api.put(
        `/users/${this.user._id}/payment-methods/${paymentMethod.id}/default`,
      );

      this.notifications.success('Default payment method updated');
      this.send('refreshModel');
    } catch (error) {
      console.error('Error setting default payment method:', error);
      this.notifications.error('Failed to update default payment method');
    } finally {
      this.isLoading = false;
    }
  }

  @action
  async removePaymentMethod(paymentMethod) {
    if (
      !confirm(
        'Are you sure you want to remove this payment method? This action cannot be undone.',
      )
    ) {
      return;
    }

    this.isLoading = true;

    try {
      await this.api.delete(
        `/users/${this.user._id}/payment-methods/${paymentMethod.id}`,
      );

      this.notifications.success('Payment method removed');
      this.send('refreshModel');
    } catch (error) {
      console.error('Error removing payment method:', error);
      this.notifications.error(
        error.message || 'Failed to remove payment method',
      );
    } finally {
      this.isLoading = false;
    }
  }
}
