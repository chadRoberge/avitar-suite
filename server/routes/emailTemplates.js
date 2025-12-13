const express = require('express');
const router = express.Router();
const MunicipalityEmailTemplate = require('../models/MunicipalityEmailTemplate');
const templateService = require('../services/templateService');
const { authenticateToken } = require('../middleware/auth');

/**
 * Get all email templates for a municipality
 * GET /api/municipalities/:municipalityId/email-templates
 */
router.get(
  '/municipalities/:municipalityId/email-templates',
  authenticateToken,
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
      const { template_type } = req.query;

      // TODO: Add permission check - user must have access to this municipality

      const query = { municipality_id: municipalityId };
      if (template_type) {
        query.template_type = template_type;
      }

      const templates = await MunicipalityEmailTemplate.find(query).sort({
        is_default: -1,
        created_at: -1,
      });

      res.json({
        success: true,
        templates,
        count: templates.length,
      });
    } catch (error) {
      console.error('Error fetching email templates:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch email templates',
        message: error.message,
      });
    }
  },
);

/**
 * Get a single email template
 * GET /api/municipalities/:municipalityId/email-templates/:templateId
 */
router.get(
  '/municipalities/:municipalityId/email-templates/:templateId',
  authenticateToken,
  async (req, res) => {
    try {
      const { municipalityId, templateId } = req.params;

      const template = await MunicipalityEmailTemplate.findOne({
        _id: templateId,
        municipality_id: municipalityId,
      });

      if (!template) {
        return res.status(404).json({
          success: false,
          error: 'Template not found',
        });
      }

      res.json({
        success: true,
        template,
      });
    } catch (error) {
      console.error('Error fetching email template:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch email template',
        message: error.message,
      });
    }
  },
);

/**
 * Create a new email template
 * POST /api/municipalities/:municipalityId/email-templates
 */
router.post(
  '/municipalities/:municipalityId/email-templates',
  authenticateToken,
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
      const { template_type, name, subject, body, is_default } = req.body;

      // TODO: Add permission check - user must have admin access to this municipality

      // Validate required fields
      if (!template_type || !name || !subject || !body) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields',
          required: ['template_type', 'name', 'subject', 'body'],
        });
      }

      // Get available variables for this template type
      const availableVariables =
        MunicipalityEmailTemplate.getAvailableVariables(template_type);

      const template = new MunicipalityEmailTemplate({
        municipality_id: municipalityId,
        template_type,
        name,
        subject,
        body,
        is_default: is_default || false,
        variables: availableVariables.map((v) => v.name),
        created_by: req.user._id,
        updated_by: req.user._id,
      });

      await template.save();

      res.status(201).json({
        success: true,
        template,
        message: 'Email template created successfully',
      });
    } catch (error) {
      console.error('Error creating email template:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create email template',
        message: error.message,
      });
    }
  },
);

/**
 * Update an email template
 * PATCH /api/municipalities/:municipalityId/email-templates/:templateId
 */
router.patch(
  '/municipalities/:municipalityId/email-templates/:templateId',
  authenticateToken,
  async (req, res) => {
    try {
      const { municipalityId, templateId } = req.params;
      const { name, subject, body, is_default } = req.body;

      // TODO: Add permission check - user must have admin access to this municipality

      const template = await MunicipalityEmailTemplate.findOne({
        _id: templateId,
        municipality_id: municipalityId,
      });

      if (!template) {
        return res.status(404).json({
          success: false,
          error: 'Template not found',
        });
      }

      // Update fields
      if (name !== undefined) template.name = name;
      if (subject !== undefined) template.subject = subject;
      if (body !== undefined) template.body = body;
      if (is_default !== undefined) template.is_default = is_default;
      template.updated_by = req.user._id;

      await template.save();

      res.json({
        success: true,
        template,
        message: 'Email template updated successfully',
      });
    } catch (error) {
      console.error('Error updating email template:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update email template',
        message: error.message,
      });
    }
  },
);

/**
 * Delete an email template
 * DELETE /api/municipalities/:municipalityId/email-templates/:templateId
 */
router.delete(
  '/municipalities/:municipalityId/email-templates/:templateId',
  authenticateToken,
  async (req, res) => {
    try {
      const { municipalityId, templateId } = req.params;

      // TODO: Add permission check - user must have admin access to this municipality

      const template = await MunicipalityEmailTemplate.findOneAndDelete({
        _id: templateId,
        municipality_id: municipalityId,
      });

      if (!template) {
        return res.status(404).json({
          success: false,
          error: 'Template not found',
        });
      }

      res.json({
        success: true,
        message: 'Email template deleted successfully',
      });
    } catch (error) {
      console.error('Error deleting email template:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete email template',
        message: error.message,
      });
    }
  },
);

/**
 * Preview an email template
 * POST /api/municipalities/:municipalityId/email-templates/preview
 */
router.post(
  '/municipalities/:municipalityId/email-templates/preview',
  authenticateToken,
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
      const { template_type, subject, body, templateId } = req.body;

      let preview;

      if (templateId) {
        // Preview existing template
        preview = await templateService.previewTemplate({
          municipalityId,
          templateType: template_type,
        });
      } else if (subject && body) {
        // Preview custom subject/body before saving
        preview = await templateService.previewTemplate({
          municipalityId,
          templateType: template_type,
          customSubject: subject,
          customBody: body,
        });
      } else {
        return res.status(400).json({
          success: false,
          error: 'Either templateId or both subject and body must be provided',
        });
      }

      res.json({
        success: true,
        preview,
      });
    } catch (error) {
      console.error('Error previewing email template:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to preview email template',
        message: error.message,
      });
    }
  },
);

/**
 * Get available variables for a template type
 * GET /api/email-templates/variables/:templateType
 */
router.get(
  '/email-templates/variables/:templateType',
  authenticateToken,
  async (req, res) => {
    try {
      const { templateType } = req.params;

      const variables =
        MunicipalityEmailTemplate.getAvailableVariables(templateType);

      res.json({
        success: true,
        templateType,
        variables,
      });
    } catch (error) {
      console.error('Error fetching template variables:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch template variables',
        message: error.message,
      });
    }
  },
);

/**
 * Get all available template types
 * GET /api/email-templates/types
 */
router.get('/email-templates/types', authenticateToken, async (req, res) => {
  try {
    const types = [
      {
        value: 'permit_approved',
        label: 'Permit Approved',
        category: 'Permit Status',
      },
      {
        value: 'permit_rejected',
        label: 'Permit Rejected',
        category: 'Permit Status',
      },
      {
        value: 'permit_under_review',
        label: 'Permit Under Review',
        category: 'Permit Status',
      },
      {
        value: 'permit_revision_requested',
        label: 'Revision Requested',
        category: 'Permit Status',
      },
      {
        value: 'permit_pending_payment',
        label: 'Payment Required',
        category: 'Permit Status',
      },
      {
        value: 'permit_issued',
        label: 'Permit Issued',
        category: 'Permit Status',
      },
      {
        value: 'inspection_scheduled',
        label: 'Inspection Scheduled',
        category: 'Inspections',
      },
      {
        value: 'inspection_reminder',
        label: 'Inspection Reminder',
        category: 'Inspections',
      },
      {
        value: 'inspection_passed',
        label: 'Inspection Passed',
        category: 'Inspections',
      },
      {
        value: 'inspection_failed',
        label: 'Inspection Failed',
        category: 'Inspections',
      },
      {
        value: 'inspection_cancelled',
        label: 'Inspection Cancelled',
        category: 'Inspections',
      },
      {
        value: 'inspection_rescheduled',
        label: 'Inspection Rescheduled',
        category: 'Inspections',
      },
    ];

    res.json({
      success: true,
      types,
    });
  } catch (error) {
    console.error('Error fetching template types:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch template types',
      message: error.message,
    });
  }
});

module.exports = router;
