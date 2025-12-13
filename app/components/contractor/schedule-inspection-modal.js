import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';

/**
 * Schedule Inspection Modal Component
 *
 * Allows contractors to schedule inspections for their approved permits.
 * Fetches available time slots from the API based on municipality settings,
 * permit type requirements, and inspector availability.
 *
 * @param {Object} @permit - The permit object
 * @param {Boolean} @isOpen - Whether the modal is visible
 * @param {Function} @onClose - Action to close the modal
 * @param {Function} @onSchedule - Action to schedule inspection with data
 */
export default class ContractorScheduleInspectionModalComponent extends Component {
  @service api;
  @service notifications;

  @tracked selectedInspectionType = null;
  @tracked selectedTimeSlot = null;
  @tracked availableSlots = [];
  @tracked isLoadingSlots = false;
  @tracked contactName = '';
  @tracked contactPhone = '';
  @tracked contactEmail = '';
  @tracked accessInstructions = '';
  @tracked description = '';

  get inspectionTypes() {
    // Get permit type categories
    const permitType = this.args.permit?.permitTypeId;
    const categories = permitType?.categories || [];

    // Map categories to inspection types
    const inspectionTypesByCategoryMap = {
      building: [
        {
          type: 'foundation',
          label: 'Foundation',
          estimatedMinutes: 60,
          bufferDays: 1,
        },
        {
          type: 'framing',
          label: 'Framing',
          estimatedMinutes: 90,
          bufferDays: 1,
        },
        {
          type: 'insulation',
          label: 'Insulation',
          estimatedMinutes: 45,
          bufferDays: 1,
        },
        {
          type: 'drywall',
          label: 'Drywall',
          estimatedMinutes: 45,
          bufferDays: 1,
        },
        { type: 'final', label: 'Final', estimatedMinutes: 120, bufferDays: 2 },
      ],
      electrical: [
        {
          type: 'rough_electrical',
          label: 'Rough Electrical',
          estimatedMinutes: 60,
          bufferDays: 1,
        },
        {
          type: 'final_electrical',
          label: 'Final Electrical',
          estimatedMinutes: 60,
          bufferDays: 1,
        },
      ],
      plumbing: [
        {
          type: 'rough_plumbing',
          label: 'Rough Plumbing',
          estimatedMinutes: 60,
          bufferDays: 1,
        },
        {
          type: 'final_plumbing',
          label: 'Final Plumbing',
          estimatedMinutes: 60,
          bufferDays: 1,
        },
      ],
      mechanical: [
        {
          type: 'rough_mechanical',
          label: 'Rough Mechanical',
          estimatedMinutes: 60,
          bufferDays: 1,
        },
        {
          type: 'final_mechanical',
          label: 'Final Mechanical',
          estimatedMinutes: 60,
          bufferDays: 1,
        },
      ],
      fire: [
        {
          type: 'fire',
          label: 'Fire Safety',
          estimatedMinutes: 90,
          bufferDays: 2,
        },
      ],
      occupancy: [
        {
          type: 'occupancy',
          label: 'Occupancy',
          estimatedMinutes: 120,
          bufferDays: 2,
        },
      ],
    };

    // Collect all inspection types based on permit categories
    const allInspectionTypes = [];
    categories.forEach((category) => {
      const inspectionTypesForCategory = inspectionTypesByCategoryMap[category];
      if (inspectionTypesForCategory) {
        allInspectionTypes.push(...inspectionTypesForCategory);
      }
    });

    // Remove duplicates and format
    const uniqueTypes = allInspectionTypes.reduce((acc, curr) => {
      if (!acc.find((t) => t.type === curr.type)) {
        acc.push({
          value: curr.type,
          label: curr.label,
          bufferDays: curr.bufferDays,
          estimatedMinutes: curr.estimatedMinutes,
        });
      }
      return acc;
    }, []);

    return uniqueTypes;
  }

  get selectedInspectionDetails() {
    if (!this.selectedInspectionType) return null;
    return this.inspectionTypes.find(
      (type) => type.value === this.selectedInspectionType,
    );
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
    return (
      this.selectedInspectionType &&
      this.selectedTimeSlot &&
      this.contactName?.trim() &&
      this.contactPhone?.trim() &&
      this.contactEmail?.trim()
    );
  }

  formatInspectionType(type) {
    // Convert snake_case to Title Case
    return type
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
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

  @action
  async selectInspectionType(event) {
    this.selectedInspectionType = event.target.value;
    this.selectedTimeSlot = null;
    this.availableSlots = [];

    if (this.selectedInspectionType) {
      await this.loadAvailableSlots();
    }
  }

  @action
  async loadAvailableSlots() {
    this.isLoadingSlots = true;

    try {
      // Extract municipalityId - handle both string and ObjectId
      const municipalityId =
        this.args.permit.municipalityId?._id || this.args.permit.municipalityId;

      const response = await this.api.get(
        `/municipalities/${municipalityId}/permits/${this.args.permit._id}/inspections/available-slots`,
        {
          inspectionType: this.selectedInspectionType,
        },
      );

      this.availableSlots = response.availableSlots || [];

      if (this.availableSlots.length === 0) {
        this.notifications.warning(
          'No available time slots found. Please contact the municipality.',
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

    // Auto-scroll to contact form after selection
    setTimeout(() => {
      const contactForm = document.getElementById(
        'contact-information-section',
      );
      if (contactForm) {
        contactForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  }

  @action
  updateField(field, event) {
    this[field] = event.target.value;
  }

  @action
  async handleSubmit(event) {
    event.preventDefault();

    if (!this.canSubmit) {
      this.notifications.warning('Please fill in all required fields');
      return;
    }

    const inspectionData = {
      type: this.selectedInspectionType,
      scheduledDate: this.selectedTimeSlot.startTime,
      scheduledTimeSlot: `${this.formatTime(this.selectedTimeSlot.startTime)} - ${this.formatTime(this.selectedTimeSlot.endTime)}`,
      contactName: this.contactName.trim(),
      contactPhone: this.contactPhone.trim(),
      contactEmail: this.contactEmail.trim(),
      accessInstructions: this.accessInstructions.trim(),
      description: this.description.trim(),
    };

    // Call parent action
    await this.args.onSchedule(inspectionData);

    // Reset form
    this.resetForm();
  }

  @action
  handleClose() {
    this.resetForm();
    this.args.onClose();
  }

  @action
  resetForm() {
    this.selectedInspectionType = null;
    this.selectedTimeSlot = null;
    this.availableSlots = [];
    this.contactName = '';
    this.contactPhone = '';
    this.contactEmail = '';
    this.accessInstructions = '';
    this.description = '';
  }

  @action
  stopPropagation(event) {
    event.stopPropagation();
  }
}
