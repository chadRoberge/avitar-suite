import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';

export default class CitizenSettingsProfileController extends Controller {
  @service api;
  @service notifications;
  @service('current-user') currentUser;

  @tracked isLoading = false;
  @tracked isEditing = false;

  // Form fields
  @tracked firstName = '';
  @tracked lastName = '';
  @tracked email = '';
  @tracked phone = '';

  get user() {
    return this.model.user;
  }

  get isContractor() {
    return this.model.isContractor;
  }

  @action
  startEditing() {
    // Populate form fields with current values
    this.firstName = this.user.first_name || '';
    this.lastName = this.user.last_name || '';
    this.email = this.user.email || '';
    this.phone = this.user.phone || '';
    this.isEditing = true;
  }

  @action
  cancelEditing() {
    this.isEditing = false;
  }

  @action
  updateField(field, event) {
    this[field] = event.target.value;
  }

  @action
  async saveProfile() {
    this.isLoading = true;

    try {
      await this.api.put(`/users/${this.user._id}`, {
        first_name: this.firstName,
        last_name: this.lastName,
        email: this.email,
        phone: this.phone,
      });

      // Update current user data
      this.currentUser.user.first_name = this.firstName;
      this.currentUser.user.last_name = this.lastName;
      this.currentUser.user.email = this.email;
      this.currentUser.user.phone = this.phone;

      this.notifications.success('Profile updated successfully');
      this.isEditing = false;
    } catch (error) {
      console.error('Error updating profile:', error);
      this.notifications.error(error.message || 'Failed to update profile');
    } finally {
      this.isLoading = false;
    }
  }
}
