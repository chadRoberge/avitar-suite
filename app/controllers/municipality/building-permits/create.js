import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class MunicipalityBuildingPermitsCreateController extends Controller {
  @service notifications;
  @service router;
  @service session;
  @service('current-user') currentUser;
  @service store;
  @service api;

  @tracked permit = null;
  @tracked municipalityId = null;
  @tracked isSubmitting = false;
  @tracked isSaving = false;

  // Step progression
  @tracked currentStep = 1;

  // Form state
  @tracked selectedPermitType = null;
  @tracked selectedProperty = null;
  @tracked propertySearchText = '';
  @tracked propertySearchResults = [];
  @tracked isSearchingProperty = false;
  @tracked selectedCard = null;
  @tracked uploadedDocuments = [];

  // Property documents
  @tracked propertyDocuments = [];
  @tracked isLoadingPropertyDocuments = false;

  // Validation
  @tracked errors = {};

  // Permit types will be loaded from API
  @tracked permitTypes = [];
  @tracked isLoadingPermitTypes = false;

  relationshipOptions = [
    { value: 'owner', label: 'Property Owner' },
    { value: 'tenant', label: 'Tenant' },
    { value: 'contractor', label: 'Contractor' },
    { value: 'agent', label: 'Authorized Agent' },
    { value: 'other', label: 'Other' },
  ];

  resetForm() {
    this.currentStep = 1;
    this.selectedPermitType = null;
    this.selectedProperty = null;
    this.propertySearchText = '';
    this.propertySearchResults = [];
    this.selectedCard = null;
    this.uploadedDocuments = [];
    this.errors = {};

    // Initialize nested objects in permit
    if (this.permit) {
      if (!this.permit.customFields) {
        this.permit.customFields = {};
      }
      if (!this.permit.applicant) {
        this.permit.applicant = {};
      }
      if (!this.permit.contractor) {
        this.permit.contractor = {};
      }
    }
  }

  get stepTitle() {
    const titles = {
      1: 'Select Permit Type',
      2: 'Project Details',
      3: 'Applicant Information',
      4: 'Document Upload',
      5: 'Review & Submit',
    };
    return titles[this.currentStep] || '';
  }

  get canGoNext() {
    return this.currentStep < 5;
  }

  get canGoBack() {
    return this.currentStep > 1;
  }

  get isLastStep() {
    return this.currentStep === 5;
  }

  get canSubmit() {
    return (
      this.selectedPermitType &&
      this.selectedProperty &&
      this.permit.description &&
      this.permit.applicant?.name &&
      this.permit.applicant?.email &&
      this.permit.estimatedValue >= 0
    );
  }

  get calculatedFee() {
    if (!this.selectedPermitType || !this.selectedPermitType.feeSchedule) {
      return 0;
    }

    const schedule = this.selectedPermitType.feeSchedule;
    const base = parseFloat(schedule.baseAmount) || 0;

    switch (schedule.calculationType) {
      case 'flat':
        return base;
      case 'per_sqft':
        const sqft = parseFloat(this.permit.squareFootage) || 0;
        const rate = parseFloat(schedule.perSqftRate) || 0;
        return base + sqft * rate;
      case 'percentage':
        const value = parseFloat(this.permit.estimatedValue) || 0;
        return value * (base / 100);
      case 'custom':
        // Would need to evaluate formula
        return base;
      default:
        return base;
    }
  }

  @action
  async loadPermitTypes() {
    this.isLoadingPermitTypes = true;
    try {
      const response = await this.api.get(
        `/municipalities/${this.municipalityId}/permit-types?status=active`,
      );
      this.permitTypes = response.permitTypes || [];
    } catch (error) {
      console.error('Error loading permit types:', error);
      this.notifications.error('Failed to load permit types');
    } finally {
      this.isLoadingPermitTypes = false;
    }
  }

  @action
  goToStep(stepNum) {
    if (stepNum >= 1 && stepNum <= 6) {
      this.currentStep = stepNum;
    }
  }

  @action
  nextStep() {
    if (this.validateCurrentStep()) {
      if (this.canGoNext) {
        this.currentStep++;
      }
    }
  }

  @action
  previousStep() {
    if (this.canGoBack) {
      this.currentStep--;
    }
  }

  @action
  selectPermitType(permitType) {
    this.selectedPermitType = permitType;
    this.permit.permitTypeId = permitType._id;
    this.permit.type = permitType.category || 'building';
    this.permit.subtype = permitType.name;
    this.errors.permitType = null;

    // Trigger reactivity by reassigning
    this.permit = { ...this.permit };

    // Debug: log the custom fields
    console.log('Selected permit type:', permitType.name);
    console.log('Custom fields:', permitType.customFormFields);
  }

  @action
  async searchProperties(event) {
    const searchText = event.target.value;
    if (!searchText || searchText.length < 2) {
      this.propertySearchResults = [];
      this.propertySearchText = searchText;
      return;
    }

    this.isSearchingProperty = true;
    this.propertySearchText = searchText;

    try {
      const data = await this.api.get(
        `/municipalities/${this.municipalityId}/properties/search?q=${encodeURIComponent(searchText)}`,
      );
      this.propertySearchResults = data.properties || [];
    } catch (error) {
      console.error('Property search error:', error);
    } finally {
      this.isSearchingProperty = false;
    }
  }

  @action
  async selectProperty(property) {
    console.log('Selected property:', property);

    // Property ID might be in _id or id field depending on the API response
    const propertyId = property._id || property.id;
    console.log('Property ID:', propertyId);

    this.selectedProperty = property;
    this.permit.propertyId = propertyId;
    this.permit.pidRaw = property.pid_raw;
    this.permit.pidFormatted = property.pid_formatted;
    this.permit.propertyAddress = property.location?.address || '';

    // Set location if available
    if (property.location?.coordinates) {
      this.permit.location = {
        type: 'Point',
        coordinates: property.location.coordinates,
      };
    }

    // Clear search
    this.propertySearchResults = [];
    this.propertySearchText = '';

    // Load property owner info if available
    if (property.owners?.primary) {
      const owner = property.owners.primary;
      if (!this.permit.applicant) {
        this.permit.applicant = {};
      }
      this.permit.applicant.name = owner.primary_name || '';
      this.permit.applicant.email = owner.email || '';
      this.permit.applicant.phone = owner.phone || '';
      this.permit.applicant.address = owner.mailing_address || '';
      this.permit.applicant.relationshipToProperty = 'owner';
    }

    this.errors.property = null;

    // Trigger reactivity by reassigning the permit object
    this.permit = {
      ...this.permit,
      applicant: this.permit.applicant ? { ...this.permit.applicant } : {},
      location: this.permit.location ? { ...this.permit.location } : undefined,
    };

    // Load property documents
    console.log('Loading documents for property ID:', propertyId);
    await this.loadPropertyDocuments(propertyId);
  }

  @action
  async loadPropertyDocuments(propertyId) {
    // Don't try to load if no property ID
    if (!propertyId) {
      this.propertyDocuments = [];
      return;
    }

    this.isLoadingPropertyDocuments = true;
    try {
      const response = await this.api.get(
        `/municipalities/${this.municipalityId}/files?propertyId=${propertyId}`,
      );
      this.propertyDocuments = response.files || [];
    } catch (error) {
      console.error('Error loading property documents:', error);
      this.propertyDocuments = [];
    } finally {
      this.isLoadingPropertyDocuments = false;
    }
  }

  @action
  async downloadDocument(fileId) {
    try {
      // Open download URL in new window
      window.open(`/api/files/${fileId}/download`, '_blank');
    } catch (error) {
      console.error('Error downloading document:', error);
      this.notifications.error('Failed to download document');
    }
  }

  @action
  formatFileSize(bytes) {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

  @action
  formatDate(date) {
    if (!date) return '';
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  @action
  selectCard(event) {
    const cardNumber = event.target.value;
    this.selectedCard = cardNumber;
    this.permit.cardNumber = cardNumber;
    // Trigger reactivity by reassigning
    this.permit = { ...this.permit };
  }

  @action
  updateDescription(event) {
    this.permit.description = event.target.value;
    // Trigger reactivity by reassigning
    this.permit = { ...this.permit };
  }

  @action
  updateScopeOfWork(event) {
    this.permit.scopeOfWork = event.target.value;
    // Trigger reactivity by reassigning
    this.permit = { ...this.permit };
  }

  @action
  updateEstimatedValue(event) {
    this.permit.estimatedValue = event.target.value;
    // Trigger reactivity by reassigning
    this.permit = { ...this.permit };
  }

  @action
  updateSquareFootage(event) {
    this.permit.squareFootage = event.target.value;
    // Trigger reactivity by reassigning
    this.permit = { ...this.permit };
  }

  @action
  updateApplicantField(field, event) {
    if (!this.permit.applicant) {
      this.permit.applicant = {};
    }
    this.permit.applicant[field] = event.target.value;
    // Trigger reactivity by reassigning the permit object
    this.permit = { ...this.permit, applicant: { ...this.permit.applicant } };
  }

  @action
  updateContractorField(field, event) {
    if (!this.permit.contractor) {
      this.permit.contractor = {};
    }
    this.permit.contractor[field] = event.target.value;
    // Trigger reactivity by reassigning the permit object
    this.permit = { ...this.permit, contractor: { ...this.permit.contractor } };
  }

  formatFileTypes(fileTypes) {
    if (!fileTypes || !Array.isArray(fileTypes)) {
      return '';
    }
    return fileTypes.map((type) => `.${type}`).join(',');
  }

  @action
  handleFileUpload(documentType, event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    // Store files temporarily to be uploaded after permit is saved
    if (!this.pendingFiles) {
      this.pendingFiles = [];
    }

    for (const file of files) {
      this.pendingFiles.push({
        file,
        documentType,
        fileName: file.name,
      });
    }

    this.notifications.info(
      `${files.length} file(s) ready to upload with permit`,
    );
  }

  async uploadPendingFiles(savedPermit) {
    if (!this.pendingFiles || this.pendingFiles.length === 0) {
      return;
    }

    const isProject = savedPermit.isProject;
    const permitId = savedPermit._id;
    const projectId = isProject ? permitId : null;
    const projectName = isProject ? savedPermit.projectName : null;

    for (const pending of this.pendingFiles) {
      try {
        const formData = new FormData();
        formData.append('file', pending.file);
        formData.append(
          'propertyId',
          this.selectedProperty?._id || this.selectedProperty?.id,
        );
        formData.append('department', 'building_permit');
        formData.append('category', pending.documentType);
        formData.append('displayName', pending.fileName);
        formData.append('description', `Document for ${pending.documentType}`);
        formData.append('visibility', 'private');

        // Add permit/project references
        formData.append('permitId', permitId);
        formData.append('permitNumber', savedPermit.permitNumber || '');

        if (isProject) {
          formData.append('isProjectFile', 'true');
          formData.append('projectId', projectId);
          formData.append('projectName', projectName);
        }

        await this.api.upload(
          `/municipalities/${this.municipalityId}/files/upload`,
          formData,
        );

        this.notifications.success(`${pending.fileName} uploaded successfully`);
      } catch (error) {
        console.error('Error uploading file:', error);
        this.notifications.error(`Failed to upload ${pending.fileName}`);
      }
    }

    // Clear pending files
    this.pendingFiles = [];
  }

  @action
  updateCustomField(fieldId, event) {
    if (!this.permit.customFields) {
      this.permit.customFields = {};
    }
    this.permit.customFields[fieldId] = event.target.value;
    // Trigger reactivity - must update both customFields AND permit
    this.permit = {
      ...this.permit,
      customFields: { ...this.permit.customFields },
    };
  }

  @action
  updateCustomFieldCheckbox(fieldId, option, event) {
    if (!this.permit.customFields) {
      this.permit.customFields = {};
    }

    // Initialize as array if not already
    if (!Array.isArray(this.permit.customFields[fieldId])) {
      this.permit.customFields[fieldId] = [];
    }

    const values = [...this.permit.customFields[fieldId]];

    if (event.target.checked) {
      // Add option if checked
      if (!values.includes(option)) {
        values.push(option);
      }
    } else {
      // Remove option if unchecked
      const index = values.indexOf(option);
      if (index > -1) {
        values.splice(index, 1);
      }
    }

    this.permit.customFields[fieldId] = values;
    // Trigger reactivity - must update both customFields AND permit
    this.permit = {
      ...this.permit,
      customFields: { ...this.permit.customFields },
    };
  }

  validateCurrentStep() {
    this.errors = {};
    let isValid = true;

    switch (this.currentStep) {
      case 1: // Permit Type
        if (!this.selectedPermitType) {
          this.errors.permitType = 'Please select a permit type';
          isValid = false;
        }
        break;

      case 2: // Project Details
        if (!this.permit.description) {
          this.errors.description = 'Description is required';
          isValid = false;
        }
        if (
          this.permit.estimatedValue === null ||
          this.permit.estimatedValue === undefined ||
          this.permit.estimatedValue < 0
        ) {
          this.errors.estimatedValue = 'Estimated value is required';
          isValid = false;
        }

        // Validate required custom fields
        if (this.selectedPermitType?.customFormFields?.length > 0) {
          this.selectedPermitType.customFormFields.forEach((field) => {
            if (field.required) {
              const value = this.permit.customFields?.[field.id];
              const isEmpty =
                value === null ||
                value === undefined ||
                value === '' ||
                (Array.isArray(value) && value.length === 0);

              if (isEmpty) {
                this.errors[`customField_${field.id}`] =
                  `${field.label} is required`;
                isValid = false;
              }
            }
          });
        }
        break;

      case 3: // Applicant
        if (!this.permit.applicant?.name) {
          this.errors.applicantName = 'Applicant name is required';
          isValid = false;
        }
        if (!this.permit.applicant?.email) {
          this.errors.applicantEmail = 'Applicant email is required';
          isValid = false;
        }
        break;

      case 4: // Documents
        // Check if required documents are uploaded
        if (this.selectedPermitType?.requiredDocuments?.length > 0) {
          const missingDocs = this.selectedPermitType.requiredDocuments.filter(
            (doc) =>
              !this.uploadedDocuments.some(
                (uploaded) => uploaded.type === doc.name,
              ),
          );
          if (missingDocs.length > 0) {
            this.errors.documents = `Missing required documents: ${missingDocs.map((d) => d.name).join(', ')}`;
            // Allow proceeding but show warning
          }
        }
        break;
    }

    if (!isValid) {
      this.notifications.error('Please correct the errors before continuing');
    }

    return isValid;
  }

  @action
  async submitPermit() {
    if (!this.canSubmit) {
      this.notifications.error('Please complete all required fields');
      return;
    }

    this.isSubmitting = true;

    try {
      // Save via API
      const savedPermit = await this.api.post(
        `/municipalities/${this.municipalityId}/permits`,
        {
          ...this.getPermitData(),
          status: 'submitted',
        },
      );

      // Upload any pending files
      await this.uploadPendingFiles(savedPermit);

      this.notifications.success('Permit submitted successfully');
      this.router.transitionTo(
        'municipality.building-permits.permit',
        savedPermit._id,
      );
    } catch (error) {
      console.error('Error submitting permit:', error);
      this.notifications.error(error.message || 'Failed to submit permit');
    } finally {
      this.isSubmitting = false;
    }
  }

  @action
  async saveDraft() {
    this.isSaving = true;

    try {
      const savedPermit = await this.api.post(
        `/municipalities/${this.municipalityId}/permits`,
        {
          ...this.getPermitData(),
          status: 'draft',
        },
      );

      // Upload any pending files
      await this.uploadPendingFiles(savedPermit);

      this.notifications.success('Permit saved as draft');
      this.router.transitionTo(
        'municipality.building-permits.edit',
        savedPermit._id,
      );
    } catch (error) {
      console.error('Error saving permit:', error);
      this.notifications.error('Failed to save permit');
    } finally {
      this.isSaving = false;
    }
  }

  getPermitData() {
    return {
      municipalityId: this.municipalityId,
      permitTypeId: this.selectedPermitType?._id,
      type: this.selectedPermitType?.category || 'building',
      subtype: this.selectedPermitType?.name,
      propertyId: this.selectedProperty?._id || this.selectedProperty?.id,
      pidRaw: this.selectedProperty?.pid_raw,
      pidFormatted: this.selectedProperty?.pid_formatted,
      propertyAddress: this.selectedProperty?.location?.address,
      cardNumber: this.selectedCard,
      description: this.permit.description,
      scopeOfWork: this.permit.scopeOfWork,
      estimatedValue: parseFloat(this.permit.estimatedValue) || 0,
      squareFootage: parseFloat(this.permit.squareFootage) || 0,
      applicant: this.permit.applicant,
      contractor: this.permit.contractor,
      customFields: this.permit.customFields || {},
      fees: [
        {
          type: 'base',
          description: 'Application Fee',
          amount: this.calculatedFee,
          status: 'pending',
        },
      ],
      documents: this.uploadedDocuments,
      applicationDate: new Date(),
    };
  }

  @action
  cancel() {
    if (
      confirm(
        'Are you sure you want to cancel? Any unsaved changes will be lost.',
      )
    ) {
      this.router.transitionTo('municipality.building-permits.queue');
    }
  }
}
