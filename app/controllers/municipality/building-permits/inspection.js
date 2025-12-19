import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';

export default class MunicipalityBuildingPermitsInspectionController extends Controller {
  @service api;
  @service notifications;
  @service router;
  @service municipality;

  @tracked isUploadingPhoto = false;
  @tracked photoCaption = '';
  @tracked noteContent = '';
  @tracked isAddingNote = false;
  @tracked isUpdatingStatus = false;
  @tracked selectedStatus = '';
  @tracked selectedResult = '';
  @tracked statusComments = '';
  @tracked activeTab = 'checklist'; // 'checklist', 'issues', 'photos', or 'notes'

  // Issue editing state
  @tracked showEditIssueModal = false;
  @tracked editingIssue = null;
  @tracked issueDescription = '';
  @tracked issueLocation = '';
  @tracked issueSeverity = 'major';
  @tracked isSavingIssue = false;
  @tracked issuePhotos = []; // Photos for the issue being edited
  @tracked isUploadingIssuePhoto = false;

  // Post-scan photo prompt
  @tracked showPostScanPhotoModal = false;
  @tracked justLinkedIssue = null;

  // Checklist completion tracking (from child component)
  @tracked checklistLoaded = false;
  @tracked checklistCompletionPercent = 0;

  get inspection() {
    return this.model.inspection;
  }

  get linkedIssues() {
    return this.model.linkedIssues || [];
  }

  get hasLinkedIssues() {
    return this.linkedIssues.length > 0;
  }

  getIssueSeverityBadge(severity) {
    const badges = {
      critical: 'avitar-badge--danger',
      major: 'avitar-badge--warning',
      minor: 'avitar-badge--info',
    };
    return `avitar-badge ${badges[severity] || 'avitar-badge--secondary'}`;
  }

  getIssueStatusBadge(status) {
    const badges = {
      pending: 'avitar-badge--secondary',
      open: 'avitar-badge--warning',
      contractor_viewed: 'avitar-badge--info',
      corrected: 'avitar-badge--primary',
      verified: 'avitar-badge--success',
      closed: 'avitar-badge--secondary',
    };
    return `avitar-badge ${badges[status] || 'avitar-badge--secondary'}`;
  }

  get severityOptions() {
    return [
      {
        value: 'critical',
        label: 'Critical',
        description: 'Must be fixed immediately',
      },
      {
        value: 'major',
        label: 'Major',
        description: 'Must be fixed before proceeding',
      },
      {
        value: 'minor',
        label: 'Minor',
        description: 'Should be fixed but not blocking',
      },
    ];
  }

  // Destination element for modal to render at document body level
  get destinationElement() {
    return document.body;
  }

  get statusOptions() {
    return [
      { value: 'scheduled', label: 'Scheduled' },
      { value: 'in_progress', label: 'In Progress' },
      { value: 'completed', label: 'Completed' },
      { value: 'cancelled', label: 'Cancelled' },
      { value: 'no_access', label: 'No Access' },
      { value: 'rescheduled', label: 'Rescheduled' },
    ];
  }

  get resultOptions() {
    return [
      { value: '', label: '(No Result)' },
      { value: 'pending', label: 'Pending' },
      { value: 'passed', label: 'Passed' },
      { value: 'failed', label: 'Failed' },
      { value: 'partial', label: 'Partial Pass' },
      { value: 'conditional', label: 'Conditional Pass' },
    ];
  }

  formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }

  formatTime(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }

  formatInspectionType(type) {
    return type
      ?.split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  getStatusBadge(status) {
    const badges = {
      scheduled: 'avitar-badge--primary',
      in_progress: 'avitar-badge--warning',
      completed: 'avitar-badge--info',
      passed: 'avitar-badge--success',
      failed: 'avitar-badge--danger',
      cancelled: 'avitar-badge--secondary',
      rescheduled: 'avitar-badge--warning',
    };
    return `avitar-badge ${badges[status] || 'avitar-badge--secondary'}`;
  }

  formatStatus(status) {
    return status
      ?.split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  @action
  handlePhotoSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Convert to base64
    const reader = new FileReader();
    reader.onload = async (e) => {
      await this.uploadPhoto(e.target.result);
    };
    reader.readAsDataURL(file);
  }

  @action
  async uploadPhoto(base64Data) {
    if (this.isUploadingPhoto) return;

    this.isUploadingPhoto = true;

    try {
      await this.api.post(
        `/municipalities/${this.model.municipalityId}/inspections/${this.inspection._id}/photos`,
        {
          base64Data,
          caption: this.photoCaption.trim(),
        },
      );

      this.notifications.success('Photo uploaded successfully');
      this.photoCaption = '';

      // Refresh model
      this.router.refresh();
    } catch (error) {
      this.notifications.error(error.message || 'Failed to upload photo');
    } finally {
      this.isUploadingPhoto = false;
    }
  }

  @action
  updatePhotoCaption(event) {
    this.photoCaption = event.target.value;
  }

  @action
  updateNoteContent(event) {
    this.noteContent = event.target.value;
  }

  @action
  async addNote() {
    if (!this.noteContent.trim() || this.isAddingNote) return;

    this.isAddingNote = true;

    try {
      await this.api.post(
        `/municipalities/${this.model.municipalityId}/inspections/${this.inspection._id}/notes`,
        {
          content: this.noteContent.trim(),
        },
      );

      this.notifications.success('Note added successfully');
      this.noteContent = '';

      // Refresh model
      this.router.refresh();
    } catch (error) {
      this.notifications.error(error.message || 'Failed to add note');
    } finally {
      this.isAddingNote = false;
    }
  }

  @action
  setStatus(event) {
    this.selectedStatus = event.target.value;
  }

  @action
  setResult(event) {
    this.selectedResult = event.target.value;
  }

  @action
  updateStatusComments(event) {
    this.statusComments = event.target.value;
  }

  @action
  async updateInspectionStatus() {
    if (!this.selectedStatus || this.isUpdatingStatus) return;

    this.isUpdatingStatus = true;

    try {
      await this.api.patch(
        `/municipalities/${this.model.municipalityId}/inspections/${this.inspection._id}/status`,
        {
          status: this.selectedStatus,
          result: this.selectedResult || undefined,
          comments: this.statusComments.trim() || undefined,
        },
      );

      this.notifications.success('Inspection status updated successfully');
      this.selectedStatus = '';
      this.selectedResult = '';
      this.statusComments = '';

      // Refresh model
      this.router.refresh();
    } catch (error) {
      this.notifications.error(
        error.message || 'Failed to update inspection status',
      );
    } finally {
      this.isUpdatingStatus = false;
    }
  }

  @action
  goBack() {
    this.router.transitionTo('municipality.building-permits.inspections');
  }

  @action
  viewPermit() {
    if (this.inspection.permitId?._id) {
      this.router.transitionTo(
        'municipality.building-permits.permit',
        this.inspection.permitId._id,
      );
    }
  }

  @action
  handleStatusChange() {
    // Status was changed via the dropdown component
    // Refresh the route to get the updated inspection data
    this.router.refresh();
  }

  @action
  handlePhotoAdded() {
    // Photo was added via the gallery component
    // Refresh the route to get the updated inspection data with new photo
    this.router.refresh();
  }

  @action
  handlePhotoDeleted() {
    // Photo was deleted via the gallery component
    // Refresh the route to get the updated inspection data without the deleted photo
    this.router.refresh();
  }

  @action
  handleChecklistLoaded(checklistData) {
    // Receive checklist stats from the child component
    this.checklistLoaded = true;
    this.checklistCompletionPercent = checklistData.completionPercent || 0;
  }

  @action
  handleIssueLinked(issue) {
    // Issue card was scanned and linked to this inspection
    // Switch to issues tab to show the newly linked issue
    this.activeTab = 'issues';
    // Show prompt to add a photo to the issue
    this.openPostScanPhotoModal(issue);
  }

  @action
  setActiveTab(tab) {
    this.activeTab = tab;
  }

  @action
  openEditIssueModal(issue) {
    this.editingIssue = issue;
    this.issueDescription = issue.description || '';
    this.issueLocation = issue.location || '';
    this.issueSeverity = issue.severity || 'major';
    this.issuePhotos = issue.photos || [];
    this.showEditIssueModal = true;
  }

  @action
  closeEditIssueModal() {
    this.showEditIssueModal = false;
    this.editingIssue = null;
    this.issueDescription = '';
    this.issueLocation = '';
    this.issueSeverity = 'major';
    this.issuePhotos = [];
  }

  @action
  handleIssuePhotoSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      await this.uploadIssuePhoto(e.target.result);
    };
    reader.readAsDataURL(file);

    // Reset the input so the same file can be selected again
    event.target.value = '';
  }

  @action
  async uploadIssuePhoto(base64Data) {
    if (this.isUploadingIssuePhoto || !this.editingIssue) return;

    this.isUploadingIssuePhoto = true;

    try {
      const response = await this.api.post(
        `/municipalities/${this.model.municipalityId}/inspection-issues/${this.editingIssue.issueNumber}/photos`,
        { base64Data },
      );

      this.notifications.success('Photo uploaded successfully');

      // Update local photos array
      this.issuePhotos = [...this.issuePhotos, response.photo];
    } catch (error) {
      this.notifications.error(error.message || 'Failed to upload photo');
    } finally {
      this.isUploadingIssuePhoto = false;
    }
  }

  @action
  async deleteIssuePhoto(photo) {
    if (!confirm('Are you sure you want to delete this photo?')) return;

    try {
      await this.api.delete(
        `/municipalities/${this.model.municipalityId}/inspection-issues/${this.editingIssue.issueNumber}/photos/${photo._id}`,
      );

      this.notifications.success('Photo deleted');
      this.issuePhotos = this.issuePhotos.filter((p) => p._id !== photo._id);
    } catch (error) {
      this.notifications.error(error.message || 'Failed to delete photo');
    }
  }

  // Post-scan photo modal actions
  @action
  openPostScanPhotoModal(issue) {
    this.justLinkedIssue = issue;
    this.showPostScanPhotoModal = true;
  }

  @action
  closePostScanPhotoModal() {
    this.showPostScanPhotoModal = false;
    this.justLinkedIssue = null;
    this.router.refresh();
  }

  @action
  handlePostScanPhotoSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      await this.uploadPostScanPhoto(e.target.result);
    };
    reader.readAsDataURL(file);

    event.target.value = '';
  }

  @action
  async uploadPostScanPhoto(base64Data) {
    if (this.isUploadingIssuePhoto || !this.justLinkedIssue) return;

    this.isUploadingIssuePhoto = true;

    try {
      await this.api.post(
        `/municipalities/${this.model.municipalityId}/inspection-issues/${this.justLinkedIssue.issueNumber}/photos`,
        { base64Data },
      );

      this.notifications.success('Photo uploaded successfully');
    } catch (error) {
      this.notifications.error(error.message || 'Failed to upload photo');
    } finally {
      this.isUploadingIssuePhoto = false;
    }
  }

  @action
  skipPostScanPhoto() {
    this.closePostScanPhotoModal();
  }

  @action
  updateIssueField(field, event) {
    this[field] = event.target.value;
  }

  @action
  async saveIssue() {
    if (this.isSavingIssue || !this.editingIssue) return;

    this.isSavingIssue = true;

    try {
      await this.api.patch(
        `/municipalities/${this.model.municipalityId}/inspection-issues/${this.editingIssue.issueNumber}`,
        {
          description: this.issueDescription.trim(),
          location: this.issueLocation.trim(),
          severity: this.issueSeverity,
        },
      );

      this.notifications.success('Issue updated successfully');
      this.closeEditIssueModal();
      this.router.refresh();
    } catch (error) {
      this.notifications.error(error.message || 'Failed to update issue');
    } finally {
      this.isSavingIssue = false;
    }
  }

  @action
  stopPropagation(event) {
    event.stopPropagation();
  }
}
