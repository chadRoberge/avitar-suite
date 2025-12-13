import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';

export default class ContractorManagementDocumentsController extends Controller {
  @service api;
  @service notifications;
  @service router;

  @tracked showUploadModal = false;

  get visibilityOptions() {
    return [
      { value: 'private', label: 'Private', description: 'Only you can view' },
      {
        value: 'public',
        label: 'Public',
        description: 'Can be seen by municipalities',
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
  handleBrowserUpload() {
    this.openUploadModal();
  }
}
