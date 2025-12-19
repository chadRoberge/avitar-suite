import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class MunicipalityBuildingPermitsSettingsInspectionChecklistsController extends Controller {
  @service api;
  @service notifications;
  @service router;

  @tracked templates = [];
  @tracked municipalityId = null;
  @tracked isModalOpen = false;
  @tracked selectedTemplate = null;
  @tracked isEditMode = false;
  @tracked filterInspectionType = 'all';

  // Inspection type options (as property, not getter, so it's available in helper methods)
  inspectionTypeOptions = [
    { value: 'all', label: 'All Inspection Types' },
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

  get filteredTemplates() {
    let templates = this.templates || [];

    // Filter by inspection type
    if (this.filterInspectionType !== 'all') {
      templates = templates.filter(
        (t) => t.inspectionType === this.filterInspectionType,
      );
    }

    // Filter active templates only
    templates = templates.filter((t) => t.isActive);

    return templates;
  }

  get activeCount() {
    return this.templates?.filter((t) => t.isActive).length || 0;
  }

  get inactiveCount() {
    return this.templates?.filter((t) => !t.isActive).length || 0;
  }

  get templatesByType() {
    const grouped = {};
    this.filteredTemplates.forEach((template) => {
      if (!grouped[template.inspectionType]) {
        grouped[template.inspectionType] = [];
      }
      grouped[template.inspectionType].push(template);
    });
    return grouped;
  }

  get uniqueInspectionTypesCount() {
    const types = new Set(this.filteredTemplates.map((t) => t.inspectionType));
    return types.size;
  }

  // Helper method to count required items
  getRequiredItemsCount(items) {
    if (!items || !Array.isArray(items)) return 0;
    return items.filter((item) => item.isRequired).length;
  }

  // Helper method to count unique categories
  getUniqueCategoriesCount(items) {
    if (!items || !Array.isArray(items)) return 0;
    const categories = new Set(
      items.filter((item) => item.category).map((item) => item.category),
    );
    return categories.size;
  }

  @action
  setFilterInspectionType(event) {
    this.filterInspectionType = event.target.value;
  }

  @action
  openCreateModal(inspectionType = null) {
    this.selectedTemplate = inspectionType
      ? { inspectionType, items: [] }
      : null;
    this.isEditMode = false;
    this.isModalOpen = true;
  }

  @action
  openEditModal(template) {
    this.selectedTemplate = template;
    this.isEditMode = true;
    this.isModalOpen = true;
  }

  @action
  closeModal() {
    this.isModalOpen = false;
    this.selectedTemplate = null;
    this.isEditMode = false;
  }

  @action
  async saveTemplate(templateData) {
    try {
      console.log('Saving template data:', templateData);

      if (this.isEditMode && this.selectedTemplate) {
        // Update existing
        const updated = await this.api.put(
          `/municipalities/${this.municipalityId}/inspection-checklist-templates/${this.selectedTemplate._id}`,
          templateData,
        );

        // Update in list
        const index = this.templates.findIndex(
          (t) => t._id === this.selectedTemplate._id,
        );
        if (index !== -1) {
          this.templates[index] = updated;
          this.templates = [...this.templates]; // Trigger reactivity
        }

        this.notifications.success('Checklist template updated successfully');
      } else {
        // Create new
        const created = await this.api.post(
          `/municipalities/${this.municipalityId}/inspection-checklist-templates`,
          templateData,
        );

        this.templates = [...this.templates, created];
        this.notifications.success('Checklist template created successfully');
      }

      this.closeModal();

      // Refresh the route
      this.router.refresh(
        'municipality.building-permits.settings.inspection-checklists',
      );
    } catch (error) {
      console.error('Error saving checklist template:', error);

      // Show specific error message if available
      if (error.error === 'Duplicate template') {
        this.notifications.error(
          'A checklist template for this inspection type already exists',
        );
      } else if (error.error === 'Validation failed') {
        this.notifications.error(
          error.message || 'Please check the form for errors',
        );
      } else {
        this.notifications.error('Failed to save checklist template');
      }
    }
  }

  @action
  async deleteTemplate(template) {
    if (
      !confirm(
        `Are you sure you want to delete the "${template.name}" checklist template? This will not affect existing inspections.`,
      )
    ) {
      return;
    }

    try {
      await this.api.delete(
        `/municipalities/${this.municipalityId}/inspection-checklist-templates/${template._id}`,
      );

      // Remove from list or mark as inactive
      const index = this.templates.findIndex((t) => t._id === template._id);
      if (index !== -1) {
        this.templates[index].isActive = false;
        this.templates = [...this.templates];
      }

      this.notifications.success('Checklist template deleted successfully');
    } catch (error) {
      console.error('Error deleting checklist template:', error);
      this.notifications.error('Failed to delete checklist template');
    }
  }

  // Helper method to get inspection type label
  @action
  getInspectionTypeLabel(type) {
    const option = this.inspectionTypeOptions.find((opt) => opt.value === type);
    return option ? option.label : type;
  }
}
