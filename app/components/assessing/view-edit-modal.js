import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class AssessingViewEditModalComponent extends Component {
  @tracked userModifications = {};

  constructor() {
    super(...arguments);
  }

  get viewData() {
    // Reset user modifications when args.view changes (when switching between add/edit modes)
    if (this._lastArgsView !== this.args.view) {
      this._lastArgsView = this.args.view;
      this.userModifications = {}; // Reset modifications when view changes
    }

    // Start with data from args.view or defaults
    let baseData;
    if (this.args.view) {
      baseData = {
        subjectId: this.args.view.subjectId || '',
        widthId: this.args.view.widthId || '',
        distanceId: this.args.view.distanceId || '',
        depthId: this.args.view.depthId || '',
        conditionFactor: this.args.view.conditionFactor || 1.0,
        conditionNotes: this.args.view.conditionNotes || '',
        current_use: this.args.view.current_use || false,
      };
    } else {
      // Empty data for new view
      baseData = {
        subjectId: '',
        widthId: '',
        distanceId: '',
        depthId: '',
        conditionFactor: 1.0,
        conditionNotes: '',
        current_use: false,
      };
    }

    // Apply any user modifications on top of base data
    return { ...baseData, ...this.userModifications };
  }

  get formData() {
    return this.viewData;
  }

  // Computed properties to filter view attributes by type
  get subjectAttributes() {
    return (
      this.args.viewAttributes?.filter(
        (attr) => attr.attributeType === 'subject',
      ) || []
    );
  }

  get widthAttributes() {
    return (
      this.args.viewAttributes?.filter(
        (attr) => attr.attributeType === 'width',
      ) || []
    );
  }

  get distanceAttributes() {
    return (
      this.args.viewAttributes?.filter(
        (attr) => attr.attributeType === 'distance',
      ) || []
    );
  }

  get depthAttributes() {
    return (
      this.args.viewAttributes?.filter(
        (attr) => attr.attributeType === 'depth',
      ) || []
    );
  }

  // Selected attribute getters
  get selectedSubject() {
    if (!this.formData.subjectId) return null;
    return this.subjectAttributes.find(
      (attr) => attr._id === this.formData.subjectId,
    );
  }

  get selectedWidth() {
    if (!this.formData.widthId) return null;
    return this.widthAttributes.find(
      (attr) => attr._id === this.formData.widthId,
    );
  }

  get selectedDistance() {
    if (!this.formData.distanceId) return null;
    return this.distanceAttributes.find(
      (attr) => attr._id === this.formData.distanceId,
    );
  }

  get selectedDepth() {
    if (!this.formData.depthId) return null;
    return this.depthAttributes.find(
      (attr) => attr._id === this.formData.depthId,
    );
  }

  get zoneBaseValue() {
    const property = this.args.property;
    const landAssessment = this.args.landAssessment;

    // Try to get zone from land assessment first (most current), then property
    let zoneCode = null;

    if (landAssessment?.zone_name) {
      // If land assessment has zone name, use it
      zoneCode = landAssessment.zone_name;
    } else if (landAssessment?.zone) {
      // If land assessment has zone ID, find the zone name
      // This requires access to zones data to convert ID to name
      // For now, fall back to property zone
      zoneCode = property?.zone;
    } else {
      // Fall back to property zone
      zoneCode = property?.zone;
    }

    if (!zoneCode || !this.args.zoneBaseViewValues) {
      return 0;
    }

    return this.args.zoneBaseViewValues[zoneCode] || 0;
  }

  get totalFactor() {
    const subjectFactor = this.selectedSubject?.factor
      ? this.selectedSubject.factor / 100
      : 1;
    const widthFactor = this.selectedWidth?.factor
      ? this.selectedWidth.factor / 100
      : 1;
    const distanceFactor = this.selectedDistance?.factor
      ? this.selectedDistance.factor / 100
      : 1;
    const depthFactor = this.selectedDepth?.factor
      ? this.selectedDepth.factor / 100
      : 1;
    const conditionFactor = parseFloat(this.formData.conditionFactor) || 1;

    return (
      subjectFactor *
      widthFactor *
      distanceFactor *
      depthFactor *
      conditionFactor
    );
  }

  get calculatedValue() {
    const baseValue = this.zoneBaseValue;
    const totalFactor = this.totalFactor;

    return baseValue * totalFactor;
  }

  get hasAllSelections() {
    return (
      this.selectedSubject &&
      this.selectedWidth &&
      this.selectedDistance &&
      this.selectedDepth
    );
  }

  get isValid() {
    return (
      this.formData.subjectId &&
      this.formData.widthId &&
      this.formData.distanceId &&
      this.formData.depthId &&
      this.formData.conditionFactor &&
      parseFloat(this.formData.conditionFactor) >= 0
    );
  }

  @action
  updateField(fieldName, event) {
    const value = event.target.value;
    this.userModifications = {
      ...this.userModifications,
      [fieldName]: value,
    };
  }

  @action
  updateCheckboxField(fieldName, event) {
    const value = event.target.checked;
    this.userModifications = {
      ...this.userModifications,
      [fieldName]: value,
    };
  }

  @action
  stopPropagation(event) {
    event.stopPropagation();
  }

  @action
  handleSubmit(event) {
    event.preventDefault();

    if (!this.isValid) {
      return;
    }

    const viewData = {
      subjectId: this.formData.subjectId,
      widthId: this.formData.widthId,
      distanceId: this.formData.distanceId,
      depthId: this.formData.depthId,
      conditionFactor: parseFloat(this.formData.conditionFactor),
      conditionNotes: this.formData.conditionNotes,
      current_use: this.formData.current_use,

      // Cached attribute values for performance (server will handle factor conversion)
      subjectName: this.selectedSubject?.name || '',
      subjectDisplayText: this.selectedSubject?.displayText || '',
      subjectFactor: this.selectedSubject?.factor || 1,
      widthName: this.selectedWidth?.name || '',
      widthDisplayText: this.selectedWidth?.displayText || '',
      widthFactor: this.selectedWidth?.factor || 1,
      distanceName: this.selectedDistance?.name || '',
      distanceDisplayText: this.selectedDistance?.displayText || '',
      distanceFactor: this.selectedDistance?.factor || 1,
      depthName: this.selectedDepth?.name || '',
      depthDisplayText: this.selectedDepth?.displayText || '',
      depthFactor: this.selectedDepth?.factor || 1,

      baseValue: this.zoneBaseValue,
      calculatedValue: this.calculatedValue,
    };

    this.args.onSave(viewData);
  }
}
