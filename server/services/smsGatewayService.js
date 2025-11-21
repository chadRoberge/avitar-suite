const emailService = require('./emailService');

/**
 * SMS Gateway Service
 *
 * Provides SMS messaging via email-to-SMS gateways (free)
 * Can be upgraded to Twilio API for professional SMS delivery
 */
class SMSGatewayService {
  constructor() {
    this.provider = process.env.SMS_PROVIDER || 'email-gateway'; // 'email-gateway' or 'twilio'

    // Email-to-SMS gateway domains by carrier
    this.carrierGateways = {
      verizon: 'vtext.com',
      att: 'txt.att.net',
      tmobile: 'tmomail.net',
      sprint: 'messaging.sprintpcs.com',
      us_cellular: 'email.uscc.net',
      boost: 'smsmyboostmobile.com',
      cricket: 'sms.cricketwireless.net',
      metro_pcs: 'mymetropcs.com',
      other: null, // Cannot send to unknown carriers
    };

    // SMS character limits
    this.SMS_LIMIT = 160; // Standard SMS limit
    this.SMS_GATEWAY_LIMIT = 140; // Email-to-SMS gateways often have lower limits

    this.initializeProvider();
  }

  initializeProvider() {
    if (this.provider === 'twilio') {
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      this.twilioNumber = process.env.TWILIO_PHONE_NUMBER;

      if (!accountSid || !authToken || !this.twilioNumber) {
        console.warn('Twilio credentials not configured. SMS sending will fail.');
      } else {
        // Initialize Twilio client when needed
        this.twilioClient = require('twilio')(accountSid, authToken);
        console.log('Twilio SMS service initialized');
      }
    } else {
      console.log('Email-to-SMS gateway service initialized');
    }
  }

  /**
   * Send an SMS message
   * @param {Object} options - SMS options
   * @param {string} options.phone - 10-digit phone number
   * @param {string} options.carrier - Carrier identifier
   * @param {string} options.message - SMS message text
   * @returns {Promise<Object>} - Send result
   */
  async sendSMS({ phone, carrier, message }) {
    // Validate inputs
    if (!phone || !/^\d{10}$/.test(phone)) {
      throw new Error('Invalid phone number. Must be 10 digits.');
    }

    if (!message || message.trim().length === 0) {
      throw new Error('Message cannot be empty');
    }

    try {
      if (this.provider === 'twilio') {
        return await this.sendViaTwilio({ phone, message });
      } else {
        return await this.sendViaEmailGateway({ phone, carrier, message });
      }
    } catch (error) {
      console.error('SMS sending failed:', error);
      throw error;
    }
  }

  /**
   * Send SMS via email-to-SMS gateway (free)
   */
  async sendViaEmailGateway({ phone, carrier, message }) {
    // Get gateway domain for carrier
    const gatewayDomain = this.carrierGateways[carrier];

    if (!gatewayDomain) {
      throw new Error(`Invalid or unsupported carrier: ${carrier}`);
    }

    // Construct email-to-SMS address
    const smsEmail = `${phone}@${gatewayDomain}`;

    // Truncate message to gateway limit
    const truncatedMessage = message.substring(0, this.SMS_GATEWAY_LIMIT);

    // Warn if message was truncated
    if (message.length > this.SMS_GATEWAY_LIMIT) {
      console.warn(
        `SMS message truncated from ${message.length} to ${this.SMS_GATEWAY_LIMIT} characters for ${smsEmail}`
      );
    }

    // Send via email service with plain text only
    const result = await emailService.sendEmail({
      to: smsEmail,
      subject: '', // Subject is often ignored or included in message
      text: truncatedMessage,
      html: `<pre>${truncatedMessage}</pre>`, // Wrap in pre to preserve formatting
    });

    console.log(`SMS sent via email gateway to ${phone} (${carrier})`);

    return {
      success: true,
      phone,
      carrier,
      provider: 'email-gateway',
      gateway: smsEmail,
      messageLength: truncatedMessage.length,
      truncated: message.length > this.SMS_GATEWAY_LIMIT,
    };
  }

  /**
   * Send SMS via Twilio (paid, professional)
   */
  async sendViaTwilio({ phone, message }) {
    if (!this.twilioClient) {
      throw new Error('Twilio client not initialized');
    }

    // Format phone number for Twilio (+1 prefix)
    const formattedPhone = `+1${phone}`;

    // Twilio handles message length automatically (concatenation)
    const twilioMessage = await this.twilioClient.messages.create({
      body: message,
      from: this.twilioNumber,
      to: formattedPhone,
    });

    console.log(`SMS sent via Twilio to ${phone}`, twilioMessage.sid);

    return {
      success: true,
      phone,
      provider: 'twilio',
      messageId: twilioMessage.sid,
      messageLength: message.length,
    };
  }

  /**
   * Get carrier gateway domain
   */
  getCarrierGateway(carrier) {
    return this.carrierGateways[carrier] || null;
  }

  /**
   * Get all supported carriers
   */
  getSupportedCarriers() {
    return Object.keys(this.carrierGateways).filter(
      (carrier) => carrier !== 'other'
    );
  }

  /**
   * Validate phone number format
   */
  isValidPhone(phone) {
    return /^\d{10}$/.test(phone);
  }

  /**
   * Get SMS character limit for current provider
   */
  getCharacterLimit() {
    return this.provider === 'twilio'
      ? this.SMS_LIMIT * 3 // Twilio supports concatenation
      : this.SMS_GATEWAY_LIMIT;
  }

  /**
   * Truncate message to fit within SMS limits
   */
  truncateMessage(message, suffix = '...') {
    const limit = this.getCharacterLimit();
    if (message.length <= limit) {
      return message;
    }

    return message.substring(0, limit - suffix.length) + suffix;
  }

  /**
   * Send bulk SMS messages
   * @param {Array} messages - Array of {phone, carrier, message}
   * @returns {Promise<Array>} - Array of send results
   */
  async sendBulk(messages) {
    const results = await Promise.allSettled(
      messages.map((msg) => this.sendSMS(msg))
    );

    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          success: false,
          phone: messages[index].phone,
          error: result.reason.message,
        };
      }
    });
  }

  /**
   * Send a test SMS to verify configuration
   */
  async sendTestSMS(phone, carrier) {
    const message = `Avitar Platform SMS Test: Your SMS notifications are configured correctly. Provider: ${this.provider}`;

    return await this.sendSMS({ phone, carrier, message });
  }

  /**
   * Get provider info
   */
  getProviderInfo() {
    return {
      provider: this.provider,
      characterLimit: this.getCharacterLimit(),
      supportedCarriers: this.getSupportedCarriers(),
      cost: this.provider === 'twilio' ? 'Paid (~$0.0079/msg)' : 'Free',
      deliverySpeed:
        this.provider === 'twilio'
          ? 'Near-instant'
          : 'Variable (1-30 seconds)',
      deliveryConfirmation: this.provider === 'twilio',
    };
  }
}

// Export singleton instance
module.exports = new SMSGatewayService();
