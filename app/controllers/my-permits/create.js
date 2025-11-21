import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class MyPermitsCreateController extends Controller {
  @service router;
  @service api;
  @service notifications;
  @service('current-user') currentUser;

  @tracked currentStep = 1;
  @tracked isLoading = false;
  @tracked selectedMunicipality = null;
  @tracked selectedProperty = null;
  @tracked selectedPermitType = null;
  @tracked permitTypes = [];
  @tracked properties = [];
  @tracked searchingProperties = false;
  @tracked propertySearchText = '';

  // Wizard steps
  get steps() {
    return [
      { number: 1, name: 'Municipality', icon: 'map-marker-alt' },
      { number: 2, name: 'Property', icon: 'home' },
      { number: 3, name: 'Permit Type', icon: 'file-alt' },
      { number: 4, name: 'Details', icon: 'edit' },
      { number: 5, name: 'Review', icon: 'check-circle' },
    ];
  }

  get canGoNext() {
    switch (this.currentStep) {
      case 1:
        return !!this.selectedMunicipality;
      case 2:
        return !!this.selectedProperty;
      case 3:
        return !!this.selectedPermitType;
      case 4:
        return this.validatePermitDetails();
      case 5:
        return true;
      default:
        return false;
    }
  }

  get canGoPrevious() {
    return this.currentStep > 1;
  }

  get isLastStep() {
    return this.currentStep === 5;
  }

  get progressPercentage() {
    return ((this.currentStep - 1) / 4) * 100;
  }

  validatePermitDetails() {
    const data = this.model.wizard.permitData;
    return !!(
      data.description &&
      data.description.trim().length > 0 &&
      data.estimatedValue >= 0
    );
  }

  @action
  async selectMunicipality(municipality) {
    this.selectedMunicipality = municipality;
    this.model.wizard.permitData.municipalityId = municipality.id;

    // Load permit types for this municipality
    try {
      const response = await this.api.get(
        `/municipalities/${municipality.id}/permit-types`
      );
      this.permitTypes = response.permitTypes || [];
    } catch (error) {
      console.error('Error loading permit types:', error);
      this.notifications.error('Failed to load permit types');
    }
  }

  @action
  async searchProperties(event) {
    event?.preventDefault();

    if (!this.propertySearchText || this.propertySearchText.length < 2) {
      this.notifications.warning('Please enter at least 2 characters to search');
      return;
    }

    this.searchingProperties = true;

    try {
      const response = await this.api.get(
        `/municipalities/${this.selectedMunicipality.id}/properties/search`,
        {
          q: this.propertySearchText,
          limit: 20,
        }
      );
      this.properties = response.properties || [];
    } catch (error) {
      console.error('Error searching properties:', error);
      this.notifications.error('Failed to search properties');
    } finally {
      this.searchingProperties = false;
    }
  }

  @action
  selectProperty(property) {
    this.selectedProperty = property;
    this.model.wizard.permitData.propertyId = property._id || property.id;
    this.model.wizard.permitData.pidFormatted = property.pidFormatted;
    this.model.wizard.permitData.propertyAddress = property.address;
  }

  @action
  selectPermitType(permitType) {
    this.selectedPermitType = permitType;
    this.model.wizard.permitData.permitTypeId = permitType._id || permitType.id;
    this.model.wizard.permitData.type = permitType.categories?.[0] || 'building';
  }

  @action
  updatePermitField(field, event) {
    this.model.wizard.permitData[field] = event.target.value;
  }

  @action
  updateApplicantField(field, event) {
    this.model.wizard.permitData.applicant[field] = event.target.value;
  }

  @action
  nextStep() {
    if (this.canGoNext && this.currentStep < 5) {
      this.currentStep++;
      window.scrollTo(0, 0);
    }
  }

  @action
  previousStep() {
    if (this.canGoPrevious) {
      this.currentStep--;
      window.scrollTo(0, 0);
    }
  }

  @action
  goToStep(stepNumber) {
    // Can only go to previous steps or current step
    if (stepNumber <= this.currentStep) {
      this.currentStep = stepNumber;
      window.scrollTo(0, 0);
    }
  }

  @action
  async submitPermit() {
    if (!this.validatePermitDetails()) {
      this.notifications.error('Please fill in all required fields');
      return;
    }

    this.isLoading = true;

    try {
      const permitData = {
        ...this.model.wizard.permitData,
        status: 'submitted', // Submit directly instead of saving as draft
        contractor_id: this.currentUser.user.contractor_id,
        submitted_by: this.currentUser.user._id,
        createdBy: this.currentUser.user._id,
      };

      const response = await this.api.post(
        `/municipalities/${this.selectedMunicipality.id}/permits`,
        permitData
      );

      this.notifications.success('Permit application submitted successfully!');

      // Redirect to permit detail or back to dashboard
      this.router.transitionTo('my-permits');
    } catch (error) {
      console.error('Error submitting permit:', error);
      this.notifications.error(
        error.message || 'Failed to submit permit application'
      );
    } finally {
      this.isLoading = false;
    }
  }

  @action
  async saveDraft() {
    this.isLoading = true;

    try {
      const permitData = {
        ...this.model.wizard.permitData,
        status: 'draft',
        contractor_id: this.currentUser.user.contractor_id,
        submitted_by: this.currentUser.user._id,
        createdBy: this.currentUser.user._id,
      };

      const response = await this.api.post(
        `/municipalities/${this.selectedMunicipality.id}/permits`,
        permitData
      );

      this.notifications.success('Permit saved as draft');
      this.router.transitionTo('my-permits');
    } catch (error) {
      console.error('Error saving draft:', error);
      this.notifications.error('Failed to save draft');
    } finally {
      this.isLoading = false;
    }
  }

  @action
  cancel() {
    if (confirm('Are you sure you want to cancel? All progress will be lost.')) {
      this.router.transitionTo('my-permits');
    }
  }

  @action
  updatePropertySearch(event) {
    this.propertySearchText = event.target.value;
  }
}
