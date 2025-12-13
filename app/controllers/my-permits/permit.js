import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';

export default class MyPermitsPermitController extends Controller {
  @service router;
  @service api;
  @service notifications;
  @service('current-user') currentUser;

  @tracked activeTab = 'overview';
  @tracked showScheduleInspectionModal = false;
  @tracked showUploadDocumentModal = false;
  @tracked showAddCommentModal = false;
  @tracked isLoading = false;

  // Document viewer state
  @tracked showDocumentViewer = false;
  @tracked selectedDocumentForViewing = null;

  // Comment/Communication
  @tracked newCommentText = '';
  @tracked uploadingFiles = [];

  get permit() {
    return this.model.permit;
  }

  get permitStatusSteps() {
    const steps = [
      { label: 'Draft', icon: 'file-alt', status: 'draft' },
      { label: 'Submitted', icon: 'paper-plane', status: 'submitted' },
      { label: 'Under Review', icon: 'search', status: 'under_review' },
      { label: 'Approved', icon: 'check-circle', status: 'approved' },
      { label: 'Active', icon: 'clipboard-check', status: 'active' },
    ];

    return steps;
  }

  get currentStepIndex() {
    const status = this.permit.status;
    const statusMap = {
      draft: 0,
      submitted: 1,
      under_review: 2,
      approved: 3,
      active: 4,
      completed: 4,
      closed: 4,
    };

    return statusMap[status] || 0;
  }

  get departmentReviews() {
    // Get department reviews from permit data
    // This will come from the backend - format: [{ department, approved, reviewedAt, reviewedBy }]
    return this.permit.departmentReviews || [];
  }

  get canScheduleInspection() {
    // Can schedule inspections once permit is approved or active
    return ['approved', 'active'].includes(this.permit.status);
  }

  get canUploadDocuments() {
    // Can upload documents at any time after submission
    return this.permit.status !== 'draft';
  }

  get breadcrumbItems() {
    return [
      { label: 'My Permits', route: 'my-permits' },
      { label: this.permit.permitNumber || 'Permit Details', route: null },
    ];
  }

  // Filter out internal/private comments - contractors should only see public comments
  get publicComments() {
    const comments = this.model.comments || [];
    return comments.filter((comment) => comment.visibility === 'public');
  }

  get statusBadgeClass() {
    const status = this.permit.status;
    const badges = {
      draft: 'avitar-badge--secondary',
      submitted: 'avitar-badge--primary',
      under_review: 'avitar-badge--warning',
      approved: 'avitar-badge--success',
      active: 'avitar-badge--success',
      completed: 'avitar-badge--info',
      denied: 'avitar-badge--danger',
      closed: 'avitar-badge--secondary',
    };

    return `avitar-badge ${badges[status] || 'avitar-badge--secondary'}`;
  }

  @action
  setActiveTab(tab) {
    this.activeTab = tab;
  }

  @action
  backToDashboard() {
    this.router.transitionTo('my-permits');
  }

  @action
  async refreshData() {
    this.isLoading = true;
    try {
      await this.router.refresh('my-permits.permit');
      this.notifications.success('Permit data refreshed');
    } catch (error) {
      this.notifications.error('Failed to refresh data');
    } finally {
      this.isLoading = false;
    }
  }

  @action
  printPermit() {
    window.print();
  }

  // Inspection actions
  @action
  openScheduleInspectionModal() {
    if (!this.canScheduleInspection) {
      this.notifications.warning(
        'Inspections can only be scheduled after permit approval',
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
    this.isLoading = true;
    try {
      // Extract municipalityId - handle both string and ObjectId
      const municipalityId =
        this.permit.municipalityId?._id || this.permit.municipalityId;

      await this.api.post(
        `/municipalities/${municipalityId}/permits/${this.permit._id}/inspections`,
        inspectionData,
      );
      this.notifications.success('Inspection scheduled successfully');
      this.showScheduleInspectionModal = false;
      await this.refreshData();
    } catch (error) {
      this.notifications.error(
        error.message || 'Failed to schedule inspection',
      );
    } finally {
      this.isLoading = false;
    }
  }

  // Document actions
  @action
  openUploadDocumentModal() {
    if (!this.canUploadDocuments) {
      this.notifications.warning('Documents can be uploaded after submission');
      return;
    }

    this.showUploadDocumentModal = true;
  }

  @action
  closeUploadDocumentModal() {
    this.showUploadDocumentModal = false;
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
        formData.append('permitId', this.permit._id);

        await this.api.upload(`/permits/${this.permit._id}/files`, formData);
      }

      this.notifications.success(
        `${files.length} file(s) uploaded successfully`,
      );
      this.showUploadDocumentModal = false;
      await this.refreshData();

      // Clear file input
      event.target.value = '';
    } catch (error) {
      this.notifications.error(
        error.message || 'Failed to upload one or more files',
      );
    } finally {
      this.isLoading = false;
    }
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

  // Communication actions
  @action
  openAddCommentModal() {
    this.showAddCommentModal = true;
  }

  @action
  closeAddCommentModal() {
    this.showAddCommentModal = false;
    this.newCommentText = '';
  }

  @action
  updateCommentText(event) {
    this.newCommentText = event.target.value;
  }

  @action
  async submitComment() {
    if (!this.newCommentText.trim()) {
      this.notifications.warning('Please enter a comment');
      return;
    }

    this.isLoading = true;
    try {
      // Extract municipalityId - handle both string and ObjectId
      const municipalityId =
        this.permit.municipalityId?._id || this.permit.municipalityId;

      await this.api.post(
        `/municipalities/${municipalityId}/permits/${this.permit._id}/comments`,
        {
          text: this.newCommentText.trim(),
          visibility: 'public', // Public comments (visible to everyone)
        },
      );

      this.notifications.success('Message sent successfully');
      this.closeAddCommentModal();
      await this.refreshData();
    } catch (error) {
      this.notifications.error(error.message || 'Failed to send message');
    } finally {
      this.isLoading = false;
    }
  }

  @action
  stopPropagation(event) {
    event.stopPropagation();
  }
}
