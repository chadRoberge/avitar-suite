import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class ContractorManagementGeneralController extends Controller {
  @service api;
  @service notifications;

  @tracked isEditing = false;
  @tracked isLoading = false;

  // Form data
  @tracked formData = {};

  get contractor() {
    return this.model.contractor;
  }

  get needsOnboarding() {
    return this.model.needsOnboarding || !this.contractor;
  }

  get canEdit() {
    return this.model.isOwner || this.contractor?.userHasPermission(this.model.user._id, 'manage_company_info');
  }

  @action
  enableEdit() {
    // Initialize form data with current contractor info
    this.formData = {
      company_name: this.contractor.company_name || '',
      license_number: this.contractor.license_number || '',
      license_state: this.contractor.license_state || '',
      license_type: this.contractor.license_type || '',
      license_expiration: this.contractor.license_expiration || '',
      business_info: {
        address: {
          street: this.contractor.business_info?.address?.street || '',
          city: this.contractor.business_info?.address?.city || '',
          state: this.contractor.business_info?.address?.state || '',
          zip: this.contractor.business_info?.address?.zip || '',
        },
        phone: this.contractor.business_info?.phone || '',
        email: this.contractor.business_info?.email || '',
        website: this.contractor.business_info?.website || '',
      },
      years_in_business: this.contractor.years_in_business || 0,
      employee_count: this.contractor.employee_count || 0,
      bonded: this.contractor.bonded || false,
    };
    this.isEditing = true;
  }

  @action
  cancelEdit() {
    this.isEditing = false;
    this.formData = {};
  }

  @action
  updateField(field, event) {
    this.formData[field] = event.target.value;
  }

  @action
  updateNestedField(parent, field, event) {
    if (parent === 'business_info.address') {
      this.formData.business_info.address[field] = event.target.value;
    } else if (parent === 'business_info') {
      this.formData.business_info[field] = event.target.value;
    }
  }

  @action
  updateCheckbox(field, event) {
    this.formData[field] = event.target.checked;
  }

  @action
  updateNumber(field, event) {
    this.formData[field] = parseInt(event.target.value) || 0;
  }

  @action
  async saveChanges() {
    // Validate required fields
    if (!this.formData.company_name || !this.formData.license_number || !this.formData.license_state) {
      this.notifications.error('Please fill in all required fields');
      return;
    }

    this.isLoading = true;

    try {
      await this.api.put(
        `/contractors/${this.contractor._id}`,
        this.formData
      );

      this.notifications.success('Company information updated successfully');
      this.isEditing = false;

      // Refresh the model
      this.send('refreshModel');
    } catch (error) {
      console.error('Error updating contractor:', error);
      this.notifications.error(
        error.message || 'Failed to update company information'
      );
    } finally {
      this.isLoading = false;
    }
  }
}
