import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';

export default class MunicipalityBuildingPermitsInspectionController extends Controller {
  @service api;
  @service notifications;
  @service router;

  @tracked isUploadingPhoto = false;
  @tracked photoCaption = '';
  @tracked noteContent = '';
  @tracked isAddingNote = false;
  @tracked isUpdatingStatus = false;
  @tracked selectedStatus = '';
  @tracked selectedResult = '';
  @tracked statusComments = '';

  get inspection() {
    return this.model.inspection;
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
}
