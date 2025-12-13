const sgMail = require('@sendgrid/mail');
const nodemailer = require('nodemailer');

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
}

// Export singleton instance
module.exports = new EmailService();
