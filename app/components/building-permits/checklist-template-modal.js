import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class BuildingPermitsChecklistTemplateModalComponent extends Component {
  @tracked name = '';
  @tracked description = '';
  @tracked inspectionType = '';
  @tracked items = [];
  @tracked isSaving = false;

  // New item form
  @tracked newItemText = '';
  @tracked newItemCategory = '';
  @tracked newItemIsRequired = true;

  inspectionTypeOptions = [
    { value: 'foundation', label: 'Foundation' },
    { value: 'framing', label: 'Framing' },
    { value: 'rough_electrical', label: 'Rough Electrical' },
    { value: 'rough_plumbing', label: 'Rough Plumbing' },
    { value: 'rough_mechanical', label: 'Rough Mechanical' },
    { value: 'insulation', label: 'Insulation' },
    { value: 'drywall', label: 'Drywall' },
    { value: 'final_electrical', label: 'Final Electrical' },
    { value: 'final_plumbing', label: 'Final Plumbing' },
    { value: 'final_mechanical', label: 'Final Mechanical' },
    { value: 'final', label: 'Final' },
    { value: 'occupancy', label: 'Occupancy' },
    { value: 'fire', label: 'Fire' },
    { value: 'other', label: 'Other' },
  ];

  constructor() {
    super(...arguments);
    this.loadTemplateData();
  }

  loadTemplateData() {
    if (this.args.isEditMode && this.args.template) {
      const template = this.args.template;
      this.name = template.name || '';
      this.description = template.description || '';
      this.inspectionType = template.inspectionType || '';
      // Deep copy items to avoid mutating original
      this.items = template.items
        ? template.items.map((item) => ({ ...item }))
        : [];
    } else if (this.args.template?.inspectionType) {
      // Creating new template with pre-selected inspection type
      this.inspectionType = this.args.template.inspectionType;
    }
  }

  get formData() {
    return {
      name: this.name.trim(),
      description: this.description.trim(),
      inspectionType: this.inspectionType,
      items: this.items.map((item, index) => ({
        text: item.text,
        order: index + 1,
        isRequired: item.isRequired || false,
        category: item.category || '',
      })),
    };
  }

  get isValid() {
    return (
      this.name.trim() &&
      this.inspectionType &&
      this.items.length > 0 &&
      this.items.every((item) => item.text && item.text.trim())
    );
  }

  get canAddItem() {
    return this.newItemText.trim().length > 0;
  }

  @action
  updateName(event) {
    this.name = event.target.value;
  }

  @action
  updateDescription(event) {
    this.description = event.target.value;
  }

  @action
  setInspectionType(event) {
    this.inspectionType = event.target.value;
  }

  @action
  updateNewItemText(event) {
    this.newItemText = event.target.value;
  }

  @action
  updateNewItemCategory(event) {
    this.newItemCategory = event.target.value;
  }

  @action
  toggleNewItemRequired() {
    this.newItemIsRequired = !this.newItemIsRequired;
  }

  @action
  addItem() {
    if (!this.canAddItem) return;

    this.items = [
      ...this.items,
      {
        text: this.newItemText.trim(),
        category: this.newItemCategory.trim(),
        isRequired: this.newItemIsRequired,
        order: this.items.length + 1,
      },
    ];

    // Reset form
    this.newItemText = '';
    this.newItemCategory = '';
    this.newItemIsRequired = true;
  }

  @action
  removeItem(index) {
    this.items = this.items.filter((_, i) => i !== index);
  }

  @action
  moveItemUp(index) {
    if (index === 0) return;

    const newItems = [...this.items];
    const temp = newItems[index - 1];
    newItems[index - 1] = newItems[index];
    newItems[index] = temp;
    this.items = newItems;
  }

  @action
  moveItemDown(index) {
    if (index >= this.items.length - 1) return;

    const newItems = [...this.items];
    const temp = newItems[index + 1];
    newItems[index + 1] = newItems[index];
    newItems[index] = temp;
    this.items = newItems;
  }

  @action
  updateItemText(index, event) {
    const newItems = [...this.items];
    newItems[index].text = event.target.value;
    this.items = newItems;
  }

  @action
  updateItemCategory(index, event) {
    const newItems = [...this.items];
    newItems[index].category = event.target.value;
    this.items = newItems;
  }

  @action
  toggleItemRequired(index) {
    const newItems = [...this.items];
    newItems[index].isRequired = !newItems[index].isRequired;
    this.items = newItems;
  }

  @action
  async save() {
    if (!this.isValid || this.isSaving) return;

    this.isSaving = true;

    try {
      await this.args.onSave(this.formData);
      this.close();
    } catch (error) {
      // Error handling is done in parent controller
      console.error('Error in modal save:', error);
    } finally {
      this.isSaving = false;
    }
  }

  @action
  close() {
    if (this.args.onClose) {
      this.args.onClose();
    }
  }

  @action
  stopPropagation(event) {
    event.stopPropagation();
  }
}
