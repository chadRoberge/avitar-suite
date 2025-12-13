import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';

export default class MunicipalityBuildingPermitsSettingsInspectionsController extends Controller {
  @service api;
  @service notifications;
  @service router;

  @tracked activeTab = 'availability';
  @tracked isLoading = false;
  @tracked availableTimeSlots = [];
  @tracked inspectors = [];
  @tracked showAddTimeSlotModal = false;
  @tracked editingTimeSlotIndex = null;

  // New time slot form data
  @tracked newSlotDayOfWeek = 1; // Monday
  @tracked newSlotStartTime = '08:00';
  @tracked newSlotEndTime = '17:00';
  @tracked newSlotDuration = 60;

  // Days of week for dropdown
  get daysOfWeek() {
    return [
      { value: 0, label: 'Sunday' },
      { value: 1, label: 'Monday' },
      { value: 2, label: 'Tuesday' },
      { value: 3, label: 'Wednesday' },
      { value: 4, label: 'Thursday' },
      { value: 5, label: 'Friday' },
      { value: 6, label: 'Saturday' },
    ];
  }

  // Available inspection types
  get inspectionTypeOptions() {
    return [
      { value: 'foundation', label: 'Foundation' },
      { value: 'framing', label: 'Framing' },
      { value: 'insulation', label: 'Insulation' },
      { value: 'drywall', label: 'Drywall' },
      { value: 'final', label: 'Final' },
      { value: 'rough_electrical', label: 'Rough Electrical' },
      { value: 'final_electrical', label: 'Final Electrical' },
      { value: 'rough_plumbing', label: 'Rough Plumbing' },
      { value: 'final_plumbing', label: 'Final Plumbing' },
      { value: 'rough_mechanical', label: 'Rough Mechanical' },
      { value: 'final_mechanical', label: 'Final Mechanical' },
      { value: 'fire', label: 'Fire Safety' },
      { value: 'occupancy', label: 'Occupancy' },
    ];
  }

  // Group time slots by day
  get timeSlotsByDay() {
    const grouped = {};

    this.availableTimeSlots.forEach((slot, index) => {
      const day = this.daysOfWeek.find((d) => d.value === slot.dayOfWeek);
      if (!grouped[slot.dayOfWeek]) {
        grouped[slot.dayOfWeek] = {
          day: day?.label || 'Unknown',
          dayOfWeek: slot.dayOfWeek,
          slots: [],
        };
      }

      grouped[slot.dayOfWeek].slots.push({
        ...slot,
        index,
      });
    });

    // Sort by day of week and return array
    return Object.values(grouped).sort((a, b) => a.dayOfWeek - b.dayOfWeek);
  }

  // Computed property for active inspectors count
  get activeInspectorsCount() {
    return this.inspectors.filter((insp) => insp.isActive).length;
  }

  @action
  setActiveTab(tab) {
    this.activeTab = tab;
  }

  // Time slot management
  @action
  openAddTimeSlotModal() {
    this.editingTimeSlotIndex = null;
    this.newSlotDayOfWeek = 1;
    this.newSlotStartTime = '08:00';
    this.newSlotEndTime = '17:00';
    this.newSlotDuration = 60;
    this.showAddTimeSlotModal = true;
  }

  @action
  editTimeSlot(slot) {
    this.editingTimeSlotIndex = slot.index;
    this.newSlotDayOfWeek = slot.dayOfWeek;
    this.newSlotStartTime = slot.startTime;
    this.newSlotEndTime = slot.endTime;
    this.newSlotDuration = slot.slotDuration || 60;
    this.showAddTimeSlotModal = true;
  }

  @action
  closeTimeSlotModal() {
    this.showAddTimeSlotModal = false;
    this.editingTimeSlotIndex = null;
  }

  @action
  async saveTimeSlot() {
    // Validate times
    if (this.newSlotStartTime >= this.newSlotEndTime) {
      this.notifications.warning('End time must be after start time');
      return;
    }

    const newSlot = {
      dayOfWeek: parseInt(this.newSlotDayOfWeek),
      startTime: this.newSlotStartTime,
      endTime: this.newSlotEndTime,
      slotDuration: parseInt(this.newSlotDuration),
    };

    if (this.editingTimeSlotIndex !== null) {
      // Edit existing
      this.availableTimeSlots[this.editingTimeSlotIndex] = newSlot;
      this.availableTimeSlots = [...this.availableTimeSlots];
    } else {
      // Add new
      this.availableTimeSlots = [...this.availableTimeSlots, newSlot];
    }

    this.closeTimeSlotModal();
  }

  @action
  removeTimeSlot(slotIndex) {
    if (!confirm('Are you sure you want to remove this time slot?')) {
      return;
    }

    this.availableTimeSlots = this.availableTimeSlots.filter(
      (_, index) => index !== slotIndex,
    );
  }

  @action
  async saveAvailability() {
    this.isLoading = true;
    try {
      await this.api.put(
        `/municipalities/${this.model.municipalityId}/inspection-settings/availability`,
        {
          availableTimeSlots: this.availableTimeSlots,
        },
      );

      this.notifications.success(
        'Inspection availability updated successfully',
      );
      await this.router.refresh();
    } catch (error) {
      this.notifications.error(
        error.message || 'Failed to update inspection availability',
      );
    } finally {
      this.isLoading = false;
    }
  }

  // Inspector management
  @action
  toggleInspectorActive(inspector) {
    inspector.isActive = !inspector.isActive;
    this.inspectors = [...this.inspectors];
  }

  @action
  updateInspectorMaxPerDay(inspector, event) {
    const value = parseInt(event.target.value);
    if (value >= 1 && value <= 20) {
      inspector.maxPerDay = value;
      this.inspectors = [...this.inspectors];
    }
  }

  @action
  toggleInspectionType(inspector, inspectionType) {
    const types = inspector.inspectionTypes || [];
    const index = types.indexOf(inspectionType);

    if (index > -1) {
      // Remove
      inspector.inspectionTypes = types.filter((t) => t !== inspectionType);
    } else {
      // Add
      inspector.inspectionTypes = [...types, inspectionType];
    }

    this.inspectors = [...this.inspectors];
  }

  @action
  async saveInspectors() {
    this.isLoading = true;
    try {
      // Format inspectors for API
      const inspectorsToSave = this.inspectors.map((insp) => ({
        userId: insp.userId,
        inspectionTypes: insp.inspectionTypes || [],
        maxPerDay: insp.maxPerDay || 8,
        isActive: insp.isActive ?? true,
      }));

      await this.api.put(
        `/municipalities/${this.model.municipalityId}/inspection-settings/inspectors`,
        {
          inspectors: inspectorsToSave,
        },
      );

      this.notifications.success('Inspector settings updated successfully');
      await this.router.refresh();
    } catch (error) {
      this.notifications.error(
        error.message || 'Failed to update inspector settings',
      );
    } finally {
      this.isLoading = false;
    }
  }

  @action
  updateField(field, event) {
    this[field] = event.target.value;
  }

  @action
  stopPropagation(event) {
    event.stopPropagation();
  }
}
