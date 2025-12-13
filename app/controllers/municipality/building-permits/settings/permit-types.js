import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class MunicipalityBuildingPermitsSettingsPermitTypesController extends Controller {
  @service api;
  @service notifications;
  @service router;

  @tracked permitTypes = [];
  @tracked municipalityId = null;
  @tracked isModalOpen = false;
  @tracked selectedPermitType = null;
  @tracked isEditMode = false;
  @tracked searchText = '';
  @tracked filterStatus = 'all';
  @tracked filterCategory = 'all';

  get filteredPermitTypes() {
    let types = this.permitTypes || [];

    // Filter by category (now checks if categories array includes the filter)
    if (this.filterCategory !== 'all') {
      types = types.filter((t) => t.categories?.includes(this.filterCategory));
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
          t.categories?.some((cat) => cat.toLowerCase().includes(search)),
      );
    }

    return types;
  }

  get activeCount() {
    return this.permitTypes?.filter((t) => t.isActive).length || 0;
  }

  get inactiveCount() {
    return this.permitTypes?.filter((t) => !t.isActive).length || 0;
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
    this.selectedPermitType = null;
    this.isEditMode = false;
    this.isModalOpen = true;
  }

  @action
  openEditModal(permitType) {
    this.selectedPermitType = permitType;
    this.isEditMode = true;
    this.isModalOpen = true;
  }

  @action
  closeModal() {
    this.isModalOpen = false;
    this.selectedPermitType = null;
    this.isEditMode = false;
  }

  @action
  async savePermitType(permitTypeData) {
    try {
      // Debug: log what we're sending
      console.log('Saving permit type data:', permitTypeData);
      console.log('Custom form fields:', permitTypeData.customFormFields);

      if (this.isEditMode && this.selectedPermitType) {
        // Update existing
        const updated = await this.api.put(
          `/municipalities/${this.municipalityId}/permit-types/${this.selectedPermitType._id}`,
          permitTypeData,
        );

        // Update in list
        const index = this.permitTypes.findIndex(
          (t) => t._id === this.selectedPermitType._id,
        );
        if (index !== -1) {
          this.permitTypes[index] = updated;
          this.permitTypes = [...this.permitTypes]; // Trigger reactivity
        }

        this.notifications.success('Permit type updated successfully');
      } else {
        // Create new
        const created = await this.api.post(
          `/municipalities/${this.municipalityId}/permit-types`,
          permitTypeData,
        );

        this.permitTypes = [...this.permitTypes, created];
        this.notifications.success('Permit type created successfully');
      }

      this.closeModal();

      // Refresh the route
      this.router.refresh(
        'municipality.building-permits.settings.permit-types',
      );
    } catch (error) {
      console.error('Error saving permit type:', error);

      // Show specific error message if available
      if (error.error === 'Duplicate permit type') {
        this.notifications.error('A permit type with this name already exists');
      } else if (error.error === 'Validation failed') {
        this.notifications.error(
          error.message || 'Please check the form for errors',
        );
      } else {
        this.notifications.error('Failed to save permit type');
      }
    }
  }

  @action
  async toggleStatus(permitType) {
    try {
      const updated = await this.api.put(
        `/municipalities/${this.municipalityId}/permit-types/${permitType._id}`,
        {
          isActive: !permitType.isActive,
        },
      );

      // Update in list
      const index = this.permitTypes.findIndex((t) => t._id === permitType._id);
      if (index !== -1) {
        this.permitTypes[index] = updated;
        this.permitTypes = [...this.permitTypes];
      }

      this.notifications.success(
        `Permit type ${updated.isActive ? 'activated' : 'deactivated'}`,
      );
    } catch (error) {
      console.error('Error toggling permit type status:', error);
      this.notifications.error('Failed to update permit type status');
    }
  }

  @action
  async deletePermitType(permitType) {
    if (
      !confirm(
        `Are you sure you want to deactivate "${permitType.name}"? This will prevent new permits of this type from being created.`,
      )
    ) {
      return;
    }

    try {
      await this.api.delete(
        `/municipalities/${this.municipalityId}/permit-types/${permitType._id}`,
      );

      // Update in list
      const index = this.permitTypes.findIndex((t) => t._id === permitType._id);
      if (index !== -1) {
        this.permitTypes[index].isActive = false;
        this.permitTypes = [...this.permitTypes];
      }

      this.notifications.success('Permit type deactivated successfully');
    } catch (error) {
      console.error('Error deleting permit type:', error);
      this.notifications.error('Failed to deactivate permit type');
    }
  }
}
