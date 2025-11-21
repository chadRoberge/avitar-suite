import Model, { attr, belongsTo, hasMany } from '@ember-data/model';

export default class PermitModel extends Model {
  // Municipality and Property References
  @attr('string') municipalityId;
  @attr('string') propertyId; // Reference to PropertyTreeNode ObjectId
  @attr('string') pidRaw;
  @attr('string') pidFormatted;
  @attr('string') propertyAddress;

  // Building/Card Reference (for multi-building properties)
  @attr('number') cardNumber;
  @attr('string') buildingAssessmentId;

  // Permit Identification
  @attr('string') permitNumber;
  @attr('string') type; // building, electrical, plumbing, mechanical, demolition, zoning
  @attr('string') subtype;

  // Status
  @attr('string', { defaultValue: 'draft' }) status;
  // Status options: draft, submitted, under_review, approved, denied, on_hold, expired, closed, cancelled

  // Applicant Information
  @attr() applicant; // { name, email, phone, address, relationshipToProperty }

  // Contractor Information
  @attr() contractor; // { companyName, licenseNumber, contactName, email, phone, address }

  // Project Details
  @attr('string') description;
  @attr('string') scopeOfWork;
  @attr('number', { defaultValue: 0 }) estimatedValue;
  @attr('number') squareFootage;

  // Important Dates
  @attr('date') applicationDate;
  @attr('date') reviewStartDate;
  @attr('date') approvalDate;
  @attr('date') issuanceDate;
  @attr('date') expirationDate;
  @attr('date') completionDate;
  @attr('date') finalInspectionDate;

  // Fees
  @attr() fees; // Array of fee objects

  // Location (GIS)
  @attr() location; // { type: 'Point', coordinates: [lng, lat] }

  // Access Control
  @attr() visibility; // { public, commercial, owner }

  // Internal Notes
  @attr() internalNotes; // Array of note objects

  // Assignment
  @belongsTo('user', { async: true, inverse: null }) assignedInspector;
  @belongsTo('user', { async: true, inverse: null }) assignedReviewer;
  @attr('number', { defaultValue: 0 }) priorityLevel;

  // Approval/Denial
  @belongsTo('user', { async: true, inverse: null }) approvedBy;
  @attr('string') approvalNotes;
  @attr('string') denialReason;
  @belongsTo('user', { async: true, inverse: null }) deniedBy;

  // Relationships
  @hasMany('permit-inspection', { async: true, inverse: 'permit' })
  inspections;
  @hasMany('permit-document', { async: true, inverse: 'permit' }) documents;

  // Audit Trail
  @belongsTo('user', { async: true, inverse: null }) createdBy;
  @belongsTo('user', { async: true, inverse: null }) updatedBy;
  @attr() statusHistory; // Array of status change objects

  // System Fields
  @attr('boolean', { defaultValue: true }) isActive;
  @attr('date') deletedAt;
  @attr('date') createdAt;
  @attr('date') updatedAt;

  // === Computed Properties ===

  get totalFees() {
    if (!this.fees || !Array.isArray(this.fees)) return 0;
    return this.fees.reduce((sum, fee) => sum + (fee.amount || 0), 0);
  }

  get unpaidFees() {
    if (!this.fees || !Array.isArray(this.fees)) return [];
    return this.fees.filter((fee) => !fee.paid);
  }

  get totalUnpaid() {
    return this.unpaidFees.reduce((sum, fee) => sum + (fee.amount || 0), 0);
  }

  get totalPaid() {
    if (!this.fees || !Array.isArray(this.fees)) return 0;
    return this.fees
      .filter((fee) => fee.paid)
      .reduce((sum, fee) => sum + (fee.paidAmount || fee.amount || 0), 0);
  }

  get isPaid() {
    return this.totalUnpaid === 0 && this.totalFees > 0;
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

  get processingTimeDays() {
    if (!this.approvalDate || !this.applicationDate) return null;
    const start = new Date(this.applicationDate);
    const end = new Date(this.approvalDate);
    return Math.floor((end - start) / (1000 * 60 * 60 * 24));
  }

  // === Status Helpers ===

  get statusBadge() {
    const badges = {
      draft: { text: 'Draft', class: 'avitar-badge avitar-badge--secondary' },
      submitted: {
        text: 'Submitted',
        class: 'avitar-badge avitar-badge--primary',
      },
      under_review: {
        text: 'Under Review',
        class: 'avitar-badge avitar-badge--info',
      },
      approved: {
        text: 'Approved',
        class: 'avitar-badge avitar-badge--success',
      },
      denied: { text: 'Denied', class: 'avitar-badge avitar-badge--danger' },
      on_hold: { text: 'On Hold', class: 'avitar-badge avitar-badge--warning' },
      expired: {
        text: 'Expired',
        class: 'avitar-badge avitar-badge--secondary',
      },
      closed: { text: 'Closed', class: 'avitar-badge avitar-badge--dark' },
      cancelled: {
        text: 'Cancelled',
        class: 'avitar-badge avitar-badge--secondary',
      },
    };
    return badges[this.status] || badges.draft;
  }

  get isDraft() {
    return this.status === 'draft';
  }

  get isSubmitted() {
    return this.status === 'submitted';
  }

  get isUnderReview() {
    return this.status === 'under_review';
  }

  get isApproved() {
    return this.status === 'approved';
  }

  get isDenied() {
    return this.status === 'denied';
  }

  get isOnHold() {
    return this.status === 'on_hold';
  }

  get isClosed() {
    return this.status === 'closed';
  }

  get isCancelled() {
    return this.status === 'cancelled';
  }

  get canEdit() {
    return ['draft', 'submitted', 'under_review', 'on_hold'].includes(
      this.status,
    );
  }

  get canSubmit() {
    return this.status === 'draft';
  }

  get canApprove() {
    return ['submitted', 'under_review'].includes(this.status);
  }

  get canClose() {
    return this.status === 'approved';
  }

  // === Type Helpers ===

  get typeDisplay() {
    const types = {
      building: 'Building',
      electrical: 'Electrical',
      plumbing: 'Plumbing',
      mechanical: 'Mechanical',
      demolition: 'Demolition',
      zoning: 'Zoning',
      sign: 'Sign',
      occupancy: 'Occupancy',
      fire: 'Fire',
      other: 'Other',
    };
    return types[this.type] || this.type;
  }

  get typeIcon() {
    const icons = {
      building: 'building',
      electrical: 'bolt',
      plumbing: 'faucet',
      mechanical: 'cog',
      demolition: 'hammer',
      zoning: 'map-marked-alt',
      sign: 'sign',
      occupancy: 'door-open',
      fire: 'fire-extinguisher',
      other: 'file-alt',
    };
    return icons[this.type] || 'file-alt';
  }

  // === Display Helpers ===

  get applicantName() {
    return this.applicant?.name || 'Unknown';
  }

  get applicantEmail() {
    return this.applicant?.email || null;
  }

  get applicantPhone() {
    return this.applicant?.phone || null;
  }

  get contractorName() {
    return this.contractor?.companyName || 'No Contractor';
  }

  get contractorLicense() {
    return this.contractor?.licenseNumber || 'N/A';
  }

  get hasContractor() {
    return !!this.contractor?.companyName;
  }

  get formattedEstimatedValue() {
    if (!this.estimatedValue) return '$0';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(this.estimatedValue);
  }

  get formattedApplicationDate() {
    if (!this.applicationDate) return 'N/A';
    return new Date(this.applicationDate).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  get formattedExpirationDate() {
    if (!this.expirationDate) return 'N/A';
    return new Date(this.expirationDate).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  // === Priority Helpers ===

  get priorityDisplay() {
    const levels = ['Normal', 'Low Priority', 'Medium', 'High', 'Urgent', 'Critical'];
    return levels[this.priorityLevel] || 'Normal';
  }

  get priorityClass() {
    if (this.priorityLevel >= 4) return 'text-danger';
    if (this.priorityLevel >= 3) return 'text-warning';
    if (this.priorityLevel >= 2) return 'text-info';
    return 'text-secondary';
  }

  // === Validation Helpers ===

  get hasValidApplicant() {
    return !!(this.applicant?.name && this.applicant?.email);
  }

  get hasValidContractor() {
    return !!(this.contractor?.companyName && this.contractor?.licenseNumber);
  }

  get isReadyToSubmit() {
    return !!(
      this.description &&
      this.type &&
      this.propertyId &&
      this.hasValidApplicant &&
      this.estimatedValue >= 0
    );
  }

  // === Note Helpers ===

  get latestNote() {
    if (!this.internalNotes || this.internalNotes.length === 0) return null;
    return this.internalNotes[this.internalNotes.length - 1];
  }

  get noteCount() {
    return this.internalNotes?.length || 0;
  }

  // === Status History Helpers ===

  get latestStatusChange() {
    if (!this.statusHistory || this.statusHistory.length === 0) return null;
    return this.statusHistory[this.statusHistory.length - 1];
  }
}
