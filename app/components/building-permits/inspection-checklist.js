import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';

export default class BuildingPermitsInspectionChecklistComponent extends Component {
  @service api;
  @service notifications;
  @service('current-user') currentUser;

  @tracked checklist = [];
  @tracked isLoading = false;
  @tracked savingItemIds = [];
  @tracked expandedNoteIds = []; // Track which items have expanded notes

  @action
  toggleNoteExpanded(itemId) {
    if (this.expandedNoteIds.includes(itemId)) {
      this.expandedNoteIds = this.expandedNoteIds.filter((id) => id !== itemId);
    } else {
      this.expandedNoteIds = [...this.expandedNoteIds, itemId];
    }
  }

  constructor() {
    super(...arguments);
    this.loadChecklist();
  }

  async loadChecklist() {
    if (!this.args.inspection?.id) return;

    this.isLoading = true;
    try {
      const data = await this.api.get(
        `/municipalities/${this.args.municipalityId}/inspections/${this.args.inspection.id}/checklist`,
      );
      this.checklist = data.checklist || [];

      // Notify parent of checklist completion stats
      this.notifyParentOfCompletion();
    } catch (error) {
      console.error('Error loading checklist:', error);
      this.notifications.error('Failed to load inspection checklist');
    } finally {
      this.isLoading = false;
    }
  }

  notifyParentOfCompletion() {
    if (this.args.onChecklistLoaded) {
      this.args.onChecklistLoaded({
        total: this.checklist.length,
        checked: this.checklist.filter((item) => item.checked).length,
        completionPercent: this.completionPercentage,
      });
    }
  }

  @action
  async toggleChecklistItem(item) {
    // Update locally first for immediate feedback
    const itemIndex = this.checklist.findIndex((i) => i._id === item._id);
    if (itemIndex === -1) return;

    const newCheckedState = !item.checked;
    this.checklist[itemIndex].checked = newCheckedState;
    this.checklist[itemIndex].checkedAt = newCheckedState ? new Date() : null;
    this.checklist[itemIndex].checkedBy = newCheckedState
      ? this.currentUser.user._id
      : null;

    // Trigger reactivity
    this.checklist = [...this.checklist];

    // Notify parent of updated completion stats
    this.notifyParentOfCompletion();

    // Save to server
    await this.saveChecklistItem(item._id, {
      checked: newCheckedState,
    });
  }

  @action
  async saveNotesOnBlur(item, event) {
    const newNotes = event.target.value;

    // Update the local item (without triggering array reactivity)
    const itemIndex = this.checklist.findIndex((i) => i._id === item._id);
    if (itemIndex !== -1) {
      this.checklist[itemIndex].notes = newNotes;
    }

    // Save to server silently (no loading indicator, no checklist refresh)
    await this.saveNotesSilently(item._id, newNotes);
  }

  /**
   * Save notes without triggering any UI updates that could cause focus issues
   */
  async saveNotesSilently(itemId, notes) {
    try {
      await this.api.patch(
        `/municipalities/${this.args.municipalityId}/inspections/${this.args.inspection.id}/checklist/${itemId}`,
        { notes },
      );
    } catch (error) {
      console.error('Error saving checklist notes:', error);
      this.notifications.error('Failed to save notes');
    }
  }

  async saveChecklistItem(itemId, updates) {
    // Add to saving list
    this.savingItemIds = [...this.savingItemIds, itemId];

    try {
      const response = await this.api.patch(
        `/municipalities/${this.args.municipalityId}/inspections/${this.args.inspection.id}/checklist/${itemId}`,
        updates,
      );

      // Update the item in the list with server response
      // Backend returns { item: {...} } so we need to unwrap it
      const itemIndex = this.checklist.findIndex((i) => i._id === itemId);
      if (itemIndex !== -1 && response.item) {
        this.checklist[itemIndex] = response.item;
        this.checklist = [...this.checklist];
      }
    } catch (error) {
      console.error('Error saving checklist item:', error);
      this.notifications.error('Failed to save checklist item');

      // Reload checklist to get correct state
      await this.loadChecklist();
    } finally {
      // Remove from saving list
      this.savingItemIds = this.savingItemIds.filter((id) => id !== itemId);
    }
  }

  get groupedByCategory() {
    const grouped = {};

    this.checklist.forEach((item) => {
      const category = item.category || 'General';
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(item);
    });

    return Object.entries(grouped).map(([category, items]) => ({
      category,
      items,
    }));
  }

  get completionPercentage() {
    if (this.checklist.length === 0) return 0;
    const checkedCount = this.checklist.filter((item) => item.checked).length;
    return Math.round((checkedCount / this.checklist.length) * 100);
  }

  get requiredItemsCompleted() {
    const requiredItems = this.checklist.filter((item) => item.isRequired);
    if (requiredItems.length === 0) return true;
    return requiredItems.every((item) => item.checked);
  }
}
