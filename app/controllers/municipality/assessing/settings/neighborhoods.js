import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';

export default class NeighborhoodsController extends Controller {
  @service api;

  // Neighborhood code tracking
  @tracked isAddingNeighborhood = false;
  @tracked isEditingNeighborhood = false;
  @tracked editingNeighborhoodCode = null;
  @tracked newNeighborhoodDescription = '';
  @tracked newNeighborhoodCode = '';
  @tracked newNeighborhoodRate = '';

  // Land use details tracking
  @tracked isAddingLandUse = false;
  @tracked isEditingLandUse = false;
  @tracked editingLandUseDetail = null;
  @tracked newLandUseCode = '';
  @tracked newLandUseDisplayText = '';
  @tracked newLandUseType = '';

  // Attribute form tracking
  @tracked isAddingSite = false;
  @tracked isEditingSite = false;
  @tracked editingSiteAttribute = null;
  @tracked isAddingDriveway = false;
  @tracked isEditingDriveway = false;
  @tracked editingDrivewayAttribute = null;
  @tracked isAddingRoad = false;
  @tracked isEditingRoad = false;
  @tracked editingRoadAttribute = null;
  @tracked isAddingTopology = false;
  @tracked isEditingTopology = false;
  @tracked editingTopologyAttribute = null;

  // Site attribute form
  @tracked newSiteDescription = '';
  @tracked newSiteDisplayText = '';
  @tracked newSiteRate = '';

  // Driveway attribute form
  @tracked newDrivewayDescription = '';
  @tracked newDrivewayDisplayText = '';
  @tracked newDrivewayRate = '';

  // Road attribute form
  @tracked newRoadDescription = '';
  @tracked newRoadDisplayText = '';
  @tracked newRoadRate = '';

  // Topology attribute form
  @tracked newTopologyDescription = '';
  @tracked newTopologyDisplayText = '';
  @tracked newTopologyRate = '';

  // Update counters for reactivity
  @tracked neighborhoodUpdateCounter = 0;
  @tracked landUseUpdateCounter = 0;
  @tracked attributeUpdateCounter = 0;

  // Computed properties for reactive data
  get reactiveNeighborhoodCodes() {
    this.neighborhoodUpdateCounter;
    return this.model?.neighborhoodCodes || [];
  }

  get reactiveLandUseDetails() {
    this.landUseUpdateCounter;
    return this.model?.landUseDetails || [];
  }

  get reactiveSiteAttributes() {
    this.attributeUpdateCounter;
    return this.model?.siteAttributes || [];
  }

  get reactiveDrivewayAttributes() {
    this.attributeUpdateCounter;
    return this.model?.drivewayAttributes || [];
  }

  get reactiveRoadAttributes() {
    this.attributeUpdateCounter;
    return this.model?.roadAttributes || [];
  }

  get reactiveTopologyAttributes() {
    this.attributeUpdateCounter;
    return this.model?.topologyAttributes || [];
  }

  // Neighborhood code actions
  @action
  startAddingNeighborhood() {
    this.isAddingNeighborhood = true;
    this.newNeighborhoodDescription = '';
    this.newNeighborhoodCode = '';
    this.newNeighborhoodRate = '';
  }

  @action
  cancelAddingNeighborhood() {
    this.isAddingNeighborhood = false;
    this.newNeighborhoodDescription = '';
    this.newNeighborhoodCode = '';
    this.newNeighborhoodRate = '';
  }

  @action
  startEditingNeighborhood(neighborhoodCode) {
    this.isEditingNeighborhood = true;
    this.isAddingNeighborhood = false;
    this.editingNeighborhoodCode = neighborhoodCode;
    this.newNeighborhoodDescription = neighborhoodCode.description;
    this.newNeighborhoodCode = neighborhoodCode.code;
    this.newNeighborhoodRate = neighborhoodCode.rate.toString();
  }

  @action
  cancelEditingNeighborhood() {
    this.isEditingNeighborhood = false;
    this.editingNeighborhoodCode = null;
    this.newNeighborhoodDescription = '';
    this.newNeighborhoodCode = '';
    this.newNeighborhoodRate = '';
  }

  @action
  updateNeighborhoodDescription(event) {
    this.newNeighborhoodDescription = event.target.value;
  }

  @action
  updateNeighborhoodCode(event) {
    // Limit to 2 characters and uppercase
    const value = event.target.value.toUpperCase().slice(0, 2);
    this.newNeighborhoodCode = value;
    event.target.value = value;
  }

  @action
  updateNeighborhoodRate(event) {
    const value = parseInt(event.target.value, 10);
    this.newNeighborhoodRate = isNaN(value)
      ? ''
      : Math.min(1000, Math.max(0, value));
  }

  @action
  async saveNeighborhoodCode() {
    try {
      const municipalityId = this.model.municipality.id;
      const codeData = {
        description: this.newNeighborhoodDescription.trim(),
        code: this.newNeighborhoodCode.trim(),
        rate: parseInt(this.newNeighborhoodRate, 10),
      };

      // Validate
      if (
        !codeData.description ||
        !codeData.code ||
        codeData.code.length < 1 ||
        codeData.code.length > 2
      ) {
        alert('Please fill in all fields. Code must be 1-2 characters.');
        return;
      }

      let savedCode;
      if (this.isEditingNeighborhood && this.editingNeighborhoodCode) {
        // Update existing neighborhood code
        const response = await this.api.put(
          `/municipalities/${municipalityId}/neighborhood-codes/${this.editingNeighborhoodCode._id || this.editingNeighborhoodCode.id}`,
          codeData,
        );
        savedCode = response.neighborhoodCode;

        // Update in local model
        const codeIndex = this.model.neighborhoodCodes.findIndex(
          (c) =>
            (c._id || c.id) ===
            (this.editingNeighborhoodCode._id ||
              this.editingNeighborhoodCode.id),
        );
        if (codeIndex !== -1) {
          this.model.neighborhoodCodes[codeIndex] = savedCode;
          this.model.neighborhoodCodes = [...this.model.neighborhoodCodes];
        }
      } else {
        // Create new neighborhood code
        const response = await this.api.post(
          `/municipalities/${municipalityId}/neighborhood-codes`,
          codeData,
        );
        savedCode = response.neighborhoodCode;

        // Add to local model
        if (!this.model.neighborhoodCodes) {
          this.model.neighborhoodCodes = [];
        }
        this.model.neighborhoodCodes.push(savedCode);
        this.model.neighborhoodCodes = [...this.model.neighborhoodCodes];
      }

      this.model = { ...this.model };

      // Force reactivity
      this.neighborhoodUpdateCounter++;

      if (this.isEditingNeighborhood) {
        this.cancelEditingNeighborhood();
      } else {
        this.cancelAddingNeighborhood();
      }
    } catch (error) {
      console.error('Error saving neighborhood code:', error);
      alert('Error saving neighborhood code. Please try again.');
    }
  }

  // Land use details actions
  @action
  startAddingLandUse() {
    this.isAddingLandUse = true;
    this.isEditingLandUse = false;
    this.editingLandUseDetail = null;
    this.newLandUseCode = '';
    this.newLandUseDisplayText = '';
    this.newLandUseType = '';
  }

  @action
  cancelAddingLandUse() {
    this.isAddingLandUse = false;
    this.newLandUseCode = '';
    this.newLandUseDisplayText = '';
    this.newLandUseType = '';
  }

  @action
  startEditingLandUse(landUseDetail) {
    this.isEditingLandUse = true;
    this.isAddingLandUse = false;
    this.editingLandUseDetail = landUseDetail;
    this.newLandUseCode = landUseDetail.code;
    this.newLandUseDisplayText = landUseDetail.displayText;
    this.newLandUseType = landUseDetail.landUseType;
  }

  @action
  cancelEditingLandUse() {
    this.isEditingLandUse = false;
    this.editingLandUseDetail = null;
    this.newLandUseCode = '';
    this.newLandUseDisplayText = '';
    this.newLandUseType = '';
  }

  @action
  updateLandUseCode(event) {
    this.newLandUseCode = event.target.value;
  }

  @action
  updateLandUseDisplayText(event) {
    this.newLandUseDisplayText = event.target.value;
  }

  @action
  updateLandUseType(event) {
    this.newLandUseType = event.target.value;
  }

  @action
  async saveLandUseDetail() {
    if (
      !this.newLandUseCode.trim() ||
      !this.newLandUseDisplayText.trim() ||
      !this.newLandUseType
    ) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      const municipalityId = this.model.municipality.id;
      const detailData = {
        code: this.newLandUseCode.toUpperCase().trim(),
        displayText: this.newLandUseDisplayText.trim(),
        landUseType: this.newLandUseType,
      };

      let savedDetail;
      if (this.isEditingLandUse) {
        // Update existing land use detail
        const response = await this.api.put(
          `/municipalities/${municipalityId}/land-use-details/${this.editingLandUseDetail._id || this.editingLandUseDetail.id}`,
          detailData,
        );
        savedDetail = response.landUseDetail;

        // Update in local model
        const detailIndex = this.model.landUseDetails.findIndex(
          (d) =>
            (d._id || d.id) ===
            (this.editingLandUseDetail._id || this.editingLandUseDetail.id),
        );
        if (detailIndex !== -1) {
          this.model.landUseDetails[detailIndex] = savedDetail;
          this.model.landUseDetails = [...this.model.landUseDetails];
        }
      } else {
        // Create new land use detail
        const response = await this.api.post(
          `/municipalities/${municipalityId}/land-use-details`,
          detailData,
        );
        savedDetail = response.landUseDetail;

        // Add to local model
        if (!this.model.landUseDetails) {
          this.model.landUseDetails = [];
        }
        this.model.landUseDetails.push(savedDetail);
        this.model.landUseDetails = [...this.model.landUseDetails];
      }

      this.model = { ...this.model };

      // Force reactivity
      this.landUseUpdateCounter++;

      if (this.isEditingLandUse) {
        this.cancelEditingLandUse();
      } else {
        this.cancelAddingLandUse();
      }
    } catch (error) {
      console.error('Error saving land use detail:', error);
      alert('Error saving land use detail. Please try again.');
    }
  }

  @action
  async deleteLandUseDetail(landUseDetail) {
    if (confirm('Are you sure you want to delete this land use detail?')) {
      try {
        const municipalityId = this.model.municipality.id;
        await this.api.delete(
          `/municipalities/${municipalityId}/land-use-details/${landUseDetail._id || landUseDetail.id}`,
        );

        // Remove from local model
        const detailIndex = this.model.landUseDetails.findIndex(
          (d) => (d._id || d.id) === (landUseDetail._id || landUseDetail.id),
        );
        if (detailIndex !== -1) {
          this.model.landUseDetails.splice(detailIndex, 1);
          this.model.landUseDetails = [...this.model.landUseDetails];
          this.model = { ...this.model };

          // Force reactivity
          this.landUseUpdateCounter++;
        }
      } catch (error) {
        console.error('Error deleting land use detail:', error);
        alert('Error deleting land use detail. Please try again.');
      }
    }
  }

  // Site attribute actions
  @action
  startAddingSite() {
    this.isAddingSite = true;
    this.newSiteDescription = '';
    this.newSiteDisplayText = '';
    this.newSiteRate = '';
  }

  @action
  cancelAddingSite() {
    this.isAddingSite = false;
    this.newSiteDescription = '';
    this.newSiteDisplayText = '';
    this.newSiteRate = '';
  }

  @action
  startEditingSite(siteAttribute) {
    this.isEditingSite = true;
    this.isAddingSite = false;
    this.editingSiteAttribute = siteAttribute;
    this.newSiteDescription = siteAttribute.description;
    this.newSiteDisplayText = siteAttribute.displayText;
    this.newSiteRate = siteAttribute.rate.toString();
  }

  @action
  cancelEditingSite() {
    this.isEditingSite = false;
    this.editingSiteAttribute = null;
    this.newSiteDescription = '';
    this.newSiteDisplayText = '';
    this.newSiteRate = '';
  }

  @action
  updateSiteDescription(event) {
    this.newSiteDescription = event.target.value;
  }

  @action
  updateSiteDisplayText(event) {
    // Limit to 10 characters
    const value = event.target.value.slice(0, 10);
    this.newSiteDisplayText = value;
    event.target.value = value;
  }

  @action
  updateSiteRate(event) {
    this.newSiteRate = event.target.value;
  }

  @action
  async saveSiteAttribute() {
    try {
      const municipalityId = this.model.municipality.id;
      const attributeData = {
        description: this.newSiteDescription.trim(),
        displayText: this.newSiteDisplayText.trim(),
        rate: parseFloat(this.newSiteRate),
      };

      // Validate
      if (!attributeData.description || !attributeData.displayText) {
        alert('Please fill in all fields.');
        return;
      }

      let savedAttribute;
      if (this.isEditingSite && this.editingSiteAttribute) {
        // Update existing site attribute
        const response = await this.api.put(
          `/municipalities/${municipalityId}/site-attributes/${this.editingSiteAttribute._id || this.editingSiteAttribute.id}`,
          attributeData,
        );
        savedAttribute = response.siteAttribute;

        // Update in local model
        const attrIndex = this.model.siteAttributes.findIndex(
          (a) =>
            (a._id || a.id) ===
            (this.editingSiteAttribute._id || this.editingSiteAttribute.id),
        );
        if (attrIndex !== -1) {
          this.model.siteAttributes[attrIndex] = savedAttribute;
          this.model.siteAttributes = [...this.model.siteAttributes];
        }
      } else {
        // Create new site attribute
        const response = await this.api.post(
          `/municipalities/${municipalityId}/site-attributes`,
          attributeData,
        );
        savedAttribute = response.siteAttribute;

        // Add to local model
        if (!this.model.siteAttributes) {
          this.model.siteAttributes = [];
        }
        this.model.siteAttributes.push(savedAttribute);
        this.model.siteAttributes = [...this.model.siteAttributes];
      }

      this.model = { ...this.model };

      // Force reactivity
      this.attributeUpdateCounter++;

      if (this.isEditingSite) {
        this.cancelEditingSite();
      } else {
        this.cancelAddingSite();
      }
    } catch (error) {
      console.error('Error saving site attribute:', error);
      alert('Error saving site attribute. Please try again.');
    }
  }

  // Driveway attribute actions (similar pattern)
  @action
  startAddingDriveway() {
    this.isAddingDriveway = true;
    this.newDrivewayDescription = '';
    this.newDrivewayDisplayText = '';
    this.newDrivewayRate = '';
  }

  @action
  cancelAddingDriveway() {
    this.isAddingDriveway = false;
    this.newDrivewayDescription = '';
    this.newDrivewayDisplayText = '';
    this.newDrivewayRate = '';
  }

  @action
  startEditingDriveway(drivewayAttribute) {
    this.isEditingDriveway = true;
    this.isAddingDriveway = false;
    this.editingDrivewayAttribute = drivewayAttribute;
    this.newDrivewayDescription = drivewayAttribute.description;
    this.newDrivewayDisplayText = drivewayAttribute.displayText;
    this.newDrivewayRate = drivewayAttribute.rate.toString();
  }

  @action
  cancelEditingDriveway() {
    this.isEditingDriveway = false;
    this.editingDrivewayAttribute = null;
    this.newDrivewayDescription = '';
    this.newDrivewayDisplayText = '';
    this.newDrivewayRate = '';
  }

  @action
  updateDrivewayDescription(event) {
    this.newDrivewayDescription = event.target.value;
  }

  @action
  updateDrivewayDisplayText(event) {
    const value = event.target.value.slice(0, 10);
    this.newDrivewayDisplayText = value;
    event.target.value = value;
  }

  @action
  updateDrivewayRate(event) {
    this.newDrivewayRate = event.target.value;
  }

  @action
  async saveDrivewayAttribute() {
    try {
      const municipalityId = this.model.municipality.id;
      const attributeData = {
        description: this.newDrivewayDescription.trim(),
        displayText: this.newDrivewayDisplayText.trim(),
        rate: parseFloat(this.newDrivewayRate),
      };

      if (!attributeData.description || !attributeData.displayText) {
        alert('Please fill in all fields.');
        return;
      }

      let savedAttribute;
      if (this.isEditingDriveway && this.editingDrivewayAttribute) {
        // Update existing driveway attribute
        const response = await this.api.put(
          `/municipalities/${municipalityId}/driveway-attributes/${this.editingDrivewayAttribute._id || this.editingDrivewayAttribute.id}`,
          attributeData,
        );
        savedAttribute = response.drivewayAttribute;

        // Update in local model
        const attrIndex = this.model.drivewayAttributes.findIndex(
          (a) =>
            (a._id || a.id) ===
            (this.editingDrivewayAttribute._id ||
              this.editingDrivewayAttribute.id),
        );
        if (attrIndex !== -1) {
          this.model.drivewayAttributes[attrIndex] = savedAttribute;
          this.model.drivewayAttributes = [...this.model.drivewayAttributes];
        }
      } else {
        // Create new driveway attribute
        const response = await this.api.post(
          `/municipalities/${municipalityId}/driveway-attributes`,
          attributeData,
        );
        savedAttribute = response.drivewayAttribute;

        // Add to local model
        if (!this.model.drivewayAttributes) {
          this.model.drivewayAttributes = [];
        }
        this.model.drivewayAttributes.push(savedAttribute);
        this.model.drivewayAttributes = [...this.model.drivewayAttributes];
      }

      this.model = { ...this.model };
      this.attributeUpdateCounter++;

      if (this.isEditingDriveway) {
        this.cancelEditingDriveway();
      } else {
        this.cancelAddingDriveway();
      }
    } catch (error) {
      console.error('Error saving driveway attribute:', error);
      alert('Error saving driveway attribute. Please try again.');
    }
  }

  // Road attribute actions (similar pattern)
  @action
  startAddingRoad() {
    this.isAddingRoad = true;
    this.newRoadDescription = '';
    this.newRoadDisplayText = '';
    this.newRoadRate = '';
  }

  @action
  cancelAddingRoad() {
    this.isAddingRoad = false;
    this.newRoadDescription = '';
    this.newRoadDisplayText = '';
    this.newRoadRate = '';
  }

  @action
  updateRoadDescription(event) {
    this.newRoadDescription = event.target.value;
  }

  @action
  updateRoadDisplayText(event) {
    const value = event.target.value.slice(0, 10);
    this.newRoadDisplayText = value;
    event.target.value = value;
  }

  @action
  updateRoadRate(event) {
    this.newRoadRate = event.target.value;
  }

  @action
  startEditingRoad(roadAttribute) {
    this.isEditingRoad = true;
    this.isAddingRoad = false;
    this.editingRoadAttribute = roadAttribute;
    this.newRoadDescription = roadAttribute.description;
    this.newRoadDisplayText = roadAttribute.displayText;
    this.newRoadRate = roadAttribute.rate.toString();
  }

  @action
  cancelEditingRoad() {
    this.isEditingRoad = false;
    this.editingRoadAttribute = null;
    this.newRoadDescription = '';
    this.newRoadDisplayText = '';
    this.newRoadRate = '';
  }

  @action
  async saveRoadAttribute() {
    try {
      const municipalityId = this.model.municipality.id;
      const attributeData = {
        description: this.newRoadDescription.trim(),
        displayText: this.newRoadDisplayText.trim(),
        rate: parseFloat(this.newRoadRate),
      };

      if (!attributeData.description || !attributeData.displayText) {
        alert('Please fill in all fields.');
        return;
      }

      let savedAttribute;
      if (this.isEditingRoad && this.editingRoadAttribute) {
        // Update existing road attribute
        const response = await this.api.put(
          `/municipalities/${municipalityId}/road-attributes/${this.editingRoadAttribute._id || this.editingRoadAttribute.id}`,
          attributeData,
        );
        savedAttribute = response.roadAttribute;

        // Update in local model
        const attrIndex = this.model.roadAttributes.findIndex(
          (a) =>
            (a._id || a.id) ===
            (this.editingRoadAttribute._id || this.editingRoadAttribute.id),
        );
        if (attrIndex !== -1) {
          this.model.roadAttributes[attrIndex] = savedAttribute;
          this.model.roadAttributes = [...this.model.roadAttributes];
        }
      } else {
        // Create new road attribute
        const response = await this.api.post(
          `/municipalities/${municipalityId}/road-attributes`,
          attributeData,
        );
        savedAttribute = response.roadAttribute;

        // Add to local model
        if (!this.model.roadAttributes) {
          this.model.roadAttributes = [];
        }
        this.model.roadAttributes.push(savedAttribute);
        this.model.roadAttributes = [...this.model.roadAttributes];
      }

      this.model = { ...this.model };
      this.attributeUpdateCounter++;

      if (this.isEditingRoad) {
        this.cancelEditingRoad();
      } else {
        this.cancelAddingRoad();
      }
    } catch (error) {
      console.error('Error saving road attribute:', error);
      alert('Error saving road attribute. Please try again.');
    }
  }

  // Topology attribute actions (similar pattern)
  @action
  startAddingTopology() {
    this.isAddingTopology = true;
    this.newTopologyDescription = '';
    this.newTopologyDisplayText = '';
    this.newTopologyRate = '';
  }

  @action
  cancelAddingTopology() {
    this.isAddingTopology = false;
    this.newTopologyDescription = '';
    this.newTopologyDisplayText = '';
    this.newTopologyRate = '';
  }

  @action
  updateTopologyDescription(event) {
    this.newTopologyDescription = event.target.value;
  }

  @action
  updateTopologyDisplayText(event) {
    const value = event.target.value.slice(0, 10);
    this.newTopologyDisplayText = value;
    event.target.value = value;
  }

  @action
  updateTopologyRate(event) {
    this.newTopologyRate = event.target.value;
  }

  @action
  startEditingTopology(topologyAttribute) {
    this.isEditingTopology = true;
    this.isAddingTopology = false;
    this.editingTopologyAttribute = topologyAttribute;
    this.newTopologyDescription = topologyAttribute.description;
    this.newTopologyDisplayText = topologyAttribute.displayText;
    this.newTopologyRate = topologyAttribute.rate.toString();
  }

  @action
  cancelEditingTopology() {
    this.isEditingTopology = false;
    this.editingTopologyAttribute = null;
    this.newTopologyDescription = '';
    this.newTopologyDisplayText = '';
    this.newTopologyRate = '';
  }

  @action
  async saveTopologyAttribute() {
    try {
      const municipalityId = this.model.municipality.id;
      const attributeData = {
        description: this.newTopologyDescription.trim(),
        displayText: this.newTopologyDisplayText.trim(),
        rate: parseFloat(this.newTopologyRate),
      };

      if (!attributeData.description || !attributeData.displayText) {
        alert('Please fill in all fields.');
        return;
      }

      let savedAttribute;
      if (this.isEditingTopology && this.editingTopologyAttribute) {
        // Update existing topology attribute
        const response = await this.api.put(
          `/municipalities/${municipalityId}/topology-attributes/${this.editingTopologyAttribute._id || this.editingTopologyAttribute.id}`,
          attributeData,
        );
        savedAttribute = response.topologyAttribute;

        // Update in local model
        const attrIndex = this.model.topologyAttributes.findIndex(
          (a) =>
            (a._id || a.id) ===
            (this.editingTopologyAttribute._id ||
              this.editingTopologyAttribute.id),
        );
        if (attrIndex !== -1) {
          this.model.topologyAttributes[attrIndex] = savedAttribute;
          this.model.topologyAttributes = [...this.model.topologyAttributes];
        }
      } else {
        // Create new topology attribute
        const response = await this.api.post(
          `/municipalities/${municipalityId}/topology-attributes`,
          attributeData,
        );
        savedAttribute = response.topologyAttribute;

        // Add to local model
        if (!this.model.topologyAttributes) {
          this.model.topologyAttributes = [];
        }
        this.model.topologyAttributes.push(savedAttribute);
        this.model.topologyAttributes = [...this.model.topologyAttributes];
      }

      this.model = { ...this.model };
      this.attributeUpdateCounter++;

      if (this.isEditingTopology) {
        this.cancelEditingTopology();
      } else {
        this.cancelAddingTopology();
      }
    } catch (error) {
      console.error('Error saving topology attribute:', error);
      alert('Error saving topology attribute. Please try again.');
    }
  }

  // Delete functions for all attribute types
  @action
  async deleteSiteAttribute(siteAttribute) {
    if (confirm('Are you sure you want to delete this site attribute?')) {
      try {
        const municipalityId = this.model.municipality.id;
        await this.api.delete(
          `/municipalities/${municipalityId}/site-attributes/${siteAttribute._id || siteAttribute.id}`,
        );

        // Remove from local model
        const attrIndex = this.model.siteAttributes.findIndex(
          (a) => (a._id || a.id) === (siteAttribute._id || siteAttribute.id),
        );
        if (attrIndex !== -1) {
          this.model.siteAttributes.splice(attrIndex, 1);
          this.model.siteAttributes = [...this.model.siteAttributes];
          this.model = { ...this.model };
          this.attributeUpdateCounter++;
        }
      } catch (error) {
        console.error('Error deleting site attribute:', error);
        alert('Error deleting site attribute. Please try again.');
      }
    }
  }

  @action
  async deleteDrivewayAttribute(drivewayAttribute) {
    if (confirm('Are you sure you want to delete this driveway attribute?')) {
      try {
        const municipalityId = this.model.municipality.id;
        await this.api.delete(
          `/municipalities/${municipalityId}/driveway-attributes/${drivewayAttribute._id || drivewayAttribute.id}`,
        );

        // Remove from local model
        const attrIndex = this.model.drivewayAttributes.findIndex(
          (a) =>
            (a._id || a.id) === (drivewayAttribute._id || drivewayAttribute.id),
        );
        if (attrIndex !== -1) {
          this.model.drivewayAttributes.splice(attrIndex, 1);
          this.model.drivewayAttributes = [...this.model.drivewayAttributes];
          this.model = { ...this.model };
          this.attributeUpdateCounter++;
        }
      } catch (error) {
        console.error('Error deleting driveway attribute:', error);
        alert('Error deleting driveway attribute. Please try again.');
      }
    }
  }

  @action
  async deleteRoadAttribute(roadAttribute) {
    if (confirm('Are you sure you want to delete this road attribute?')) {
      try {
        const municipalityId = this.model.municipality.id;
        await this.api.delete(
          `/municipalities/${municipalityId}/road-attributes/${roadAttribute._id || roadAttribute.id}`,
        );

        // Remove from local model
        const attrIndex = this.model.roadAttributes.findIndex(
          (a) => (a._id || a.id) === (roadAttribute._id || roadAttribute.id),
        );
        if (attrIndex !== -1) {
          this.model.roadAttributes.splice(attrIndex, 1);
          this.model.roadAttributes = [...this.model.roadAttributes];
          this.model = { ...this.model };
          this.attributeUpdateCounter++;
        }
      } catch (error) {
        console.error('Error deleting road attribute:', error);
        alert('Error deleting road attribute. Please try again.');
      }
    }
  }

  @action
  async deleteTopologyAttribute(topologyAttribute) {
    if (confirm('Are you sure you want to delete this topology attribute?')) {
      try {
        const municipalityId = this.model.municipality.id;
        await this.api.delete(
          `/municipalities/${municipalityId}/topology-attributes/${topologyAttribute._id || topologyAttribute.id}`,
        );

        // Remove from local model
        const attrIndex = this.model.topologyAttributes.findIndex(
          (a) =>
            (a._id || a.id) === (topologyAttribute._id || topologyAttribute.id),
        );
        if (attrIndex !== -1) {
          this.model.topologyAttributes.splice(attrIndex, 1);
          this.model.topologyAttributes = [...this.model.topologyAttributes];
          this.model = { ...this.model };
          this.attributeUpdateCounter++;
        }
      } catch (error) {
        console.error('Error deleting topology attribute:', error);
        alert('Error deleting topology attribute. Please try again.');
      }
    }
  }

  // === LAND TAXATION CATEGORIES ===

  // Computed property for reactive land taxation categories
  get landTaxationCategories() {
    return this.model?.landTaxationCategories || [];
  }

  @action
  addTaxationCategory() {
    const newCategory = {
      id: null, // New category
      name: '',
      taxPercentage: 100,
    };

    const updatedCategories = [...this.landTaxationCategories, newCategory];
    this.model.landTaxationCategories = updatedCategories;
    this.model = { ...this.model };
  }

  @action
  removeTaxationCategory(index) {
    const updatedCategories = [...this.landTaxationCategories];
    updatedCategories.splice(index, 1);
    this.model.landTaxationCategories = updatedCategories;
    this.model = { ...this.model };
  }

  @action
  updateTaxationCategory(index, field, event) {
    const value =
      field === 'taxPercentage'
        ? parseFloat(event.target.value) || 0
        : event.target.value;
    const updatedCategories = [...this.landTaxationCategories];
    updatedCategories[index] = { ...updatedCategories[index], [field]: value };
    this.model.landTaxationCategories = updatedCategories;
    this.model = { ...this.model };
  }

  @action
  updateTaxationCategoryAndCheck(index, field, checkForChanges, event) {
    this.updateTaxationCategory(index, field, event);
    // Use next tick to ensure the property update is complete
    setTimeout(() => {
      checkForChanges();
    }, 0);
  }

  @action
  async saveLandTaxationSettings(data) {
    try {
      const municipalityId = this.model.municipality.id;

      // Validate categories
      for (const category of data) {
        if (!category.name || !category.name.trim()) {
          throw new Error('All categories must have a name');
        }
        if (category.taxPercentage < 0 || category.taxPercentage > 100) {
          throw new Error('Tax percentage must be between 0% and 100%');
        }
      }

      const response = await this.api.put(
        `/municipalities/${municipalityId}/land-taxation-categories`,
        { categories: data },
        {
          loadingMessage: 'Saving land taxation categories...',
        },
      );

      // Update local model with response
      this.model.landTaxationCategories = response.landTaxationCategories || [];
      this.model = { ...this.model };

      console.log('Land taxation categories saved successfully');
    } catch (error) {
      console.error('Failed to save land taxation categories:', error);
      throw error;
    }
  }

  @action
  saveTaxationCategories() {
    // Wrapper action for the save button
    return this.saveLandTaxationSettings(this.model.landTaxationCategories);
  }

  @action
  resetLandTaxationSettings(originalData) {
    this.model.landTaxationCategories = [...originalData];
    this.model = { ...this.model };
  }
}
