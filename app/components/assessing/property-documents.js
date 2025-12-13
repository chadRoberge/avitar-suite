import Component from '@glimmer/component';
import { inject as service } from '@ember/service';
import { action } from '@ember/object';
import { tracked } from '@glimmer/tracking';

export default class PropertyDocumentsComponent extends Component {
  @service api;
  @service notifications;

  @tracked documents = [];
  @tracked permits = [];
  @tracked isLoading = false;
  @tracked isListView = true;
  @tracked expandedFolders = {};

  constructor() {
    super(...arguments);
    this.loadDocuments();
  }

  async loadDocuments() {
    if (!this.args.propertyId) return;

    this.isLoading = true;
    try {
      // Load all documents for this property
      const filesResponse = await this.api.get(
        `/municipalities/${this.args.municipalityId}/files?propertyId=${this.args.propertyId}`,
      );
      this.documents = filesResponse.files || [];

      // Load all permits for this property (to get project structure)
      const permitsResponse = await this.api.get(
        `/municipalities/${this.args.municipalityId}/permits?propertyId=${this.args.propertyId}`,
      );
      this.permits = permitsResponse.permits || [];
    } catch (error) {
      console.error('Error loading property documents:', error);
      this.notifications.error('Failed to load documents');
    } finally {
      this.isLoading = false;
    }
  }

  get hasDocuments() {
    return this.documents.length > 0;
  }

  get organizedDocuments() {
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
          name:
            permit.projectName || `${permit.permitNumber} - ${permit.subtype}`,
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
      if (
        file.isProjectFile &&
        file.projectId &&
        projectMap.has(file.projectId)
      ) {
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
            const childPermit = project.childPermits.find(
              (p) => p.id === permit._id,
            );
            if (childPermit) {
              childPermit.files.push(file);
              project.totalFiles++;
            }
          } else {
            // Standalone permit
            const standalonePermit = standalonePermits.find(
              (p) => p.id === permit._id,
            );
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
      projects: Array.from(projectMap.values()).filter(
        (p) => p.totalFiles > 0 || p.childPermits.length > 0,
      ),
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
    // Trigger upload modal or action
    if (this.args.onUpload) {
      this.args.onUpload();
    }
  }

  @action
  async downloadFile(fileId) {
    try {
      window.open(`/api/files/${fileId}/download`, '_blank');
    } catch (error) {
      console.error('Error downloading file:', error);
      this.notifications.error('Failed to download file');
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
