const mongoose = require('mongoose');

const municipalityEmailTemplateSchema = new mongoose.Schema(
  {
    municipality_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Municipality',
      required: true,
      index: true,
    },
    template_type: {
      type: String,
      required: true,
      enum: [
        // Permit status templates
        'permit_approved',
        'permit_rejected',
        'permit_under_review',
        'permit_revision_requested',
        'permit_pending_payment',
        'permit_issued',

        // Inspection templates
        'inspection_scheduled',
        'inspection_reminder',
        'inspection_passed',
        'inspection_failed',
        'inspection_cancelled',
        'inspection_rescheduled',

        // Team member templates (municipality staff notifications)
        'team_member_added',
        'team_member_removed',
      ],
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    body: {
      type: String,
      required: true,
    },
    is_default: {
      type: Boolean,
      default: false,
    },
    variables: {
      type: [String],
      default: [],
    },
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    updated_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  },
);

// Compound index to ensure only one default template per type per municipality
municipalityEmailTemplateSchema.index(
  { municipality_id: 1, template_type: 1, is_default: 1 },
  { unique: true, partialFilterExpression: { is_default: true } },
);

// When setting a template as default, unset other defaults for same type/municipality
municipalityEmailTemplateSchema.pre('save', async function (next) {
  if (this.isModified('is_default') && this.is_default) {
    await this.constructor.updateMany(
      {
        municipality_id: this.municipality_id,
        template_type: this.template_type,
        is_default: true,
        _id: { $ne: this._id },
      },
      { $set: { is_default: false } },
    );
  }
  next();
});

// Static method to get template for a municipality and type
municipalityEmailTemplateSchema.statics.getTemplate = async function (
  municipalityId,
  templateType,
) {
  // Try to get default template for this municipality and type
  let template = await this.findOne({
    municipality_id: municipalityId,
    template_type: templateType,
    is_default: true,
  });

  // If no default, get any template for this type
  if (!template) {
    template = await this.findOne({
      municipality_id: municipalityId,
      template_type: templateType,
    }).sort({ created_at: -1 });
  }

  return template;
};

// Static method to get available variables for a template type
municipalityEmailTemplateSchema.statics.getAvailableVariables = function (
  templateType,
) {
  const variablesByType = {
    // Permit variables
    permit_approved: [
      { name: 'permitNumber', description: 'Permit application number' },
      { name: 'applicantName', description: 'Name of the applicant' },
      { name: 'companyName', description: 'Contractor company name' },
      { name: 'propertyAddress', description: 'Property address' },
      { name: 'permitType', description: 'Type of permit' },
      { name: 'approvedDate', description: 'Date approved' },
      { name: 'reviewerName', description: 'Name of reviewer' },
      { name: 'reviewNotes', description: 'Reviewer notes' },
      { name: 'municipalityName', description: 'Municipality name' },
    ],
    permit_rejected: [
      { name: 'permitNumber', description: 'Permit application number' },
      { name: 'applicantName', description: 'Name of the applicant' },
      { name: 'companyName', description: 'Contractor company name' },
      { name: 'propertyAddress', description: 'Property address' },
      { name: 'permitType', description: 'Type of permit' },
      { name: 'rejectedDate', description: 'Date rejected' },
      { name: 'reviewerName', description: 'Name of reviewer' },
      { name: 'rejectionReason', description: 'Reason for rejection' },
      { name: 'municipalityName', description: 'Municipality name' },
    ],
    permit_under_review: [
      { name: 'permitNumber', description: 'Permit application number' },
      { name: 'applicantName', description: 'Name of the applicant' },
      { name: 'companyName', description: 'Contractor company name' },
      { name: 'propertyAddress', description: 'Property address' },
      { name: 'permitType', description: 'Type of permit' },
      { name: 'submittedDate', description: 'Date submitted' },
      { name: 'municipalityName', description: 'Municipality name' },
    ],
    permit_revision_requested: [
      { name: 'permitNumber', description: 'Permit application number' },
      { name: 'applicantName', description: 'Name of the applicant' },
      { name: 'companyName', description: 'Contractor company name' },
      { name: 'propertyAddress', description: 'Property address' },
      { name: 'permitType', description: 'Type of permit' },
      { name: 'reviewerName', description: 'Name of reviewer' },
      { name: 'revisionNotes', description: 'Required revisions' },
      { name: 'municipalityName', description: 'Municipality name' },
    ],
    permit_pending_payment: [
      { name: 'permitNumber', description: 'Permit application number' },
      { name: 'applicantName', description: 'Name of the applicant' },
      { name: 'companyName', description: 'Contractor company name' },
      { name: 'propertyAddress', description: 'Property address' },
      { name: 'permitType', description: 'Type of permit' },
      { name: 'paymentAmount', description: 'Amount due' },
      { name: 'municipalityName', description: 'Municipality name' },
    ],
    permit_issued: [
      { name: 'permitNumber', description: 'Permit application number' },
      { name: 'applicantName', description: 'Name of the applicant' },
      { name: 'companyName', description: 'Contractor company name' },
      { name: 'propertyAddress', description: 'Property address' },
      { name: 'permitType', description: 'Type of permit' },
      { name: 'issuedDate', description: 'Date issued' },
      { name: 'expirationDate', description: 'Permit expiration date' },
      { name: 'municipalityName', description: 'Municipality name' },
    ],

    // Inspection variables
    inspection_scheduled: [
      { name: 'permitNumber', description: 'Permit number' },
      { name: 'applicantName', description: 'Name of the applicant' },
      { name: 'companyName', description: 'Contractor company name' },
      { name: 'propertyAddress', description: 'Property address' },
      { name: 'inspectionType', description: 'Type of inspection' },
      { name: 'inspectionDate', description: 'Scheduled date' },
      { name: 'inspectionTime', description: 'Scheduled time' },
      { name: 'inspectorName', description: 'Inspector name' },
      { name: 'inspectorPhone', description: 'Inspector phone' },
      { name: 'municipalityName', description: 'Municipality name' },
    ],
    inspection_reminder: [
      { name: 'permitNumber', description: 'Permit number' },
      { name: 'applicantName', description: 'Name of the applicant' },
      { name: 'companyName', description: 'Contractor company name' },
      { name: 'propertyAddress', description: 'Property address' },
      { name: 'inspectionType', description: 'Type of inspection' },
      { name: 'inspectionDate', description: 'Scheduled date' },
      { name: 'inspectionTime', description: 'Scheduled time' },
      { name: 'inspectorName', description: 'Inspector name' },
      { name: 'municipalityName', description: 'Municipality name' },
    ],
    inspection_passed: [
      { name: 'permitNumber', description: 'Permit number' },
      { name: 'applicantName', description: 'Name of the applicant' },
      { name: 'companyName', description: 'Contractor company name' },
      { name: 'propertyAddress', description: 'Property address' },
      { name: 'inspectionType', description: 'Type of inspection' },
      { name: 'inspectionDate', description: 'Inspection date' },
      { name: 'inspectorName', description: 'Inspector name' },
      { name: 'inspectorNotes', description: 'Inspector notes' },
      { name: 'municipalityName', description: 'Municipality name' },
    ],
    inspection_failed: [
      { name: 'permitNumber', description: 'Permit number' },
      { name: 'applicantName', description: 'Name of the applicant' },
      { name: 'companyName', description: 'Contractor company name' },
      { name: 'propertyAddress', description: 'Property address' },
      { name: 'inspectionType', description: 'Type of inspection' },
      { name: 'inspectionDate', description: 'Inspection date' },
      { name: 'inspectorName', description: 'Inspector name' },
      { name: 'failureReason', description: 'Reason for failure' },
      { name: 'correctionRequired', description: 'Required corrections' },
      { name: 'municipalityName', description: 'Municipality name' },
    ],
    inspection_cancelled: [
      { name: 'permitNumber', description: 'Permit number' },
      { name: 'applicantName', description: 'Name of the applicant' },
      { name: 'companyName', description: 'Contractor company name' },
      { name: 'propertyAddress', description: 'Property address' },
      { name: 'inspectionType', description: 'Type of inspection' },
      { name: 'originalDate', description: 'Original inspection date' },
      { name: 'cancellationReason', description: 'Reason for cancellation' },
      { name: 'municipalityName', description: 'Municipality name' },
    ],
    inspection_rescheduled: [
      { name: 'permitNumber', description: 'Permit number' },
      { name: 'applicantName', description: 'Name of the applicant' },
      { name: 'companyName', description: 'Contractor company name' },
      { name: 'propertyAddress', description: 'Property address' },
      { name: 'inspectionType', description: 'Type of inspection' },
      { name: 'originalDate', description: 'Original inspection date' },
      { name: 'newDate', description: 'New inspection date' },
      { name: 'newTime', description: 'New inspection time' },
      { name: 'municipalityName', description: 'Municipality name' },
    ],

    // Team member variables
    team_member_added: [
      { name: 'teamMemberName', description: 'Name of new team member' },
      { name: 'teamMemberEmail', description: 'Email of new team member' },
      { name: 'teamMemberRole', description: 'Role of new team member' },
      { name: 'companyName', description: 'Company name' },
      { name: 'addedBy', description: 'Who added the team member' },
    ],
    team_member_removed: [
      { name: 'teamMemberName', description: 'Name of removed team member' },
      { name: 'teamMemberEmail', description: 'Email of removed team member' },
      { name: 'companyName', description: 'Company name' },
      { name: 'removedBy', description: 'Who removed the team member' },
    ],
  };

  return variablesByType[templateType] || [];
};

const MunicipalityEmailTemplate = mongoose.model(
  'MunicipalityEmailTemplate',
  municipalityEmailTemplateSchema,
);

module.exports = MunicipalityEmailTemplate;
