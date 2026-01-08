import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';

export default class ViewController extends Controller {
  @service assessing;

  // Query params for year selection
  queryParams = ['year'];
  @tracked year = new Date().getFullYear();

  // Year-aware computed properties
  get configYear() {
    return this.model?.configYear || this.year;
  }

  get isYearLocked() {
    return this.model?.isYearLocked || false;
  }

  get availableYears() {
    const currentYear = new Date().getFullYear();
    const years = [];
    for (let y = currentYear + 2; y >= currentYear - 5; y--) {
      years.push(y);
    }
    return years;
  }

  @action
  changeYear(event) {
    const newYear = parseInt(event.target.value, 10);
    this.year = newYear;
  }

  @tracked attributeUpdateCounter = 0;

  // View Attribute Modal State
  @tracked isViewAttributeModalOpen = false;
  @tracked editingViewAttribute = null;
  @tracked editingAttributeType = null;
  @tracked editingAttributeTypeName = null;
  @tracked editingAttributeTypeIcon = null;

  // Define the four view attribute types
  viewAttributeTypes = [
    {
      key: 'subject',
      title: 'Subject',
      subtitle: 'What the property has a view of',
      icon: 'fas fa-eye',
    },
    {
      key: 'width',
      title: 'Width',
      subtitle: 'Width of the view angle',
      icon: 'fas fa-arrows-alt-h',
    },
    {
      key: 'distance',
      title: 'Distance',
      subtitle: 'Distance to the view subject',
      icon: 'fas fa-ruler',
    },
    {
      key: 'depth',
      title: 'Depth',
      subtitle: 'Depth or extent of the view',
      icon: 'fas fa-mountain',
    },
  ];

  // Computed property to ensure view attributes are reactive
  get reactiveViewAttributes() {
    this.attributeUpdateCounter;
    return this.model?.viewAttributes || [];
  }

  // Computed property to group attributes by type
  get attributesByType() {
    this.attributeUpdateCounter;

    const attributes = {};
    if (this.model?.viewAttributes) {
      this.model.viewAttributes.forEach((attribute) => {
        if (!attributes[attribute.attributeType]) {
          attributes[attribute.attributeType] = [];
        }
        attributes[attribute.attributeType].push(attribute);
      });
    }
    return attributes;
  }

  // === VIEW ATTRIBUTE ACTIONS ===

  @action
  openNewAttributeModal(attributeType) {
    const typeInfo = this.viewAttributeTypes.find(
      (type) => type.key === attributeType,
    );
    this.editingViewAttribute = null;
    this.editingAttributeType = attributeType;
    this.editingAttributeTypeName = typeInfo?.title;
    this.editingAttributeTypeIcon = typeInfo?.icon;
    this.isViewAttributeModalOpen = true;
  }

  @action
  openEditAttributeModal(attributeType, attribute) {
    const typeInfo = this.viewAttributeTypes.find(
      (type) => type.key === attributeType,
    );
    this.editingViewAttribute = attribute;
    this.editingAttributeType = attributeType;
    this.editingAttributeTypeName = typeInfo?.title;
    this.editingAttributeTypeIcon = typeInfo?.icon;
    this.isViewAttributeModalOpen = true;
  }

  @action
  closeViewAttributeModal() {
    this.isViewAttributeModalOpen = false;
    this.editingViewAttribute = null;
    this.editingAttributeType = null;
    this.editingAttributeTypeName = null;
    this.editingAttributeTypeIcon = null;
  }

  @action
  async saveViewAttribute(attributeData) {
    try {
      const municipalityId = this.model.municipality.id;
      console.log('Controller: saveViewAttribute called with:', attributeData);
      console.log('Controller: municipalityId:', municipalityId);
      console.log(
        'Controller: editingViewAttribute:',
        this.editingViewAttribute,
      );

      let savedAttribute;
      if (this.editingViewAttribute?.id || this.editingViewAttribute?._id) {
        // Update existing attribute using assessing service
        console.log('Controller: Updating existing attribute');
        const attributeId =
          this.editingViewAttribute.id || this.editingViewAttribute._id;
        const response = await this.assessing.updateViewAttribute(
          attributeId,
          attributeData,
          municipalityId,
        );
        savedAttribute = response.viewAttribute;

        const attributeIndex = this.model.viewAttributes.findIndex(
          (attr) =>
            (attr.id || attr._id) ===
            (this.editingViewAttribute.id || this.editingViewAttribute._id),
        );
        if (attributeIndex !== -1) {
          this.model.viewAttributes[attributeIndex] = savedAttribute;
        }
      } else {
        // Create new attribute using assessing service
        console.log('Controller: Creating new attribute');
        const response = await this.assessing.createViewAttribute(
          attributeData,
          municipalityId,
        );
        savedAttribute = response.viewAttribute;
        this.model.viewAttributes.push(savedAttribute);
      }

      // Force reactivity update
      this.model.viewAttributes = [...this.model.viewAttributes];
      this.model = { ...this.model };
      this.attributeUpdateCounter++;

      this.closeViewAttributeModal();
    } catch (error) {
      console.error('Error saving view attribute:', error);
      throw error; // Re-throw so modal can handle it
    }
  }

  @action
  async deleteAttribute(attribute) {
    if (confirm(`Are you sure you want to delete "${attribute.name}"?`)) {
      try {
        const municipalityId = this.model.municipality.id;
        const attributeId = attribute.id || attribute._id;
        await this.assessing.deleteViewAttribute(attributeId, municipalityId);

        // Remove from local model
        const attributeIndex = this.model.viewAttributes.findIndex(
          (attr) => (attr.id || attr._id) === attributeId,
        );
        if (attributeIndex !== -1) {
          this.model.viewAttributes.splice(attributeIndex, 1);
        }

        // Force reactivity update
        this.model = { ...this.model };
        this.attributeUpdateCounter++;
      } catch (error) {
        console.error('Error deleting view attribute:', error);
        alert('Error deleting attribute. Please try again.');
      }
    }
  }

  @action
  async createDefaults() {
    try {
      const municipalityId = this.model.municipality.id;
      const response =
        await this.assessing.createDefaultViewAttributes(municipalityId);
      const defaultAttributes = response.viewAttributes;

      // Update local model with defaults
      this.model.viewAttributes = defaultAttributes;
      this.model = { ...this.model };
      this.attributeUpdateCounter++;
    } catch (error) {
      console.error('Error creating default view attributes:', error);
      alert('Error creating default view attributes. Please try again.');
    }
  }
}
