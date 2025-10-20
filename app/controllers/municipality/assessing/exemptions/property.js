import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class MunicipalityAssessingExemptionsPropertyController extends Controller {
  @service api;
  @service notifications;
  @service municipality;
  @service router;
  @service('property-selection') propertySelection;

  @tracked exemptions = [];
  @tracked availableExemptions = [];
  @tracked isLoadingExemptions = false;
  @tracked isEditModalOpen = false;
  @tracked currentEditingExemption = null;

  get totalExemptionValue() {
    return this.exemptions.reduce((total, exemption) => {
      return total + (exemption.exemption_value || 0);
    }, 0);
  }

  get totalCreditValue() {
    return this.exemptions.reduce((total, exemption) => {
      return total + (exemption.credit_value || 0);
    }, 0);
  }

  @action
  async setupExemptions() {
    console.log('Setting up exemptions...');

    // Initialize exemptions from model
    this.exemptions = (this.model.exemptions || []).map((exemption) => {
      const exemptionTypeData =
        exemption.exemption_type_id || exemption.exemptionTypeId;
      const exemptionTypeId =
        typeof exemptionTypeData === 'object'
          ? exemptionTypeData._id || exemptionTypeData.id
          : exemptionTypeData;

      const selectedExemptionType = this.model.availableExemptions.find(
        (type) => (type._id || type.id) === exemptionTypeId,
      );

      return {
        ...exemption,
        isEditing: false,
        isNew: false,
        exemptionTypeId: exemptionTypeId,
        selectedExemptionType: selectedExemptionType,
        originalData: { ...exemption },
      };
    });

    this.availableExemptions = this.model.availableExemptions || [];
    console.log('Available exemptions:', this.availableExemptions);
  }

  @action
  addExemption() {
    const newExemption = {
      id: null,
      exemptionTypeId: '',
      selectedExemptionType: null,
      exemption_value: 0,
      credit_value: 0,
      start_year: new Date().getFullYear(),
      end_year: null,
      qualification_notes: '',
      is_active: true,
      isEditing: true,
      isNew: true,
      originalData: null,
    };

    this.exemptions = [newExemption, ...this.exemptions];
  }

  @action
  selectExemptionType(exemption, event) {
    const exemptionTypeId = event.target.value;
    const selectedType = this.availableExemptions.find(
      (type) => (type._id || type.id) === exemptionTypeId,
    );

    if (selectedType) {
      this.exemptions = this.exemptions.map((e) => {
        if (e === exemption) {
          const updatedExemption = {
            ...e,
            exemptionTypeId: exemptionTypeId,
            selectedExemptionType: selectedType,
            exemption_value: selectedType.default_exemption_value || 0,
            credit_value: selectedType.default_credit_value || 0,
          };

          return updatedExemption;
        }
        return e;
      });
    }
  }

  @action
  editExemption(exemption) {
    this.currentEditingExemption = exemption;
    this.isEditModalOpen = true;
  }

  @action
  addExemptionModal() {
    this.currentEditingExemption = null;
    this.isEditModalOpen = true;
  }

  @action
  closeEditModal() {
    this.isEditModalOpen = false;
    this.currentEditingExemption = null;
  }

  @action
  updateExemptionField(exemption, field, event) {
    const value = event.target ? event.target.value : event;
    const processedValue =
      field === 'exemption_value' ||
      field === 'credit_value' ||
      field === 'start_year' ||
      field === 'end_year'
        ? value === ''
          ? null
          : parseFloat(value) || 0
        : field === 'is_active'
          ? event.target.checked
          : value;

    this.exemptions = this.exemptions.map((e) => {
      if (e === exemption) {
        return { ...e, [field]: processedValue };
      }
      return e;
    });
  }

  @action
  async saveExemptionFromModal(exemptionData) {
    try {
      const currentCard = this.model.property.current_card || 1;
      const isNew = !this.currentEditingExemption;

      const saveData = {
        property_id: this.model.property.id,
        card_number: currentCard,
        ...exemptionData,
      };

      let savedExemption;
      if (isNew) {
        const response = await this.api.post(
          `/municipalities/${this.municipality.currentMunicipality.id}/properties/${this.model.property.id}/exemptions`,
          saveData,
        );
        savedExemption = response.exemption;
        this.notifications.success('Exemption added successfully');
      } else {
        const exemptionId =
          this.currentEditingExemption._id || this.currentEditingExemption.id;
        const response = await this.api.put(
          `/municipalities/${this.municipality.currentMunicipality.id}/properties/${this.model.property.id}/exemptions/${exemptionId}`,
          saveData,
        );
        savedExemption = response.exemption;
        this.notifications.success('Exemption updated successfully');
      }

      // Update the exemption in the list
      if (isNew) {
        this.exemptions = [
          {
            ...savedExemption,
            isEditing: false,
            isNew: false,
            exemptionTypeId: savedExemption.exemption_type_id,
            selectedExemptionType: this.availableExemptions.find(
              (type) =>
                (type._id || type.id) === savedExemption.exemption_type_id,
            ),
          },
          ...this.exemptions,
        ];
      } else {
        this.exemptions = this.exemptions.map((e) => {
          if (e === this.currentEditingExemption) {
            return {
              ...savedExemption,
              isEditing: false,
              isNew: false,
              exemptionTypeId: savedExemption.exemption_type_id,
              selectedExemptionType: this.availableExemptions.find(
                (type) =>
                  (type._id || type.id) === savedExemption.exemption_type_id,
              ),
            };
          }
          return e;
        });
      }

      // Close modal
      this.closeEditModal();

      // Refresh assessment totals in property header
      await this.propertySelection.refreshCurrentAssessmentTotals(
        null,
        this.model,
      );
    } catch (error) {
      console.error('Failed to save exemption:', error);
      this.notifications.error('Failed to save exemption');
      throw error;
    }
  }

  @action
  async saveExemption(exemption) {
    try {
      const currentCard = this.model.property.current_card || 1;

      const exemptionData = {
        property_id: this.model.property.id,
        card_number: currentCard,
        exemption_type_id: exemption.exemptionTypeId,
        exemption_value: parseFloat(exemption.exemption_value) || 0,
        credit_value: parseFloat(exemption.credit_value) || 0,
        start_year: parseInt(exemption.start_year) || new Date().getFullYear(),
        end_year: exemption.end_year ? parseInt(exemption.end_year) : null,
        qualification_notes: exemption.qualification_notes || '',
        is_active: exemption.is_active !== false,
      };

      let savedExemption;
      if (exemption.isNew) {
        const response = await this.api.post(
          `/municipalities/${this.municipality.currentMunicipality.id}/properties/${this.model.property.id}/exemptions`,
          exemptionData,
        );
        savedExemption = response.exemption;
        this.notifications.success('Exemption added successfully');
      } else {
        const exemptionId = exemption._id || exemption.id;
        const response = await this.api.put(
          `/municipalities/${this.municipality.currentMunicipality.id}/properties/${this.model.property.id}/exemptions/${exemptionId}`,
          exemptionData,
        );
        savedExemption = response.exemption;
        this.notifications.success('Exemption updated successfully');
      }

      // Update the exemption in the list
      this.exemptions = this.exemptions.map((e) => {
        if (e === exemption) {
          const exemptionTypeData =
            savedExemption.exemption_type_id || savedExemption.exemptionTypeId;
          const exemptionTypeId =
            typeof exemptionTypeData === 'object'
              ? exemptionTypeData._id || exemptionTypeData.id
              : exemptionTypeData;

          const selectedExemptionType = this.availableExemptions.find(
            (type) => (type._id || type.id) === exemptionTypeId,
          );

          return {
            ...savedExemption,
            isEditing: false,
            isNew: false,
            exemptionTypeId: exemptionTypeId,
            selectedExemptionType: selectedExemptionType,
            originalData: null,
          };
        }
        return e;
      });

      // Refresh assessment totals in property header
      await this.propertySelection.refreshCurrentAssessmentTotals(
        null,
        this.model,
      );
    } catch (error) {
      console.error('Failed to save exemption:', error);
      this.notifications.error('Failed to save exemption');
    }
  }

  @action
  cancelEdit(exemption) {
    if (exemption.isNew) {
      this.exemptions = this.exemptions.filter((e) => e !== exemption);
    } else {
      this.exemptions = this.exemptions.map((e) => {
        if (e === exemption && e.originalData) {
          return {
            ...e.originalData,
            originalData: null,
          };
        }
        return e;
      });
    }
  }

  @action
  async deleteExemption(exemption) {
    const exemptionName =
      exemption.selectedExemptionType?.name || 'this exemption';
    const exemptionId = exemption._id || exemption.id;

    if (!exemptionId) {
      console.error('No exemption ID found:', exemption);
      this.notifications.error('Cannot delete exemption: No ID found');
      return;
    }

    if (confirm(`Are you sure you want to delete "${exemptionName}"?`)) {
      try {
        await this.api.delete(
          `/municipalities/${this.municipality.currentMunicipality.id}/properties/${this.model.property.id}/exemptions/${exemptionId}`,
        );
        this.exemptions = this.exemptions.filter((e) => e !== exemption);
        this.notifications.success('Exemption deleted successfully');

        // Refresh assessment totals in property header
        await this.propertySelection.refreshCurrentAssessmentTotals(
          null,
          this.model,
        );
      } catch (error) {
        console.error('Failed to delete exemption:', error);
        this.notifications.error('Failed to delete exemption');
      }
    }
  }

  @action
  async refreshExemptionsProperty() {
    if (this.exemptionsRoute) {
      this.exemptionsRoute.refresh();
    }

    await this.propertySelection.refreshCurrentAssessmentTotals(
      null,
      this.model,
    );
  }
}
