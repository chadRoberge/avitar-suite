import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';

export default class ContractorManagementVerificationController extends Controller {
  @service api;
  @service notifications;
  @service router;
  @service('current-user') currentUser;

  @tracked isLoading = false;
  @tracked isSaving = false;
  @tracked isCreatingProfile = false;

  // Onboarding step tracking
  @tracked onboardingStep = 1; // 1 = plan selection, 2 = company info
  @tracked selectedPlan = null;

  // Onboarding form data (for creating contractor profile)
  @tracked onboardingData = {
    company_name: '',
    license_number: '',
    license_state: '',
    license_type: 'general_contractor',
    license_expiration: '',
    business_info: {
      address: {
        street: '',
        city: '',
        state: '',
        zip: '',
      },
      phone: '',
      email: '',
    },
  };

  // Form data - licenses array
  @tracked licenses = [];

  // Form data - driver's license
  @tracked driversLicense = {
    license_number: '',
    issuing_state: '',
    expiration_date: '',
    file_id: null,
  };

  // Form data - insurance
  @tracked insurance = {
    has_insurance: false,
    policy_number: '',
    provider: '',
    coverage_amount: '',
    expiration_date: '',
    file_id: null,
  };

  get verification() {
    return this.model.verification;
  }

  get needsOnboarding() {
    return this.model.needsOnboarding || !this.model.contractor;
  }

  get availablePlans() {
    return this.model.availablePlans || [];
  }

  // Transform plans for module card display
  get planCards() {
    const plans = this.availablePlans;

    return plans.map((plan) => {
      // Determine linearicon and color based on plan key
      let icon = 'gift'; // linearicon name without lnr- prefix
      let color = 'gray';
      let tier = plan.plan_key || 'basic';

      if (plan.plan_key === 'free') {
        icon = 'gift';
        color = 'blue';
      } else if (plan.plan_key === 'premium') {
        icon = 'star';
        color = 'purple';
      } else if (plan.plan_key === 'pro') {
        icon = 'rocket';
        color = 'gold';
      }

      // Extract feature list (server already extracted from marketing_features)
      const featureList = plan.features || [];

      // Build pricing display
      // Note: Server already converts from cents to dollars
      let pricingText = 'Free';
      if (plan.pricing && plan.pricing.amount > 0) {
        const amount = plan.pricing.amount.toFixed(2);
        const interval = plan.pricing.interval || 'month';
        pricingText = `$${amount}/${interval}`;
      }

      return {
        // Original plan data
        originalPlan: plan,
        // Module card format
        name: plan.name || tier.charAt(0).toUpperCase() + tier.slice(1),
        icon,
        color,
        tier,
        description: plan.description || `${tier} contractor subscription plan`,
        pricing: pricingText,
        features: featureList,
        hasAccess: false, // Set to false to prevent footer LinkTo from rendering
      };
    });
  }

  get canSelectPlan() {
    return this.selectedPlan !== null;
  }

  get canCreateProfile() {
    const valid =
      this.selectedPlan &&
      this.onboardingData.company_name &&
      this.onboardingData.license_number &&
      this.onboardingData.license_state &&
      this.onboardingData.license_expiration;

    return valid;
  }

  get canSubmit() {
    // Must have at least one license
    if (!this.licenses.length) return false;

    // Must have driver's license info
    if (
      !this.driversLicense.license_number ||
      !this.driversLicense.issuing_state ||
      !this.driversLicense.expiration_date ||
      !this.driversLicense.file_id
    ) {
      return false;
    }

    // All licenses must have required fields
    const allLicensesValid = this.licenses.every(
      (license) =>
        license.type &&
        license.license_number &&
        license.issuing_state &&
        license.expiration_date &&
        license.file_id,
    );

    return allLicensesValid;
  }

  get isDraft() {
    return this.verification?.status === 'draft';
  }

  get isSubmitted() {
    return ['submitted', 'under_review'].includes(this.verification?.status);
  }

  get isApproved() {
    return this.verification?.status === 'approved';
  }

  get isRejected() {
    return this.verification?.status === 'rejected';
  }

  get isExpired() {
    return this.verification?.status === 'expired';
  }

  get canEdit() {
    return !this.verification || this.isDraft || this.isRejected;
  }

  get statusBadgeClass() {
    const status = this.verification?.status;
    const badges = {
      draft: 'avitar-badge avitar-badge--secondary',
      submitted: 'avitar-badge avitar-badge--primary',
      under_review: 'avitar-badge avitar-badge--info',
      approved: 'avitar-badge avitar-badge--success',
      rejected: 'avitar-badge avitar-badge--danger',
      expired: 'avitar-badge avitar-badge--warning',
    };
    return badges[status] || 'avitar-badge avitar-badge--secondary';
  }

  get statusText() {
    const status = this.verification?.status;
    const texts = {
      draft: 'Draft',
      submitted: 'Submitted',
      under_review: 'Under Review',
      approved: 'Approved',
      rejected: 'Rejected',
      expired: 'Expired',
    };
    return texts[status] || 'Not Started';
  }

  get licenseTypeOptions() {
    return [
      { value: 'general_contractor', label: 'General Contractor' },
      { value: 'electrical', label: 'Electrical' },
      { value: 'plumbing', label: 'Plumbing' },
      { value: 'hvac', label: 'HVAC' },
    ];
  }

  get stateOptions() {
    return [
      'AL',
      'AK',
      'AZ',
      'AR',
      'CA',
      'CO',
      'CT',
      'DE',
      'FL',
      'GA',
      'HI',
      'ID',
      'IL',
      'IN',
      'IA',
      'KS',
      'KY',
      'LA',
      'ME',
      'MD',
      'MA',
      'MI',
      'MN',
      'MS',
      'MO',
      'MT',
      'NE',
      'NV',
      'NH',
      'NJ',
      'NM',
      'NY',
      'NC',
      'ND',
      'OH',
      'OK',
      'OR',
      'PA',
      'RI',
      'SC',
      'SD',
      'TN',
      'TX',
      'UT',
      'VT',
      'VA',
      'WA',
      'WV',
      'WI',
      'WY',
    ].map((state) => ({ value: state, label: state }));
  }

  // Initialize form from existing verification
  setupFormData() {
    if (this.verification) {
      this.licenses = this.verification.licenses || [];
      this.driversLicense = this.verification.drivers_license || {
        license_number: '',
        issuing_state: '',
        expiration_date: '',
        file_id: null,
      };
      this.insurance = this.verification.insurance || {
        has_insurance: false,
        policy_number: '',
        provider: '',
        coverage_amount: '',
        expiration_date: '',
        file_id: null,
      };
    }
  }

  @action
  addLicense() {
    this.licenses = [
      ...this.licenses,
      {
        type: '',
        license_number: '',
        issuing_state: '',
        issue_date: '',
        expiration_date: '',
        file_id: null,
      },
    ];
  }

  @action
  removeLicense(index) {
    this.licenses = this.licenses.filter((_, i) => i !== index);
  }

  @action
  updateLicense(index, field, event) {
    const value = event.target.value;
    const updated = [...this.licenses];
    updated[index] = { ...updated[index], [field]: value };
    this.licenses = updated;
  }

  @action
  updateDriversLicense(field, event) {
    this.driversLicense = {
      ...this.driversLicense,
      [field]: event.target.value,
    };
  }

  @action
  updateInsurance(field, event) {
    const value =
      event.target.type === 'checkbox'
        ? event.target.checked
        : event.target.value;
    this.insurance = { ...this.insurance, [field]: value };
  }

  @action
  handleLicenseFileUpload(index, fileId) {
    this.updateLicense(index, 'file_id', fileId);
  }

  @action
  handleDriversLicenseFileUpload(fileId) {
    this.driversLicense = { ...this.driversLicense, file_id: fileId };
  }

  @action
  handleInsuranceFileUpload(fileId) {
    this.insurance = { ...this.insurance, file_id: fileId };
  }

  @action
  async saveDraft() {
    if (!this.canEdit) return;

    this.isSaving = true;
    try {
      const response = await this.api.post(
        '/contractor-verification/my-verification',
        {
          licenses: this.licenses,
          drivers_license: this.driversLicense,
          insurance: this.insurance,
        },
      );

      this.model.verification = response.verification;
      this.notifications.success('Draft saved successfully');
    } catch (error) {
      console.error('Error saving draft:', error);
      this.notifications.error(error.message || 'Failed to save draft');
    } finally {
      this.isSaving = false;
    }
  }

  @action
  async submitForReview() {
    if (!this.canSubmit || !this.canEdit) return;

    // Save draft first
    await this.saveDraft();

    if (!this.model.verification) {
      this.notifications.error('Please save your application first');
      return;
    }

    this.isLoading = true;
    try {
      const response = await this.api.post(
        '/contractor-verification/my-verification/submit',
      );

      this.model.verification = response.verification;
      this.notifications.success(
        'Verification application submitted successfully! You will be notified once it has been reviewed.',
      );
    } catch (error) {
      console.error('Error submitting verification:', error);
      this.notifications.error(error.message || 'Failed to submit application');
    } finally {
      this.isLoading = false;
    }
  }

  @action
  resetForm() {
    this.setupFormData();
    this.notifications.info('Form reset to saved state');
  }

  @action
  selectPlan(planCard) {
    // Store the original plan data for submission
    this.selectedPlan = planCard.originalPlan;
  }

  @action
  nextOnboardingStep() {
    if (this.onboardingStep === 1 && this.canSelectPlan) {
      this.onboardingStep = 2;
      window.scrollTo(0, 0);
    }
  }

  @action
  previousOnboardingStep() {
    if (this.onboardingStep === 2) {
      this.onboardingStep = 1;
      window.scrollTo(0, 0);
    }
  }

  @action
  updateOnboardingField(field, event) {
    // Reassign the entire object to trigger reactivity
    this.onboardingData = {
      ...this.onboardingData,
      [field]: event.target.value,
    };
  }

  @action
  updateOnboardingNestedField(parent, field, event) {
    const value = event.target.value;

    if (parent === 'business_info.address') {
      // Update nested address field
      this.onboardingData = {
        ...this.onboardingData,
        business_info: {
          ...this.onboardingData.business_info,
          address: {
            ...this.onboardingData.business_info.address,
            [field]: value,
          },
        },
      };
    } else if (parent === 'business_info') {
      // Update business_info field
      this.onboardingData = {
        ...this.onboardingData,
        business_info: {
          ...this.onboardingData.business_info,
          [field]: value,
        },
      };
    }
  }

  @action
  async createContractorProfile() {
    if (!this.canCreateProfile) {
      this.notifications.error(
        'Please fill in all required fields and select a plan',
      );
      return;
    }

    this.isCreatingProfile = true;

    try {
      const payload = {
        ...this.onboardingData,
        selected_plan: this.selectedPlan
          ? {
              plan_key: this.selectedPlan.plan_key,
              product_id: this.selectedPlan.id,
              price_id: this.selectedPlan.pricing?.price_id,
            }
          : null,
      };

      const response = await this.api.post('/contractors', payload);

      // If there's a subscription that requires payment, handle it
      if (response.subscription?.client_secret) {
        this.notifications.info(
          'Redirecting to payment... (Stripe integration pending)',
        );
        // TODO: Integrate Stripe payment element here
      }

      this.notifications.success(
        'Contractor profile created successfully! You can now upload verification documents.',
      );

      // Refresh current user to get updated contractor_id
      await this.currentUser.load();

      // Redirect to refresh the route and load contractor data
      this.router.transitionTo('contractor-management.verification');
    } catch (error) {
      console.error('Error creating contractor profile:', error);
      this.notifications.error(
        error.message || 'Failed to create contractor profile',
      );
    } finally {
      this.isCreatingProfile = false;
    }
  }
}
