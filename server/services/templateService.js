const Handlebars = require('handlebars');
const fs = require('fs').promises;
const path = require('path');
const MunicipalityEmailTemplate = require('../models/MunicipalityEmailTemplate');

/**
 * Template Resolution and Rendering Service
 *
 * Handles template resolution (custom vs default) and rendering with Handlebars
 */
class TemplateService {
  constructor() {
    this.templateCache = new Map();
    this.defaultTemplatesPath = path.join(
      __dirname,
      '../templates/emails/defaults'
    );

    // Register Handlebars helpers
    this.registerHelpers();
  }

  /**
   * Register Handlebars helpers
   */
  registerHelpers() {
    // Date formatting helper
    Handlebars.registerHelper('formatDate', function (date, format) {
      if (!date) return '';
      const d = new Date(date);
      if (format === 'short') {
        return d.toLocaleDateString();
      } else if (format === 'long') {
        return d.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
      } else if (format === 'time') {
        return d.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
        });
      }
      return d.toLocaleDateString();
    });

    // Status color helper
    Handlebars.registerHelper('statusColor', function (status) {
      const colors = {
        approved: '#10b981',
        rejected: '#ef4444',
        under_review: '#f59e0b',
        revision_requested: '#f59e0b',
        pending_payment: '#3b82f6',
        issued: '#10b981',
        passed: '#10b981',
        failed: '#ef4444',
      };
      return colors[status] || '#6b7280';
    });

    // Capitalize helper
    Handlebars.registerHelper('capitalize', function (str) {
      if (!str) return '';
      return str.charAt(0).toUpperCase() + str.slice(1);
    });

    // Conditional helper
    Handlebars.registerHelper('ifEquals', function (arg1, arg2, options) {
      return arg1 == arg2 ? options.fn(this) : options.inverse(this);
    });
  }

  /**
   * Render email template
   * @param {Object} options - Rendering options
   * @param {string} options.municipalityId - Municipality ID (null for system templates)
   * @param {string} options.templateType - Template type (e.g., 'permit_approved')
   * @param {Object} options.data - Template variables
   * @param {string} options.subject - Fallback subject if no template
   * @returns {Promise<Object>} - {subject, html, text}
   */
  async renderEmailTemplate({ municipalityId, templateType, data, subject }) {
    let template = null;

    // Try to get custom municipality template if municipalityId provided
    if (municipalityId) {
      template = await MunicipalityEmailTemplate.getTemplate(
        municipalityId,
        templateType
      );
    }

    // Fallback to default system template
    if (!template) {
      template = await this.getDefaultTemplate(templateType);
    }

    if (!template) {
      // Ultimate fallback: use simple template
      console.warn(`No template found for ${templateType}, using fallback`);
      return this.renderFallbackTemplate({ subject, data });
    }

    // Compile and render template
    const compiledSubject = Handlebars.compile(template.subject);
    const compiledBody = Handlebars.compile(template.body);

    const renderedSubject = compiledSubject(data);
    const renderedHtml = compiledBody(data);

    // Generate plain text version
    const renderedText = this.htmlToText(renderedHtml);

    return {
      subject: renderedSubject,
      html: renderedHtml,
      text: renderedText,
    };
  }

  /**
   * Get default system template
   */
  async getDefaultTemplate(templateType) {
    // Check cache first
    const cacheKey = `default_${templateType}`;
    if (this.templateCache.has(cacheKey)) {
      return this.templateCache.get(cacheKey);
    }

    // Try to load from file
    const templatePath = path.join(
      this.defaultTemplatesPath,
      `${templateType}.hbs`
    );

    try {
      const content = await fs.readFile(templatePath, 'utf-8');

      // Parse frontmatter for subject
      const { subject, body } = this.parseFrontmatter(content);

      const template = {
        subject: subject || this.getDefaultSubject(templateType),
        body,
      };

      // Cache it
      this.templateCache.set(cacheKey, template);

      return template;
    } catch (error) {
      console.error(`Failed to load default template ${templateType}:`, error);
      return null;
    }
  }

  /**
   * Parse frontmatter from template file
   * Format:
   * ---
   * subject: Email Subject Here
   * ---
   * <template body>
   */
  parseFrontmatter(content) {
    const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
    const match = content.match(frontmatterRegex);

    if (!match) {
      return { subject: null, body: content };
    }

    const frontmatter = match[1];
    const body = match[2];

    // Parse subject from frontmatter
    const subjectMatch = frontmatter.match(/subject:\s*(.+)/);
    const subject = subjectMatch ? subjectMatch[1].trim() : null;

    return { subject, body };
  }

  /**
   * Get default subject for a template type
   */
  getDefaultSubject(templateType) {
    const subjects = {
      permit_approved: 'Permit Approved - {{permitNumber}}',
      permit_rejected: 'Permit Rejected - {{permitNumber}}',
      permit_under_review: 'Permit Under Review - {{permitNumber}}',
      permit_revision_requested:
        'Revision Requested - {{permitNumber}}',
      permit_pending_payment: 'Payment Required - {{permitNumber}}',
      permit_issued: 'Permit Issued - {{permitNumber}}',
      inspection_scheduled: 'Inspection Scheduled - {{permitNumber}}',
      inspection_reminder: 'Inspection Reminder - Tomorrow',
      inspection_passed: 'Inspection Passed - {{permitNumber}}',
      inspection_failed: 'Inspection Failed - {{permitNumber}}',
      inspection_cancelled: 'Inspection Cancelled - {{permitNumber}}',
      inspection_rescheduled: 'Inspection Rescheduled - {{permitNumber}}',
      license_expiration: 'License Expiration Warning',
      team_member_added: 'New Team Member Added',
      team_member_removed: 'Team Member Removed',
    };

    return subjects[templateType] || 'Notification';
  }

  /**
   * Render fallback template when no template exists
   */
  renderFallbackTemplate({ subject, data }) {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #2563eb;">${subject}</h2>
        <p>You have a new notification from the Avitar Platform.</p>
        ${Object.entries(data)
          .map(
            ([key, value]) => `
          <p><strong>${key}:</strong> ${value}</p>
        `
          )
          .join('')}
        <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
          This is an automated notification from the Avitar Platform.
        </p>
      </div>
    `;

    return {
      subject,
      html,
      text: this.htmlToText(html),
    };
  }

  /**
   * Render SMS template (simple text)
   */
  renderSMSTemplate({ templateType, data }) {
    const templates = {
      permit_approved: 'Permit {{permitNumber}} approved. Check email for details.',
      permit_rejected: 'Permit {{permitNumber}} rejected. Check email for details.',
      permit_under_review: 'Permit {{permitNumber}} is under review.',
      permit_revision_requested: 'Revision requested for permit {{permitNumber}}. Check email.',
      inspection_scheduled: 'Inspection scheduled on {{inspectionDate}}. Check email.',
      inspection_reminder: 'Inspection tomorrow at {{inspectionTime}}.',
      inspection_passed: 'Inspection passed for permit {{permitNumber}}!',
      inspection_failed: 'Inspection failed. Check email for corrections.',
      license_expiration: 'Your license expires in {{daysUntilExpiration}} days. Renew soon.',
    };

    const template = templates[templateType] || 'You have a new notification.';
    const compiled = Handlebars.compile(template);
    return compiled(data);
  }

  /**
   * Preview template with sample data
   */
  async previewTemplate({ municipalityId, templateType, customSubject, customBody }) {
    // Sample data by template type
    const sampleData = this.getSampleData(templateType);

    // If custom subject/body provided, use those (for preview before saving)
    if (customSubject && customBody) {
      const compiledSubject = Handlebars.compile(customSubject);
      const compiledBody = Handlebars.compile(customBody);

      return {
        subject: compiledSubject(sampleData),
        html: compiledBody(sampleData),
        text: this.htmlToText(compiledBody(sampleData)),
        sampleData,
      };
    }

    // Otherwise render normally
    const result = await this.renderEmailTemplate({
      municipalityId,
      templateType,
      data: sampleData,
      subject: this.getDefaultSubject(templateType),
    });

    return {
      ...result,
      sampleData,
    };
  }

  /**
   * Get sample data for template preview
   */
  getSampleData(templateType) {
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const commonData = {
      municipalityName: 'Sample Municipality',
      applicantName: 'John Smith',
      companyName: 'ABC Construction',
      propertyAddress: '123 Main Street, Sample City, MA 01234',
    };

    if (templateType.startsWith('permit_')) {
      return {
        ...commonData,
        permitNumber: 'BP-2025-001',
        permitType: 'Building Permit - New Construction',
        submittedDate: now.toLocaleDateString(),
        approvedDate: now.toLocaleDateString(),
        rejectedDate: now.toLocaleDateString(),
        reviewerName: 'Jane Doe',
        reviewNotes: 'All requirements met. Approved for construction.',
        rejectionReason: 'Missing structural plans. Please resubmit with complete documentation.',
        revisionNotes: 'Please revise the foundation plans to comply with setback requirements.',
        paymentAmount: '$250.00',
        issuedDate: now.toLocaleDateString(),
        expirationDate: new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000).toLocaleDateString(),
      };
    }

    if (templateType.startsWith('inspection_')) {
      return {
        ...commonData,
        permitNumber: 'BP-2025-001',
        inspectionType: 'Foundation Inspection',
        inspectionDate: tomorrow.toLocaleDateString(),
        inspectionTime: '10:00 AM',
        originalDate: now.toLocaleDateString(),
        newDate: tomorrow.toLocaleDateString(),
        newTime: '2:00 PM',
        inspectorName: 'Bob Wilson',
        inspectorPhone: '(555) 123-4567',
        inspectorNotes: 'Foundation meets all code requirements.',
        failureReason: 'Rebar spacing does not meet code requirements.',
        correctionRequired: 'Adjust rebar spacing to 12 inches on center and request re-inspection.',
        cancellationReason: 'Weather conditions unsafe for inspection.',
      };
    }

    if (templateType.startsWith('license_')) {
      return {
        daysUntilExpiration: 30,
        licenseType: 'General Contractor',
        licenseNumber: 'GC-12345',
        expirationDate: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString(),
        renewalUrl: 'https://avitar.com/renew-license',
      };
    }

    if (templateType.startsWith('team_member_')) {
      return {
        ...commonData,
        teamMemberName: 'Sarah Johnson',
        teamMemberEmail: 'sarah@abcconstruction.com',
        teamMemberRole: 'Project Manager',
        addedBy: 'John Smith',
        removedBy: 'John Smith',
      };
    }

    return commonData;
  }

  /**
   * HTML to plain text converter
   */
  htmlToText(html) {
    return html
      .replace(/<style[^>]*>.*?<\/style>/gi, '')
      .replace(/<script[^>]*>.*?<\/script>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Clear template cache
   */
  clearCache() {
    this.templateCache.clear();
    console.log('Template cache cleared');
  }
}

// Export singleton instance
module.exports = new TemplateService();
