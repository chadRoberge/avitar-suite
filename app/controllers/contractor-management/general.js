import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class ContractorManagementGeneralController extends Controller {
  @service api;
  @service notifications;
  @service router;

  @tracked isLoading = false;

  // Form data - initialized from route
  @tracked formData = {};

  get contractor() {
    return this.model.contractor;
  }

  get needsOnboarding() {
    return this.model.needsOnboarding || !this.contractor;
  }

  get canEdit() {
    // Owner always has permission
    if (this.model?.isOwner) {
      return true;
    }

    // Check if user is a member with manage_company_info permission
    if (!this.contractor?.members) {
      return false;
    }

    const member = this.contractor.members.find(
      (m) => m.user_id === this.model.user._id && m.is_active,
    );

    return member?.permissions?.includes('manage_company_info') || false;
  }

  // Check if form has unsaved changes
  get isDirty() {
    if (!this.contractor || !this.formData.company_name) {
      return false;
    }

    // Compare form data with original contractor data
    const hasChanges =
      this.formData.company_name !== (this.contractor.company_name || '') ||
      this.formData.license_number !== (this.contractor.license_number || '') ||
      this.formData.license_state !== (this.contractor.license_state || '') ||
      this.formData.license_type !== (this.contractor.license_type || '') ||
      this.formData.license_expiration !==
        this.formatDateForInput(this.contractor.license_expiration) ||
      this.formData.business_info?.address?.street !==
        (this.contractor.business_info?.address?.street || '') ||
      this.formData.business_info?.address?.city !==
        (this.contractor.business_info?.address?.city || '') ||
      this.formData.business_info?.address?.state !==
        (this.contractor.business_info?.address?.state || '') ||
      this.formData.business_info?.address?.zip !==
        (this.contractor.business_info?.address?.zip || '') ||
      this.formData.business_info?.phone !==
        (this.contractor.business_info?.phone || '') ||
      this.formData.business_info?.email !==
        (this.contractor.business_info?.email || '') ||
      this.formData.business_info?.website !==
        (this.contractor.business_info?.website || '') ||
      this.formData.years_in_business !==
        (this.contractor.years_in_business || 0) ||
      this.formData.employee_count !== (this.contractor.employee_count || 0) ||
      this.formData.bonded !== (this.contractor.bonded || false);

    return hasChanges;
  }

  // Helper to format date for HTML date input (YYYY-MM-DD)
  formatDateForInput(dateValue) {
    if (!dateValue) return '';

    // If it's already in YYYY-MM-DD format, return as-is
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
      return dateValue;
    }

    // Otherwise parse and format
    const date = new Date(dateValue);
    if (isNaN(date.getTime())) return '';

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  // Initialize form data from contractor
  initializeFormData() {
    if (!this.contractor) return;

    this.formData = {
      company_name: this.contractor.company_name || '',
      license_number: this.contractor.license_number || '',
      license_state: this.contractor.license_state || '',
      license_type: this.contractor.license_type || '',
      license_expiration: this.formatDateForInput(
        this.contractor.license_expiration,
      ),
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
  }

  @action
  undoChanges() {
    this.initializeFormData();
    this.notifications.info('Changes discarded');
  }

  @action
  updateField(field, event) {
    // Reassign entire object to trigger Glimmer reactivity
    this.formData = {
      ...this.formData,
      [field]: event.target.value,
    };
  }

  @action
  updateNestedField(parent, field, event) {
    const value = event.target.value;

    if (parent === 'business_info.address') {
      // Update nested address field
      this.formData = {
        ...this.formData,
        business_info: {
          ...this.formData.business_info,
          address: {
            ...this.formData.business_info.address,
            [field]: value,
          },
        },
      };
    } else if (parent === 'business_info') {
      // Update business_info field
      this.formData = {
        ...this.formData,
        business_info: {
          ...this.formData.business_info,
          [field]: value,
        },
      };
    }
  }

  @action
  updateCheckbox(field, event) {
    // Reassign entire object to trigger Glimmer reactivity
    this.formData = {
      ...this.formData,
      [field]: event.target.checked,
    };
  }

  @action
  updateNumber(field, event) {
    // Reassign entire object to trigger Glimmer reactivity
    this.formData = {
      ...this.formData,
      [field]: parseInt(event.target.value) || 0,
    };
  }

  @action
  async saveChanges() {
    if (!this.canEdit) {
      this.notifications.error(
        'You do not have permission to edit company information',
      );
      return;
    }

    // Validate required fields
    if (
      !this.formData.company_name ||
      !this.formData.license_number ||
      !this.formData.license_state
    ) {
      this.notifications.error('Please fill in all required fields');
      return;
    }

    this.isLoading = true;

    try {
      console.log('Saving contractor data:', this.formData);

      const response = await this.api.put(
        `/contractors/${this.contractor._id}`,
        this.formData,
      );

      console.log('Server response:', response);

      this.notifications.success('Company information updated successfully');

      // Update the model with the new data
      this.model.contractor = response.contractor;

      // Re-initialize form data to match saved data (clears dirty state)
      this.initializeFormData();
    } catch (error) {
      console.error('Error updating contractor:', error);
      this.notifications.error(
        error.message || 'Failed to update company information',
      );
    } finally {
      this.isLoading = false;
    }
  }
}
