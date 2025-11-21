import Model, { attr, belongsTo } from '@ember-data/model';

export default class PermitTypeModel extends Model {
  @attr('string') municipalityId;
  @attr('string') name;
  @attr('string') description;
  @attr('string') icon;
  @attr('array', { defaultValue: () => [] }) subtypes;
  @attr('boolean', { defaultValue: true }) isActive;

  // Fee schedule
  @attr('number', { defaultValue: 0 }) feeScheduleBaseAmount;
  @attr('string', { defaultValue: 'flat' }) feeScheduleCalculationType;
  @attr('string') feeScheduleFormula;
  @attr('string') feeScheduleLinkedScheduleId;

  // Department reviews
  @attr('array', { defaultValue: () => [] }) departmentReviews;

  // Document requirements
  @attr('array', { defaultValue: () => [] }) requiredDocuments;
  @attr('array', { defaultValue: () => [] }) suggestedDocuments;

  // Template files
  @attr('array', { defaultValue: () => [] }) templateFiles;

  // Timestamps and relationships
  @attr('date') createdAt;
  @attr('date') updatedAt;
  @attr('string') createdBy;
  @attr('string') updatedBy;

  // Computed properties
  get displayName() {
    return this.isActive ? this.name : `${this.name} (Inactive)`;
  }

  get requiredDocumentCount() {
    return this.requiredDocuments?.length || 0;
  }

  get departmentCount() {
    return this.departmentReviews?.length || 0;
  }

  get templateFileCount() {
    return this.templateFiles?.length || 0;
  }

  get hasRequiredReviews() {
    return this.departmentReviews?.some((dept) => dept.isRequired);
  }

  // Get fee schedule object for easier access
  get feeSchedule() {
    return {
      baseAmount: this.feeScheduleBaseAmount,
      calculationType: this.feeScheduleCalculationType,
      formula: this.feeScheduleFormula,
      linkedScheduleId: this.feeScheduleLinkedScheduleId,
    };
  }

  set feeSchedule(value) {
    if (value) {
      this.feeScheduleBaseAmount = value.baseAmount;
      this.feeScheduleCalculationType = value.calculationType;
      this.feeScheduleFormula = value.formula;
      this.feeScheduleLinkedScheduleId = value.linkedScheduleId;
    }
  }

  // Serialize for API
  serialize() {
    return {
      name: this.name,
      description: this.description,
      icon: this.icon,
      subtypes: this.subtypes,
      isActive: this.isActive,
      feeSchedule: {
        baseAmount: this.feeScheduleBaseAmount,
        calculationType: this.feeScheduleCalculationType,
        formula: this.feeScheduleFormula,
        linkedScheduleId: this.feeScheduleLinkedScheduleId,
      },
      departmentReviews: this.departmentReviews,
      requiredDocuments: this.requiredDocuments,
      suggestedDocuments: this.suggestedDocuments,
      templateFiles: this.templateFiles,
    };
  }
}
