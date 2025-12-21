const sgMail = require('@sendgrid/mail');
const nodemailer = require('nodemailer');
const { SUBSCRIPTION_PLANS } = require('../config/subscriptionPlans');

class EmailService {
  constructor() {
    this.provider = process.env.EMAIL_PROVIDER || 'sendgrid'; // 'sendgrid' or 'smtp'
    this.fromEmail = process.env.EMAIL_FROM || 'noreply@avitar.com';
    this.fromName = process.env.EMAIL_FROM_NAME || 'Avitar Platform';

    this.initializeProvider();
  }

  initializeProvider() {
    if (this.provider === 'sendgrid') {
      const apiKey = process.env.SENDGRID_API_KEY;
      if (!apiKey) {
        console.warn(
          'SENDGRID_API_KEY not configured. Email sending will fail.',
        );
      } else {
        sgMail.setApiKey(apiKey);
        console.log('SendGrid email service initialized');
      }
    } else if (this.provider === 'smtp') {
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASSWORD,
        },
      });
      console.log('SMTP email service initialized');
    }
  }

  /**
   * Send an email
   * @param {Object} options - Email options
   * @param {string} options.to - Recipient email address
   * @param {string} options.subject - Email subject
   * @param {string} options.html - HTML content
   * @param {string} options.text - Plain text content (optional)
   * @param {string} options.from - Sender email (optional, uses default)
   * @param {string} options.fromName - Sender name (optional, uses default)
   * @returns {Promise<Object>} - Send result
   */
  async sendEmail({ to, subject, html, text, from, fromName }) {
    const senderEmail = from || this.fromEmail;
    const senderName = fromName || this.fromName;
    const sender = `${senderName} <${senderEmail}>`;

    try {
      if (this.provider === 'sendgrid') {
        return await this.sendViaSendGrid({ to, subject, html, text, sender });
      } else if (this.provider === 'smtp') {
        return await this.sendViaSMTP({ to, subject, html, text, sender });
      } else {
        throw new Error(`Unknown email provider: ${this.provider}`);
      }
    } catch (error) {
      console.error('Email sending failed:', error);
      throw error;
    }
  }

  /**
   * Send email via SendGrid
   */
  async sendViaSendGrid({ to, subject, html, text, sender }) {
    const msg = {
      to,
      from: sender,
      subject,
      html,
      text: text || this.htmlToText(html),
    };

    const result = await sgMail.send(msg);
    console.log(`Email sent via SendGrid to ${to}: ${subject}`);
    return {
      success: true,
      messageId: result[0]?.headers?.['x-message-id'],
      provider: 'sendgrid',
    };
  }

  /**
   * Send email via SMTP (nodemailer)
   */
  async sendViaSMTP({ to, subject, html, text, sender }) {
    if (!this.transporter) {
      throw new Error('SMTP transporter not initialized');
    }

    const mailOptions = {
      from: sender,
      to,
      subject,
      html,
      text: text || this.htmlToText(html),
    };

    const info = await this.transporter.sendMail(mailOptions);
    console.log(`Email sent via SMTP to ${to}: ${subject}`, info.messageId);
    return {
      success: true,
      messageId: info.messageId,
      provider: 'smtp',
    };
  }

  /**
   * Send bulk emails (batch)
   * @param {Array} emails - Array of email objects with {to, subject, html, text}
   * @returns {Promise<Array>} - Array of send results
   */
  async sendBulk(emails) {
    if (this.provider === 'sendgrid') {
      // SendGrid supports batch sending
      const messages = emails.map(({ to, subject, html, text }) => ({
        to,
        from: `${this.fromName} <${this.fromEmail}>`,
        subject,
        html,
        text: text || this.htmlToText(html),
      }));

      try {
        await sgMail.send(messages);
        console.log(`Sent ${emails.length} emails via SendGrid batch`);
        return emails.map(() => ({ success: true, provider: 'sendgrid' }));
      } catch (error) {
        console.error('Bulk email sending failed:', error);
        throw error;
      }
    } else {
      // For SMTP, send individually
      const results = await Promise.allSettled(
        emails.map((email) => this.sendEmail(email)),
      );
      return results.map((result) =>
        result.status === 'fulfilled'
          ? result.value
          : { success: false, error: result.reason },
      );
    }
  }

  /**
   * Basic HTML to plain text converter
   */
  htmlToText(html) {
    return html
      .replace(/<style[^>]*>.*?<\/style>/gi, '')
      .replace(/<script[^>]*>.*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Validate email address
   */
  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Send a test email to verify configuration
   */
  async sendTestEmail(to) {
    return await this.sendEmail({
      to,
      subject: 'Avitar Platform - Email Test',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563eb;">Email Service Test</h2>
          <p>This is a test email from the Avitar Platform notification system.</p>
          <p>If you received this email, your email service is configured correctly.</p>
          <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">
            Provider: ${this.provider}<br>
            From: ${this.fromEmail}
          </p>
        </div>
      `,
    });
  }

  /**
   * Send welcome email to new user
   * @param {Object} options - Email options
   * @param {Object} options.user - User object with first_name, last_name, email
   * @param {string} options.accountType - 'residential' or 'commercial'
   * @param {string} options.planName - Current plan name (e.g., 'free')
   * @param {string} options.companyName - Company name for commercial accounts
   */
  async sendWelcomeEmail({ user, accountType, planName = 'free', companyName }) {
    const isCommercial = accountType === 'commercial';
    const plan = SUBSCRIPTION_PLANS[planName] || SUBSCRIPTION_PLANS.free;

    // Get upgrade plans for comparison
    const upgradePlans = isCommercial
      ? [SUBSCRIPTION_PLANS.pro, SUBSCRIPTION_PLANS.professional]
      : [SUBSCRIPTION_PLANS.basic, SUBSCRIPTION_PLANS.pro];

    const appUrl = process.env.APP_URL || 'http://localhost:4200';

    const html = this.generateWelcomeEmailHtml({
      user,
      isCommercial,
      companyName,
      plan,
      upgradePlans,
      appUrl,
    });

    return await this.sendEmail({
      to: user.email,
      subject: `Welcome to Avitar - Your ${isCommercial ? 'Contractor' : 'Residential'} Account is Ready!`,
      html,
    });
  }

  /**
   * Generate welcome email HTML
   */
  generateWelcomeEmailHtml({
    user,
    isCommercial,
    companyName,
    plan,
    upgradePlans,
    appUrl,
  }) {
    const accountTypeLabel = isCommercial ? 'Contractor' : 'Residential';
    const accountDescription = isCommercial
      ? 'manage your team, submit permits, and track projects across multiple municipalities'
      : 'submit building permits and track your home improvement projects';

    // Current plan features
    const currentFeatures = this.formatPlanFeatures(plan, isCommercial);

    // Generate upgrade plan cards
    const upgradeCards = upgradePlans
      .map((upgradePlan) => this.generatePlanCard(upgradePlan, isCommercial))
      .join('');

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Avitar</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f3f4f6;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">

    <!-- Header -->
    <div style="background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); border-radius: 12px 12px 0 0; padding: 40px 30px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 600;">Welcome to Avitar!</h1>
      <p style="color: #bfdbfe; margin: 10px 0 0 0; font-size: 16px;">Your building permit management platform</p>
    </div>

    <!-- Main Content -->
    <div style="background-color: #ffffff; padding: 40px 30px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">

      <!-- Greeting -->
      <p style="font-size: 18px; color: #1f2937; margin: 0 0 20px 0;">
        Hi ${user.first_name},
      </p>

      <p style="font-size: 16px; color: #4b5563; line-height: 1.6; margin: 0 0 25px 0;">
        Your <strong>${accountTypeLabel} Account</strong> has been created successfully!
        ${isCommercial && companyName ? `Your company <strong>"${companyName}"</strong> is now registered on our platform.` : ''}
        You're all set to ${accountDescription}.
      </p>

      <!-- Account Type Badge -->
      <div style="background-color: ${isCommercial ? '#dbeafe' : '#dcfce7'}; border-left: 4px solid ${isCommercial ? '#2563eb' : '#22c55e'}; padding: 15px 20px; border-radius: 0 8px 8px 0; margin-bottom: 30px;">
        <p style="margin: 0; font-size: 14px; color: ${isCommercial ? '#1e40af' : '#166534'};">
          <strong>Account Type:</strong> ${accountTypeLabel} ${isCommercial ? '(Commercial)' : '(Homeowner)'}
        </p>
        <p style="margin: 5px 0 0 0; font-size: 14px; color: ${isCommercial ? '#1e40af' : '#166534'};">
          <strong>Current Plan:</strong> ${plan.name} Plan
        </p>
      </div>

      <!-- Current Plan Features -->
      <h2 style="font-size: 18px; color: #1f2937; margin: 0 0 15px 0; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px;">
        Your ${plan.name} Plan Features
      </h2>

      <div style="margin-bottom: 30px;">
        ${currentFeatures}
      </div>

      <!-- Upgrade Section -->
      <div style="background-color: #fefce8; border: 1px solid #fde047; border-radius: 8px; padding: 20px; margin-bottom: 30px;">
        <h3 style="font-size: 16px; color: #854d0e; margin: 0 0 10px 0;">
          Unlock More Features
        </h3>
        <p style="font-size: 14px; color: #713f12; margin: 0 0 15px 0; line-height: 1.5;">
          Upgrade your plan to access premium features like ${isCommercial ? 'team management, stored payment methods, and advanced reporting' : 'priority support and enhanced permit tracking'}.
        </p>

        <!-- Upgrade Plan Cards -->
        <div style="display: table; width: 100%; border-spacing: 10px;">
          ${upgradeCards}
        </div>
      </div>

      <!-- Getting Started Steps -->
      <h2 style="font-size: 18px; color: #1f2937; margin: 0 0 15px 0; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px;">
        Getting Started
      </h2>

      <div style="margin-bottom: 30px;">
        <div style="display: flex; align-items: flex-start; margin-bottom: 15px;">
          <div style="background-color: #2563eb; color: #ffffff; width: 28px; height: 28px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 600; margin-right: 12px; flex-shrink: 0;">1</div>
          <div>
            <p style="margin: 0; font-size: 15px; color: #1f2937; font-weight: 500;">Complete Your Profile</p>
            <p style="margin: 4px 0 0 0; font-size: 14px; color: #6b7280;">Add your contact information and preferences.</p>
          </div>
        </div>

        <div style="display: flex; align-items: flex-start; margin-bottom: 15px;">
          <div style="background-color: #2563eb; color: #ffffff; width: 28px; height: 28px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 600; margin-right: 12px; flex-shrink: 0;">2</div>
          <div>
            <p style="margin: 0; font-size: 15px; color: #1f2937; font-weight: 500;">Select a Municipality</p>
            <p style="margin: 4px 0 0 0; font-size: 14px; color: #6b7280;">Choose the town where you'll be submitting permits.</p>
          </div>
        </div>

        <div style="display: flex; align-items: flex-start; margin-bottom: 15px;">
          <div style="background-color: #2563eb; color: #ffffff; width: 28px; height: 28px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 600; margin-right: 12px; flex-shrink: 0;">3</div>
          <div>
            <p style="margin: 0; font-size: 15px; color: #1f2937; font-weight: 500;">Submit Your First Permit</p>
            <p style="margin: 4px 0 0 0; font-size: 14px; color: #6b7280;">Use our easy wizard to create and submit a building permit.</p>
          </div>
        </div>
      </div>

      <!-- Notification Settings Notice -->
      <div style="background-color: #f3f4f6; border-radius: 8px; padding: 15px 20px; margin-bottom: 30px;">
        <p style="margin: 0; font-size: 14px; color: #4b5563; line-height: 1.5;">
          <strong>Notification Preferences:</strong> You can customize how you receive updates about your permits and account.
          Visit <a href="${appUrl}/citizen-settings/notifications" style="color: #2563eb; text-decoration: none;">Account Settings &rarr; Notifications</a> to manage your preferences.
        </p>
      </div>

      <!-- CTA Button -->
      <div style="text-align: center; margin-bottom: 30px;">
        <a href="${appUrl}/my-permits" style="display: inline-block; background-color: #2563eb; color: #ffffff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-size: 16px; font-weight: 600; box-shadow: 0 2px 4px rgba(37, 99, 235, 0.3);">
          Go to My Permits Dashboard
        </a>
      </div>

      <!-- Support -->
      <div style="border-top: 1px solid #e5e7eb; padding-top: 20px; text-align: center;">
        <p style="margin: 0 0 10px 0; font-size: 14px; color: #6b7280;">
          Questions? We're here to help!
        </p>
        <p style="margin: 0; font-size: 14px; color: #6b7280;">
          Contact us at <a href="mailto:support@avitar.com" style="color: #2563eb; text-decoration: none;">support@avitar.com</a>
        </p>
      </div>
    </div>

    <!-- Footer -->
    <div style="text-align: center; padding: 20px;">
      <p style="margin: 0 0 10px 0; font-size: 12px; color: #9ca3af;">
        &copy; ${new Date().getFullYear()} Avitar. All rights reserved.
      </p>
      <p style="margin: 0; font-size: 12px; color: #9ca3af;">
        This email was sent to ${user.email} because you created an account on Avitar.
      </p>
    </div>
  </div>
</body>
</html>
    `;
  }

  /**
   * Format plan features as HTML list items
   */
  formatPlanFeatures(plan, isCommercial) {
    const features = [];

    // Add relevant features based on the plan
    if (plan.features.max_permits_per_month) {
      const permits = plan.features.max_permits_per_month;
      features.push({
        icon: '📄',
        text: permits === -1 ? 'Unlimited permits per month' : `Up to ${permits} permits per month`,
      });
    }

    if (plan.features.max_team_members && isCommercial) {
      const members = plan.features.max_team_members;
      features.push({
        icon: '👥',
        text: members === -1 ? 'Unlimited team members' : members === 1 ? 'Single user account' : `Up to ${members} team members`,
      });
    }

    if (plan.features.team_management && isCommercial) {
      features.push({ icon: '🔧', text: 'Team management tools' });
    }

    if (plan.features.stored_payment_methods) {
      features.push({ icon: '💳', text: 'Store payment methods for quick checkout' });
    }

    if (plan.features.advanced_reporting) {
      features.push({ icon: '📊', text: 'Advanced reporting and analytics' });
    }

    if (plan.features.priority_support) {
      features.push({ icon: '⭐', text: 'Priority customer support' });
    }

    if (plan.features.permit_fee_discount > 0) {
      features.push({ icon: '💰', text: `${plan.features.permit_fee_discount}% discount on permit fees` });
    }

    // Default features for all plans
    features.push({ icon: '✓', text: 'Submit and track building permits' });
    features.push({ icon: '✓', text: 'View permit status and inspection results' });
    features.push({ icon: '✓', text: 'Upload supporting documents' });

    return features
      .map(
        (f) => `
        <div style="display: flex; align-items: center; margin-bottom: 8px;">
          <span style="margin-right: 10px; font-size: 16px;">${f.icon}</span>
          <span style="font-size: 14px; color: #4b5563;">${f.text}</span>
        </div>
      `,
      )
      .join('');
  }

  /**
   * Generate a plan comparison card for upgrade section
   */
  generatePlanCard(plan, isCommercial) {
    const highlightFeatures = [];

    if (plan.features.team_management && isCommercial) {
      highlightFeatures.push('Team management');
    }
    if (plan.features.stored_payment_methods) {
      highlightFeatures.push('Stored payments');
    }
    if (plan.features.advanced_reporting) {
      highlightFeatures.push('Advanced reporting');
    }
    if (plan.features.priority_support) {
      highlightFeatures.push('Priority support');
    }

    const featureList = highlightFeatures.slice(0, 3).join(' • ');

    return `
      <div style="display: table-cell; width: 50%; vertical-align: top; padding: 10px;">
        <div style="background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 15px; text-align: center;">
          <h4 style="margin: 0 0 5px 0; font-size: 16px; color: #1f2937;">${plan.name}</h4>
          <p style="margin: 0 0 10px 0; font-size: 24px; font-weight: 700; color: #2563eb;">
            $${plan.price}<span style="font-size: 14px; font-weight: 400; color: #6b7280;">/mo</span>
          </p>
          <p style="margin: 0; font-size: 12px; color: #6b7280; line-height: 1.4;">
            ${featureList}
          </p>
        </div>
      </div>
    `;
  }
}

// Export singleton instance
module.exports = new EmailService();
