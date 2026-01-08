import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';

export default class WaterfrontController extends Controller {
  @service api;
  @service('current-user') currentUser;

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

  @tracked waterBodyUpdateCounter = 0;
  @tracked ladderUpdateCounter = 0;
  @tracked attributeUpdateCounter = 0;

  // Water Body Modal State
  @tracked isWaterBodyModalOpen = false;
  @tracked editingWaterBody = null;
  @tracked isWaterBodyLadderModalOpen = false;
  @tracked editingWaterBodyLadder = null;
  @tracked editingLadderWaterBody = null;
  @tracked isLadderEntryModalOpen = false;
  @tracked editingLadderEntry = null;
  @tracked editingEntryWaterBody = null;

  // Waterfront Attributes State
  @tracked isWaterfrontAttributeModalOpen = false;
  @tracked editingWaterfrontAttribute = null;
  @tracked editingAttributeType = null;
  @tracked editingAttributeTypeName = null;
  @tracked editingAttributeTypeIcon = null;

  // Define the three waterfront attribute types
  waterfrontAttributeTypes = [
    {
      key: 'water_access',
      title: 'Water Access',
      subtitle: 'Quality and type of access to waterfront',
      icon: 'fas fa-route',
    },
    {
      key: 'water_location',
      title: 'Water Location',
      subtitle: 'Location and positioning relative to water body',
      icon: 'fas fa-map-marker-alt',
    },
    {
      key: 'topography',
      title: 'Topography',
      subtitle: 'Topographical features affecting waterfront value',
      icon: 'fas fa-mountain',
    },
  ];

  // Computed property to ensure water bodies are reactive
  get reactiveWaterBodies() {
    this.waterBodyUpdateCounter;
    const waterBodies = this.model?.waterBodies || [];
    // Ensure consistent string IDs for template lookups
    return waterBodies.map((wb) => {
      const id = wb.id || wb._id;
      let stringId;
      if (typeof id === 'string') {
        stringId = id;
      } else if (id && id.$oid) {
        stringId = id.$oid;
      } else if (id && id._id) {
        stringId = id._id;
      } else if (id && id.toString) {
        stringId = id.toString();
      } else {
        stringId = String(id);
      }
      return {
        ...wb,
        stringId: stringId,
      };
    });
  }

  // Computed property to group ladder entries by water body
  get laddersByWaterBody() {
    this.ladderUpdateCounter;

    const ladders = {};
    if (this.model?.waterBodyLadders) {
      // Group ladder entries by water body
      this.model.waterBodyLadders.forEach((entry) => {
        // Handle different ObjectID serialization formats
        let waterBodyId;
        if (typeof entry.waterBodyId === 'string') {
          waterBodyId = entry.waterBodyId;
        } else if (entry.waterBodyId && entry.waterBodyId.$oid) {
          waterBodyId = entry.waterBodyId.$oid;
        } else if (entry.waterBodyId && entry.waterBodyId._id) {
          waterBodyId = entry.waterBodyId._id;
        } else if (entry.waterBodyId && entry.waterBodyId.toString) {
          waterBodyId = entry.waterBodyId.toString();
        } else {
          waterBodyId = String(entry.waterBodyId);
        }

        if (!ladders[waterBodyId]) {
          ladders[waterBodyId] = {
            waterBodyId: waterBodyId,
            entries: [],
          };
        }
        // Normalize field names: ensure 'factor' field exists (for backward compatibility with 'value')
        const normalizedEntry = {
          ...entry,
          factor: entry.factor ?? entry.value,
        };
        ladders[waterBodyId].entries.push(normalizedEntry);
      });

      // Sort entries by frontage for each water body
      Object.keys(ladders).forEach((waterBodyId) => {
        ladders[waterBodyId].entries.sort((a, b) => a.frontage - b.frontage);
      });
    }
    return ladders;
  }

  // Computed property to group waterfront attributes by type
  get attributesByType() {
    this.attributeUpdateCounter;

    const attributes = {};
    if (this.model?.waterfrontAttributes) {
      this.model.waterfrontAttributes.forEach((attribute) => {
        if (!attributes[attribute.attributeType]) {
          attributes[attribute.attributeType] = [];
        }
        attributes[attribute.attributeType].push(attribute);
      });
    }
    return attributes;
  }

  // === WATER BODY ACTIONS ===

  @action
  openNewWaterBodyModal() {
    this.editingWaterBody = null;
    this.isWaterBodyModalOpen = true;
  }

  @action
  openEditWaterBodyModal(waterBody) {
    this.editingWaterBody = waterBody;
    this.isWaterBodyModalOpen = true;
  }

  @action
  closeWaterBodyModal() {
    this.isWaterBodyModalOpen = false;
    this.editingWaterBody = null;
  }

  @action
  async saveWaterBody(waterBodyData) {
    try {
      const municipalityId = this.model.municipality.id;

      let savedWaterBody;
      if (waterBodyData.id) {
        // Update existing water body
        const response = await this.api.put(
          `/municipalities/${municipalityId}/water-bodies/${waterBodyData.id}`,
          waterBodyData,
        );
        savedWaterBody = response.waterBody;

        const waterBodyIndex = this.model.waterBodies.findIndex(
          (wb) => (wb.id || wb._id) === waterBodyData.id,
        );
        if (waterBodyIndex !== -1) {
          this.model.waterBodies[waterBodyIndex] = savedWaterBody;
        }
      } else {
        // Create new water body
        const response = await this.api.post(
          `/municipalities/${municipalityId}/water-bodies`,
          waterBodyData,
        );
        savedWaterBody = response.waterBody;
        this.model.waterBodies.push(savedWaterBody);
      }

      // Force reactivity update
      this.model.waterBodies = [...this.model.waterBodies];
      this.model = { ...this.model };
      this.waterBodyUpdateCounter++;

      this.closeWaterBodyModal();
    } catch (error) {
      console.error('Error saving water body:', error);
      alert('Error saving water body. Please try again.');
    }
  }

  @action
  async deleteWaterBody(waterBodyId) {
    if (
      confirm(
        'Are you sure you want to delete this water body? This will also delete all associated ladder entries.',
      )
    ) {
      try {
        const municipalityId = this.model.municipality.id;
        await this.api.delete(
          `/municipalities/${municipalityId}/water-bodies/${waterBodyId}`,
        );

        // Remove from local model
        const waterBodyIndex = this.model.waterBodies.findIndex(
          (wb) => (wb.id || wb._id) === waterBodyId,
        );
        if (waterBodyIndex !== -1) {
          this.model.waterBodies.splice(waterBodyIndex, 1);
        }

        // Remove associated ladder entries
        this.model.waterBodyLadders = this.model.waterBodyLadders.filter(
          (entry) => entry.waterBodyId !== waterBodyId,
        );

        // Force reactivity update
        this.model = { ...this.model };
        this.waterBodyUpdateCounter++;
        this.ladderUpdateCounter++;
      } catch (error) {
        console.error('Error deleting water body:', error);
        alert('Error deleting water body. Please try again.');
      }
    }
  }

  // === LADDER ACTIONS ===

  @action
  openWaterBodyLadderModal(waterBody) {
    this.editingLadderWaterBody = waterBody;
    const waterBodyId = waterBody.id || waterBody._id;
    const ladder = this.laddersByWaterBody[waterBodyId];
    this.editingWaterBodyLadder = ladder || {
      waterBodyId: waterBodyId,
      entries: [],
    };
    this.isWaterBodyLadderModalOpen = true;
  }

  @action
  closeWaterBodyLadderModal() {
    this.isWaterBodyLadderModalOpen = false;
    this.editingWaterBodyLadder = null;
    this.editingLadderWaterBody = null;
  }

  @action
  async saveWaterBodyLadder(ladderData) {
    try {
      const municipalityId = this.model.municipality.id;
      const waterBodyId =
        this.editingLadderWaterBody.id || this.editingLadderWaterBody._id;

      // Save all ladder entries
      const response = await this.api.put(
        `/municipalities/${municipalityId}/water-bodies/${waterBodyId}/ladder/bulk`,
        {
          entries: ladderData.entries,
        },
      );

      const updatedEntries = response.ladderEntries;

      // Update local model - remove old entries for this water body and add new ones
      this.model.waterBodyLadders = this.model.waterBodyLadders.filter(
        (entry) => entry.waterBodyId !== waterBodyId,
      );
      this.model.waterBodyLadders.push(...updatedEntries);

      // Force reactivity update
      this.model.waterBodyLadders = [...this.model.waterBodyLadders];
      this.model = { ...this.model };
      this.ladderUpdateCounter++;

      this.closeWaterBodyLadderModal();
    } catch (error) {
      console.error('Error saving water body ladder:', error);
      throw error; // Re-throw so modal can handle it
    }
  }

  @action
  openNewLadderEntryModal(waterBody) {
    this.editingEntryWaterBody = waterBody;
    this.editingLadderEntry = null;
    this.isLadderEntryModalOpen = true;
  }

  @action
  openLadderEntryModal(waterBody, entry) {
    this.editingEntryWaterBody = waterBody;
    this.editingLadderEntry = entry;
    this.isLadderEntryModalOpen = true;
  }

  @action
  closeLadderEntryModal() {
    this.isLadderEntryModalOpen = false;
    this.editingLadderEntry = null;
    this.editingEntryWaterBody = null;
  }

  @action
  async saveLadderEntry(entryData) {
    try {
      const municipalityId = this.model.municipality.id;
      const waterBodyId =
        this.editingEntryWaterBody.id ||
        this.editingEntryWaterBody._id ||
        this.editingEntryWaterBody.stringId;

      let savedEntry;
      if (entryData.id) {
        // Update existing entry
        const response = await this.api.put(
          `/municipalities/${municipalityId}/water-bodies/${waterBodyId}/ladder/${entryData.id}`,
          entryData,
        );
        savedEntry = response.ladderEntry;

        // Find and update the entry (check both id and _id)
        const entryIndex = this.model.waterBodyLadders.findIndex(
          (entry) => (entry.id || entry._id) === entryData.id,
        );
        if (entryIndex !== -1) {
          this.model.waterBodyLadders[entryIndex] = savedEntry;
        }
      } else {
        // Create new entry
        const response = await this.api.post(
          `/municipalities/${municipalityId}/water-bodies/${waterBodyId}/ladder`,
          entryData,
        );
        savedEntry = response.ladderEntry;
        this.model.waterBodyLadders.push(savedEntry);
      }

      // Force reactivity update
      this.model.waterBodyLadders = [...this.model.waterBodyLadders];
      this.model = { ...this.model };
      this.ladderUpdateCounter++;

      this.closeLadderEntryModal();
    } catch (error) {
      console.error('Error saving ladder entry:', error);
      alert('Error saving ladder entry. Please try again.');
    }
  }

  @action
  async deleteLadderEntry(waterBody, entry) {
    if (confirm('Are you sure you want to delete this ladder entry?')) {
      try {
        const municipalityId = this.model.municipality.id;
        // Handle different ID field names
        const waterBodyId = waterBody.id || waterBody._id || waterBody.stringId;
        const entryId = entry.id || entry._id;

        await this.api.delete(
          `/municipalities/${municipalityId}/water-bodies/${waterBodyId}/ladder/${entryId}`,
        );

        // Remove from local model
        const entryIndex = this.model.waterBodyLadders.findIndex(
          (e) => (e.id || e._id) === entryId,
        );
        if (entryIndex !== -1) {
          this.model.waterBodyLadders.splice(entryIndex, 1);
        }

        // Force reactivity update
        this.model = { ...this.model };
        this.ladderUpdateCounter++;
      } catch (error) {
        console.error('Error deleting ladder entry:', error);
        alert('Error deleting ladder entry. Please try again.');
      }
    }
  }

  // === WATERFRONT ATTRIBUTE ACTIONS ===

  @action
  openNewAttributeModal(attributeType) {
    const typeInfo = this.waterfrontAttributeTypes.find(
      (type) => type.key === attributeType,
    );
    this.editingWaterfrontAttribute = null;
    this.editingAttributeType = attributeType;
    this.editingAttributeTypeName = typeInfo?.title;
    this.editingAttributeTypeIcon = typeInfo?.icon;
    this.isWaterfrontAttributeModalOpen = true;
  }

  @action
  openEditAttributeModal(attributeType, attribute) {
    const typeInfo = this.waterfrontAttributeTypes.find(
      (type) => type.key === attributeType,
    );
    this.editingWaterfrontAttribute = attribute;
    this.editingAttributeType = attributeType;
    this.editingAttributeTypeName = typeInfo?.title;
    this.editingAttributeTypeIcon = typeInfo?.icon;
    this.isWaterfrontAttributeModalOpen = true;
  }

  @action
  closeWaterfrontAttributeModal() {
    this.isWaterfrontAttributeModalOpen = false;
    this.editingWaterfrontAttribute = null;
    this.editingAttributeType = null;
    this.editingAttributeTypeName = null;
    this.editingAttributeTypeIcon = null;
  }

  @action
  async saveWaterfrontAttributeModal(attributeData) {
    try {
      const municipalityId = this.model.municipality.id;
      console.log('Municipality ID:', municipalityId);
      console.log('Attribute data received in controller:', attributeData);

      let savedAttribute;
      if (attributeData.id) {
        // Update existing attribute
        const url = `/municipalities/${municipalityId}/waterfront-attributes/${attributeData.id}`;
        console.log('PUT URL:', url);
        const response = await this.api.put(url, attributeData);
        savedAttribute = response.waterfrontAttribute;

        // Find and update the attribute (check both id and _id)
        const attributeIndex = this.model.waterfrontAttributes.findIndex(
          (attr) => (attr.id || attr._id) === attributeData.id,
        );
        if (attributeIndex !== -1) {
          this.model.waterfrontAttributes[attributeIndex] = savedAttribute;
        }
      } else {
        // Create new attribute
        const url = `/municipalities/${municipalityId}/waterfront-attributes`;
        console.log('POST URL:', url);
        const response = await this.api.post(url, attributeData);
        savedAttribute = response.waterfrontAttribute;
        this.model.waterfrontAttributes.push(savedAttribute);
      }

      // Force reactivity update
      this.model.waterfrontAttributes = [...this.model.waterfrontAttributes];
      this.model = { ...this.model };
      this.attributeUpdateCounter++;

      this.closeWaterfrontAttributeModal();
    } catch (error) {
      console.error('Error saving waterfront attribute:', error);
      throw error; // Re-throw so modal can handle it
    }
  }

  @action
  async deleteAttribute(attribute) {
    if (confirm(`Are you sure you want to delete "${attribute.name}"?`)) {
      try {
        const municipalityId = this.model.municipality.id;
        const attributeId = attribute.id || attribute._id;

        await this.api.delete(
          `/municipalities/${municipalityId}/waterfront-attributes/${attributeId}`,
        );

        // Remove from local model (check both id and _id)
        const attributeIndex = this.model.waterfrontAttributes.findIndex(
          (attr) => (attr.id || attr._id) === attributeId,
        );
        if (attributeIndex !== -1) {
          this.model.waterfrontAttributes.splice(attributeIndex, 1);
        }

        // Force reactivity update
        this.model = { ...this.model };
        this.attributeUpdateCounter++;
      } catch (error) {
        console.error('Error deleting waterfront attribute:', error);
        alert('Error deleting attribute. Please try again.');
      }
    }
  }

  @action
  async createAttributeDefaults() {
    try {
      const municipalityId = this.model.municipality.id;
      const response = await this.api.post(
        `/municipalities/${municipalityId}/waterfront-attributes/defaults`,
        {},
      );
      const defaultAttributes = response.waterfrontAttributes;

      // Update local model with defaults
      this.model.waterfrontAttributes = defaultAttributes;
      this.model = { ...this.model };
      this.attributeUpdateCounter++;
    } catch (error) {
      console.error('Error creating default waterfront attributes:', error);
      alert('Error creating default waterfront attributes. Please try again.');
    }
  }

  @action
  async createWaterBodyDefaults() {
    try {
      const municipalityId = this.model.municipality.id;
      const response = await this.api.post(
        `/municipalities/${municipalityId}/water-bodies/defaults`,
        {},
      );
      const defaultWaterBodies = response.waterBodies;

      // Update local model with defaults
      this.model.waterBodies = defaultWaterBodies;
      this.model = { ...this.model };
      this.waterBodyUpdateCounter++;
    } catch (error) {
      console.error('Error creating default water bodies:', error);
      alert('Error creating default water bodies. Please try again.');
    }
  }
}
