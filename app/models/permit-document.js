import Model, { attr, belongsTo } from '@ember-data/model';

export default class PermitDocumentModel extends Model {
  // References
  @attr('string') municipalityId;
  @belongsTo('permit', { async: true, inverse: 'documents' }) permit;
  @belongsTo('permit-inspection', { async: true, inverse: null }) inspection;

  // Document Classification
  @attr('string') type;
  // Options: application, site_plan, floor_plan, elevation, survey, structural_calc,
  // approval_letter, inspection_report, certificate_of_occupancy, photo,
  // correspondence, invoice, receipt, other
  @attr('string') subtype;

  // File Information
  @attr('string') filename;
  @attr('string') originalFilename;
  @attr('string') url; // Google Cloud Storage URL
  @attr('string') thumbnailUrl;
  @attr('number') size; // Size in bytes
  @attr('string') mimeType;

  // Metadata
  @attr('string') title;
  @attr('string') description;
  @attr('number', { defaultValue: 1 }) version;
  @attr('string') supersedes; // Previous version ID

  // Access Control
  @attr() visibility; // { public, commercial, owner, municipal }

  // Document Dates
  @attr('date') documentDate;
  @attr('date') expirationDate;
  @attr('date') receivedDate;

  // Upload Information
  @belongsTo('user', { async: true, inverse: null }) uploadedBy;
  @attr('string') uploadedByName;
  @attr('string', { defaultValue: 'web_upload' }) uploadSource;
  // Options: web_upload, mobile_app, email, scan, system_generated

  // Review/Approval
  @attr('boolean', { defaultValue: false }) requiresReview;
  @attr('boolean', { defaultValue: false }) reviewed;
  @belongsTo('user', { async: true, inverse: null }) reviewedBy;
  @attr('date') reviewedDate;
  @attr('string') reviewNotes;
  @attr('boolean', { defaultValue: false }) approved;
  @belongsTo('user', { async: true, inverse: null }) approvedBy;
  @attr('date') approvedDate;

  // Google Cloud Storage Metadata
  @attr() gcsMetadata; // { bucket, path, generation, contentType }

  // Processing
  @attr('string', { defaultValue: 'completed' }) processingStatus;
  // Options: pending, processing, completed, failed
  @attr('string') processingError;

  // OCR and Text Extraction
  @attr('string') extractedText;
  @attr('boolean', { defaultValue: false }) ocrCompleted;
  @attr('date') ocrDate;

  // Tags and Categorization
  @attr() tags; // Array of strings
  @attr('string') category;

  // System Fields
  @attr('string') updatedBy;
  @attr('boolean', { defaultValue: true }) isActive;
  @attr('date') deletedAt;
  @attr('string') deletedBy;
  @attr('date') createdAt;
  @attr('date') updatedAt;

  // === Computed Properties ===

  get typeDisplay() {
    const types = {
      application: 'Application',
      site_plan: 'Site Plan',
      floor_plan: 'Floor Plan',
      elevation: 'Elevation Drawing',
      survey: 'Survey',
      structural_calc: 'Structural Calculations',
      approval_letter: 'Approval Letter',
      inspection_report: 'Inspection Report',
      certificate_of_occupancy: 'Certificate of Occupancy',
      photo: 'Photograph',
      correspondence: 'Correspondence',
      invoice: 'Invoice',
      receipt: 'Receipt',
      other: 'Other Document',
    };
    return types[this.type] || this.type;
  }

  get typeIcon() {
    const icons = {
      application: 'file-alt',
      site_plan: 'map',
      floor_plan: 'th',
      elevation: 'building',
      survey: 'map-marked-alt',
      structural_calc: 'calculator',
      approval_letter: 'check-circle',
      inspection_report: 'clipboard-check',
      certificate_of_occupancy: 'certificate',
      photo: 'image',
      correspondence: 'envelope',
      invoice: 'file-invoice-dollar',
      receipt: 'receipt',
      other: 'file',
    };
    return icons[this.type] || 'file';
  }

  get sizeMB() {
    if (!this.size) return 0;
    return (this.size / (1024 * 1024)).toFixed(2);
  }

  get sizeDisplay() {
    if (!this.size) return '0 B';
    const kb = this.size / 1024;
    if (kb < 1024) {
      return `${kb.toFixed(1)} KB`;
    }
    const mb = kb / 1024;
    if (mb < 1024) {
      return `${mb.toFixed(2)} MB`;
    }
    const gb = mb / 1024;
    return `${gb.toFixed(2)} GB`;
  }

  get isImage() {
    return this.mimeType && this.mimeType.startsWith('image/');
  }

  get isPDF() {
    return this.mimeType === 'application/pdf';
  }

  get isVideo() {
    return this.mimeType && this.mimeType.startsWith('video/');
  }

  get isDocument() {
    const docTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
    ];
    return docTypes.includes(this.mimeType);
  }

  get extension() {
    if (!this.filename) return null;
    const parts = this.filename.split('.');
    return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : null;
  }

  get displayName() {
    return this.title || this.originalFilename || this.filename;
  }

  get formattedUploadDate() {
    if (!this.createdAt) return 'Unknown';
    return new Date(this.createdAt).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  get formattedDocumentDate() {
    if (!this.documentDate) return 'N/A';
    return new Date(this.documentDate).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  get isExpired() {
    if (!this.expirationDate) return false;
    return new Date() > new Date(this.expirationDate);
  }

  get daysUntilExpiration() {
    if (!this.expirationDate) return null;
    const now = new Date();
    const exp = new Date(this.expirationDate);
    const days = Math.floor((exp - now) / (1000 * 60 * 60 * 24));
    return days;
  }

  get isExpiringSoon() {
    const days = this.daysUntilExpiration;
    return days !== null && days >= 0 && days <= 30;
  }

  get needsReview() {
    return this.requiresReview && !this.reviewed;
  }

  get isApproved() {
    return this.approved;
  }

  get isRejected() {
    return this.reviewed && !this.approved;
  }

  get reviewStatus() {
    if (!this.requiresReview) return 'Not Required';
    if (!this.reviewed) return 'Pending Review';
    if (this.approved) return 'Approved';
    return 'Rejected';
  }

  get reviewStatusBadge() {
    const status = this.reviewStatus;
    const badges = {
      'Not Required': {
        text: 'Not Required',
        class: 'avitar-badge avitar-badge--secondary',
      },
      'Pending Review': {
        text: 'Pending Review',
        class: 'avitar-badge avitar-badge--warning',
      },
      Approved: {
        text: 'Approved',
        class: 'avitar-badge avitar-badge--success',
      },
      Rejected: {
        text: 'Rejected',
        class: 'avitar-badge avitar-badge--danger',
      },
    };
    return badges[status] || badges['Not Required'];
  }

  get processingStatusBadge() {
    const badges = {
      pending: {
        text: 'Processing Pending',
        class: 'avitar-badge avitar-badge--secondary',
      },
      processing: {
        text: 'Processing',
        class: 'avitar-badge avitar-badge--info',
      },
      completed: {
        text: 'Ready',
        class: 'avitar-badge avitar-badge--success',
      },
      failed: {
        text: 'Processing Failed',
        class: 'avitar-badge avitar-badge--danger',
      },
    };
    return badges[this.processingStatus] || badges.completed;
  }

  get isProcessing() {
    return ['pending', 'processing'].includes(this.processingStatus);
  }

  get hasProcessingError() {
    return this.processingStatus === 'failed' && !!this.processingError;
  }

  get canPreview() {
    return this.isImage || this.isPDF || this.processingStatus === 'completed';
  }

  get canDownload() {
    return !!this.url && this.processingStatus === 'completed';
  }

  get hasThumbnail() {
    return !!this.thumbnailUrl;
  }

  get hasExtractedText() {
    return !!this.extractedText;
  }

  get tagsList() {
    return this.tags || [];
  }

  get hasVersion() {
    return this.version > 1;
  }

  get versionDisplay() {
    return `v${this.version}`;
  }

  get uploadSourceDisplay() {
    const sources = {
      web_upload: 'Web Upload',
      mobile_app: 'Mobile App',
      email: 'Email',
      scan: 'Scan',
      system_generated: 'System Generated',
    };
    return sources[this.uploadSource] || this.uploadSource;
  }

  // === Visibility Helpers ===

  get isPublic() {
    return this.visibility?.public || false;
  }

  get isCommercialVisible() {
    return this.visibility?.commercial || false;
  }

  get isOwnerVisible() {
    return this.visibility?.owner || false;
  }

  get isMunicipalOnly() {
    return (
      this.visibility?.municipal &&
      !this.visibility?.public &&
      !this.visibility?.commercial &&
      !this.visibility?.owner
    );
  }
}
