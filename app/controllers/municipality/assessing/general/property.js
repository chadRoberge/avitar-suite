import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';

export default class MunicipalityAssessingGeneralPropertyController extends Controller {
  @service api;
  @service notifications;
  @service municipality;
  @service('current-user') currentUser;

  // Tracked properties for each section
  @tracked listingEntries = [];
  @tracked propertyNotes = {};
  @tracked salesEntries = [];

  // New entry forms
  @tracked newListingEntry = {};
  @tracked newSalesEntry = {};

  // Modal state
  @tracked showListingHistoryModal = false;
  @tracked showSalesHistoryModal = false;
  @tracked showPropertyNotesModal = false;

  // Initialize tracked properties from model
  @action
  setupController(model) {
    this.listingEntries = [...(model.listingHistory || [])];
    this.propertyNotes = {
      ...(model.propertyNotes || {
        notes: '',
      }),
    };
    this.salesEntries = [...(model.salesHistory || [])];

    // Initialize new entry forms
    this.resetNewListingEntry();
    this.resetNewSalesEntry();
  }

  @action
  resetNewListingEntry() {
    this.newListingEntry = {
      visitDate: new Date().toISOString().split('T')[0], // Today's date
      visitorCode: '',
      reasonCode: '',
      notes: '',
    };
  }

  @action
  resetNewSalesEntry() {
    this.newSalesEntry = {
      saleDate: '',
      salePrice: '',
      buyer: '',
      seller: '',
      saleType: '',
      verified: false,
      notes: '',
    };
  }

  // Listing history entry updates
  @action
  updateListingEntry(entryId, field, event) {
    // Check permissions before allowing updates
    if (!this.currentUser.hasModulePermission('assessing', 'update')) {
      return;
    }

    const value =
      event.target.type === 'checkbox'
        ? event.target.checked
        : event.target.value;
    const entryIndex = this.listingEntries.findIndex(
      (entry) => entry._id === entryId,
    );

    if (entryIndex !== -1) {
      const updatedEntry = {
        ...this.listingEntries[entryIndex],
        [field]: value,
      };
      this.listingEntries = [
        ...this.listingEntries.slice(0, entryIndex),
        updatedEntry,
        ...this.listingEntries.slice(entryIndex + 1),
      ];
    }
  }

  @action
  updateNewListingEntry(field, event) {
    // Check permissions before allowing updates
    if (!this.currentUser.hasModulePermission('assessing', 'update')) {
      return;
    }

    const value = event.target.value;
    this.newListingEntry = { ...this.newListingEntry, [field]: value };
  }

  // Property notes updates
  @action
  updatePropertyNotes(field, event) {
    // Check permissions before allowing updates
    if (!this.currentUser.hasModulePermission('assessing', 'update')) {
      return;
    }

    const value = event.target.value;
    this.propertyNotes = { ...this.propertyNotes, [field]: value };
  }

  // Sales entry updates
  @action
  updateSalesEntry(entryId, field, event) {
    // Check permissions before allowing updates
    if (!this.currentUser.hasModulePermission('assessing', 'update')) {
      return;
    }

    const value =
      event.target.type === 'checkbox'
        ? event.target.checked
        : event.target.value;
    const entryIndex = this.salesEntries.findIndex(
      (entry) => entry._id === entryId,
    );

    if (entryIndex !== -1) {
      const updatedEntry = { ...this.salesEntries[entryIndex], [field]: value };
      this.salesEntries = [
        ...this.salesEntries.slice(0, entryIndex),
        updatedEntry,
        ...this.salesEntries.slice(entryIndex + 1),
      ];
    }
  }

  @action
  updateNewSalesEntry(field, event) {
    // Check permissions before allowing updates
    if (!this.currentUser.hasModulePermission('assessing', 'update')) {
      return;
    }

    const value =
      event.target.type === 'checkbox'
        ? event.target.checked
        : event.target.value;
    this.newSalesEntry = { ...this.newSalesEntry, [field]: value };
  }

  // Save actions
  @action
  async saveListingEntry(entryData) {
    // Check permissions before attempting to save
    if (!this.currentUser.hasModulePermission('assessing', 'update')) {
      this.notifications.error(
        'You do not have permission to edit listing history',
      );
      return;
    }

    try {
      const municipalityId = this.municipality.currentMunicipality?.id;
      const propertyId = this.model.property.id;

      if (!municipalityId || !propertyId) {
        throw new Error('Municipality or property not found');
      }

      if (entryData._id) {
        // Update existing entry
        await this.api.put(
          `/municipalities/${municipalityId}/properties/${propertyId}/listing-history/${entryData._id}`,
          entryData,
          { loadingMessage: 'Saving listing history entry...' },
        );

        // Update the entry in the local array
        const entryIndex = this.listingEntries.findIndex(
          (entry) => entry._id === entryData._id,
        );
        if (entryIndex !== -1) {
          this.listingEntries = [
            ...this.listingEntries.slice(0, entryIndex),
            entryData,
            ...this.listingEntries.slice(entryIndex + 1),
          ];
        }

        this.notifications.success(
          'Listing history entry updated successfully',
        );
      } else {
        // Create new entry
        const response = await this.api.post(
          `/municipalities/${municipalityId}/properties/${propertyId}/listing-history`,
          entryData,
          { loadingMessage: 'Adding listing history entry...' },
        );

        // Add the new entry to the list
        this.listingEntries = [response.listingEntry, ...this.listingEntries];
        this.resetNewListingEntry();

        this.notifications.success('Listing history entry added successfully');
      }

      // Close modal on success
      this.closeListingHistoryModal();
    } catch (error) {
      console.error('Failed to save listing entry:', error);
      this.notifications.error(
        error.message || 'Failed to save listing history entry',
      );
      throw error;
    }
  }

  @action
  async savePropertyNotes(notesData) {
    // Check permissions before attempting to save
    if (!this.currentUser.hasModulePermission('assessing', 'update')) {
      this.notifications.error(
        'You do not have permission to edit property notes',
      );
      return;
    }

    try {
      const municipalityId = this.municipality.currentMunicipality?.id;
      const propertyId = this.model.property.id;

      if (!municipalityId || !propertyId) {
        throw new Error('Municipality or property not found');
      }

      await this.api.put(
        `/municipalities/${municipalityId}/properties/${propertyId}/notes`,
        notesData,
        { loadingMessage: 'Saving property notes...' },
      );

      this.notifications.success('Property notes saved successfully');

      // Close modal on success
      this.closePropertyNotesModal();
    } catch (error) {
      console.error('Failed to save property notes:', error);
      this.notifications.error(
        error.message || 'Failed to save property notes',
      );
      throw error;
    }
  }

  @action
  async saveSalesEntry(entryData) {
    // Check permissions before attempting to save
    if (!this.currentUser.hasModulePermission('assessing', 'update')) {
      this.notifications.error(
        'You do not have permission to edit sales history',
      );
      return;
    }

    try {
      const municipalityId = this.municipality.currentMunicipality?.id;
      const propertyId = this.model.property.id;

      if (!municipalityId || !propertyId) {
        throw new Error('Municipality or property not found');
      }

      if (entryData._id) {
        // Update existing entry
        await this.api.put(
          `/municipalities/${municipalityId}/properties/${propertyId}/sales-history/${entryData._id}`,
          entryData,
          { loadingMessage: 'Saving sales entry...' },
        );

        // Update the entry in the local array
        const entryIndex = this.salesEntries.findIndex(
          (entry) => entry._id === entryData._id,
        );
        if (entryIndex !== -1) {
          this.salesEntries = [
            ...this.salesEntries.slice(0, entryIndex),
            entryData,
            ...this.salesEntries.slice(entryIndex + 1),
          ];
        }

        this.notifications.success('Sales entry updated successfully');
      } else {
        // Create new entry
        const response = await this.api.post(
          `/municipalities/${municipalityId}/properties/${propertyId}/sales-history`,
          entryData,
          { loadingMessage: 'Adding sales entry...' },
        );

        // Add the new entry to the list
        this.salesEntries = [response.salesEntry, ...this.salesEntries];
        this.resetNewSalesEntry();

        this.notifications.success('Sales entry added successfully');
      }

      // Close modal on success
      this.closeSalesHistoryModal();
    } catch (error) {
      console.error('Failed to save sales entry:', error);
      this.notifications.error(error.message || 'Failed to save sales entry');
      throw error;
    }
  }

  // Delete actions
  @action
  async deleteListingEntry(entryId) {
    // Check permissions before attempting to delete
    if (!this.currentUser.hasModulePermission('assessing', 'update')) {
      this.notifications.error(
        'You do not have permission to delete listing history entries',
      );
      return;
    }

    if (
      !confirm('Are you sure you want to delete this listing history entry?')
    ) {
      return;
    }

    try {
      const municipalityId = this.municipality.currentMunicipality?.id;
      const propertyId = this.model.property.id;

      await this.api.delete(
        `/municipalities/${municipalityId}/properties/${propertyId}/listing-history/${entryId}`,
        { loadingMessage: 'Deleting listing history entry...' },
      );

      // Remove from local array
      this.listingEntries = this.listingEntries.filter(
        (entry) => entry._id !== entryId,
      );

      this.notifications.success('Listing history entry deleted successfully');

      // Close modal on success
      this.closeListingHistoryModal();
    } catch (error) {
      console.error('Failed to delete listing entry:', error);
      this.notifications.error(
        error.message || 'Failed to delete listing history entry',
      );
    }
  }

  @action
  async deleteSalesEntry(entryId) {
    // Check permissions before attempting to delete
    if (!this.currentUser.hasModulePermission('assessing', 'update')) {
      this.notifications.error(
        'You do not have permission to delete sales entries',
      );
      return;
    }

    if (!confirm('Are you sure you want to delete this sales entry?')) {
      return;
    }

    try {
      const municipalityId = this.municipality.currentMunicipality?.id;
      const propertyId = this.model.property.id;

      await this.api.delete(
        `/municipalities/${municipalityId}/properties/${propertyId}/sales-history/${entryId}`,
        { loadingMessage: 'Deleting sales entry...' },
      );

      // Remove from local array
      this.salesEntries = this.salesEntries.filter(
        (entry) => entry._id !== entryId,
      );

      this.notifications.success('Sales entry deleted successfully');

      // Close modal on success
      this.closeSalesHistoryModal();
    } catch (error) {
      console.error('Failed to delete sales entry:', error);
      this.notifications.error(error.message || 'Failed to delete sales entry');
    }
  }

  // Reset actions
  @action
  resetListingEntry(originalData) {
    const entryIndex = this.listingEntries.findIndex(
      (entry) => entry._id === originalData._id,
    );
    if (entryIndex !== -1) {
      this.listingEntries = [
        ...this.listingEntries.slice(0, entryIndex),
        { ...originalData },
        ...this.listingEntries.slice(entryIndex + 1),
      ];
    }
  }

  @action
  resetPropertyNotes(originalData) {
    this.propertyNotes = { ...originalData };
  }

  @action
  resetSalesEntry(originalData) {
    const entryIndex = this.salesEntries.findIndex(
      (entry) => entry._id === originalData._id,
    );
    if (entryIndex !== -1) {
      this.salesEntries = [
        ...this.salesEntries.slice(0, entryIndex),
        { ...originalData },
        ...this.salesEntries.slice(entryIndex + 1),
      ];
    }
  }

  // Modal actions
  @action
  openListingHistoryModal() {
    this.showListingHistoryModal = true;
  }

  @action
  closeListingHistoryModal() {
    this.showListingHistoryModal = false;
  }

  @action
  openSalesHistoryModal() {
    this.showSalesHistoryModal = true;
  }

  @action
  closeSalesHistoryModal() {
    this.showSalesHistoryModal = false;
  }

  @action
  openPropertyNotesModal() {
    this.showPropertyNotesModal = true;
  }

  @action
  closePropertyNotesModal() {
    this.showPropertyNotesModal = false;
  }

  @action
  refreshGeneralProperty() {
    // Use the route reference to refresh
    if (this.generalRoute) {
      this.generalRoute.refresh();
    }
  }
}
