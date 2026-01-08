import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import config from 'avitar-suite/config/environment';

export default class MunicipalityBuildingPermitsPermitController extends Controller {
  @service api;
  @service router;
  @service notifications;
  @service('current-user') currentUser;
  @service municipality;

  @tracked activeTab = 'overview';
  @tracked chatView = 'private'; // 'private' or 'public'
  @tracked newComment = '';
  @tracked showUploadModal = false;
  @tracked showViewerModal = false;
  @tracked showPrintModal = false;
  @tracked selectedFile = null;
  @tracked files = [];
  @tracked comments = [];

  // Payment state
  @tracked showPaymentModal = false;
  @tracked paymentBreakdown = null;
  @tracked clientSecret = null;
  @tracked paymentIntentId = null;
  @tracked stripeAccountId = null;
  @tracked isProcessingPayment = false;

  // Mark as paid modal state (for staff)
  @tracked showMarkPaidModal = false;
  @tracked markPaidPaymentMethod = 'check';
  @tracked markPaidReceiptNumber = '';
  @tracked markPaidNotes = '';
  @tracked isMarkingAsPaid = false;

  // Resubmit state (for applicants)
  @tracked showResubmitModal = false;
  @tracked resubmitMessage = '';
  @tracked isResubmitting = false;

  // Schedule inspection state
  @tracked showScheduleInspectionModal = false;
  @tracked isSchedulingInspection = false;

  get breadcrumbItems() {
    if (!this.model.fromContractorDashboard) {
      return [];
    }

    const items = [
      {
        label: 'Contractor Dashboard',
        route: 'my-permits.index',
        icon: 'hard-hat',
      },
      {
        label: this.model.municipality?.name || 'Municipality',
        icon: 'building',
      },
      {
        label: `Permit #${this.model.permit?.permitNumber || 'Loading...'}`,
        icon: 'file-alt',
      },
    ];

    return items;
  }

  get permitStatusSteps() {
    return [
      {
        key: 'submitted',
        label: 'Submitted',
        status: 'submitted',
        icon: 'paper-plane',
      },
      {
        key: 'under_review',
        label: 'Under Review',
        status: 'under_review',
        icon: 'search',
      },
      {
        key: 'approved',
        label: 'Approved',
        status: 'approved',
        icon: 'check-circle',
      },
      {
        key: 'inspections',
        label: 'Inspections',
        status: 'inspections',
        icon: 'clipboard-check',
      },
      {
        key: 'completed',
        label: 'Completed',
        status: 'completed',
        icon: 'flag-checkered',
      },
    ];
  }

  get currentStepIndex() {
    const status = this.model.permit.status;
    const statusMap = {
      draft: -1,
      submitted: 0,
      under_review: 1,
      approved: 2,
      inspections: 3,
      completed: 4,
      issued: 4, // Issued = Completed
      rejected: 1, // Show as under review
      on_hold: 1, // Show as under review
    };
    return statusMap[status] ?? 0;
  }

  // Department reviews for progress indicator
  get departmentReviews() {
    const reviews = this.model.permit?.departmentReviews || [];
    return reviews.map((review) => ({
      department: review.department,
      approved: review.status === 'approved',
      status: review.status,
      reviewedAt: review.reviewedAt,
      reviewedBy: review.reviewedBy,
    }));
  }

  // Check if applicant can resubmit the permit (when revisions are requested)
  get canResubmit() {
    // Only applicants can resubmit
    const isApplicant =
      this.currentUser.isContractor || this.currentUser.isCitizen;
    if (!isApplicant) return false;

    const reviews = this.model.permit?.departmentReviews || [];
    return reviews.some((r) => r.status === 'revisions_requested');
  }

  // Get list of departments that requested revisions
  get departmentsRequestingRevisions() {
    const reviews = this.model.permit?.departmentReviews || [];
    return reviews
      .filter((r) => r.status === 'revisions_requested')
      .map((r) => r.department);
  }

  get privateComments() {
    return this.comments.filter(
      (c) => c.visibility === 'private' || c.visibility === 'internal',
    );
  }

  get publicComments() {
    return this.comments.filter((c) => c.visibility === 'public');
  }

  get displayedComments() {
    return this.chatView === 'private'
      ? this.privateComments
      : this.publicComments;
  }

  get canEditPermit() {
    return this.currentUser.hasModulePermission(
      this.model.municipalityId,
      'building_permit',
      'update',
    );
  }

  // Get departments assigned to this permit that the current user can review
  get userReviewableDepartments() {
    const permit = this.model.permit;
    if (!permit?.departmentReviews || !permit.departmentReviews.length) {
      return [];
    }

    // Get user's department for this municipality
    const userDepartment =
      this.currentUser?.currentMunicipalPermissions?.department;

    if (!userDepartment) {
      return [];
    }

    // Find reviews for this user's department that are pending or in_review
    return permit.departmentReviews.filter(
      (review) =>
        review.department === userDepartment &&
        ['pending', 'in_review'].includes(review.status),
    );
  }

  get canReviewPermit() {
    return this.userReviewableDepartments.length > 0;
  }

  // Permits can only be printed once approved
  get canPrint() {
    const status = this.model.permit?.status;
    const printableStatuses = [
      'approved',
      'inspections',
      'completed',
      'issued',
    ];
    return printableStatuses.includes(status);
  }

  // Check if permit can be paid online - only for applicants (residents/contractors), not staff
  get canPayOnline() {
    const status = this.model.permit?.status;
    const isPendingPayment = status === 'draft' || status === 'pending_payment';
    const hasFees = this.model.permit?.totalFees > 0;

    // Only show to contractors/citizens (applicants), not municipal staff
    const isApplicant =
      this.currentUser.isContractor || this.currentUser.isCitizen;

    return isApplicant && isPendingPayment && hasFees;
  }

  get municipalityId() {
    return this.model.municipalityId;
  }

  get permitId() {
    return this.model.permitId;
  }

  // Check if staff can mark this permit as paid (pending payment or draft with fees)
  // Only for municipal staff, not applicants (contractors/citizens)
  get canMarkAsPaid() {
    const status = this.model.permit?.status;
    const hasFees = this.model.permit?.totalFees > 0;
    const isPendingPayment = status === 'pending_payment' || status === 'draft';

    // Must NOT be an applicant (contractor/citizen)
    const isApplicant =
      this.currentUser.isContractor || this.currentUser.isCitizen;
    if (isApplicant) {
      return false;
    }

    // Check if user has any building permit permissions that would indicate staff access
    // This includes module-level permissions OR department-level access (for inspectors)
    const hasModulePermissions =
      this.currentUser.hasModulePermission(
        this.model.municipalityId,
        'building_permit',
        'update',
      ) ||
      this.currentUser.hasModulePermission(
        this.model.municipalityId,
        'building_permit',
        'inspect',
      ) ||
      this.currentUser.hasModulePermission(
        this.model.municipalityId,
        'building_permit',
        'approve',
      );

    // Also check if user has department-based access (can review permits)
    const hasDepartmentAccess = this.userReviewableDepartments.length > 0;

    // Or check if user is municipal staff (not contractor/citizen) and has any municipal permissions
    const isMunicipalStaff = this.currentUser.isMunicipalStaff;

    const hasPermitAccess =
      hasModulePermissions || hasDepartmentAccess || isMunicipalStaff;

    return hasPermitAccess && isPendingPayment && hasFees;
  }

  get paymentMethodOptions() {
    return [
      { value: 'check', label: 'Check' },
      { value: 'cash', label: 'Cash' },
      { value: 'money_order', label: 'Money Order' },
      { value: 'other', label: 'Other' },
    ];
  }

  @action
  setActiveTab(tab) {
    this.activeTab = tab;
  }

  @action
  setChatView(view) {
    this.chatView = view;
  }

  @action
  updateComment(event) {
    this.newComment = event.target.value;
  }

  @action
  async sendComment() {
    if (!this.newComment.trim()) {
      return;
    }

    try {
      // Include department for staff/avitar staff users
      const userDepartment = this.currentUser.isMunicipalStaff
        ? this.currentUser.currentMunicipalPermissions?.department
        : null;

      const comment = await this.api.post(
        `/municipalities/${this.model.municipalityId}/permits/${this.model.permitId}/comments`,
        {
          content: this.newComment,
          visibility: this.chatView,
          authorId: this.currentUser.user?._id,
          authorName: this.currentUser.user?.fullName,
          department: userDepartment,
        },
      );

      console.log('Comment created:', comment);

      // Add the new comment to the tracked comments array
      this.comments = [...this.comments, comment];

      // Clear the input
      this.newComment = '';

      this.notifications.success('Comment added');
    } catch (error) {
      console.error('Error adding comment:', error);
      this.notifications.error('Failed to add comment');
    }
  }

  @action
  openUploadModal() {
    console.log('openUploadModal called');
    this.showUploadModal = true;
    console.log('showUploadModal is now:', this.showUploadModal);
  }

  @action
  closeUploadModal() {
    this.showUploadModal = false;
  }

  @action
  viewFile(file) {
    this.selectedFile = file;
    this.showViewerModal = true;
  }

  @action
  closeViewerModal() {
    this.showViewerModal = false;
    this.selectedFile = null;
  }

  @action
  printPermit() {
    this.showPrintModal = true;
  }

  @action
  closePrintModal() {
    this.showPrintModal = false;
  }

  @action
  triggerPrint() {
    window.print();
  }

  @action
  stopPropagation(event) {
    event.stopPropagation();
  }

  @action
  handleFileUploaded(uploadedFile) {
    this.files = [...this.files, uploadedFile];
  }

  @action
  refreshData() {
    this.router.refresh('municipality.building-permits.permit');
    this.notifications.success('Data refreshed');
  }

  @action
  editPermit() {
    this.router.transitionTo(
      'municipality.building-permits.edit',
      this.model.permitId,
    );
  }

  @action
  async deleteFile(file) {
    if (
      !confirm(
        `Are you sure you want to permanently delete "${file.displayName}"? This action cannot be undone.`,
      )
    ) {
      return;
    }

    try {
      await this.api.delete(`/files/${file._id}?hardDelete=true`);

      // Remove file from the tracked list
      this.files = this.files.filter((f) => f._id !== file._id);
      this.notifications.success('File permanently deleted');
    } catch (error) {
      console.error('Error deleting file:', error);
      this.notifications.error(error.message || 'Failed to delete file');
    }
  }

  @action
  async downloadFile(file) {
    try {
      const token = localStorage.getItem('authToken');
      const apiHost = config.APP.API_HOST;
      const url = `${apiHost}/api/files/${file._id}/download?token=${token}`;

      // Fetch the file
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to download file');

      // Get the blob
      const blob = await response.blob();

      // Create a temporary URL for the blob
      const blobUrl = window.URL.createObjectURL(blob);

      // Create a temporary link and trigger download
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = file.originalName || file.displayName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Clean up the blob URL
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error('Error downloading file:', error);
      this.notifications.error('Failed to download file. Please try again.');
    }
  }

  @action
  reviewPermit() {
    if (!this.canReviewPermit) {
      return;
    }

    // Get the first reviewable department (user should only be in one department)
    const review = this.userReviewableDepartments[0];
    const departmentName = review.department;

    this.router.transitionTo(
      'municipality.building-permits.review',
      this.model.permitId,
      departmentName,
    );
  }

  @action
  viewInspection(inspection) {
    this.router.transitionTo(
      'municipality.building-permits.inspection',
      inspection._id,
    );
  }

  @action
  async initiatePayment() {
    this.isProcessingPayment = true;

    try {
      // Step 1: Calculate payment
      const paymentCalc = await this.api.post(
        `/municipalities/${this.municipalityId}/permits/${this.permitId}/calculate-payment`,
      );

      // API returns { breakdown: { permitFee, processingFees, totalAmount, ... } }
      const breakdown = paymentCalc.breakdown || {};

      this.paymentBreakdown = {
        permitFee: breakdown.permitFee?.toFixed(2) || '0.00',
        processingFees: breakdown.processingFees?.toFixed(2) || '0.00',
        totalAmount: breakdown.totalAmount || 0,
      };

      // Step 2: Check if payment is required
      if (breakdown.totalAmount <= 0) {
        this.notifications.info('No payment required for this permit.');
        await this.submitPermitWithoutPayment();
        return;
      }

      // Step 3: Create payment intent
      const paymentIntent = await this.api.post(
        `/municipalities/${this.municipalityId}/permits/${this.permitId}/create-payment-intent`,
      );

      this.clientSecret = paymentIntent.clientSecret;
      this.paymentIntentId = paymentIntent.paymentIntentId;
      this.stripeAccountId = paymentIntent.stripeAccountId;

      // Step 4: Show payment modal
      this.showPaymentModal = true;
    } catch (error) {
      console.error('Payment initiation error:', error);
      this.notifications.error(
        error.message || 'Failed to calculate payment. Please try again.',
      );
    } finally {
      this.isProcessingPayment = false;
    }
  }

  async submitPermitWithoutPayment() {
    try {
      await this.api.put(
        `/municipalities/${this.municipalityId}/permits/${this.permitId}`,
        { status: 'submitted' },
      );

      this.notifications.success('Permit submitted successfully!');
      this.router.refresh('municipality.building-permits.permit');
    } catch (error) {
      console.error('Submit error:', error);
      this.notifications.error(
        error.message || 'Failed to submit permit. Please try again.',
      );
    }
  }

  @action
  async handlePaymentSuccess() {
    try {
      // Use dedicated confirm-payment endpoint which verifies payment and updates permit
      await this.api.post(
        `/municipalities/${this.municipalityId}/permits/${this.permitId}/confirm-payment`,
        {
          paymentIntentId: this.paymentIntentId,
        },
      );

      this.showPaymentModal = false;
      this.notifications.success(
        'Payment successful! Your permit has been submitted for review.',
      );

      // Refresh the permit data
      this.router.refresh('municipality.building-permits.permit');
    } catch (error) {
      console.error('Error updating permit after payment:', error);
      this.notifications.error(
        'Payment was processed but there was an error updating the permit. Please contact support.',
      );
    }
  }

  @action
  closePaymentModal() {
    this.showPaymentModal = false;
    this.clientSecret = null;
    this.paymentIntentId = null;
    this.paymentBreakdown = null;
  }

  @action
  openMarkPaidModal() {
    this.showMarkPaidModal = true;
    this.markPaidPaymentMethod = 'check';
    this.markPaidReceiptNumber = '';
    this.markPaidNotes = '';
  }

  @action
  closeMarkPaidModal() {
    this.showMarkPaidModal = false;
  }

  @action
  updateMarkPaidField(field, event) {
    this[field] = event.target.value;
  }

  @action
  async confirmMarkAsPaid() {
    this.isMarkingAsPaid = true;

    try {
      await this.api.post(
        `/municipalities/${this.municipalityId}/permits/${this.permitId}/mark-paid`,
        {
          paymentMethod: this.markPaidPaymentMethod,
          receiptNumber: this.markPaidReceiptNumber,
          notes: this.markPaidNotes,
        },
      );

      this.showMarkPaidModal = false;
      this.notifications.success(
        'Payment recorded successfully. Permit has been submitted for review.',
      );

      // Refresh the permit data
      this.router.refresh('municipality.building-permits.permit');
    } catch (error) {
      console.error('Error marking permit as paid:', error);
      this.notifications.error(
        error.message || 'Failed to record payment. Please try again.',
      );
    } finally {
      this.isMarkingAsPaid = false;
    }
  }

  // Resubmit actions (for applicants)
  @action
  openResubmitModal() {
    this.showResubmitModal = true;
    this.resubmitMessage = '';
  }

  @action
  closeResubmitModal() {
    this.showResubmitModal = false;
    this.resubmitMessage = '';
  }

  @action
  updateResubmitMessage(event) {
    this.resubmitMessage = event.target.value;
  }

  @action
  async resubmitPermit() {
    if (
      !confirm(
        'Are you sure you want to resubmit this permit? The requesting departments will be notified to re-review.',
      )
    ) {
      return;
    }

    this.isResubmitting = true;
    try {
      await this.api.post(
        `/municipalities/${this.municipalityId}/permits/${this.permitId}/resubmit`,
        {
          message: this.resubmitMessage.trim() || null,
        },
      );

      this.notifications.success(
        'Permit resubmitted successfully! Reviewers have been notified.',
      );
      this.closeResubmitModal();

      // Refresh the pending reviews count badge
      await this.municipality.loadPendingReviewsCount();

      // Refresh the permit data
      this.router.refresh('municipality.building-permits.permit');
    } catch (error) {
      console.error('Error resubmitting permit:', error);
      this.notifications.error(error.message || 'Failed to resubmit permit');
    } finally {
      this.isResubmitting = false;
    }
  }

  // Check if inspections can be scheduled (permit must be approved or active)
  get canScheduleInspection() {
    const status = this.model.permit?.status;
    return ['approved', 'active', 'inspections', 'issued'].includes(status);
  }

  // Schedule inspection actions
  @action
  openScheduleInspectionModal() {
    if (!this.canScheduleInspection) {
      this.notifications.warning(
        'Inspections can only be scheduled for approved or active permits.',
      );
      return;
    }
    this.showScheduleInspectionModal = true;
  }

  @action
  closeScheduleInspectionModal() {
    this.showScheduleInspectionModal = false;
  }

  @action
  async scheduleInspection(inspectionData) {
    this.isSchedulingInspection = true;
    try {
      await this.api.post(
        `/municipalities/${this.municipalityId}/permits/${this.permitId}/inspections`,
        inspectionData,
      );

      this.notifications.success('Inspection scheduled successfully!');
      this.closeScheduleInspectionModal();

      // Refresh the permit data to show the new inspection
      this.router.refresh('municipality.building-permits.permit');
    } catch (error) {
      console.error('Error scheduling inspection:', error);
      this.notifications.error(
        error.message || 'Failed to schedule inspection',
      );
    } finally {
      this.isSchedulingInspection = false;
    }
  }
}
