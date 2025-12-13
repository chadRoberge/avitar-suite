import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';

export default class MunicipalityBuildingPermitsSettingsDocumentsController extends Controller {
  @service api;
  @service notifications;
  @service router;

  @tracked showUploadModal = false;
  @tracked showCreateFolderModal = false;
  @tracked showEditFileModal = false;
  @tracked selectedFile = null;
  @tracked currentFolder = '/';
  @tracked isLoading = false;

  // Create folder modal fields
  @tracked newFolderPath = '';

  // Edit file modal fields
  @tracked editDisplayName = '';
  @tracked editDescription = '';
  @tracked editFolder = '';
  @tracked editTags = '';
  @tracked editVisibility = '';

  get visibilityOptions() {
    return [
      { value: 'public', label: 'Public', description: 'Anyone can view' },
      {
        value: 'private',
        label: 'Private',
        description: 'Only municipal staff',
      },
      {
        value: 'restricted',
        label: 'Restricted',
        description: 'Requires permission',
      },
    ];
  }

  get folderOptions() {
    const folders = Object.keys(this.model.folders || {});
    return [
      { value: '/', label: 'Root Folder' },
      ...folders.filter((f) => f !== '/').map((f) => ({ value: f, label: f })),
    ];
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
  async refreshFiles() {
    // Refresh the route model after files are uploaded
    this.send('refreshModel');
  }

  @action
  openCreateFolderModal() {
    this.newFolderPath = this.currentFolder === '/' ? '/' : this.currentFolder;
    this.showCreateFolderModal = true;
  }

  @action
  closeCreateFolderModal() {
    this.showCreateFolderModal = false;
    this.newFolderPath = '';
  }

  @action
  async createFolder() {
    if (!this.newFolderPath || this.newFolderPath.trim() === '') {
      this.notifications.warning('Please enter a folder path');
      return;
    }

    // Note: Folders are created automatically when files are uploaded to them
    // This just validates the path
    this.notifications.info(
      'Folder will be created when you upload files to it',
    );
    this.closeCreateFolderModal();
  }

  @action
  openEditFileModal(file) {
    this.selectedFile = file;
    this.editDisplayName = file.displayName || '';
    this.editDescription = file.description || '';
    this.editFolder = file.folder || '/';
    this.editTags = file.tags ? file.tags.join(', ') : '';
    this.editVisibility = file.visibility || 'public';
    this.showEditFileModal = true;
  }

  @action
  closeEditFileModal() {
    this.showEditFileModal = false;
    this.selectedFile = null;
  }

  @action
  async saveFileChanges() {
    if (!this.selectedFile) return;

    this.isLoading = true;

    try {
      const fileId = this.selectedFile._id || this.selectedFile.id;

      const updates = {
        displayName: this.editDisplayName,
        description: this.editDescription,
        folder: this.editFolder,
        visibility: this.editVisibility,
      };

      if (this.editTags) {
        updates.tags = this.editTags
          .split(',')
          .map((t) => t.trim())
          .filter((t) => t);
      }

      await this.api.put(`/files/${fileId}`, updates);

      this.notifications.success('File updated successfully');
      this.closeEditFileModal();
      this.send('refreshModel');
    } catch (error) {
      console.error('Error updating file:', error);
      this.notifications.error(error.message || 'Failed to update file');
    } finally {
      this.isLoading = false;
    }
  }

  @action
  async deleteFile(file) {
    const fileId = file._id || file.id;
    const fileName = file.displayName || file.fileName;

    if (
      !confirm(
        `Are you sure you want to delete "${fileName}"? This action cannot be undone.`,
      )
    ) {
      return;
    }

    this.isLoading = true;

    try {
      await this.api.delete(`/files/${fileId}`);
      this.notifications.success('File deleted successfully');
      this.send('refreshModel');
    } catch (error) {
      console.error('Error deleting file:', error);
      this.notifications.error(error.message || 'Failed to delete file');
    } finally {
      this.isLoading = false;
    }
  }

  @action
  async downloadFile(file) {
    try {
      const fileId = file._id || file.id;
      window.open(`/api/files/${fileId}/download`, '_blank');
    } catch (error) {
      console.error('Error downloading file:', error);
      this.notifications.error('Failed to download file');
    }
  }

  @action
  updateEditDisplayName(event) {
    this.editDisplayName = event.target.value;
  }

  @action
  updateEditDescription(event) {
    this.editDescription = event.target.value;
  }

  @action
  updateEditFolder(event) {
    this.editFolder = event.target.value;
  }

  @action
  updateEditTags(event) {
    this.editTags = event.target.value;
  }

  @action
  updateEditVisibility(event) {
    this.editVisibility = event.target.value;
  }

  @action
  updateNewFolderPath(event) {
    this.newFolderPath = event.target.value;
  }

  @action
  stopPropagation(event) {
    event.stopPropagation();
  }

  @action
  handleBrowserUpload() {
    this.openUploadModal();
  }
}
