import Model, { attr, belongsTo } from '@ember-data/model';

export default class PermitInspectionModel extends Model {
  // References
  @attr('string') municipalityId;
  @belongsTo('permit', { async: true, inverse: 'inspections' }) permit;
  @attr('string') propertyId;
  @attr('string') propertyAddress;

  // Inspection Details
  @attr('string') type; // foundation, framing, rough_electrical, etc.
  @attr('string') description;

  // Scheduling
  @attr('date') scheduledDate;
  @attr('string') scheduledTimeSlot;
  @attr('date') requestedDate;
  @attr('string') requestedBy;

  // Assignment
  @belongsTo('user', { async: true, inverse: null }) inspector;
  @attr('string') inspectorName;

  // Status
  @attr('string', { defaultValue: 'scheduled' }) status;
  // Options: scheduled, in_progress, completed, cancelled, no_access, rescheduled

  // Completion
  @attr('date') completedDate;
  @attr('date') startTime;
  @attr('date') endTime;

  // Results
  @attr('string', { defaultValue: 'pending' }) result;
  // Options: pending, passed, failed, partial, conditional, cancelled

  // Findings
  @attr('string') comments;
  @attr() violations; // Array of violation objects
  @attr() conditions; // Array of condition objects (for conditional passes)

  // Documentation
  @attr() photos; // Array of photo objects with URLs
  @attr() documents; // Array of document objects

  // Reinspection
  @attr('boolean', { defaultValue: false }) requiresReinspection;
  @attr('string') reinspectionReason;
  @attr('date') nextInspectionDate;
  @attr('string') originalInspectionId;
  @attr('boolean', { defaultValue: false }) isReinspection;
  @attr('number', { defaultValue: 0 }) reinspectionNumber;

  // Contact/Access
  @attr('string') contactName;
  @attr('string') contactPhone;
  @attr('string') contactEmail;
  @attr('string') accessInstructions;

  // Conditions
  @attr('string') weatherConditions;
  @attr('string') siteConditions;
  @attr('string') accessIssues;

  // Cancellation
  @attr('date') cancelledDate;
  @attr('string') cancelledBy;
  @attr('string') cancellationReason;

  // System Fields
  @attr('string') createdBy;
  @attr('string') updatedBy;
  @attr('boolean', { defaultValue: true }) isActive;
  @attr('date') deletedAt;
  @attr('date') createdAt;
  @attr('date') updatedAt;

  // === Computed Properties ===

  get typeDisplay() {
    const types = {
      foundation: 'Foundation',
      framing: 'Framing',
      rough_electrical: 'Rough Electrical',
      rough_plumbing: 'Rough Plumbing',
      rough_mechanical: 'Rough Mechanical',
      insulation: 'Insulation',
      drywall: 'Drywall',
      final_electrical: 'Final Electrical',
      final_plumbing: 'Final Plumbing',
      final_mechanical: 'Final Mechanical',
      final: 'Final Inspection',
      occupancy: 'Certificate of Occupancy',
      fire: 'Fire Inspection',
      other: 'Other',
    };
    return types[this.type] || this.type;
  }

  get statusBadge() {
    const badges = {
      scheduled: {
        text: 'Scheduled',
        class: 'avitar-badge avitar-badge--primary',
      },
      in_progress: {
        text: 'In Progress',
        class: 'avitar-badge avitar-badge--info',
      },
      completed: {
        text: 'Completed',
        class: 'avitar-badge avitar-badge--success',
      },
      cancelled: {
        text: 'Cancelled',
        class: 'avitar-badge avitar-badge--secondary',
      },
      no_access: {
        text: 'No Access',
        class: 'avitar-badge avitar-badge--warning',
      },
      rescheduled: {
        text: 'Rescheduled',
        class: 'avitar-badge avitar-badge--warning',
      },
    };
    return badges[this.status] || badges.scheduled;
  }

  get resultBadge() {
    const badges = {
      pending: {
        text: 'Pending',
        class: 'avitar-badge avitar-badge--secondary',
      },
      passed: { text: 'Passed', class: 'avitar-badge avitar-badge--success' },
      failed: { text: 'Failed', class: 'avitar-badge avitar-badge--danger' },
      partial: {
        text: 'Partial Pass',
        class: 'avitar-badge avitar-badge--warning',
      },
      conditional: {
        text: 'Conditional',
        class: 'avitar-badge avitar-badge--info',
      },
      cancelled: {
        text: 'Cancelled',
        class: 'avitar-badge avitar-badge--secondary',
      },
    };
    return badges[this.result] || badges.pending;
  }

  get isScheduled() {
    return this.status === 'scheduled';
  }

  get isInProgress() {
    return this.status === 'in_progress';
  }

  get isCompleted() {
    return this.status === 'completed';
  }

  get isCancelled() {
    return this.status === 'cancelled';
  }

  get isPassed() {
    return this.result === 'passed';
  }

  get isFailed() {
    return this.result === 'failed';
  }

  get isPending() {
    return this.result === 'pending';
  }

  get hasOpenViolations() {
    if (!this.violations || !Array.isArray(this.violations)) return false;
    return this.violations.some((v) => !v.corrected);
  }

  get openViolationsCount() {
    if (!this.violations || !Array.isArray(this.violations)) return 0;
    return this.violations.filter((v) => !v.corrected).length;
  }

  get totalViolationsCount() {
    return this.violations?.length || 0;
  }

  get hasConditions() {
    return this.conditions && this.conditions.length > 0;
  }

  get pendingConditionsCount() {
    if (!this.conditions || !Array.isArray(this.conditions)) return 0;
    return this.conditions.filter((c) => !c.completed).length;
  }

  get durationMinutes() {
    if (!this.startTime || !this.endTime) return null;
    const start = new Date(this.startTime);
    const end = new Date(this.endTime);
    return Math.floor((end - start) / (1000 * 60));
  }

  get formattedDuration() {
    const minutes = this.durationMinutes;
    if (!minutes) return 'N/A';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  }

  get formattedScheduledDate() {
    if (!this.scheduledDate) return 'Not Scheduled';
    const date = new Date(this.scheduledDate);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  get formattedScheduledTime() {
    if (!this.scheduledDate) return '';
    const date = new Date(this.scheduledDate);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }

  get isToday() {
    if (!this.scheduledDate) return false;
    const today = new Date();
    const scheduled = new Date(this.scheduledDate);
    return (
      today.getFullYear() === scheduled.getFullYear() &&
      today.getMonth() === scheduled.getMonth() &&
      today.getDate() === scheduled.getDate()
    );
  }

  get isTomorrow() {
    if (!this.scheduledDate) return false;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const scheduled = new Date(this.scheduledDate);
    return (
      tomorrow.getFullYear() === scheduled.getFullYear() &&
      tomorrow.getMonth() === scheduled.getMonth() &&
      tomorrow.getDate() === scheduled.getDate()
    );
  }

  get isPast() {
    if (!this.scheduledDate) return false;
    return new Date(this.scheduledDate) < new Date();
  }

  get isUpcoming() {
    if (!this.scheduledDate) return false;
    const scheduled = new Date(this.scheduledDate);
    const now = new Date();
    const inSevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    return scheduled > now && scheduled <= inSevenDays;
  }

  get photoCount() {
    return this.photos?.length || 0;
  }

  get documentCount() {
    return this.documents?.length || 0;
  }

  get hasPhotos() {
    return this.photoCount > 0;
  }

  get hasDocuments() {
    return this.documentCount > 0;
  }

  get canStart() {
    return this.isScheduled && !this.isPast;
  }

  get canComplete() {
    return this.isInProgress || this.isScheduled;
  }

  get canCancel() {
    return ['scheduled', 'in_progress'].includes(this.status);
  }

  get canReschedule() {
    return ['scheduled', 'no_access'].includes(this.status);
  }

  get requiresAction() {
    return (
      (this.isCompleted && this.requiresReinspection && !this.nextInspectionDate) ||
      (this.hasOpenViolations && this.isFailed) ||
      (this.hasConditions && this.pendingConditionsCount > 0)
    );
  }

  get reinspectionDisplay() {
    if (!this.isReinspection) return 'Initial';
    return `Reinspection #${this.reinspectionNumber}`;
  }

  get criticalViolationsCount() {
    if (!this.violations || !Array.isArray(this.violations)) return 0;
    return this.violations.filter(
      (v) => v.severity === 'critical' && !v.corrected,
    ).length;
  }

  get hasCriticalViolations() {
    return this.criticalViolationsCount > 0;
  }
}
