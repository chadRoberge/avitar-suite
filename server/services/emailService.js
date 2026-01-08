const sgMail = require('@sendgrid/mail');
const nodemailer = require('nodemailer');
const templateService = require('./templateService');

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
   * Fetch subscription plans from Stripe
   * @param {string} planType - 'residential' or 'contractor'
   * @returns {Promise<Array>} - Array of plans with pricing
   */
  async fetchPlansFromStripe(planType = 'residential') {
    try {
      const stripeService = require('./stripeService');

      // Get all active products from Stripe
      const products = await stripeService.stripe.products.list({
        active: true,
        limit: 100,
      });

      // Filter for the requested plan type
      const filteredPlans = products.data.filter(
        (product) =>
          product.metadata &&
          product.metadata.plan_type === planType &&
          product.metadata.plan_key,
      );

      // Get prices for each plan
      const plansWithPricing = await Promise.all(
        filteredPlans.map(async (product) => {
          const prices = await stripeService.stripe.prices.list({
            product: product.id,
            active: true,
          });

          let price = 0;
          let interval = 'month';
          if (prices.data.length > 0) {
            const priceObj = prices.data[0];
            price = priceObj.unit_amount / 100;
            interval = priceObj.recurring?.interval || 'month';
          }

          // Get features from marketing_features or metadata
          const features = [
            ...(product.marketing_features || []).map((f) => f.name),
            ...(product.metadata.features
              ? product.metadata.features.split(',').map((f) => f.trim())
              : []),
          ];

          return {
            name: product.name,
            plan_key: product.metadata.plan_key,
            description: product.description || '',
            price,
            interval,
            features,
            feature_flags: {
              stored_payment_methods:
                product.metadata.stored_payment_methods === 'true',
              priority_support: product.metadata.priority_support === 'true',
              sms_notifications: product.metadata.sms_notifications === 'true',
              max_permits_per_month:
                product.metadata.max_permits_per_month === 'unlimited' ||
                product.metadata.max_permits_per_month === '-1'
                  ? -1
                  : parseInt(product.metadata.max_permits_per_month) || 5,
            },
          };
        }),
      );

      // Sort by price (free first, then ascending)
      plansWithPricing.sort((a, b) => a.price - b.price);

      return plansWithPricing;
    } catch (error) {
      console.error('Error fetching plans from Stripe:', error);
      // Return default free plan on error
      return [
        {
          name: 'Free',
          plan_key: 'free',
          description: 'Basic access to submit and track building permits',
          price: 0,
          features: [
            'Submit and track building permits',
            'View permit status and inspection results',
            'Upload supporting documents',
          ],
        },
      ];
    }
  }

  /**
   * Send welcome email to new user
   * @param {Object} options - Email options
   * @param {Object} options.user - User object with first_name, last_name, email
   * @param {string} options.accountType - 'residential' or 'commercial'
   * @param {string} options.planName - Current plan name (e.g., 'free')
   * @param {string} options.companyName - Company name for commercial accounts
   */
  async sendWelcomeEmail({
    user,
    accountType,
    planName = 'free',
    companyName,
  }) {
    const isCommercial = accountType === 'commercial';
    const planType = isCommercial ? 'contractor' : 'residential';

    // Fetch plans from Stripe
    const allPlans = await this.fetchPlansFromStripe(planType);

    // Find current plan
    const currentPlan =
      allPlans.find((p) => p.plan_key === planName) || allPlans[0];

    // Get upgrade plans (exclude current plan, show paid plans, max 4 features each)
    const upgradePlans = allPlans
      .filter((p) => p.plan_key !== planName && p.price > 0)
      .map((plan) => ({
        ...plan,
        features: plan.features.slice(0, 4),
      }));

    const appUrl = process.env.APP_URL || 'http://localhost:4200';

    // Build plan features list
    const planFeatures = this.buildPlanFeaturesList(currentPlan);

    // Prepare template data
    const templateData = {
      firstName: user.first_name,
      email: user.email,
      isCommercial,
      companyName,
      accountTypeLabel: isCommercial ? 'Contractor' : 'Residential',
      accountDescription: isCommercial
        ? 'manage your team, submit permits, and track projects across multiple municipalities'
        : 'submit building permits and track your home improvement projects',
      planName: currentPlan.name,
      planFeatures,
      upgradePlans,
      appUrl,
      currentYear: new Date().getFullYear(),
    };

    // Render template using templateService
    const emailContent = await templateService.renderEmailTemplate({
      municipalityId: null, // System-level template, no municipality override
      templateType: 'welcome',
      data: templateData,
      subject: `Welcome to Avitar - Your ${isCommercial ? 'Contractor' : 'Residential'} Account is Ready!`,
    });

    return await this.sendEmail({
      to: user.email,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
    });
  }

  /**
   * Build plan features list from plan data
   */
  buildPlanFeaturesList(plan) {
    // Use features from Stripe if available, otherwise use defaults
    const features =
      plan.features && plan.features.length > 0
        ? [...plan.features]
        : [
            'Submit and track building permits',
            'View permit status and inspection results',
            'Upload supporting documents',
          ];

    // Add feature flags as features if they're enabled
    if (plan.feature_flags) {
      if (plan.feature_flags.stored_payment_methods) {
        features.push('Store payment methods for quick checkout');
      }
      if (plan.feature_flags.priority_support) {
        features.push('Priority customer support');
      }
      if (plan.feature_flags.sms_notifications) {
        features.push('SMS notifications for urgent updates');
      }
      if (plan.feature_flags.max_permits_per_month === -1) {
        features.push('Unlimited permits per month');
      } else if (plan.feature_flags.max_permits_per_month > 0) {
        features.push(
          `Up to ${plan.feature_flags.max_permits_per_month} permits per month`,
        );
      }
    }

    return features;
  }
}

// Export singleton instance
module.exports = new EmailService();
