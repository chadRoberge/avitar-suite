import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';

export default class BuildingPermitsDocumentUploadModalComponent extends Component {
  @service api;
  @service notifications;

  @tracked selectedFiles = [];
  @tracked documentType = 'site-plan';
  @tracked description = '';
  @tracked isUploading = false;

  documentTypeOptions = [
    { value: 'site-plan', label: 'Site Plan' },
    { value: 'survey', label: 'Survey' },
    { value: 'license', label: 'License' },
    { value: 'picture', label: 'Picture' },
    { value: 'blueprint', label: 'Blueprint' },
    { value: 'inspection-report', label: 'Inspection Report' },
    { value: 'application', label: 'Application' },
    { value: 'correspondence', label: 'Correspondence' },
    { value: 'contract', label: 'Contract' },
    { value: 'certificate', label: 'Certificate' },
    { value: 'other', label: 'Other' },
  ];

  @action
  handleFileSelect(event) {
    const files = event.target.files;
    if (files && files.length > 0) {
      this.selectedFiles = Array.from(files);
    }
  }

  @action
  selectDocumentType(value) {
    this.documentType = value;
  }

  @action
  updateDescription(event) {
    this.description = event.target.value;
  }

  @action
  removeFile(index) {
    this.selectedFiles = this.selectedFiles.filter((_, i) => i !== index);
  }

  @action
  async uploadFiles() {
    if (this.selectedFiles.length === 0) {
      this.notifications.error('Please select at least one file');
      return;
    }

    if (!this.documentType) {
      this.notifications.error('Please select a document type');
      return;
    }

    this.isUploading = true;

    try {
      for (const file of this.selectedFiles) {
        const formData = new FormData();
        formData.append('file', file);

        // Extract propertyId - handle both object and string
        const propertyId =
          typeof this.args.propertyId === 'object'
            ? this.args.propertyId?._id || this.args.propertyId?.id
            : this.args.propertyId;
        formData.append('propertyId', propertyId);

        formData.append('department', 'building_permit');
        formData.append('category', this.documentType);
        formData.append('displayName', file.name);
        formData.append(
          'description',
          this.description || `${this.documentType} document`,
        );
        formData.append('visibility', 'private');
        formData.append('permitId', this.args.permitId);
        formData.append('permitNumber', this.args.permitNumber || '');

        if (this.args.isProject) {
          formData.append('isProjectFile', 'true');
          formData.append('projectId', this.args.permitId);
          formData.append('projectName', this.args.projectName);
        }

        const uploadedFile = await this.api.upload(
          `/municipalities/${this.args.municipalityId}/files/upload`,
          formData,
        );

        this.notifications.success(`${file.name} uploaded successfully`);

        // Call the onUpload callback if provided
        if (this.args.onUpload) {
          this.args.onUpload(uploadedFile);
        }
      }

      // Reset form
      this.selectedFiles = [];
      this.description = '';
      this.documentType = 'site-plan';

      // Close modal
      if (this.args.onClose) {
        this.args.onClose();
      }
    } catch (error) {
      console.error('Error uploading files:', error);
      this.notifications.error(error.message || 'Failed to upload files');
    } finally {
      this.isUploading = false;
    }
  }

  @action
  cancel() {
    this.selectedFiles = [];
    this.description = '';
    this.documentType = 'site-plan';

    if (this.args.onClose) {
      this.args.onClose();
    }
  }

  @action
  stopPropagation(event) {
    event.stopPropagation();
  }
}
