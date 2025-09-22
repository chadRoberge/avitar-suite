import Component from '@glimmer/component';

export default class PropertyRecordCardComponent extends Component {
  // Props passed from parent:
  // @property - The property data
  // @landAssessment - Land assessment data for this card
  // @buildingAssessment - Building assessment data for this card
  // @propertyFeatures - Property features data for this card
  // @sketchData - Sketch data for this card
  // @cardNumber - The card number (1, 2, etc.)
  // @assessmentYear - The assessment year

  get cardTitle() {
    return `Card ${this.args.cardNumber}`;
  }

  get hasLandData() {
    return this.args.landAssessment?.assessment?.land_use_details?.length > 0;
  }

  get hasBuildingData() {
    return this.args.buildingAssessment?.assessment;
  }

  get hasFeatures() {
    return this.args.propertyFeatures?.features?.length > 0;
  }

  get hasSketchData() {
    return this.args.sketchData?.length > 0;
  }
}
