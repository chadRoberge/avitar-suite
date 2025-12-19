import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';

export default class BuildingPermitsStatusDropdownComponent extends Component {
  @service api;
  @service notifications;

  @tracked isOpen = false;
  @tracked isChanging = false;
  @tracked showConfirmModal = false;
  @tracked selectedStatus = null;
  @tracked completionNotes = '';

  // Destination element for modal to render at document body level
  get destinationElement() {
    return document.body;
  }

  statusOptions = [
    {
      value: 'scheduled',
      label: 'Scheduled',
      icon: 'calendar',
      color: 'primary',
    },
    {
      value: 'in_progress',
      label: 'In Progress',
      icon: 'play-circle',
      color: 'info',
    },
    {
      value: 'completed',
      label: 'Completed',
      icon: 'check-circle',
      color: 'success',
    },
    {
      value: 'cancelled',
      label: 'Cancelled',
      icon: 'times-circle',
      color: 'danger',
    },
    { value: 'no_access', label: 'No Access', icon: 'lock', color: 'warning' },
    {
      value: 'rescheduled',
      label: 'Rescheduled',
      icon: 'calendar-alt',
      color: 'secondary',
    },
  ];

  get currentStatus() {
    return this.args.inspection?.status || 'scheduled';
  }

  get currentStatusOption() {
    return (
      this.statusOptions.find((opt) => opt.value === this.currentStatus) ||
      this.statusOptions[0]
    );
  }

  get availableStatusOptions() {
    // Filter out current status
    return this.statusOptions.filter((opt) => opt.value !== this.currentStatus);
  }

  @action
  toggleDropdown() {
    this.isOpen = !this.isOpen;
  }

  @action
  closeDropdown() {
    this.isOpen = false;
  }

  @action
  selectStatus(status) {
    this.selectedStatus = status;

    // Show confirmation modal for certain status changes
    if (status === 'completed' || status === 'cancelled') {
      this.showConfirmModal = true;
      // Close dropdown when opening modal to prevent z-index conflicts
      this.isOpen = false;
    } else {
      // Close dropdown and change immediately for other statuses
      this.closeDropdown();
      this.changeStatus();
    }
  }

  @action
  closeConfirmModal() {
    this.showConfirmModal = false;
    this.selectedStatus = null;
    this.completionNotes = '';
  }

  @action
  updateCompletionNotes(event) {
    this.completionNotes = event.target.value;
  }

  @action
  async changeStatus() {
    if (!this.selectedStatus) return;

    this.isChanging = true;

    try {
      const updateData = {
        status: this.selectedStatus,
      };

      // Add completion data if completing
      if (this.selectedStatus === 'completed') {
        updateData.completedDate = new Date().toISOString();
        updateData.comments = this.completionNotes;
      }

      // Add cancellation data if cancelling
      if (this.selectedStatus === 'cancelled') {
        updateData.cancelledDate = new Date().toISOString();
        updateData.cancellationReason = this.completionNotes;
      }

      const updated = await this.api.patch(
        `/municipalities/${this.args.municipalityId}/inspections/${this.args.inspection.id}`,
        updateData,
      );

      this.notifications.success(
        `Inspection status updated to ${this.getStatusLabel(this.selectedStatus)}`,
      );

      // Update the inspection object directly for immediate UI feedback
      if (this.args.inspection) {
        this.args.inspection.status = updated.status;
        if (updated.completedDate) {
          this.args.inspection.completedDate = updated.completedDate;
        }
        if (updated.cancelledDate) {
          this.args.inspection.cancelledDate = updated.cancelledDate;
        }
        if (updated.comments) {
          this.args.inspection.comments = updated.comments;
        }
        if (updated.cancellationReason) {
          this.args.inspection.cancellationReason = updated.cancellationReason;
        }
      }

      // Close modal first to prevent glitching
      this.closeConfirmModal();

      // Call onStatusChange callback if provided (after a small delay to prevent conflicts)
      if (this.args.onStatusChange) {
        setTimeout(() => {
          this.args.onStatusChange(updated);
        }, 100);
      }
    } catch (error) {
      console.error('Error updating inspection status:', error);
      this.notifications.error('Failed to update inspection status');
      this.closeConfirmModal();
    } finally {
      this.isChanging = false;
    }
  }

  getStatusLabel(statusValue) {
    const option = this.statusOptions.find((opt) => opt.value === statusValue);
    return option ? option.label : statusValue;
  }

  @action
  stopPropagation(event) {
    event.stopPropagation();
  }
}
