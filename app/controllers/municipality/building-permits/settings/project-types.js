import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class MunicipalityBuildingPermitsSettingsProjectTypesController extends Controller {
  @service api;
  @service notifications;
  @service router;

  @tracked projectTypes = [];
  @tracked permitTypes = [];
  @tracked municipalityId = null;
  @tracked isModalOpen = false;
  @tracked selectedProjectType = null;
  @tracked isEditMode = false;
  @tracked searchText = '';
  @tracked filterStatus = 'all';
  @tracked filterCategory = 'all';
  @tracked isSaving = false;
  @tracked formData = {
    name: '',
    description: '',
    category: '',
    icon: 'folder-open',
    estimatedCompletionDays: null,
    selectedPermitTypes: [],
    feeSchedule: {
      baseAmount: 0,
    },
    isActive: true,
  };

  get filteredProjectTypes() {
    let types = this.projectTypes || [];

    // Filter by category
    if (this.filterCategory !== 'all') {
      types = types.filter((t) => t.category === this.filterCategory);
    }

    // Filter by status
    if (this.filterStatus === 'active') {
      types = types.filter((t) => t.isActive);
    } else if (this.filterStatus === 'inactive') {
      types = types.filter((t) => !t.isActive);
    }

    // Filter by search text
    if (this.searchText) {
      const search = this.searchText.toLowerCase();
      types = types.filter(
        (t) =>
          t.name?.toLowerCase().includes(search) ||
          t.description?.toLowerCase().includes(search) ||
          t.category?.toLowerCase().includes(search),
      );
    }

    return types;
  }

  get activeCount() {
    return this.projectTypes?.filter((t) => t.isActive).length || 0;
  }

  get inactiveCount() {
    return this.projectTypes?.filter((t) => !t.isActive).length || 0;
  }

  get categoryOptions() {
    return [
      { value: 'all', label: 'All Categories' },
      { value: 'residential', label: 'Residential' },
      { value: 'commercial', label: 'Commercial' },
      { value: 'industrial', label: 'Industrial' },
      { value: 'mixed_use', label: 'Mixed Use' },
      { value: 'renovation', label: 'Renovation' },
      { value: 'new_construction', label: 'New Construction' },
      { value: 'infrastructure', label: 'Infrastructure' },
      { value: 'other', label: 'Other' },
    ];
  }

  @action
  updateSearch(event) {
    this.searchText = event.target.value;
  }

  @action
  setFilterStatus(event) {
    this.filterStatus = event.target.value;
  }

  @action
  setFilterCategory(event) {
    this.filterCategory = event.target.value;
  }

  @action
  openCreateModal() {
    this.selectedProjectType = null;
    this.isEditMode = false;
    // Reset form data
    this.formData = {
      name: '',
      description: '',
      category: '',
      icon: 'folder-open',
      estimatedCompletionDays: null,
      selectedPermitTypes: [],
      feeSchedule: {
        baseAmount: 0,
      },
      isActive: true,
    };
    this.isModalOpen = true;
  }

  @action
  openEditModal(projectType) {
    this.selectedProjectType = projectType;
    this.isEditMode = true;
    // Populate form with existing data
    this.formData = {
      name: projectType.name || '',
      description: projectType.description || '',
      category: projectType.category || '',
      icon: projectType.icon || 'folder-open',
      estimatedCompletionDays: projectType.estimatedCompletionDays || null,
      selectedPermitTypes:
        projectType.defaultPermitTypes?.map((pt) => pt.permitTypeId) || [],
      feeSchedule: {
        baseAmount: projectType.feeSchedule?.baseAmount || 0,
      },
      isActive: projectType.isActive !== false,
    };
    this.isModalOpen = true;
  }

  @action
  closeModal() {
    this.isModalOpen = false;
    this.selectedProjectType = null;
    this.isEditMode = false;
  }

  @action
  updateFormField(field, event) {
    this.formData = {
      ...this.formData,
      [field]: event.target.value,
    };
  }

  @action
  updateFeeField(field, event) {
    this.formData = {
      ...this.formData,
      feeSchedule: {
        ...this.formData.feeSchedule,
        [field]: parseFloat(event.target.value) || 0,
      },
    };
  }

  @action
  togglePermitType(permitTypeId) {
    const selected = [...this.formData.selectedPermitTypes];
    const index = selected.indexOf(permitTypeId);

    if (index > -1) {
      selected.splice(index, 1);
    } else {
      selected.push(permitTypeId);
    }

    this.formData = {
      ...this.formData,
      selectedPermitTypes: selected,
    };
  }

  @action
  toggleActive() {
    this.formData = {
      ...this.formData,
      isActive: !this.formData.isActive,
    };
  }

  @action
  stopPropagation(event) {
    event.stopPropagation();
  }

  @action
  async submitForm() {
    // Validate required fields
    if (
      !this.formData.name ||
      !this.formData.description ||
      !this.formData.category
    ) {
      this.notifications.error('Please fill in all required fields');
      return;
    }

    if (this.formData.selectedPermitTypes.length === 0) {
      this.notifications.error('Please select at least one permit type');
      return;
    }

    this.isSaving = true;

    try {
      // Build the project type data
      const projectTypeData = {
        name: this.formData.name,
        description: this.formData.description,
        category: this.formData.category,
        icon: this.formData.icon || 'folder-open',
        estimatedCompletionDays: this.formData.estimatedCompletionDays
          ? parseInt(this.formData.estimatedCompletionDays)
          : null,
        defaultPermitTypes: this.formData.selectedPermitTypes.map(
          (permitTypeId, index) => ({
            permitTypeId,
            isRequired: true,
            order: index,
          }),
        ),
        feeSchedule: {
          baseAmount: this.formData.feeSchedule.baseAmount || 0,
          calculationType: 'fixed',
        },
        isActive: this.formData.isActive,
      };

      await this.saveProjectType(projectTypeData);
    } catch (error) {
      console.error('Error submitting form:', error);
    } finally {
      this.isSaving = false;
    }
  }

  @action
  async saveProjectType(projectTypeData) {
    try {
      console.log('Saving project type data:', projectTypeData);

      if (this.isEditMode && this.selectedProjectType) {
        // Update existing
        const updated = await this.api.put(
          `/municipalities/${this.municipalityId}/project-types/${this.selectedProjectType._id}`,
          projectTypeData,
        );

        // Update in list
        const index = this.projectTypes.findIndex(
          (t) => t._id === this.selectedProjectType._id,
        );
        if (index !== -1) {
          this.projectTypes[index] = updated;
          this.projectTypes = [...this.projectTypes]; // Trigger reactivity
        }

        this.notifications.success('Project type updated successfully');
      } else {
        // Create new
        const created = await this.api.post(
          `/municipalities/${this.municipalityId}/project-types`,
          projectTypeData,
        );

        this.projectTypes = [...this.projectTypes, created];
        this.notifications.success('Project type created successfully');
      }

      this.closeModal();

      // Refresh the route
      this.router.refresh(
        'municipality.building-permits.settings.project-types',
      );
    } catch (error) {
      console.error('Error saving project type:', error);

      // Show specific error message if available
      if (error.error === 'Duplicate project type') {
        this.notifications.error(
          'A project type with this name already exists',
        );
      } else if (error.error === 'Validation failed') {
        this.notifications.error(
          error.message || 'Please check the form for errors',
        );
      } else {
        this.notifications.error('Failed to save project type');
      }
    }
  }

  @action
  async toggleStatus(projectType) {
    try {
      const updated = await this.api.put(
        `/municipalities/${this.municipalityId}/project-types/${projectType._id}`,
        {
          isActive: !projectType.isActive,
        },
      );

      // Update in list
      const index = this.projectTypes.findIndex(
        (t) => t._id === projectType._id,
      );
      if (index !== -1) {
        this.projectTypes[index] = updated;
        this.projectTypes = [...this.projectTypes];
      }

      this.notifications.success(
        `Project type ${updated.isActive ? 'activated' : 'deactivated'}`,
      );
    } catch (error) {
      console.error('Error toggling project type status:', error);
      this.notifications.error('Failed to update project type status');
    }
  }

  @action
  async deleteProjectType(projectType) {
    if (
      !confirm(
        `Are you sure you want to deactivate "${projectType.name}"? This will prevent new projects of this type from being created.`,
      )
    ) {
      return;
    }

    try {
      await this.api.delete(
        `/municipalities/${this.municipalityId}/project-types/${projectType._id}`,
      );

      // Update in list
      const index = this.projectTypes.findIndex(
        (t) => t._id === projectType._id,
      );
      if (index !== -1) {
        this.projectTypes[index].isActive = false;
        this.projectTypes = [...this.projectTypes];
      }

      this.notifications.success('Project type deactivated successfully');
    } catch (error) {
      console.error('Error deleting project type:', error);
      this.notifications.error('Failed to deactivate project type');
    }
  }
}
