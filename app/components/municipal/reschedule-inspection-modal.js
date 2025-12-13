import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';

/**
 * Reschedule Inspection Modal Component
 *
 * Allows municipal staff to reschedule existing inspections.
 * Fetches available time slots from the API based on municipality settings,
 * permit type requirements, and inspector availability.
 *
 * @param {Object} @inspection - The inspection object to reschedule
 * @param {Boolean} @isOpen - Whether the modal is visible
 * @param {Function} @onClose - Action to close the modal
 * @param {Function} @onReschedule - Action called after successful reschedule
 */
export default class MunicipalRescheduleInspectionModalComponent extends Component {
  @service api;
  @service notifications;

  @tracked selectedTimeSlot = null;
  @tracked availableSlots = [];
  @tracked isLoadingSlots = false;
  @tracked isSubmitting = false;
  @tracked reason = '';

  get inspectionType() {
    return this.args.inspection?.type;
  }

  get scheduledDate() {
    return this.args.inspection?.scheduledDate;
  }

  get groupedSlots() {
    // Group available slots by date for easier display
    const grouped = {};

    this.availableSlots.forEach((slot) => {
      const dateKey = new Date(slot.date).toDateString();

      if (!grouped[dateKey]) {
        grouped[dateKey] = {
          date: new Date(slot.date),
          slots: [],
        };
      }

      grouped[dateKey].slots.push(slot);
    });

    return Object.values(grouped).sort((a, b) => a.date - b.date);
  }

  get canSubmit() {
    return this.selectedTimeSlot && this.reason?.trim();
  }

  formatTime(dateString) {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }

  formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  formatInspectionType(type) {
    return type
      ?.split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  @action
  async loadAvailableSlots() {
    if (!this.args.inspection) return;

    this.isLoadingSlots = true;

    try {
      // Extract municipalityId and permitId
      const municipalityId =
        this.args.inspection.municipalityId?._id ||
        this.args.inspection.municipalityId;
      const permitId =
        this.args.inspection.permitId?._id || this.args.inspection.permitId;

      const response = await this.api.get(
        `/municipalities/${municipalityId}/permits/${permitId}/inspections/available-slots`,
        {
          inspectionType: this.inspectionType,
        },
      );

      this.availableSlots = response.availableSlots || [];

      if (this.availableSlots.length === 0) {
        this.notifications.warning(
          'No available time slots found. Please contact an administrator.',
        );
      }
    } catch (error) {
      this.notifications.error(
        error.message || 'Failed to load available time slots',
      );
      this.availableSlots = [];
    } finally {
      this.isLoadingSlots = false;
    }
  }

  @action
  selectTimeSlot(slot) {
    this.selectedTimeSlot = slot;
  }

  @action
  updateReason(event) {
    this.reason = event.target.value;
  }

  @action
  async handleSubmit(event) {
    event.preventDefault();

    if (!this.canSubmit) {
      this.notifications.warning(
        'Please select a time slot and provide a reason',
      );
      return;
    }

    this.isSubmitting = true;

    try {
      const municipalityId =
        this.args.inspection.municipalityId?._id ||
        this.args.inspection.municipalityId;
      const inspectionId = this.args.inspection._id;

      await this.api.patch(
        `/municipalities/${municipalityId}/inspections/${inspectionId}/reschedule`,
        {
          scheduledDate: this.selectedTimeSlot.startTime,
          scheduledTimeSlot: `${this.formatTime(this.selectedTimeSlot.startTime)} - ${this.formatTime(this.selectedTimeSlot.endTime)}`,
          reason: this.reason.trim(),
        },
      );

      this.notifications.success('Inspection rescheduled successfully');

      // Call parent action to refresh data
      await this.args.onReschedule?.();

      // Close modal
      this.handleClose();
    } catch (error) {
      this.notifications.error(
        error.message || 'Failed to reschedule inspection',
      );
    } finally {
      this.isSubmitting = false;
    }
  }

  @action
  handleClose() {
    this.resetForm();
    this.args.onClose?.();
  }

  @action
  resetForm() {
    this.selectedTimeSlot = null;
    this.availableSlots = [];
    this.reason = '';
  }

  @action
  stopPropagation(event) {
    event.stopPropagation();
  }

  @action
  handleModalOpen() {
    if (this.args.isOpen && this.args.inspection) {
      this.loadAvailableSlots();
    }
  }
}
