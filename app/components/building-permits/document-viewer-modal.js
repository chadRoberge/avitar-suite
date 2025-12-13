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
  @tracked zoomLevel = 100; // Zoom level as percentage
  @tracked annotationPanelHovered = false;

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

  // Get annotations for this specific document
  get documentAnnotations() {
    if (!this.args.comments || !this.args.file) return [];

    const fileName =
      this.args.file.displayName ||
      this.args.file.fileName ||
      this.args.file.originalName;

    // Filter comments that are document annotations for this file
    return this.args.comments.filter((comment) => {
      const content = comment.content || '';
      return (
        content.startsWith('📄 Document Annotation') &&
        content.includes(fileName)
      );
    });
  }

  get hasAnnotations() {
    return this.documentAnnotations.length > 0;
  }

  // Parse annotation content to remove the prefix
  getAnnotationText(comment) {
    const content = comment.content || '';
    const match = content.match(/📄 Document Annotation \([^)]+\): (.+)/);
    return match ? match[1] : content;
  }

  @action
  zoomIn() {
    if (this.zoomLevel < 200) {
      this.zoomLevel += 25;
    }
  }

  @action
  zoomOut() {
    if (this.zoomLevel > 50) {
      this.zoomLevel -= 25;
    }
  }

  @action
  resetZoom() {
    this.zoomLevel = 100;
  }

  @action
  setAnnotationPanelHovered(value) {
    this.annotationPanelHovered = value;
  }

  @action
  close() {
    // Reset zoom when closing
    this.zoomLevel = 100;
    this.annotationPanelHovered = false;
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
