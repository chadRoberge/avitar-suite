import Component from '@glimmer/component';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class AssessingExemptionEditModalComponent extends Component {
  @service assessing;
  @service notifications;
  @service municipality;

  @tracked isLoading = false;
  @tracked isSaving = false;
  @tracked currentStep = 1; // 1: Select Type, 2: Enter Details, 3: Upload Documents
  @tracked selectedExemptionType = null;
  @tracked availableExemptionTypes = [];
  @tracked groupedExemptionTypes = {};
  @tracked ownerBirthDate = '';
  @tracked selectedVeteranExemptions = new Set();
  @tracked exemptionAmounts = {};
  @tracked uploadedFiles = [];
  @tracked isUploadingFiles = false;

  // Form data
  @tracked exemptionData = {
    exemption_value: 0,
    credit_value: 0,
    user_entered_amount: 0,
    user_entered_percentage: 0,
    assessment_value: 0,
    start_year: new Date().getFullYear(),
    end_year: null,
    qualification_notes: '',
    is_active: true,
  };

  constructor() {
    super(...arguments);
    this.initializeModal();
  }

  get currentOwnerAge() {
    if (!this.ownerBirthDate) return null;

    const birthDate = new Date(this.ownerBirthDate);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();

    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < birthDate.getDate())
    ) {
      age--;
    }

    return age;
  }

  get isEligibleForElderly() {
    return this.currentOwnerAge && this.currentOwnerAge >= 65;
  }

  get elderlyExemptionAmount() {
    if (!this.isEligibleForElderly) return 0;

    // Base elderly exemption amount from municipality settings
    const baseAmount = this.exemptionAmounts.elderly_base || 15000;

    // Additional amount for very senior citizens (80+)
    if (this.currentOwnerAge >= 80) {
      return baseAmount + (this.exemptionAmounts.elderly_senior_bonus || 5000);
    }

    return baseAmount;
  }

  get disabledExemptionAmount() {
    // Standard disabled exemption amount
    return this.exemptionAmounts.disabled_base || 20000;
  }

  get veteranExemptionAmounts() {
    return {
      veteran_standard: this.exemptionAmounts.veteran_standard || 10000,
      veteran_all: this.exemptionAmounts.veteran_all || 15000,
      veteran_disabled: this.exemptionAmounts.veteran_disabled || 25000,
    };
  }

  get totalCalculatedExemption() {
    if (this.selectedExemptionType) {
      return this.calculateExemptionValue();
    }

    // Legacy calculation for old exemption types
    let total = 0;

    // Add elderly exemption if eligible
    if (
      this.isEligibleForElderly &&
      this.selectedVeteranExemptions.has('elderly')
    ) {
      total += this.elderlyExemptionAmount;
    }

    // Add disabled exemption if selected
    if (this.selectedVeteranExemptions.has('disabled')) {
      total += this.disabledExemptionAmount;
    }

    // Add veteran exemptions
    this.selectedVeteranExemptions.forEach((exemptionType) => {
      if (exemptionType.startsWith('veteran_')) {
        total += this.veteranExemptionAmounts[exemptionType] || 0;
      }
    });

    return total;
  }

  get requiresUserInput() {
    return (
      this.selectedExemptionType?.calculation_method ===
        'user_entered_amount' ||
      this.selectedExemptionType?.calculation_method ===
        'user_entered_percentage'
    );
  }

  get inputType() {
    if (!this.selectedExemptionType) return 'none';

    switch (this.selectedExemptionType.calculation_method) {
      case 'user_entered_amount':
        return 'amount';
      case 'user_entered_percentage':
        return 'percentage';
      default:
        return 'none';
    }
  }

  get inputLabel() {
    switch (this.inputType) {
      case 'amount':
        return 'Exemption Amount ($)';
      case 'percentage':
        return 'Exemption Percentage (%)';
      default:
        return '';
    }
  }

  get inputMin() {
    if (!this.selectedExemptionType) return 0;

    switch (this.inputType) {
      case 'amount':
        return this.selectedExemptionType.min_exemption_amount || 0;
      case 'percentage':
        return this.selectedExemptionType.min_percentage || 0;
      default:
        return 0;
    }
  }

  get inputMax() {
    if (!this.selectedExemptionType) return null;

    switch (this.inputType) {
      case 'amount':
        return this.selectedExemptionType.max_exemption_amount;
      case 'percentage':
        return this.selectedExemptionType.max_percentage || 100;
      default:
        return null;
    }
  }

  calculateExemptionValue() {
    if (!this.selectedExemptionType) return 0;

    const exemptionType = this.selectedExemptionType;
    const assessmentValue = this.exemptionData.assessment_value || 0;

    switch (exemptionType.calculation_method) {
      case 'fixed_amount':
        return exemptionType.exemption_type === 'exemption'
          ? exemptionType.default_exemption_value || 0
          : exemptionType.default_credit_value || 0;

      case 'percentage_of_assessment':
        if (!assessmentValue) return 0;
        return Math.round(
          (assessmentValue * (exemptionType.default_percentage || 0)) / 100,
        );

      case 'user_entered_amount':
        let amount = this.exemptionData.user_entered_amount || 0;
        if (
          exemptionType.min_exemption_amount !== undefined &&
          amount < exemptionType.min_exemption_amount
        ) {
          amount = exemptionType.min_exemption_amount;
        }
        if (
          exemptionType.max_exemption_amount !== undefined &&
          amount > exemptionType.max_exemption_amount
        ) {
          amount = exemptionType.max_exemption_amount;
        }
        return amount;

      case 'user_entered_percentage':
        if (!assessmentValue) return 0;
        let percentage = this.exemptionData.user_entered_percentage || 0;
        if (
          exemptionType.min_percentage !== undefined &&
          percentage < exemptionType.min_percentage
        ) {
          percentage = exemptionType.min_percentage;
        }
        if (
          exemptionType.max_percentage !== undefined &&
          percentage > exemptionType.max_percentage
        ) {
          percentage = exemptionType.max_percentage;
        }
        return Math.round((assessmentValue * percentage) / 100);

      default:
        return 0;
    }
  }

  @action
  async initializeModal() {
    this.isLoading = true;

    try {
      // Load exemption amounts from municipality settings
      await this.loadExemptionAmounts();

      // Load available exemption types for selection
      await this.loadAvailableExemptionTypes();

      // Initialize form data if editing existing exemption
      if (this.args.exemption) {
        this.initializeExistingExemption();
        this.currentStep = 2; // Skip type selection for existing exemptions
      } else {
        this.currentStep = 1; // Start with type selection for new exemptions
      }
    } catch (error) {
      console.error('Failed to initialize exemption modal:', error);
      this.notifications.error('Failed to load exemption data');
    } finally {
      this.isLoading = false;
    }
  }

  @action
  initializeExistingExemption() {
    const exemption = this.args.exemption;

    this.exemptionData = {
      exemption_value: exemption.exemption_value || 0,
      credit_value: exemption.credit_value || 0,
      start_year: exemption.start_year || new Date().getFullYear(),
      end_year: exemption.end_year || null,
      qualification_notes: exemption.qualification_notes || '',
      is_active: exemption.is_active !== false,
    };

    // Initialize owner birth date if available
    if (exemption.owner_birth_date) {
      this.ownerBirthDate = exemption.owner_birth_date;
    }

    // Initialize selected exemptions based on exemption type
    if (exemption.selectedExemptionType) {
      const category = exemption.selectedExemptionType.category;
      if (category === 'veteran') {
        this.selectedVeteranExemptions.add(
          exemption.selectedExemptionType.name.toLowerCase().replace(' ', '_'),
        );
      } else if (category === 'elderly') {
        this.selectedVeteranExemptions.add('elderly');
      } else if (category === 'disabled') {
        this.selectedVeteranExemptions.add('disabled');
      }
    }
  }

  @action
  async loadExemptionAmounts() {
    try {
      const municipalityId = this.municipality.currentMunicipality?.id;
      const exemptionTypes = await this.assessing.getExemptionTypes();

      // Transform exemption types to amounts format for backwards compatibility
      const amounts = {};
      exemptionTypes.forEach((exemptionType) => {
        switch (exemptionType.name) {
          case 'elderly_65_74':
          case 'elderly_75_79':
          case 'elderly_80_plus':
            amounts.elderly_base =
              exemptionType.default_exemption_value || 15000;
            break;
          case 'disabled_exemption':
            amounts.disabled_base =
              exemptionType.default_exemption_value || 20000;
            break;
          case 'veteran_standard':
            amounts.veteran_standard =
              exemptionType.default_credit_value || 10000;
            break;
          case 'veteran_all':
            amounts.veteran_all = exemptionType.default_credit_value || 15000;
            break;
          case 'veteran_disabled':
            amounts.veteran_disabled =
              exemptionType.default_credit_value || 25000;
            break;
        }
      });

      this.exemptionAmounts = amounts;
    } catch (error) {
      console.warn('Could not load exemption amounts, using defaults:', error);
      // Set default amounts
      this.exemptionAmounts = {
        elderly_base: 15000,
        elderly_senior_bonus: 5000,
        disabled_base: 20000,
        veteran_standard: 10000,
        veteran_all: 15000,
        veteran_disabled: 25000,
      };
    }
  }

  @action
  async loadAvailableExemptionTypes() {
    try {
      const municipalityId = this.municipality.currentMunicipality?.id;
      const exemptionConfigData =
        await this.assessing.getExemptionConfigurationData();
      this.availableExemptionTypes = exemptionConfigData.exemptionTypes || [];
      // Group exemption types by category for UI
      this.groupedExemptionTypes = this.groupExemptionTypesByCategory(
        this.availableExemptionTypes,
      );

      // If no exemption types are available, show a helpful message
      if (this.availableExemptionTypes.length === 0) {
        this.notifications.warning(
          'No exemption types are configured for this municipality. Please contact an administrator to set up exemption types.',
        );
      }
    } catch (error) {
      console.error('Failed to load exemption types:', error);
      this.availableExemptionTypes = [];
      this.groupedExemptionTypes = {};

      // Show a more helpful error message
      if (error.message?.includes('404')) {
        this.notifications.error(
          'Exemption types endpoint not found. Please ensure the server is properly configured.',
        );
      } else {
        this.notifications.error(
          'Failed to load exemption types. Please try again or contact support.',
        );
      }
    }
  }

  /**
   * Group exemption types by category for UI display
   */
  groupExemptionTypesByCategory(exemptionTypes) {
    const grouped = {};
    exemptionTypes.forEach((exemption) => {
      const category = exemption.category || 'General';
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(exemption);
    });
    return grouped;
  }

  @action
  updateBirthDate(event) {
    this.ownerBirthDate = event.target.value;
    this.recalculateExemptions();
  }

  @action
  toggleExemption(exemptionType, event) {
    if (event.target.checked) {
      this.selectedVeteranExemptions.add(exemptionType);
    } else {
      this.selectedVeteranExemptions.delete(exemptionType);
    }

    // Trigger reactivity
    this.selectedVeteranExemptions = new Set(this.selectedVeteranExemptions);
    this.recalculateExemptions();
  }

  @action
  recalculateExemptions() {
    // Update exemption value based on selections or calculation method
    this.exemptionData.exemption_value = this.totalCalculatedExemption;
  }

  @action
  updateUserInput(field, event) {
    const value = parseFloat(event.target.value) || 0;
    this.exemptionData[field] = value;
    this.recalculateExemptions();
  }

  @action
  updateAssessmentValue(event) {
    const value = parseFloat(event.target.value) || 0;
    this.exemptionData.assessment_value = value;
    this.recalculateExemptions();
  }

  @action
  updateExemptionField(field, event) {
    const value =
      event.target.type === 'checkbox'
        ? event.target.checked
        : event.target.type === 'number'
          ? parseFloat(event.target.value) || 0
          : event.target.value;

    this.exemptionData[field] = value;
  }

  @action
  handleSubmit(event) {
    event.preventDefault();
    this.saveExemption();
  }

  @action
  async saveExemption() {
    if (this.isSaving) return;

    this.isSaving = true;
    try {
      // Prepare exemption data for saving
      const saveData = {
        ...this.exemptionData,
        exemption_type_id:
          this.selectedExemptionType?._id ||
          this.args.exemption?.exemption_type_id,
        owner_birth_date: this.ownerBirthDate || null,
        selected_exemption_types: Array.from(this.selectedVeteranExemptions),
        calculated_exemption_value: this.totalCalculatedExemption,
        uploaded_documents: this.uploadedFiles,
        documentation_provided: this.uploadedFiles.length > 0,
      };

      // Ensure only the appropriate value is saved based on exemption_type
      if (this.selectedExemptionType?.exemption_type === 'exemption') {
        saveData.credit_value = 0;
      } else if (this.selectedExemptionType?.exemption_type === 'credit') {
        saveData.exemption_value = 0;
      }

      // Call the parent's save method
      await this.args.onSave(saveData);

      this.notifications.success('Exemption saved successfully');
      this.args.onClose();
    } catch (error) {
      console.error('Failed to save exemption:', error);
      this.notifications.error('Failed to save exemption');
    } finally {
      this.isSaving = false;
    }
  }

  @action
  cancel() {
    this.args.onClose();
  }

  @action
  stopPropagation(event) {
    event.stopPropagation();
  }

  @action
  selectExemptionType(exemptionType) {
    this.selectedExemptionType = exemptionType;

    // Pre-populate default values based on calculation method
    switch (exemptionType.calculation_method) {
      case 'fixed_amount':
        // Only populate the appropriate value based on exemption_type
        if (exemptionType.exemption_type === 'exemption') {
          this.exemptionData.exemption_value =
            exemptionType.default_exemption_value || 0;
          this.exemptionData.credit_value = 0;
        } else {
          this.exemptionData.exemption_value = 0;
          this.exemptionData.credit_value =
            exemptionType.default_credit_value || 0;
        }
        break;
      case 'percentage_of_assessment':
        // Will be calculated when assessment value is entered
        this.exemptionData.exemption_value = 0;
        this.exemptionData.credit_value = 0;
        break;
      case 'user_entered_amount':
        // Initialize with minimum value if set
        this.exemptionData.user_entered_amount =
          exemptionType.min_exemption_amount || 0;
        if (exemptionType.exemption_type === 'exemption') {
          this.exemptionData.exemption_value =
            this.exemptionData.user_entered_amount;
          this.exemptionData.credit_value = 0;
        } else {
          this.exemptionData.exemption_value = 0;
          this.exemptionData.credit_value =
            this.exemptionData.user_entered_amount;
        }
        break;
      case 'user_entered_percentage':
        // Initialize with minimum percentage if set
        this.exemptionData.user_entered_percentage =
          exemptionType.min_percentage || 0;
        this.exemptionData.exemption_value = 0; // Will be calculated when assessment value is entered
        this.exemptionData.credit_value = 0;
        break;
      default:
        // Legacy fallback - only populate the appropriate value
        if (exemptionType.exemption_type === 'exemption') {
          this.exemptionData.exemption_value =
            exemptionType.default_exemption_value || 0;
          this.exemptionData.credit_value = 0;
        } else {
          this.exemptionData.exemption_value = 0;
          this.exemptionData.credit_value =
            exemptionType.default_credit_value || 0;
        }
    }

    // Recalculate exemption value
    this.recalculateExemptions();

    // Go to details step
    this.currentStep = 2;
  }

  @action
  goToStep(step) {
    this.currentStep = step;
  }

  @action
  nextStep() {
    if (this.currentStep < 3) {
      this.currentStep++;
    }
  }

  @action
  previousStep() {
    if (this.currentStep > 1) {
      this.currentStep--;
    }
  }

  @action
  async handleFileUpload(event) {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;

    this.isUploadingFiles = true;

    try {
      for (const file of files) {
        // Here you would upload the file to your server
        // For now, we'll just add it to the local array
        const uploadedFile = {
          filename: file.name,
          original_name: file.name,
          file_size: file.size,
          mime_type: file.type,
          uploaded_at: new Date(),
        };

        this.uploadedFiles = [...this.uploadedFiles, uploadedFile];
      }

      this.notifications.success(
        `${files.length} file(s) uploaded successfully`,
      );
    } catch (error) {
      console.error('Failed to upload files:', error);
      this.notifications.error('Failed to upload files');
    } finally {
      this.isUploadingFiles = false;
    }
  }

  @action
  removeUploadedFile(fileIndex) {
    this.uploadedFiles = this.uploadedFiles.filter(
      (_, index) => index !== fileIndex,
    );
  }
}
