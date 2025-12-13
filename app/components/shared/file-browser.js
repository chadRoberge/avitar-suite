import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';

export default class FileBrowserComponent extends Component {
  @service api;
  @service notifications;

  @tracked files = [];
  @tracked folders = {};
  @tracked currentFolder = '/';
  @tracked isLoading = false;
  @tracked searchText = '';
  @tracked selectedFileIds = [];
  @tracked folderStructure = null;
  @tracked expandedFolders = new Set(['/']);
  @tracked showViewerModal = false;
  @tracked fileToView = null;

  // Props
  // @municipalityId - Municipality ID (required for municipal files)
  // @contractorId - Contractor ID (required for contractor files)
  // @department - Default 'building_permit' for municipal, 'contractor' for contractor files
  // @selectionMode - 'single' or 'multiple' (default: 'single')
  // @onSelect - Callback when selection changes
  // @initialSelectedFiles - Array of file IDs to pre-select
  // @showUpload - Show upload button (default: false)
  // @onUpload - Callback when file is uploaded

  constructor() {
    super(...arguments);
    if (this.args.initialSelectedFiles) {
      this.selectedFileIds = [...this.args.initialSelectedFiles];
    }
    this.loadFolderStructure();
    this.loadFiles();
  }

  get isContractorMode() {
    return !!this.args.contractorId;
  }

  get department() {
    return this.args.department || 'building_permit';
  }

  get selectionMode() {
    return this.args.selectionMode || 'single';
  }

  get showUpload() {
    return this.args.showUpload || false;
  }

  get destinationElement() {
    return document.body;
  }

  get filteredFiles() {
    let files = this.files;

    // Filter by current folder
    files = files.filter((file) => {
      const fileFolder = file.folder || '/';
      return fileFolder === this.currentFolder;
    });

    // Filter by search text
    if (this.searchText && this.searchText.trim().length > 0) {
      const searchLower = this.searchText.toLowerCase();
      files = files.filter((file) => {
        return (
          file.displayName?.toLowerCase().includes(searchLower) ||
          file.fileName?.toLowerCase().includes(searchLower) ||
          file.description?.toLowerCase().includes(searchLower) ||
          file.tags?.some((tag) => tag.toLowerCase().includes(searchLower))
        );
      });
    }

    return files;
  }

  get breadcrumbs() {
    if (this.currentFolder === '/') {
      return [{ name: 'Root', path: '/' }];
    }

    const parts = this.currentFolder.split('/').filter((p) => p);
    const breadcrumbs = [{ name: 'Root', path: '/' }];

    let currentPath = '';
    parts.forEach((part) => {
      currentPath += `/${part}`;
      breadcrumbs.push({ name: part, path: currentPath });
    });

    return breadcrumbs;
  }

  get selectedFiles() {
    return this.files.filter((file) =>
      this.selectedFileIds.includes(file._id || file.id),
    );
  }

  get hasSelection() {
    return this.selectedFileIds.length > 0;
  }

  @action
  async loadFolderStructure() {
    if (!this.args.municipalityId && !this.args.contractorId) return;

    try {
      let url;
      let params = {};

      if (this.isContractorMode) {
        url = `/contractors/${this.args.contractorId}/files/folders`;
      } else {
        url = `/municipalities/${this.args.municipalityId}/files/folders`;
        params.department = this.department;
      }

      const response = await this.api.get(url, params);

      this.folderStructure = response.folders || response;
      console.log('Folder structure loaded:', this.folderStructure);
    } catch (error) {
      console.error('Error loading folder structure:', error);
      this.notifications.error('Failed to load folders');
    }
  }

  @action
  async loadFiles() {
    if (!this.args.municipalityId && !this.args.contractorId) return;

    this.isLoading = true;

    try {
      let url;
      const params = {};

      if (this.isContractorMode) {
        url = `/contractors/${this.args.contractorId}/files`;
      } else {
        url = `/municipalities/${this.args.municipalityId}/files`;
        params.department = this.department;
      }

      if (this.currentFolder && this.currentFolder !== '/') {
        params.folder = this.currentFolder;
      }

      const response = await this.api.get(url, params);

      this.files = response.files || response || [];
      console.log(
        `Loaded ${this.files.length} files for folder: ${this.currentFolder}`,
      );
    } catch (error) {
      console.error('Error loading files:', error);
      this.notifications.error('Failed to load files');
    } finally {
      this.isLoading = false;
    }
  }

  @action
  navigateToFolder(folderPath) {
    this.currentFolder = folderPath;
    this.loadFiles();
  }

  @action
  toggleFolder(folderPath) {
    if (this.expandedFolders.has(folderPath)) {
      this.expandedFolders.delete(folderPath);
    } else {
      this.expandedFolders.add(folderPath);
    }
    // Trigger reactivity
    this.expandedFolders = new Set(this.expandedFolders);
  }

  @action
  isFolderExpanded(folderPath) {
    return this.expandedFolders.has(folderPath);
  }

  @action
  selectFile(file) {
    const fileId = file._id || file.id;

    if (this.selectionMode === 'single') {
      // Single selection mode - replace selection
      this.selectedFileIds = [fileId];
    } else {
      // Multiple selection mode - toggle
      if (this.selectedFileIds.includes(fileId)) {
        this.selectedFileIds = this.selectedFileIds.filter(
          (id) => id !== fileId,
        );
      } else {
        this.selectedFileIds = [...this.selectedFileIds, fileId];
      }
    }

    // Notify parent component
    if (this.args.onSelect) {
      this.args.onSelect(this.selectedFiles);
    }
  }

  @action
  isFileSelected(file) {
    const fileId = file._id || file.id;
    return this.selectedFileIds.includes(fileId);
  }

  @action
  clearSelection() {
    this.selectedFileIds = [];
    if (this.args.onSelect) {
      this.args.onSelect([]);
    }
  }

  @action
  updateSearch(event) {
    this.searchText = event.target.value;
  }

  @action
  async handleUpload() {
    // This would open an upload modal or trigger parent's upload handler
    if (this.args.onUpload) {
      await this.args.onUpload();
      // Reload files after upload
      await this.loadFiles();
      await this.loadFolderStructure();
    }
  }

  @action
  getFileIcon(file) {
    const ext = file.fileExtension?.toLowerCase() || '';
    const mimeType = file.fileType?.toLowerCase() || '';

    // Linearicon class names
    if (
      mimeType.startsWith('image/') ||
      ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg'].includes(ext)
    ) {
      return 'picture';
    } else if (ext === 'pdf' || mimeType === 'application/pdf') {
      return 'book';
    } else if (['doc', 'docx'].includes(ext) || mimeType.includes('word')) {
      return 'file-empty';
    } else if (
      ['xls', 'xlsx'].includes(ext) ||
      mimeType.includes('excel') ||
      mimeType.includes('spreadsheet')
    ) {
      return 'chart-bars';
    } else if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
      return 'inbox';
    } else if (['dwg', 'dxf'].includes(ext)) {
      return 'laptop';
    } else {
      return 'file-empty';
    }
  }

  @action
  stopPropagation(event) {
    event.stopPropagation();
  }

  @action
  formatFileSize(bytes) {
    if (!bytes) return 'Unknown';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  @action
  formatDate(date) {
    if (!date) return 'Unknown';
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
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
  async previewFile(file, event) {
    if (event) {
      event.stopPropagation();
    }
    this.fileToView = file;
    this.showViewerModal = true;
  }

  @action
  closeViewerModal() {
    this.showViewerModal = false;
    this.fileToView = null;
  }
}
