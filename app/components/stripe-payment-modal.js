import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import { getOwner } from '@ember/application';
import { loadStripe } from '@stripe/stripe-js';

export default class StripePaymentModalComponent extends Component {
  @service api;
  @service notifications;

  @tracked isProcessing = false;
  @tracked errorMessage = null;
  @tracked stripe = null;
  @tracked cardElement = null;
  @tracked paymentRequest = null;
  @tracked canMakePayment = false;
  @tracked prButton = null;
  @tracked isInitialized = false;

  /**
   * Args:
   * @arg {boolean} isOpen - Whether modal is visible
   * @arg {string} title - Modal title (e.g., "Upgrade to Premium")
   * @arg {string} description - Payment description
   * @arg {number} amount - Amount to charge (in dollars)
   * @arg {string} currency - Currency code (default: USD)
   * @arg {function} onClose - Called when modal closes
   * @arg {function} onSuccess - Called when payment succeeds
   * @arg {function} onPaymentMethodReady - Called with payment method when card is ready (subscription mode)
   * @arg {object} metadata - Additional metadata for the payment
   * @arg {string} clientSecret - Payment intent client secret (for destination charge payments)
   * @arg {string} stripeAccountId - Connected account ID (not used for destination charges, kept for future direct charge support)
   * @arg {boolean} isPermitPayment - Whether this is a permit payment (shows breakdown)
   * @arg {object} paymentBreakdown - Payment breakdown object (permitFee, processingFees, totalAmount) for permit payments
   *
   * Payment Modes:
   * 1. Subscription Mode: Only pass onPaymentMethodReady (no clientSecret) - creates payment method only
   * 2. Destination Charge Mode: Pass clientSecret - confirms payment intent created on platform with transfer_data
   * 3. Direct Charge Mode: Pass clientSecret + stripeAccountId - for future use with direct charges on connected accounts
   */

  get config() {
    return getOwner(this).resolveRegistration('config:environment');
  }

  constructor(owner, args) {
    super(owner, args);
    this.initializeStripe();
  }

  async initializeStripe() {
    try {
      // Get Stripe key from environment config
      const stripeKey = this.config.APP?.STRIPE_PUBLISHABLE_KEY;

      if (!stripeKey) {
        console.error('Stripe publishable key not configured');
        this.errorMessage = 'Payment system not configured';
        return;
      }

      this.stripe = await loadStripe(stripeKey);
      console.log('Stripe initialized successfully');

      // If modal is already open and waiting, initialize elements now
      if (this.args.isOpen && !this.isInitialized) {
        this.initializePaymentElements();
      }
    } catch (error) {
      console.error('Failed to initialize Stripe:', error);
      this.errorMessage = 'Failed to load payment form';
    }
  }

  // Initialize payment elements when modal opens
  @action
  initializePaymentElements(retryCount = 0) {
    if (this.isInitialized) return;

    // If Stripe isn't ready yet, retry later
    if (!this.stripe) {
      console.log('Stripe not ready, will retry when loaded...');
      return;
    }

    if (!this.args.isOpen) return;

    console.log('Initializing payment elements...');

    // Wait for DOM to be ready
    setTimeout(() => {
      const cardContainer = document.getElementById('card-element');

      // If DOM not ready yet, retry a few times
      if (!cardContainer && retryCount < 5) {
        console.log(
          `Card element not found, retrying... (${retryCount + 1}/5)`,
        );
        setTimeout(() => this.initializePaymentElements(retryCount + 1), 200);
        return;
      }

      this.initializePaymentRequest();
      this.mountCardElement();
      this.isInitialized = true;
    }, 200);
  }

  async initializePaymentRequest() {
    if (!this.stripe || !this.args.amount) return;

    // Create payment request for Apple Pay / Google Pay
    const paymentRequest = this.stripe.paymentRequest({
      country: 'US',
      currency: (this.args.currency || 'usd').toLowerCase(),
      total: {
        label: this.args.title || 'Payment',
        amount: Math.round(this.args.amount * 100), // Convert to cents
      },
      requestPayerName: true,
      requestPayerEmail: true,
    });

    // Check if Apple Pay or Google Pay is available
    const result = await paymentRequest.canMakePayment();

    if (result) {
      this.canMakePayment = true;
      this.paymentRequest = paymentRequest;

      // Mount payment request button
      setTimeout(() => {
        this.mountPaymentRequestButton();
      }, 100);

      // Handle payment method creation
      paymentRequest.on('paymentmethod', async (ev) => {
        this.isProcessing = true;

        try {
          // Call parent's success handler with payment method
          if (this.args.onPaymentMethodReady) {
            await this.args.onPaymentMethodReady(ev.paymentMethod);
          }

          // Complete the payment
          ev.complete('success');

          // Success notification
          this.notifications.success('Payment successful!');

          // Call success callback
          if (this.args.onSuccess) {
            this.args.onSuccess(ev.paymentMethod);
          }
        } catch (error) {
          console.error('Payment error:', error);
          ev.complete('fail');
          this.errorMessage =
            error.message || 'Payment failed. Please try again.';
          this.notifications.error(this.errorMessage);
        } finally {
          this.isProcessing = false;
        }
      });
    }
  }

  mountPaymentRequestButton() {
    if (!this.paymentRequest || this.prButton) return;

    const prButtonContainer = document.getElementById('payment-request-button');
    if (!prButtonContainer) return;

    const elements = this.stripe.elements();
    this.prButton = elements.create('paymentRequestButton', {
      paymentRequest: this.paymentRequest,
      style: {
        paymentRequestButton: {
          type: 'default', // or 'buy', 'donate'
          theme: 'dark', // or 'light', 'light-outline'
          height: '48px',
        },
      },
    });

    // Check if button can be mounted (browser supports it)
    this.paymentRequest.canMakePayment().then((result) => {
      if (result) {
        this.prButton.mount('#payment-request-button');
      }
    });
  }

  mountCardElement() {
    console.log('mountCardElement called', {
      hasStripe: !!this.stripe,
      hasCardElement: !!this.cardElement,
    });

    if (!this.stripe || this.cardElement) {
      console.log('Skipping mount - stripe or cardElement already exists');
      return;
    }

    const cardElementContainer = document.getElementById('card-element');
    if (!cardElementContainer) {
      console.log('Card element container not found in DOM');
      return;
    }

    console.log('Mounting Stripe card element...');
    const elements = this.stripe.elements();
    this.cardElement = elements.create('card', {
      style: {
        base: {
          fontSize: '16px',
          color: '#32325d',
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          '::placeholder': {
            color: '#aab7c4',
          },
        },
        invalid: {
          color: '#fa755a',
          iconColor: '#fa755a',
        },
      },
    });

    this.cardElement.mount('#card-element');
    console.log('Stripe card element mounted successfully');

    // Listen for errors
    this.cardElement.on('change', (event) => {
      if (event.error) {
        this.errorMessage = event.error.message;
      } else {
        this.errorMessage = null;
      }
    });
  }

  willDestroy() {
    super.willDestroy(...arguments);
    if (this.cardElement) {
      this.cardElement.unmount();
      this.cardElement.destroy();
      this.cardElement = null;
    }
    if (this.prButton) {
      this.prButton.unmount();
      this.prButton.destroy();
      this.prButton = null;
    }
  }

  get formattedAmount() {
    const amount = this.args.amount || 0;
    const currency = this.args.currency || 'USD';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
    }).format(amount);
  }

  @action
  async handleSubmit(event) {
    event.preventDefault();

    if (!this.stripe || !this.cardElement) {
      this.errorMessage = 'Payment form not ready';
      return;
    }

    this.isProcessing = true;
    this.errorMessage = null;

    try {
      // If clientSecret is provided, confirm the payment intent (destination charge mode)
      if (this.args.clientSecret) {
        const confirmOptions = {
          payment_method: {
            card: this.cardElement,
            billing_details: {
              email: this.args.billingEmail || '',
              name: this.args.billingName || '',
            },
          },
        };

        // For destination charges, do NOT pass stripeAccount
        // The payment intent was created on the platform account and will automatically
        // transfer to the connected account via transfer_data
        const { error, paymentIntent } = await this.stripe.confirmCardPayment(
          this.args.clientSecret,
          confirmOptions,
        );

        if (error) {
          this.errorMessage = error.message;
          this.isProcessing = false;
          return;
        }

        // Success notification
        this.notifications.success('Payment successful!');

        // Call success callback with payment intent
        if (this.args.onSuccess) {
          this.args.onSuccess(paymentIntent);
        }
      } else {
        // Original flow: Create payment method only (for subscriptions)
        const { error, paymentMethod } = await this.stripe.createPaymentMethod({
          type: 'card',
          card: this.cardElement,
          billing_details: {
            email: this.args.billingEmail || '',
            name: this.args.billingName || '',
          },
        });

        if (error) {
          this.errorMessage = error.message;
          this.isProcessing = false;
          return;
        }

        // Call parent's success handler with payment method
        if (this.args.onPaymentMethodReady) {
          await this.args.onPaymentMethodReady(paymentMethod);
        }

        // Success notification
        this.notifications.success('Payment successful!');

        // Call success callback
        if (this.args.onSuccess) {
          this.args.onSuccess(paymentMethod);
        }
      }
    } catch (error) {
      console.error('Payment error:', error);
      this.errorMessage = error.message || 'Payment failed. Please try again.';
      this.notifications.error(this.errorMessage);
    } finally {
      this.isProcessing = false;
    }
  }

  @action
  handleClose() {
    // Clean up Stripe elements
    if (this.cardElement) {
      this.cardElement.unmount();
      this.cardElement.destroy();
      this.cardElement = null;
    }
    if (this.prButton) {
      this.prButton.unmount();
      this.prButton.destroy();
      this.prButton = null;
    }

    // Reset initialization flag so modal can be re-opened
    this.isInitialized = false;
    this.canMakePayment = false;

    if (this.args.onClose) {
      this.args.onClose();
    }
  }

  @action
  stopPropagation(event) {
    event.stopPropagation();
  }
}
