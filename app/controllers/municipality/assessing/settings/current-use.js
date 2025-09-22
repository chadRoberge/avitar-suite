import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';

export default class CurrentUseController extends Controller {
  @service api;

  // Current use tracking
  @tracked isAddingCurrentUse = false;
  @tracked isEditingCurrentUse = false;
  @tracked editingCurrentUseCategory = null;
  @tracked newCurrentUseCode = '';
  @tracked newCurrentUseDescription = '';
  @tracked newCurrentUseDisplayText = '';
  @tracked newCurrentUseMinRate = '';
  @tracked newCurrentUseMaxRate = '';

  // Ad valorem display setting - use getter to sync with model
  get showAdValorem() {
    return this.model?.settings?.showAdValorem ?? true;
  }

  // Update counter for reactivity
  @tracked currentUseUpdateCounter = 0;

  // Computed property for reactive current use categories
  get reactiveCurrentUseCategories() {
    this.currentUseUpdateCounter;
    return this.model?.currentUseCategories || [];
  }

  // Ad valorem toggle action
  @action
  async toggleAdValorem(event) {
    const newValue = event.target.checked;
    const previousValue = this.model.settings.showAdValorem;

    // Optimistically update the model
    this.model.settings.showAdValorem = newValue;
    this.model = { ...this.model };

    try {
      const municipalityId = this.model.municipality.id;
      const response = await this.api.put(
        `/municipalities/${municipalityId}/current-use-settings`,
        {
          showAdValorem: newValue,
        },
      );

      // Update with server response
      this.model.settings = response.settings;
      this.model = { ...this.model };
    } catch (error) {
      console.error('Error saving ad valorem setting:', error);
      // Revert the model if save failed
      this.model.settings.showAdValorem = previousValue;
      this.model = { ...this.model };
      alert('Error saving ad valorem setting. Please try again.');
    }
  }

  // Current use actions
  @action
  startAddingCurrentUse() {
    this.isAddingCurrentUse = true;
    this.isEditingCurrentUse = false;
    this.editingCurrentUseCategory = null;
    this.newCurrentUseCode = '';
    this.newCurrentUseDescription = '';
    this.newCurrentUseDisplayText = '';
    this.newCurrentUseMinRate = '';
    this.newCurrentUseMaxRate = '';
  }

  @action
  cancelAddingCurrentUse() {
    this.isAddingCurrentUse = false;
    this.newCurrentUseCode = '';
    this.newCurrentUseDescription = '';
    this.newCurrentUseDisplayText = '';
    this.newCurrentUseMinRate = '';
    this.newCurrentUseMaxRate = '';
  }

  @action
  startEditingCurrentUse(currentUseCategory) {
    this.isEditingCurrentUse = true;
    this.isAddingCurrentUse = false;
    this.editingCurrentUseCategory = currentUseCategory;
    this.newCurrentUseCode = currentUseCategory.code;
    this.newCurrentUseDescription = currentUseCategory.description;
    this.newCurrentUseDisplayText = currentUseCategory.displayText;
    this.newCurrentUseMinRate = currentUseCategory.minRate.toString();
    this.newCurrentUseMaxRate = currentUseCategory.maxRate.toString();
  }

  @action
  cancelEditingCurrentUse() {
    this.isEditingCurrentUse = false;
    this.editingCurrentUseCategory = null;
    this.newCurrentUseCode = '';
    this.newCurrentUseDescription = '';
    this.newCurrentUseDisplayText = '';
    this.newCurrentUseMinRate = '';
    this.newCurrentUseMaxRate = '';
  }

  @action
  updateCurrentUseCode(event) {
    this.newCurrentUseCode = event.target.value;
  }

  @action
  updateCurrentUseDescription(event) {
    this.newCurrentUseDescription = event.target.value;
  }

  @action
  updateCurrentUseDisplayText(event) {
    this.newCurrentUseDisplayText = event.target.value;
  }

  @action
  updateCurrentUseMinRate(event) {
    this.newCurrentUseMinRate = event.target.value;
  }

  @action
  updateCurrentUseMaxRate(event) {
    this.newCurrentUseMaxRate = event.target.value;
  }

  @action
  async saveCurrentUse() {
    if (
      !this.newCurrentUseCode.trim() ||
      !this.newCurrentUseDescription.trim() ||
      !this.newCurrentUseDisplayText.trim() ||
      !this.newCurrentUseMinRate ||
      !this.newCurrentUseMaxRate
    ) {
      alert('Please fill in all required fields');
      return;
    }

    const minRate = parseFloat(this.newCurrentUseMinRate);
    const maxRate = parseFloat(this.newCurrentUseMaxRate);

    if (isNaN(minRate) || minRate < 0) {
      alert('Please enter a valid minimum rate (must be a positive number)');
      return;
    }

    if (isNaN(maxRate) || maxRate < 0) {
      alert('Please enter a valid maximum rate (must be a positive number)');
      return;
    }

    if (minRate > maxRate) {
      alert('Minimum rate cannot be greater than maximum rate');
      return;
    }

    try {
      const municipalityId = this.model.municipality.id;
      const categoryData = {
        code: this.newCurrentUseCode.toUpperCase().trim(),
        description: this.newCurrentUseDescription.trim(),
        displayText: this.newCurrentUseDisplayText.trim(),
        minRate: minRate,
        maxRate: maxRate,
      };

      let savedCategory;
      if (this.isEditingCurrentUse) {
        // Update existing current use category
        const response = await this.api.put(
          `/municipalities/${municipalityId}/current-use/${this.editingCurrentUseCategory._id || this.editingCurrentUseCategory.id}`,
          categoryData,
        );
        savedCategory = response.currentUse;

        // Update in local model
        const categoryIndex = this.model.currentUseCategories.findIndex(
          (c) =>
            (c._id || c.id) ===
            (this.editingCurrentUseCategory._id ||
              this.editingCurrentUseCategory.id),
        );
        if (categoryIndex !== -1) {
          this.model.currentUseCategories[categoryIndex] = savedCategory;
          this.model.currentUseCategories = [
            ...this.model.currentUseCategories,
          ];
        }
      } else {
        // Create new current use category
        const response = await this.api.post(
          `/municipalities/${municipalityId}/current-use`,
          categoryData,
        );
        savedCategory = response.currentUse;

        // Add to local model
        if (!this.model.currentUseCategories) {
          this.model.currentUseCategories = [];
        }
        this.model.currentUseCategories.push(savedCategory);
        this.model.currentUseCategories = [...this.model.currentUseCategories];
      }

      this.model = { ...this.model };

      // Force reactivity
      this.currentUseUpdateCounter++;

      if (this.isEditingCurrentUse) {
        this.cancelEditingCurrentUse();
      } else {
        this.cancelAddingCurrentUse();
      }
    } catch (error) {
      console.error('Error saving current use category:', error);
      alert('Error saving current use category. Please try again.');
    }
  }

  @action
  async deleteCurrentUse(currentUseCategory) {
    if (confirm('Are you sure you want to delete this current use category?')) {
      try {
        const municipalityId = this.model.municipality.id;
        await this.api.delete(
          `/municipalities/${municipalityId}/current-use/${currentUseCategory._id || currentUseCategory.id}`,
        );

        // Remove from local model
        const categoryIndex = this.model.currentUseCategories.findIndex(
          (c) =>
            (c._id || c.id) ===
            (currentUseCategory._id || currentUseCategory.id),
        );
        if (categoryIndex !== -1) {
          this.model.currentUseCategories.splice(categoryIndex, 1);
          this.model.currentUseCategories = [
            ...this.model.currentUseCategories,
          ];
          this.model = { ...this.model };

          // Force reactivity
          this.currentUseUpdateCounter++;
        }
      } catch (error) {
        console.error('Error deleting current use category:', error);
        alert('Error deleting current use category. Please try again.');
      }
    }
  }
}
