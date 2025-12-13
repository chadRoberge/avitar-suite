import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';

export default class SharedDocumentUploadModalComponent extends Component {
  @service api;
  @service notifications;

  @tracked selectedFiles = [];
  @tracked uploadFolder = '/';
  @tracked uploadDescription = '';
  @tracked uploadTags = '';
  @tracked uploadVisibility = 'private';
  @tracked uploadCategory = '';
  @tracked isLoading = false;

  // Props:
  // @isOpen - Boolean to show/hide modal
  // @onClose - Callback when modal closes
  // @onUpload - Callback when files are uploaded
  // @municipalityId - Municipality ID (for municipal uploads)
  // @contractorId - Contractor ID (for contractor uploads)
  // @department - Department name (e.g., 'building_permit', 'general', 'contractor')
  // @folderOptions - Array of folder options for autocomplete
  // @categoryOptions - Array of category options (optional)
  // @visibilityOptions - Array of visibility options (optional)
  // @showCategory - Boolean to show category field (default: false)

  get visibilityOptions() {
    return (
      this.args.visibilityOptions || [
        { value: 'public', label: 'Public', description: 'Anyone can view' },
        {
          value: 'private',
          label: 'Private',
          description: 'Only authorized users',
        },
        {
          value: 'restricted',
          label: 'Restricted',
          description: 'Requires permission',
        },
      ]
    );
  }

  get folderOptions() {
    return this.args.folderOptions || [{ value: '/', label: 'Root Folder' }];
  }

  get showCategory() {
    return this.args.showCategory || false;
  }

  get categoryOptions() {
    return this.args.categoryOptions || [];
  }

  @action
  handleFileSelection(event) {
    this.selectedFiles = Array.from(event.target.files);
  }

  @action
  updateUploadFolder(event) {
    this.uploadFolder = event.target.value;
  }

  @action
  updateUploadDescription(event) {
    this.uploadDescription = event.target.value;
  }

  @action
  updateUploadTags(event) {
    this.uploadTags = event.target.value;
  }

  @action
  updateUploadVisibility(event) {
    this.uploadVisibility = event.target.value;
  }

  @action
  updateUploadCategory(event) {
    this.uploadCategory = event.target.value;
  }

  @action
  async uploadDocuments() {
    if (this.selectedFiles.length === 0) {
      this.notifications.warning('Please select at least one file');
      return;
    }

    this.isLoading = true;

    try {
      // Determine upload endpoint
      let uploadUrl;
      if (this.args.contractorId) {
        uploadUrl = `/contractors/${this.args.contractorId}/files/upload`;
      } else if (this.args.municipalityId) {
        uploadUrl = `/municipalities/${this.args.municipalityId}/files/upload`;
      } else {
        throw new Error('Either municipalityId or contractorId is required');
      }

      // Upload each file
      for (const file of this.selectedFiles) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('department', this.args.department || 'general');
        formData.append('folder', this.uploadFolder);
        formData.append('visibility', this.uploadVisibility);

        if (this.uploadDescription) {
          formData.append('description', this.uploadDescription);
        }

        if (this.uploadCategory) {
          formData.append('category', this.uploadCategory);
        }

        if (this.uploadTags) {
          const tags = this.uploadTags
            .split(',')
            .map((t) => t.trim())
            .filter((t) => t);
          formData.append('tags', JSON.stringify(tags));
        }

        await this.api.upload(uploadUrl, formData);
      }

      this.notifications.success(
        `${this.selectedFiles.length} file(s) uploaded successfully`,
      );

      // Call onUpload callback
      if (this.args.onUpload) {
        await this.args.onUpload();
      }

      // Reset and close
      this.resetForm();
      this.closeModal();
    } catch (error) {
      console.error('Error uploading files:', error);
      this.notifications.error(
        error.message || 'Failed to upload one or more files',
      );
    } finally {
      this.isLoading = false;
    }
  }

  @action
  resetForm() {
    this.selectedFiles = [];
    this.uploadFolder = '/';
    this.uploadDescription = '';
    this.uploadTags = '';
    this.uploadVisibility = 'private';
    this.uploadCategory = '';
  }

  @action
  closeModal() {
    this.resetForm();
    if (this.args.onClose) {
      this.args.onClose();
    }
  }

  @action
  stopPropagation(event) {
    event.stopPropagation();
  }
}
