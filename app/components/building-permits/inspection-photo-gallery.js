import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';

export default class BuildingPermitsInspectionPhotoGalleryComponent extends Component {
  @service api;
  @service notifications;

  @tracked showUploadModal = false;
  @tracked selectedPhoto = null;
  @tracked showPhotoModal = false;
  @tracked isDeleting = false;

  get sortedPhotos() {
    const photos = this.args.inspection?.photos || [];
    // Sort by uploadedAt descending (newest first)
    return photos.sort((a, b) => {
      const dateA = new Date(a.uploadedAt);
      const dateB = new Date(b.uploadedAt);
      return dateB - dateA;
    });
  }

  @action
  openUploadModal() {
    this.showUploadModal = true;
  }

  @action
  closeUploadModal() {
    this.showUploadModal = false;
  }

  @action
  openPhotoModal(photo) {
    this.selectedPhoto = photo;
    this.showPhotoModal = true;
  }

  @action
  closePhotoModal() {
    this.showPhotoModal = false;
    this.selectedPhoto = null;
  }

  @action
  async handlePhotoUpload(uploadedFile) {
    // Refresh inspection data to get new photo
    if (this.args.onPhotoAdded) {
      this.args.onPhotoAdded(uploadedFile);
    }
    this.closeUploadModal();
  }

  @action
  async deletePhoto(photo) {
    if (
      !confirm(
        'Are you sure you want to delete this photo? This action cannot be undone.',
      )
    ) {
      return;
    }

    this.isDeleting = true;

    try {
      await this.api.delete(
        `/municipalities/${this.args.municipalityId}/inspections/${this.args.inspection.id}/photos/${photo._id}`,
      );

      this.notifications.success('Photo deleted successfully');

      // Call callback to refresh inspection data
      if (this.args.onPhotoDeleted) {
        this.args.onPhotoDeleted(photo);
      }

      this.closePhotoModal();
    } catch (error) {
      console.error('Error deleting photo:', error);
      this.notifications.error('Failed to delete photo');
    } finally {
      this.isDeleting = false;
    }
  }

  @action
  stopPropagation(event) {
    event.stopPropagation();
  }
}
