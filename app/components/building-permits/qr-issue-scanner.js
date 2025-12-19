import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';
import { Html5Qrcode } from 'html5-qrcode';

/**
 * QR Issue Scanner Component
 *
 * Allows inspectors to scan QR codes on inspection issue cards
 * and link them to the current inspection.
 *
 * @param {Object} inspection - The current inspection object
 * @param {String} municipalityId - The municipality ID
 * @param {Function} onIssueLinked - Callback when an issue is successfully linked
 */
export default class QrIssueScannerComponent extends Component {
  @service api;
  @service notifications;

  @tracked isScanning = false;
  @tracked isProcessing = false;
  @tracked scanError = null;
  @tracked lastScannedCode = null;

  scanner = null;

  get inspection() {
    return this.args.inspection;
  }

  get municipalityId() {
    return this.args.municipalityId;
  }

  // Destination element for modal to render at document body level
  get destinationElement() {
    return document.body;
  }

  @action
  async startScanner() {
    this.isScanning = true;
    this.scanError = null;
    this.lastScannedCode = null;

    try {
      // Wait for the DOM element to be ready
      await new Promise((resolve) => setTimeout(resolve, 100));

      const scannerElement = document.getElementById('qr-reader');
      if (!scannerElement) {
        throw new Error('Scanner element not found');
      }

      this.scanner = new Html5Qrcode('qr-reader');

      const config = {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0,
      };

      await this.scanner.start(
        { facingMode: 'environment' }, // Use back camera
        config,
        (decodedText) => this.onScanSuccess(decodedText),
        () => {
          // QR code scanning failure - this fires continuously, so we ignore it
        },
      );
    } catch (error) {
      console.error('Error starting scanner:', error);
      this.scanError = this.getErrorMessage(error);
      this.isScanning = false;
    }
  }

  @action
  async stopScanner() {
    if (this.scanner) {
      try {
        await this.scanner.stop();
        this.scanner.clear();
      } catch (error) {
        console.error('Error stopping scanner:', error);
      }
      this.scanner = null;
    }
    this.isScanning = false;
    this.scanError = null;
  }

  @action
  async onScanSuccess(decodedText) {
    // Avoid processing if already processing or same code scanned
    if (this.isProcessing || this.lastScannedCode === decodedText) {
      return;
    }

    this.lastScannedCode = decodedText;
    this.isProcessing = true;

    // Stop the scanner while processing
    await this.stopScanner();

    try {
      // Extract issue number from the QR code URL
      // Expected format: https://domain/m/{slug}/building-permits/inspections/inspection-issue/{issueNumber}
      const issueNumber = this.extractIssueNumber(decodedText);

      if (!issueNumber) {
        throw new Error(
          'Invalid QR code. This does not appear to be an inspection issue card.',
        );
      }

      // Link the issue to this inspection
      await this.linkIssueToInspection(issueNumber);
    } catch (error) {
      console.error('Error processing QR code:', error);
      this.scanError = error.message || 'Failed to process QR code';
      this.notifications.error(this.scanError);
    } finally {
      this.isProcessing = false;
    }
  }

  extractIssueNumber(url) {
    // Try to extract issue number from URL
    // Pattern: /inspection-issue/{issueNumber} where issueNumber is YYMMDD-AHSLN3
    const urlPattern = /inspection-issue\/(\d{6}-[A-Z0-9]{6})/i;
    const match = url.match(urlPattern);

    if (match && match[1]) {
      return match[1].toUpperCase();
    }

    // Also try direct issue number format (in case QR contains just the number)
    const directPattern = /^(\d{6}-[A-Z0-9]{6})$/i;
    const directMatch = url.match(directPattern);

    if (directMatch && directMatch[1]) {
      return directMatch[1].toUpperCase();
    }

    return null;
  }

  async linkIssueToInspection(issueNumber) {
    const response = await this.api.post(
      `/municipalities/${this.municipalityId}/inspection-issues/${issueNumber}/link`,
      {
        inspectionId: this.inspection._id,
        permitId: this.inspection.permitId?._id || this.inspection.permitId,
        propertyId:
          this.inspection.propertyId?._id || this.inspection.propertyId,
      },
    );

    this.notifications.success(
      `Issue card ${issueNumber} linked to this inspection`,
    );

    // Call the callback to refresh the parent
    if (this.args.onIssueLinked) {
      this.args.onIssueLinked(response.issue);
    }
  }

  getErrorMessage(error) {
    if (error.name === 'NotAllowedError') {
      return 'Camera access was denied. Please allow camera access to scan QR codes.';
    }
    if (error.name === 'NotFoundError') {
      return 'No camera found on this device.';
    }
    if (error.name === 'NotReadableError') {
      return 'Camera is already in use by another application.';
    }
    return error.message || 'Failed to start camera';
  }

  @action
  stopPropagation(event) {
    event.stopPropagation();
  }

  willDestroy() {
    super.willDestroy();
    this.stopScanner();
  }
}
