import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';

export default class MunicipalityBuildingPermitsReviewController extends Controller {
  @service api;
  @service router;
  @service notifications;
  @service('current-user') currentUser;
  @service municipality;

  // Tab state
  @tracked activeTab = 'documents';

  // Review checklist state
  @tracked checklistItems = [];
  @tracked reviewNotes = '';
  @tracked reviewStatus = 'pending';
  @tracked conditions = [];
  @tracked newCondition = '';

  // Loading states
  @tracked isSubmittingReview = false;
  @tracked isAddingComment = false;

  // Comment visibility for applicant (when requesting revisions or conditional approval)
  @tracked shareWithApplicant = true;

  // Comment state
  @tracked newComment = '';
  @tracked showCommentModal = false;

  // Document annotation state
  @tracked selectedDocument = null;
  @tracked showAnnotationModal = false;
  @tracked annotationText = '';
  @tracked documentAnnotations = {};

  // Document viewer state
  @tracked showDocumentViewer = false;
  @tracked selectedDocumentForViewing = null;

  // Initialize checklist from permit type
  get permit() {
    return this.model.permit;
  }

  get departmentReview() {
    return this.model.departmentReview;
  }

  get documents() {
    return this.model.documents || [];
  }

  get comments() {
    return this.model.comments || [];
  }

  get canSubmitReview() {
    return (
      this.reviewStatus !== 'pending' &&
      (this.reviewStatus === 'approved' || this.reviewNotes.trim().length > 0)
    );
  }

  // Show visibility toggle for statuses that require applicant action
  get showVisibilityToggle() {
    return ['revisions_requested', 'conditionally_approved'].includes(
      this.reviewStatus,
    );
  }

  // Get the comment visibility based on toggle
  get commentVisibility() {
    if (!this.showVisibilityToggle) {
      return 'internal';
    }
    return this.shareWithApplicant ? 'public' : 'internal';
  }

  get reviewStatusOptions() {
    return [
      {
        value: 'approved',
        label: 'Approve',
        class: 'avitar-btn avitar-btn--success',
        icon: 'fa-check',
      },
      {
        value: 'conditionally_approved',
        label: 'Approve with Conditions',
        class: 'avitar-btn avitar-btn--warning',
        icon: 'fa-exclamation-triangle',
      },
      {
        value: 'revisions_requested',
        label: 'Request Revisions',
        class: 'avitar-btn avitar-btn--warning',
        icon: 'fa-edit',
      },
      {
        value: 'rejected',
        label: 'Reject',
        class: 'avitar-btn avitar-btn--danger',
        icon: 'fa-times',
      },
    ];
  }

  get selectedStatusOption() {
    return this.reviewStatusOptions.find(
      (opt) => opt.value === this.reviewStatus,
    );
  }

  // Permit status steps for progress indicator
  get permitStatusSteps() {
    return [
      {
        label: 'Submitted',
        status: 'submitted',
        icon: 'paper-plane',
      },
      {
        label: 'Under Review',
        status: 'under_review',
        icon: 'search',
      },
      {
        label: 'Approved',
        status: 'approved',
        icon: 'check-circle',
      },
      {
        label: 'Issued',
        status: 'issued',
        icon: 'certificate',
      },
    ];
  }

  get currentStepIndex() {
    const status = this.permit.status;
    const statusMap = {
      draft: -1,
      submitted: 0,
      under_review: 1,
      approved: 2,
      issued: 3,
      rejected: 1, // Show as under review
      on_hold: 1, // Show as under review
    };
    return statusMap[status] ?? 0;
  }

  // Department reviews for progress indicator
  get departmentReviews() {
    const reviews = this.permit.departmentReviews || [];
    return reviews.map((review) => ({
      department: review.department,
      approved: review.status === 'approved',
      reviewedAt: review.reviewedAt,
      reviewedBy: review.reviewedBy,
    }));
  }

  get totalFee() {
    const fees = this.permit.fees || [];
    const total = fees.reduce((sum, fee) => sum + (fee.amount || 0), 0);
    return total.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  get hasCustomFields() {
    const customFields = this.permit.customFields;
    if (!customFields) return false;

    // customFields is a Map in Mongoose, but becomes an object in JSON
    if (customFields instanceof Map) {
      return customFields.size > 0;
    }
    return Object.keys(customFields).length > 0;
  }

  get customFieldsArray() {
    const customFields = this.permit.customFields;
    if (!customFields) return [];

    // Get field definitions from permit type
    const permitType = this.permit.permitTypeId;
    const fieldDefinitions = permitType?.customFormFields || [];

    // Create a map of field _id to field definition (customFields uses _id as keys, not id)
    const fieldDefMap = {};
    fieldDefinitions.forEach((field) => {
      if (field._id) {
        const fieldIdStr = String(field._id);
        fieldDefMap[fieldIdStr] = field;
      }
    });

    // Convert Map or object to array with proper labels
    let entries = [];
    if (customFields instanceof Map) {
      entries = Array.from(customFields.entries());
    } else {
      entries = Object.entries(customFields);
    }

    return entries
      .map(([fieldId, value]) => {
        const fieldIdStr = String(fieldId);
        const fieldDef = fieldDefMap[fieldIdStr];
        return {
          label: fieldDef?.label || fieldIdStr, // Use label from definition, fall back to ID
          value: value,
          fieldType: fieldDef?.fieldType,
          unit: fieldDef?.unit,
        };
      })
      .filter((field) => field.value != null && field.value !== ''); // Filter out empty values
  }

  get sortedComments() {
    return [...this.comments].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
    );
  }

  // Tab actions
  @action
  selectTab(tab) {
    this.activeTab = tab;
  }

  // Checklist actions
  @action
  toggleChecklistItem(index) {
    this.checklistItems[index] = {
      ...this.checklistItems[index],
      completed: !this.checklistItems[index].completed,
    };
    this.checklistItems = [...this.checklistItems]; // Trigger reactivity
  }

  @action
  updateReviewNotes(event) {
    this.reviewNotes = event.target.value;
  }

  @action
  selectReviewStatus(status) {
    this.reviewStatus = status;
  }

  @action
  toggleShareWithApplicant() {
    this.shareWithApplicant = !this.shareWithApplicant;
  }

  // Conditions actions
  @action
  updateNewCondition(event) {
    this.newCondition = event.target.value;
  }

  @action
  addCondition() {
    if (this.newCondition.trim()) {
      this.conditions = [...this.conditions, this.newCondition.trim()];
      this.newCondition = '';
    }
  }

  @action
  handleConditionKeydown(event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.addCondition();
    }
  }

  @action
  removeCondition(index) {
    this.conditions = this.conditions.filter((_, i) => i !== index);
  }

  // Comment actions
  @action
  openCommentModal() {
    this.showCommentModal = true;
  }

  @action
  closeCommentModal() {
    this.showCommentModal = false;
    this.newComment = '';
  }

  @action
  updateNewComment(event) {
    this.newComment = event.target.value;
  }

  @action
  async addComment() {
    if (!this.newComment.trim()) {
      this.notifications.warning('Please enter a comment');
      return;
    }

    this.isAddingComment = true;
    try {
      await this.api.post(
        `/municipalities/${this.model.municipalityId}/permits/${this.permit._id}/comments`,
        {
          content: this.newComment.trim(),
          visibility: 'internal',
          department: this.model.departmentName,
        },
      );

      this.notifications.success('Comment added successfully');
      this.closeCommentModal();

      // Refresh model to get new comments
      this.send('refreshModel');
    } catch (error) {
      console.error('Failed to add comment:', error);
      this.notifications.error(error.message || 'Failed to add comment');
    } finally {
      this.isAddingComment = false;
    }
  }

  // Document annotation actions
  @action
  openAnnotationModal(document) {
    this.selectedDocument = document;
    this.annotationText = '';
    this.showAnnotationModal = true;
  }

  @action
  closeAnnotationModal() {
    this.showAnnotationModal = false;
    this.selectedDocument = null;
    this.annotationText = '';
  }

  @action
  updateAnnotationText(event) {
    this.annotationText = event.target.value;
  }

  @action
  async saveAnnotation() {
    if (!this.annotationText.trim()) {
      this.notifications.warning('Please enter an annotation');
      return;
    }

    this.isAddingComment = true;
    try {
      // Save as a comment linked to the document
      await this.api.post(
        `/municipalities/${this.model.municipalityId}/permits/${this.permit._id}/comments`,
        {
          content: `📄 Document Annotation (${this.selectedDocument.displayName || this.selectedDocument.fileName || this.selectedDocument.originalName}): ${this.annotationText.trim()}`,
          visibility: 'internal',
          department: this.model.departmentName,
        },
      );

      this.notifications.success('Annotation saved successfully');
      this.closeAnnotationModal();

      // Refresh to show new comment
      await this.router.refresh('municipality.building-permits.review');
    } catch (error) {
      console.error('Failed to save annotation:', error);
      this.notifications.error(error.message || 'Failed to save annotation');
    } finally {
      this.isAddingComment = false;
    }
  }

  // Review submission
  @action
  async submitReview() {
    if (!this.canSubmitReview) {
      this.notifications.warning(
        'Please select a review status and provide notes if required',
      );
      return;
    }

    // Confirm before submitting
    if (
      !confirm(
        `Are you sure you want to submit your review as "${this.selectedStatusOption?.label}"?`,
      )
    ) {
      return;
    }

    this.isSubmittingReview = true;
    try {
      await this.api.put(
        `/municipalities/${this.model.municipalityId}/permits/${this.permit._id}/reviews/${this.model.departmentName}`,
        {
          status: this.reviewStatus,
          comments: this.reviewNotes.trim(),
          conditions: this.conditions,
          commentVisibility: this.commentVisibility,
        },
      );

      this.notifications.success('Review submitted successfully');

      // Refresh the pending reviews count badge
      console.log('[Review] About to refresh pending reviews count');
      console.log('[Review] Municipality service:', this.municipality);
      console.log(
        '[Review] Current municipality:',
        this.municipality.currentMunicipality,
      );
      await this.municipality.loadPendingReviewsCount();
      console.log(
        '[Review] Pending reviews count refreshed:',
        this.municipality.pendingReviewsCount,
      );

      // Navigate back to queue
      this.router.transitionTo('municipality.building-permits.queue');
    } catch (error) {
      console.error('Failed to submit review:', error);
      this.notifications.error(error.message || 'Failed to submit review');
    } finally {
      this.isSubmittingReview = false;
    }
  }

  @action
  stopPropagation(event) {
    event.stopPropagation();
  }

  @action
  viewDocument(document) {
    this.selectedDocumentForViewing = document;
    this.showDocumentViewer = true;
  }

  @action
  closeDocumentViewer() {
    this.showDocumentViewer = false;
    this.selectedDocumentForViewing = null;
  }
}
