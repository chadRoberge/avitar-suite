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

  @tracked activeTab = 'overview';
  @tracked chatView = 'private'; // 'private' or 'public'
  @tracked newComment = '';
  @tracked showUploadModal = false;
  @tracked showViewerModal = false;
  @tracked showPrintModal = false;
  @tracked selectedFile = null;
  @tracked files = [];
  @tracked comments = [];

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
      reviewedAt: review.reviewedAt,
      reviewedBy: review.reviewedBy,
    }));
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
      const comment = await this.api.post(
        `/municipalities/${this.model.municipalityId}/permits/${this.model.permitId}/comments`,
        {
          content: this.newComment,
          visibility: this.chatView,
          authorId: this.currentUser.user?._id,
          authorName: this.currentUser.user?.fullName,
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
}
