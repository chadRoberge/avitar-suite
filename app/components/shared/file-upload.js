import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';

export default class SharedFileUploadComponent extends Component {
  @service api;
  @service notifications;

  @tracked isUploading = false;
  @tracked uploadProgress = 0;

  // Args:
  // @label - Label for the upload button
  // @accept - File type filter (e.g., "image/*", ".pdf")
  // @maxSize - Max file size in MB (default 10)
  // @onUpload - Callback when file is uploaded (receives file ID)
  // @currentFile - Current uploaded file object
  // @required - Whether upload is required

  get maxSizeBytes() {
    return (this.args.maxSize || 10) * 1024 * 1024;
  }

  get hasFile() {
    return !!this.args.currentFile;
  }

  @action
  async handleFileSelect(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file size
    if (file.size > this.maxSizeBytes) {
      this.notifications.error(
        `File size must be less than ${this.args.maxSize || 10}MB`,
      );
      event.target.value = '';
      return;
    }

    await this.uploadFile(file);
    event.target.value = ''; // Reset input
  }

  async uploadFile(file) {
    this.isUploading = true;
    this.uploadProgress = 0;

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', 'contractor_verification');

      // Upload file
      const response = await this.api.uploadFile('/files/upload', formData, {
        onProgress: (progress) => {
          this.uploadProgress = progress;
        },
      });

      this.notifications.success('File uploaded successfully');
      this.args.onUpload?.(response.file._id);
    } catch (error) {
      console.error('Error uploading file:', error);
      this.notifications.error(error.message || 'Failed to upload file');
    } finally {
      this.isUploading = false;
      this.uploadProgress = 0;
    }
  }

  @action
  removeFile() {
    this.args.onUpload?.(null);
  }
}
