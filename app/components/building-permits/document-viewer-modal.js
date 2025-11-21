import Component from '@glimmer/component';
import { action } from '@ember/object';
import { tracked } from '@glimmer/tracking';
import { inject as service } from '@ember/service';
import config from 'avitar-suite/config/environment';

export default class BuildingPermitsDocumentViewerModalComponent extends Component {
  @service api;

  @tracked isLoading = false;
  @tracked error = null;
  @tracked fileUrl = null;

  get shouldLoadFile() {
    return this.args.isOpen && this.args.file;
  }

  get computedFileUrl() {
    if (!this.args.file) return null;
    const token = localStorage.getItem('authToken');
    // Use environment-configured API host
    const apiHost = config.APP.API_HOST;
    const url = `${apiHost}/api/files/${this.args.file._id}/download?token=${token}&inline=true`;
    console.log('🎬 Document viewer URL:', url);
    return url;
  }

  get downloadUrl() {
    if (!this.args.file) return null;
    const token = localStorage.getItem('authToken');
    const apiHost = config.APP.API_HOST;
    // Don't include inline=true since we want to force download
    return `${apiHost}/api/files/${this.args.file._id}/download?token=${token}`;
  }

  get isPDF() {
    return this.args.file?.fileType?.includes('pdf');
  }

  get isImage() {
    return this.args.file?.fileType?.includes('image');
  }

  get canPreview() {
    return this.isPDF || this.isImage;
  }

  @action
  close() {
    if (this.args.onClose) {
      this.args.onClose();
    }
  }

  @action
  stopPropagation(event) {
    event.stopPropagation();
  }

  @action
  async download() {
    if (!this.args.file) return;

    try {
      const token = localStorage.getItem('authToken');
      const apiHost = config.APP.API_HOST;
      const url = `${apiHost}/api/files/${this.args.file._id}/download?token=${token}`;

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
      link.download = this.args.file.originalName || this.args.file.displayName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Clean up the blob URL
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error('Error downloading file:', error);
      alert('Failed to download file. Please try again.');
    }
  }
}
