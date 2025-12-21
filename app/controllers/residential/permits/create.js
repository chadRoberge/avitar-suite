import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { debounce } from '@ember/runloop';

export default class ResidentialPermitsCreateController extends Controller {
  @service router;
  @service('hybrid-api') hybridApi;
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
  @tracked viewMode = 'list'; // 'list' or 'tree'
  @tracked groupBy = 'pid'; // 'pid', 'street', 'lastname'
  @tracked groupedProperties = {};
  @tracked formVersion = 0; // Increment this to trigger validation re-check
  @tracked permitData = null; // Tracked reference to permit data

  // Project management
  @tracked permitMode = 'standalone'; // 'standalone', 'add-to-project', or 'create-project'
  @tracked existingProjects = []; // Existing projects for the selected property
  @tracked selectedProject = null; // Selected existing project
  @tracked projectTypes = []; // Available project types
  @tracked selectedProjectType = null; // Selected project type for new project
  @tracked projectData = {
    name: '',
    description: '',
    customFields: {},
  }; // Data for new project
  @tracked selectedProjectPermitTypes = []; // Which permit types to include in new project

  // Document management
  @tracked showDocumentLibraryModal = false;
  @tracked showContractorLibraryModal = false;
  @tracked attachedDocuments = []; // Files from town library
  @tracked contractorDocuments = []; // Files from contractor's library
  @tracked uploadedFiles = []; // Newly uploaded files

  // Payment management
  @tracked savedPermitId = null; // Permit ID after saving draft
  @tracked paymentBreakdown = null; // Payment calculation
  @tracked clientSecret = null; // Stripe payment intent client secret
  @tracked paymentIntentId = null; // Stripe payment intent ID
  @tracked stripeAccountId = null; // Connected account ID
  @tracked showPaymentModal = false; // Show Stripe payment modal

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
    // Reference formVersion to trigger re-computation when form changes
    void this.formVersion;

    switch (this.currentStep) {
      case 1:
        return !!this.selectedMunicipality;
      case 2:
        // Property must be selected
        if (!this.selectedProperty) return false;

        // If creating/adding to project, validate project selection
        if (this.permitMode === 'add-to-project') {
          return !!this.selectedProject;
        } else if (this.permitMode === 'create-project') {
          return (
            !!this.selectedProjectType &&
            this.projectData.name?.trim().length > 0
          );
        }

        // Standalone permit - can proceed
        return true;
      case 3:
        return !!this.selectedPermitType;
      case 4:
        return this.validatePermitDetails();
      case 5:
        return false; // Review is the last step - payment happens via modal
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
    const data = this.permitData;

    console.log('🔍 Validating permit details:', {
      description: data.description,
      estimatedValue: data.estimatedValue,
      customFields: data.customFields,
    });

    // Check basic required fields
    if (!data.description || data.description.trim().length === 0) {
      console.log('❌ Validation failed: description is empty');
      return false;
    }
    if (data.estimatedValue < 0) {
      console.log('❌ Validation failed: estimatedValue is negative');
      return false;
    }

    // Check custom form fields if permit type has them
    if (this.selectedPermitType?.customFormFields) {
      const customFields = data.customFields || {};

      console.log('🔍 Checking custom fields:', {
        customFormFields: this.selectedPermitType.customFormFields,
        customFieldsData: customFields,
      });

      // Validate required custom fields
      for (const field of this.selectedPermitType.customFormFields) {
        if (field.required) {
          const value = customFields[field.id];

          console.log(`🔍 Checking field "${field.label}" (${field.id}):`, {
            fieldId: field.id,
            value,
            type: field.type,
            required: field.required,
          });

          // Check if field has a value
          if (value === undefined || value === null || value === '') {
            console.log(
              `❌ Validation failed: field "${field.label}" is required but empty`,
            );
            return false;
          }

          // For checkbox fields, ensure at least one option is selected
          if (
            field.type === 'checkbox' &&
            (!Array.isArray(value) || value.length === 0)
          ) {
            console.log(
              `❌ Validation failed: checkbox field "${field.label}" requires at least one selection`,
            );
            return false;
          }
        }
      }
    }

    console.log('✅ Validation passed!');
    return true;
  }

  get filteredGroupedProperties() {
    if (this.viewMode !== 'tree') return {};
    if (!this.propertySearchText) return this.groupedProperties;

    const filtered = {};
    const searchLower = this.propertySearchText.toLowerCase();

    Object.keys(this.groupedProperties).forEach((groupKey) => {
      const group = this.groupedProperties[groupKey];
      const filteredGroup = group.filter((property) => {
        const formattedPid =
          property.pidFormatted || property.pid_formatted || '';
        const address = property.address || property.location?.address || '';
        const ownerName =
          property.ownerName || property.owner?.primary_name || '';

        return (
          formattedPid.toLowerCase().includes(searchLower) ||
          address.toLowerCase().includes(searchLower) ||
          ownerName.toLowerCase().includes(searchLower)
        );
      });

      if (filteredGroup.length > 0) {
        filtered[groupKey] = filteredGroup;
      }
    });

    return filtered;
  }

  get hasGroupedProperties() {
    return Object.keys(this.filteredGroupedProperties).length > 0;
  }

  @action
  async selectMunicipality(municipality) {
    this.selectedMunicipality = municipality;
    // Reassign entire object to trigger reactivity
    this.permitData = {
      ...this.permitData,
      municipalityId: municipality.id,
    };

    // Load permit types for this municipality
    try {
      const response = await this.hybridApi.get(
        `/municipalities/${municipality.id}/permit-types`,
      );

      // Normalize permit types to have consistent ID field
      this.permitTypes = (response.permitTypes || []).map((pt) => ({
        ...pt,
        id: pt._id || pt.id, // Ensure id field exists
      }));
    } catch (error) {
      console.error('Error loading permit types:', error);
      this.notifications.error('Failed to load permit types');
    }
  }

  @action
  async searchProperties(event) {
    event?.preventDefault();

    if (!this.propertySearchText || this.propertySearchText.length < 2) {
      this.notifications.warning(
        'Please enter at least 2 characters to search',
      );
      return;
    }

    this.searchingProperties = true;

    try {
      const response = await this.hybridApi.get(
        `/municipalities/${this.selectedMunicipality.id}/properties/search`,
        {
          params: {
            q: this.propertySearchText,
            limit: 20,
          },
        },
      );

      // Map API response to format expected by template
      this.properties = (response.properties || []).map((property) => ({
        ...property,
        pidFormatted: property.pid_formatted || property.pidFormatted,
        address: property.location?.address || property.address,
        owner: {
          primary_name:
            property.owners?.primary?.primary_name ||
            property.owner?.primary_name,
        },
      }));
    } catch (error) {
      console.error('Error searching properties:', error);
      this.notifications.error('Failed to search properties');
    } finally {
      this.searchingProperties = false;
    }
  }

  @action
  async selectProperty(property) {
    this.selectedProperty = property;
    // Reassign entire object to trigger reactivity
    this.permitData = {
      ...this.permitData,
      propertyId: property._id || property.id,
      pidFormatted: property.pidFormatted,
      propertyAddress: property.address,
    };

    // Load existing projects for this property and project types
    if (this.selectedMunicipality) {
      try {
        // Load existing projects for this property
        const projectsResponse = await this.hybridApi.get(
          `/municipalities/${this.selectedMunicipality.id}/permits?propertyId=${property._id || property.id}&isProject=true`,
        );
        this.existingProjects = projectsResponse.permits || [];

        // Load project types for this municipality (if not already loaded)
        if (this.projectTypes.length === 0) {
          const projectTypesResponse = await this.hybridApi.get(
            `/municipalities/${this.selectedMunicipality.id}/project-types?status=active`,
          );
          this.projectTypes = projectTypesResponse.projectTypes || [];
        }
      } catch (error) {
        console.error('Error loading projects:', error);
        // Don't block the user if this fails
        this.existingProjects = [];
      }
    }
  }

  @action
  selectPermitType(permitType) {
    // Toggle: if clicking the same permit type, deselect it
    if (
      this.selectedPermitType &&
      this.selectedPermitType.id === permitType.id
    ) {
      this.selectedPermitType = null;
      // Reassign entire object to trigger reactivity
      this.permitData = {
        ...this.permitData,
        permitTypeId: null,
        type: null,
      };
    } else {
      // Normalize custom form fields to have consistent ID field
      const normalizedPermitType = {
        ...permitType,
        customFormFields: (permitType.customFormFields || []).map((field) => ({
          ...field,
          id: field._id || field.id, // Ensure id field exists
        })),
      };

      this.selectedPermitType = normalizedPermitType;
      // Reassign entire object to trigger reactivity
      this.permitData = {
        ...this.permitData,
        permitTypeId: permitType._id || permitType.id,
        type: permitType.categories?.[0] || 'building',
      };
    }
  }

  @action
  updatePermitField(field, event) {
    const value = event.target.value;
    console.log(`📝 updatePermitField: ${field} = "${value}"`);
    // Reassign entire object to trigger reactivity
    this.permitData = {
      ...this.permitData,
      [field]: value,
    };
    console.log(`📦 Full permitData after update:`, this.permitData);
    this.formVersion++; // Trigger validation re-check
  }

  @action
  updateApplicantField(field, event) {
    // Reassign applicant object to trigger reactivity
    this.permitData = {
      ...this.permitData,
      applicant: {
        ...this.permitData.applicant,
        [field]: event.target.value,
      },
    };
    this.formVersion++; // Trigger validation re-check
  }

  // Project-related actions
  @action
  setPermitMode(mode) {
    this.permitMode = mode;
    this.selectedProject = null;
    this.selectedProjectType = null;
    this.formVersion++; // Trigger validation re-check
  }

  @action
  selectExistingProject(project) {
    this.selectedProject = project;
    this.formVersion++; // Trigger validation re-check
  }

  @action
  selectProjectType(projectType) {
    this.selectedProjectType = projectType;
    // Auto-fill project name if empty
    if (!this.projectData.name) {
      this.projectData = {
        ...this.projectData,
        name: `${projectType.name} - ${this.selectedProperty?.address || ''}`,
      };
    }
    this.formVersion++; // Trigger validation re-check
  }

  @action
  updateProjectField(field, event) {
    this.projectData = {
      ...this.projectData,
      [field]: event.target.value,
    };
    this.formVersion++; // Trigger validation re-check
  }

  @action
  toggleProjectPermitType(permitTypeId) {
    if (this.selectedProjectPermitTypes.includes(permitTypeId)) {
      this.selectedProjectPermitTypes = this.selectedProjectPermitTypes.filter(
        (id) => id !== permitTypeId,
      );
    } else {
      this.selectedProjectPermitTypes = [
        ...this.selectedProjectPermitTypes,
        permitTypeId,
      ];
    }
  }

  @action
  updateCustomField(fieldId, event) {
    // Initialize customFields object if it doesn't exist
    const customFields = this.permitData.customFields || {};

    // Reassign entire permitData object to trigger reactivity
    this.permitData = {
      ...this.permitData,
      customFields: {
        ...customFields,
        [fieldId]: event.target.value,
      },
    };
    this.formVersion++; // Trigger validation re-check
  }

  @action
  updateCustomFieldCheckbox(fieldId, optionValue, event) {
    // Initialize customFields object if it doesn't exist
    const customFields = this.permitData.customFields || {};

    // Get current values for this field (array of checked options)
    let currentValues = customFields[fieldId] || [];

    // Ensure currentValues is an array
    if (!Array.isArray(currentValues)) {
      currentValues = [];
    }

    let newValues;
    if (event.target.checked) {
      // Add value if checkbox is checked
      newValues = [...currentValues, optionValue];
    } else {
      // Remove value if checkbox is unchecked
      newValues = currentValues.filter((v) => v !== optionValue);
    }

    // Reassign entire permitData object to trigger reactivity
    this.permitData = {
      ...this.permitData,
      customFields: {
        ...customFields,
        [fieldId]: newValues,
      },
    };
    this.formVersion++; // Trigger validation re-check
  }

  @action
  nextStep() {
    if (this.canGoNext && this.currentStep < 5) {
      // Debug: log permit data before moving to next step
      if (this.currentStep === 4) {
        console.log('📋 Moving from Details step, permit data:', {
          description: this.permitData.description,
          estimatedValue: this.permitData.estimatedValue,
          squareFootage: this.permitData.squareFootage,
          customFields: this.permitData.customFields,
          applicant: this.permitData.applicant,
        });
      }

      this.currentStep++;
      window.scrollTo(0, 0);
    }
  }

  @action
  previousStep() {
    if (this.canGoPrevious) {
      this.currentStep--;
      window.scrollTo(0, 0);

      // Debug: log permit data when going back to details step
      if (this.currentStep === 4) {
        console.log('⬅️ Going back to Details step, permit data:', {
          description: this.permitData.description,
          estimatedValue: this.permitData.estimatedValue,
          squareFootage: this.permitData.squareFootage,
          customFields: this.permitData.customFields,
          applicant: this.permitData.applicant,
        });
      }
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
    // Handle different permit modes
    if (this.permitMode === 'create-project') {
      return this.submitProjectWithPermits();
    } else if (this.permitMode === 'add-to-project') {
      return this.submitPermitToProject();
    } else {
      // Standalone permit
      return this.submitStandalonePermit();
    }
  }

  async submitProjectWithPermits() {
    if (!this.selectedProjectType) {
      this.notifications.error('Please select a project type');
      return;
    }

    if (!this.projectData.name?.trim()) {
      this.notifications.error('Please enter a project name');
      return;
    }

    this.isLoading = true;

    try {
      console.log('🔵 Creating project with permits...');

      // Collect document file IDs
      const allDocuments = [
        ...this.attachedDocuments,
        ...this.contractorDocuments,
        ...this.uploadedFiles,
      ];
      const documentFileIds = allDocuments.map((doc) => doc._id || doc.id);

      // Prepare project data
      const projectData = {
        projectTypeId:
          this.selectedProjectType._id || this.selectedProjectType.id,
        projectName: this.projectData.name,
        projectDescription: this.projectData.description || '',
        propertyId: this.selectedProperty._id || this.selectedProperty.id,
        customFormFields: this.projectData.customFields || {},
        // Use selected permit types if user customized, otherwise use defaults
        childPermitTypes:
          this.selectedProjectPermitTypes.length > 0
            ? this.selectedProjectPermitTypes
            : this.selectedProjectType.defaultPermitTypes.map(
                (pt) =>
                  pt.permitTypeId._id || pt.permitTypeId.id || pt.permitTypeId,
              ),
        documentFileIds,
        contractor_id: this.currentUser.user.contractor_id,
        submitted_by: this.currentUser.user._id,
        createdBy: this.currentUser.user._id,
      };

      // Create project with child permits
      const response = await this.hybridApi.post(
        `/municipalities/${this.selectedMunicipality.id}/projects`,
        projectData,
      );

      this.savedPermitId = response.project._id || response.project.id;
      const totalProjectFee = response.totalProjectFee || 0;

      console.log('🟢 Project created:', this.savedPermitId);
      console.log('🟢 Total project fee:', totalProjectFee);

      // Check if project has fees
      if (totalProjectFee === 0) {
        // No fee - mark project as submitted directly
        console.log('🔵 No project fee - submitting project directly...');
        await this.hybridApi.put(`/permits/${this.savedPermitId}`, {
          status: 'submitted',
        });

        this.notifications.success(
          'Project submitted successfully! (No fee required)',
        );

        await this.router.transitionTo('residential.permits');
        this.router.refresh('residential.permits');
        return;
      }

      // Check Stripe minimum ($0.50)
      if (totalProjectFee < 0.5) {
        this.notifications.error(
          `Project total ($${totalProjectFee.toFixed(2)}) is below Stripe's minimum of $0.50. Please contact the municipality.`,
        );
        this.isLoading = false;
        return;
      }

      // Create payment intent for project
      console.log('🔵 Creating payment intent for project...');
      const paymentIntent = await this.hybridApi.post(
        `/municipalities/${this.selectedMunicipality.id}/permits/${this.savedPermitId}/create-payment-intent`,
      );

      this.clientSecret = paymentIntent.clientSecret;
      this.paymentIntentId = paymentIntent.paymentIntentId;
      this.stripeAccountId = paymentIntent.stripeAccountId;

      // Store payment breakdown for display
      this.paymentBreakdown = {
        permitFee: totalProjectFee,
        totalAmount: totalProjectFee,
        isProject: true,
        childPermitsCount: response.childPermits?.length || 0,
      };

      console.log('🟢 Payment intent created:', this.paymentIntentId);

      // Open payment modal
      this.showPaymentModal = true;
      window.scrollTo(0, 0);

      this.notifications.success(
        `Project created with ${response.childPermits?.length || 0} permits! Please complete payment to submit.`,
      );
    } catch (error) {
      console.error('❌ Error creating project:', error);
      this.notifications.error(error.message || 'Failed to create project');
    } finally {
      this.isLoading = false;
    }
  }

  async submitPermitToProject() {
    if (!this.validatePermitDetails()) {
      this.notifications.error('Please fill in all required fields');
      return;
    }

    if (!this.selectedProject) {
      this.notifications.error('Please select a project');
      return;
    }

    this.isLoading = true;

    try {
      console.log('🔵 Adding permit to existing project...');

      // Collect document file IDs
      const allDocuments = [
        ...this.attachedDocuments,
        ...this.contractorDocuments,
        ...this.uploadedFiles,
      ];
      const documentFileIds = allDocuments.map((doc) => doc._id || doc.id);

      // Create permit linked to project
      const permitData = {
        ...this.permitData,
        projectId: this.selectedProject._id || this.selectedProject.id,
        status: 'draft',
        contractor_id: this.currentUser.user.contractor_id,
        submitted_by: this.currentUser.user._id,
        createdBy: this.currentUser.user._id,
        documentFileIds,
      };

      console.log('🔵 Saving permit linked to project...');
      const permitResponse = await this.hybridApi.post(
        `/municipalities/${this.selectedMunicipality.id}/permits`,
        permitData,
      );

      this.savedPermitId =
        permitResponse.permit._id || permitResponse.permit.id;
      console.log('🟢 Permit saved and linked to project:', this.savedPermitId);

      // Calculate payment for this permit
      console.log('🔵 Calculating payment...');
      const paymentCalc = await this.hybridApi.post(
        `/municipalities/${this.selectedMunicipality.id}/permits/${this.savedPermitId}/calculate-payment`,
      );

      this.paymentBreakdown = paymentCalc.breakdown;
      const totalAmount = this.paymentBreakdown.totalAmount || 0;

      console.log('🟢 Payment breakdown:', this.paymentBreakdown);

      if (totalAmount === 0) {
        // No fee - submit directly
        console.log('🔵 No permit fee - submitting permit directly...');
        await this.hybridApi.put(`/permits/${this.savedPermitId}`, {
          status: 'submitted',
        });

        this.notifications.success(
          'Permit added to project and submitted! (No fee required)',
        );

        await this.router.transitionTo('residential.permits');
        this.router.refresh('residential.permits');
        return;
      }

      // Check Stripe minimum
      if (totalAmount < 0.5) {
        this.notifications.error(
          `Payment amount ($${totalAmount.toFixed(2)}) is below Stripe's minimum of $0.50.`,
        );
        this.isLoading = false;
        return;
      }

      // Create payment intent
      console.log('🔵 Creating payment intent...');
      const paymentIntent = await this.hybridApi.post(
        `/municipalities/${this.selectedMunicipality.id}/permits/${this.savedPermitId}/create-payment-intent`,
      );

      this.clientSecret = paymentIntent.clientSecret;
      this.paymentIntentId = paymentIntent.paymentIntentId;
      this.stripeAccountId = paymentIntent.stripeAccountId;

      console.log('🟢 Payment intent created:', this.paymentIntentId);

      // Open payment modal
      this.showPaymentModal = true;
      window.scrollTo(0, 0);

      this.notifications.success(
        'Permit saved! Please complete payment to submit and add to project.',
      );
    } catch (error) {
      console.error('❌ Error adding permit to project:', error);
      this.notifications.error(
        error.message || 'Failed to add permit to project',
      );
    } finally {
      this.isLoading = false;
    }
  }

  async submitStandalonePermit() {
    if (!this.validatePermitDetails()) {
      this.notifications.error('Please fill in all required fields');
      return;
    }

    this.isLoading = true;

    try {
      // Step 1: Save permit as draft to get permit ID
      const allDocuments = [
        ...this.attachedDocuments,
        ...this.contractorDocuments,
        ...this.uploadedFiles,
      ];
      const documentFileIds = allDocuments.map((doc) => doc._id || doc.id);

      const permitData = {
        ...this.permitData,
        status: 'draft', // Save as draft first, will submit after payment
        contractor_id: this.currentUser.user.contractor_id,
        submitted_by: this.currentUser.user._id,
        createdBy: this.currentUser.user._id,
        documentFileIds,
      };

      let permitResponse;

      // Check if updating an existing draft or creating new
      if (this.savedPermitId) {
        console.log('🔵 Updating existing draft permit...');
        // Use non-municipality-scoped endpoint for contractors updating their own drafts
        permitResponse = await this.hybridApi.put(
          `/permits/${this.savedPermitId}`,
          permitData,
        );
        console.log('🟢 Draft permit updated:', this.savedPermitId);
      } else {
        console.log('🔵 Saving permit as draft...');
        permitResponse = await this.hybridApi.post(
          `/municipalities/${this.selectedMunicipality.id}/permits`,
          permitData,
        );
        this.savedPermitId =
          permitResponse.permit._id || permitResponse.permit.id;
        console.log('🟢 Permit saved as draft:', this.savedPermitId);
      }

      // Step 2: Calculate payment
      console.log('🔵 Calculating payment...');
      const paymentCalc = await this.hybridApi.post(
        `/municipalities/${this.selectedMunicipality.id}/permits/${this.savedPermitId}/calculate-payment`,
      );

      this.paymentBreakdown = paymentCalc.breakdown;
      console.log('🟢 Payment breakdown:', this.paymentBreakdown);

      // Check if permit has fees that require payment
      const permitFee = this.paymentBreakdown.permitFee || 0;
      const totalAmount = this.paymentBreakdown.totalAmount || 0;

      if (permitFee === 0) {
        // No permit fee - submit directly without payment
        console.log(
          '🔵 No permit fee - submitting permit directly without payment...',
        );
        await this.hybridApi.put(`/permits/${this.savedPermitId}`, {
          status: 'submitted',
        });

        this.notifications.success(
          'Permit submitted successfully! (No fee required)',
        );

        // Transition and refresh to show updated status
        await this.router.transitionTo('residential.permits');
        this.router.refresh('residential.permits');
        return;
      }

      // Check Stripe minimum ($0.50)
      if (totalAmount < 0.5) {
        this.notifications.error(
          `Payment amount ($${totalAmount.toFixed(2)}) is below Stripe's minimum of $0.50. Please contact the municipality to adjust the permit fee.`,
        );
        this.isLoading = false;
        return;
      }

      // Step 3: Create payment intent
      console.log('🔵 Creating payment intent...');
      const paymentIntent = await this.hybridApi.post(
        `/municipalities/${this.selectedMunicipality.id}/permits/${this.savedPermitId}/create-payment-intent`,
      );

      this.clientSecret = paymentIntent.clientSecret;
      this.paymentIntentId = paymentIntent.paymentIntentId;
      this.stripeAccountId = paymentIntent.stripeAccountId;
      console.log('🟢 Payment intent created:', this.paymentIntentId);

      // Step 4: Open payment modal
      this.showPaymentModal = true;
      window.scrollTo(0, 0);

      this.notifications.success(
        'Permit saved! Please complete payment to submit your application.',
      );
    } catch (error) {
      console.error('❌ Error preparing permit for payment:', error);
      this.notifications.error(
        error.message || 'Failed to prepare permit for payment',
      );
    } finally {
      this.isLoading = false;
    }
  }

  @action
  async saveDraft() {
    this.isLoading = true;

    try {
      // Collect all document file IDs (town library, contractor library, and uploaded)
      const allDocuments = [
        ...this.attachedDocuments,
        ...this.contractorDocuments,
        ...this.uploadedFiles,
      ];
      const documentFileIds = allDocuments.map((doc) => doc._id || doc.id);

      const permitData = {
        ...this.permitData,
        status: 'draft',
        contractor_id: this.currentUser.user.contractor_id,
        submitted_by: this.currentUser.user._id,
        createdBy: this.currentUser.user._id,
        documentFileIds, // Send file IDs to attach to permit
      };

      const response = await this.hybridApi.post(
        `/municipalities/${this.selectedMunicipality.id}/permits`,
        permitData,
      );

      this.notifications.success('Permit saved as draft');
      this.router.transitionTo('residential.permits');
    } catch (error) {
      console.error('Error saving draft:', error);
      this.notifications.error('Failed to save draft');
    } finally {
      this.isLoading = false;
    }
  }

  @action
  cancel() {
    if (
      confirm('Are you sure you want to cancel? All progress will be lost.')
    ) {
      this.router.transitionTo('residential.permits');
    }
  }

  @action
  updatePropertySearch(event) {
    this.propertySearchText = event.target.value;

    // Debounce the search for live results
    debounce(this, this.performLiveSearch, 300);
  }

  @action
  async setViewMode(mode) {
    this.viewMode = mode;

    // Load all properties when switching to tree view
    if (
      mode === 'tree' &&
      this.properties.length === 0 &&
      this.selectedMunicipality
    ) {
      await this.loadAllProperties();
    }
  }

  async loadAllProperties() {
    if (!this.selectedMunicipality) return;

    this.searchingProperties = true;

    try {
      const response = await this.hybridApi.get(
        `/municipalities/${this.selectedMunicipality.id}/properties`,
      );

      // Handle properties response and normalize format
      const rawProperties = response.properties || response || [];

      // Map API response to format expected by template
      this.properties = rawProperties.map((property) => ({
        ...property,
        pidFormatted: property.pid_formatted || property.pidFormatted,
        address: property.location?.address || property.address,
        owner: {
          primary_name:
            property.owners?.primary?.primary_name ||
            property.owner?.primary_name,
        },
        ownerName:
          property.owners?.primary?.primary_name ||
          property.owner?.primary_name ||
          property.ownerName,
      }));

      // Group properties for tree view
      this.groupProperties();

      console.log(
        `Loaded ${this.properties.length} properties for municipality ${this.selectedMunicipality.id}`,
      );
    } catch (error) {
      console.error('Error loading properties:', error);
      this.notifications.error(
        'Unable to load all properties. Please use the search function instead.',
      );
      // Switch back to list mode if loading fails
      this.viewMode = 'list';
    } finally {
      this.searchingProperties = false;
    }
  }

  @action
  setGroupBy(groupBy) {
    this.groupBy = groupBy;
    this.groupProperties();
  }

  async performLiveSearch() {
    if (
      this.viewMode === 'tree' ||
      !this.propertySearchText ||
      this.propertySearchText.length < 2
    ) {
      if (!this.propertySearchText) {
        this.properties = []; // Clear results when search is empty
      }
      return;
    }

    await this.searchProperties();
  }

  groupProperties() {
    if (this.viewMode !== 'tree' || !this.properties.length) {
      this.groupedProperties = {};
      return;
    }

    const grouped = {};

    switch (this.groupBy) {
      case 'pid':
        this.properties.forEach((property) => {
          const map = property.mapNumber || 'Unknown';
          if (!grouped[map]) grouped[map] = [];
          grouped[map].push(property);
        });

        // Sort each map group by lot-sub display
        Object.keys(grouped).forEach((map) => {
          grouped[map].sort((a, b) => {
            const displayA = a.lotSubDisplay || a.pid_formatted || '';
            const displayB = b.lotSubDisplay || b.pid_formatted || '';
            return displayA.localeCompare(displayB, undefined, {
              numeric: true,
            });
          });
        });
        break;

      case 'street':
        this.properties.forEach((property) => {
          const street =
            property.location?.street || property.street || 'Unknown/Vacant';
          if (!grouped[street]) grouped[street] = [];
          grouped[street].push(property);
        });

        // Sort each street group by street number
        Object.keys(grouped).forEach((street) => {
          grouped[street].sort((a, b) => {
            const numA =
              parseInt(a.location?.street_number || a.street_number) || 0;
            const numB =
              parseInt(b.location?.street_number || b.street_number) || 0;
            return numA - numB;
          });
        });
        break;

      case 'lastname':
        this.properties.forEach((property) => {
          const ownerName =
            property.owner?.primary_name || property.ownerName || 'Unknown';
          const lastName = this.extractLastName(ownerName);
          const initial = lastName.charAt(0).toUpperCase();
          if (!grouped[initial]) grouped[initial] = [];
          grouped[initial].push(property);
        });

        // Sort each letter group by owner name
        Object.keys(grouped).forEach((letter) => {
          grouped[letter].sort((a, b) => {
            const nameA = a.owner?.primary_name || a.ownerName || '';
            const nameB = b.owner?.primary_name || b.ownerName || '';
            return nameA.localeCompare(nameB);
          });
        });
        break;
    }

    // Sort the grouped object keys
    const sortedGrouped = {};
    const sortedKeys = Object.keys(grouped).sort((a, b) => {
      if (a === 'Unknown' || a === 'Unknown/Vacant') return 1;
      if (b === 'Unknown' || b === 'Unknown/Vacant') return -1;
      return a.localeCompare(b, undefined, { numeric: true });
    });

    sortedKeys.forEach((key) => {
      sortedGrouped[key] = grouped[key];
    });

    this.groupedProperties = sortedGrouped;
  }

  extractLastName(ownerName) {
    if (!ownerName) return 'Unknown';

    // Handle "Last, First" format
    if (ownerName.includes(',')) {
      return ownerName.split(',')[0].trim();
    }

    // Handle "First Last" format - take the last word
    const parts = ownerName.trim().split(' ');
    return parts[parts.length - 1];
  }

  getPropertyDisplayName = (property) => {
    switch (this.groupBy) {
      case 'pid':
        return (
          property.lotSubDisplay ||
          property.pid_formatted ||
          property.pidFormatted ||
          'Unknown'
        );
      case 'street':
        const num =
          property.location?.street_number ||
          property.street_number ||
          'Vacant';
        const unit =
          property.location?.unit || property.unit
            ? ` Unit ${property.location?.unit || property.unit}`
            : '';
        return `${num}${unit}`;
      case 'lastname':
        return (
          property.owner?.primary_name || property.ownerName || 'Unknown Owner'
        );
      default:
        return property.pid_formatted || property.pidFormatted || property.id;
    }
  };

  getPropertySecondaryInfo = (property) => {
    switch (this.groupBy) {
      case 'pid':
        return property.location?.address || property.address || 'No address';
      case 'street':
        return (
          property.owner?.primary_name || property.ownerName || 'Unknown Owner'
        );
      case 'lastname':
        return property.location?.address || property.address || 'No address';
      default:
        return '';
    }
  };

  // Document management actions
  @action
  openDocumentLibrary() {
    this.showDocumentLibraryModal = true;
  }

  @action
  closeDocumentLibrary() {
    this.showDocumentLibraryModal = false;
  }

  @action
  openContractorLibrary() {
    this.showContractorLibraryModal = true;
  }

  @action
  closeContractorLibrary() {
    this.showContractorLibraryModal = false;
  }

  @action
  handleDocumentSelection(selectedFiles) {
    // selectedFiles is an array of file objects from the file-browser component
    console.log('Selected documents from town library:', selectedFiles);

    // Add to attached documents if not already attached
    selectedFiles.forEach((file) => {
      const fileId = file._id || file.id;
      const alreadyAttached = this.attachedDocuments.some(
        (doc) => (doc._id || doc.id) === fileId,
      );

      if (!alreadyAttached) {
        this.attachedDocuments = [...this.attachedDocuments, file];
      }
    });

    this.notifications.success(
      `${selectedFiles.length} document(s) attached from town library`,
    );
  }

  @action
  handleContractorDocumentSelection(selectedFiles) {
    // selectedFiles is an array of file objects from the file-browser component
    console.log('Selected documents from contractor library:', selectedFiles);

    // Add to contractor documents if not already attached
    selectedFiles.forEach((file) => {
      const fileId = file._id || file.id;
      const alreadyAttached = this.contractorDocuments.some(
        (doc) => (doc._id || doc.id) === fileId,
      );

      if (!alreadyAttached) {
        this.contractorDocuments = [...this.contractorDocuments, file];
      }
    });

    this.notifications.success(
      `${selectedFiles.length} document(s) attached from your library`,
    );
  }

  @action
  removeAttachedDocument(file) {
    const fileId = file._id || file.id;
    this.attachedDocuments = this.attachedDocuments.filter(
      (doc) => (doc._id || doc.id) !== fileId,
    );
    this.notifications.info('Town document removed from permit');
  }

  @action
  removeContractorDocument(file) {
    const fileId = file._id || file.id;
    this.contractorDocuments = this.contractorDocuments.filter(
      (doc) => (doc._id || doc.id) !== fileId,
    );
    this.notifications.info('Your document removed from permit');
  }

  @action
  async handleFileUpload(event) {
    const files = Array.from(event.target.files);

    if (files.length === 0) return;

    this.isLoading = true;

    try {
      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('department', 'building_permit');
        formData.append('visibility', 'private');

        const response = await this.hybridApi.upload(
          `/municipalities/${this.selectedMunicipality.id}/files/upload`,
          formData,
        );

        // Add to uploaded files list
        if (response.file) {
          this.uploadedFiles = [...this.uploadedFiles, response.file];
        }
      }

      this.notifications.success(
        `${files.length} file(s) uploaded successfully`,
      );

      // Clear file input
      event.target.value = '';
    } catch (error) {
      console.error('Error uploading files:', error);
      this.notifications.error(
        error.message || 'Failed to upload one or more files',
      );
    } finally {
      this.isLoading = false;
    }
  }

  @action
  removeUploadedFile(file) {
    const fileId = file._id || file.id;
    this.uploadedFiles = this.uploadedFiles.filter(
      (f) => (f._id || f.id) !== fileId,
    );
    this.notifications.info('Uploaded file removed');
  }

  @action
  stopPropagation(event) {
    event.stopPropagation();
  }

  // Payment actions
  @action
  closePaymentModal() {
    this.showPaymentModal = false;
  }

  @action
  async handlePaymentSuccess(paymentIntent) {
    if (!this.savedPermitId || !this.paymentIntentId) {
      this.notifications.error('Payment information missing');
      return;
    }

    this.isLoading = true;

    try {
      console.log('🔵 Confirming payment with backend...', paymentIntent);

      // Confirm payment with backend
      const response = await this.hybridApi.post(
        `/municipalities/${this.selectedMunicipality.id}/permits/${this.savedPermitId}/confirm-payment`,
        {
          paymentIntentId: this.paymentIntentId,
        },
      );

      console.log('🟢 Payment confirmed:', response);

      this.notifications.success(
        'Payment successful! Your permit application has been submitted.',
      );

      // Close modal
      this.showPaymentModal = false;

      // Redirect to my permits dashboard and refresh
      await this.router.transitionTo('residential.permits');
      this.router.refresh('residential.permits');
    } catch (error) {
      console.error('❌ Error confirming payment:', error);
      this.notifications.error(
        error.message || 'Failed to confirm payment. Please contact support.',
      );
    } finally {
      this.isLoading = false;
    }
  }

  @action
  handlePaymentError(error) {
    console.error('❌ Payment error:', error);
    this.paymentError = error.message || 'Payment failed. Please try again.';
    this.notifications.error(this.paymentError);
  }

  @action
  async retryPayment() {
    // Clear previous errors
    this.paymentError = null;

    try {
      // Create new payment intent
      console.log('🔵 Creating new payment intent...');
      const paymentIntent = await this.hybridApi.post(
        `/municipalities/${this.selectedMunicipality.id}/permits/${this.savedPermitId}/create-payment-intent`,
      );

      this.clientSecret = paymentIntent.clientSecret;
      this.paymentIntentId = paymentIntent.paymentIntentId;
      console.log('🟢 New payment intent created:', this.paymentIntentId);

      this.notifications.info('Ready to retry payment');
    } catch (error) {
      console.error('❌ Error creating new payment intent:', error);
      this.notifications.error(
        'Failed to retry payment. Please try again later.',
      );
    }
  }

  @action
  onStripeElementsReady() {
    this.stripeElementsReady = true;
    console.log('🟢 Stripe Elements ready');
  }
}
