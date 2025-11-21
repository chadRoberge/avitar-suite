import Component from '@glimmer/component';
import { inject as service } from '@ember/service';
import { action } from '@ember/object';
import { tracked } from '@glimmer/tracking';
import config from 'avitar-suite/config/environment';

export default class PropertyDocumentsComponent extends Component {
  @service api;
  @service notifications;

  @tracked isListView = true;
  @tracked expandedFolders = {};
  @tracked showViewerModal = false;
  @tracked selectedFile = null;
  @tracked showUploadModal = false;
  @tracked uploadContext = null;

  get documents() {
    const files = this.args.files || [];
    console.log('📂 Component documents getter:', files.length, 'files');
    return files;
  }

  get permits() {
    const permits = this.args.permits || [];
    console.log('📋 Component permits getter:', permits.length, 'permits');
    return permits;
  }

  get hasDocuments() {
    const hasFiles = this.documents.length > 0;
    console.log('❓ hasDocuments:', hasFiles, '(documents:', this.documents.length, ')');
    return hasFiles;
  }

  get organizedDocuments() {
    console.log('🗂️ organizedDocuments getter called');
    console.log('  - documents:', this.documents.length);
    console.log('  - permits:', this.permits.length);

    const projects = [];
    const standalonePermits = [];
    const otherFiles = [];

    // Separate permits into projects and standalone
    const permitMap = new Map();
    const projectMap = new Map();

    this.permits.forEach((permit) => {
      permitMap.set(permit._id, permit);

      if (permit.isProject) {
        projectMap.set(permit._id, {
          ...permit,
          id: permit._id,
          name: permit.projectName || `${permit.permitNumber} - ${permit.subtype}`,
          childPermits: [],
          files: [],
          totalFiles: 0,
        });
      }
    });

    // Organize permits under projects
    this.permits.forEach((permit) => {
      if (permit.projectId && projectMap.has(permit.projectId)) {
        const project = projectMap.get(permit.projectId);
        project.childPermits.push({
          ...permit,
          id: permit._id,
          files: [],
        });
      } else if (!permit.isProject) {
        standalonePermits.push({
          ...permit,
          id: permit._id,
          files: [],
        });
      }
    });

    // Organize files into their respective permits/projects
    this.documents.forEach((file) => {
      if (file.isProjectFile && file.projectId && projectMap.has(file.projectId)) {
        // Project-level file
        const project = projectMap.get(file.projectId);
        project.files.push(file);
        project.totalFiles++;
      } else if (file.permitId) {
        // Permit-specific file
        const permit = permitMap.get(file.permitId);
        if (permit) {
          if (permit.projectId && projectMap.has(permit.projectId)) {
            // Find the child permit within the project
            const project = projectMap.get(permit.projectId);
            const childPermit = project.childPermits.find((p) => p.id === permit._id);
            if (childPermit) {
              childPermit.files.push(file);
              project.totalFiles++;
            }
          } else {
            // Standalone permit
            const standalonePermit = standalonePermits.find((p) => p.id === permit._id);
            if (standalonePermit) {
              standalonePermit.files.push(file);
            }
          }
        }
      } else {
        // Other files (not associated with any permit)
        otherFiles.push(file);
      }
    });

    return {
      projects: Array.from(projectMap.values()).filter((p) => p.totalFiles > 0 || p.childPermits.length > 0),
      standalonePermits: standalonePermits.filter((p) => p.files.length > 0),
      otherFiles,
    };
  }

  @action
  toggleFolder(folderId) {
    this.expandedFolders = {
      ...this.expandedFolders,
      [folderId]: !this.expandedFolders[folderId],
    };
  }

  @action
  toggleViewMode() {
    this.isListView = !this.isListView;
  }

  @action
  uploadDocument() {
    // Open upload modal without specific context
    this.uploadContext = {};
    this.showUploadModal = true;
  }

  @action
  uploadToProject(project) {
    // Open upload modal with project context
    this.uploadContext = {
      permitId: project.id,
      projectName: project.name,
      isProject: true,
    };
    this.showUploadModal = true;
  }

  @action
  uploadToPermit(permit) {
    // Open upload modal with permit context
    this.uploadContext = {
      permitId: permit.id,
      permitNumber: permit.permitNumber,
      isProject: false,
    };
    this.showUploadModal = true;
  }

  @action
  closeUploadModal() {
    this.showUploadModal = false;
    this.uploadContext = null;
  }

  @action
  handleUploadComplete() {
    // Refresh the documents list after upload
    if (this.args.onRefresh) {
      this.args.onRefresh();
    }
  }

  @action
  viewFile(file) {
    this.selectedFile = file;
    this.showViewerModal = true;
  }

  @action
  closeViewerModal() {
    this.showViewerModal = false;
    this.selectedFile = null;
  }

  @action
  async downloadFile(file) {
    try {
      const token = localStorage.getItem('authToken');
      const apiHost = config.APP.API_HOST;
      const url = `${apiHost}/api/files/${file._id}/download?token=${token}`;

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
      link.download = file.originalName || file.displayName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Clean up the blob URL
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error('Error downloading file:', error);
      this.notifications.error('Failed to download file. Please try again.');
    }
  }

  @action
  getFileIcon(extension) {
    const iconMap = {
      pdf: 'file-pdf',
      doc: 'file-word',
      docx: 'file-word',
      xls: 'file-excel',
      xlsx: 'file-excel',
      ppt: 'file-powerpoint',
      pptx: 'file-powerpoint',
      jpg: 'file-image',
      jpeg: 'file-image',
      png: 'file-image',
      gif: 'file-image',
      zip: 'file-archive',
      rar: 'file-archive',
      txt: 'file-alt',
      csv: 'file-csv',
    };

    return iconMap[extension?.toLowerCase()] || 'file';
  }

  @action
  formatFileSize(bytes) {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

  @action
  formatDate(date) {
    if (!date) return '';
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }
}
