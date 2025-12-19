const QRCode = require('qrcode');
const storageService = require('../services/storageService');

/**
 * Generate a QR code for an inspection issue and upload to storage
 * @param {string} issueNumber - Issue number (YYMMDD-AHSLN3 format)
 * @param {Object} organizationData - Municipality and organization data for storage path
 * @returns {Promise<Object>} QR code info with storage URL
 */
async function generateIssueQRCode(issueNumber, organizationData = {}) {
  try {
    // Get domain from environment or use default
    const domain =
      process.env.APP_URL || process.env.VERCEL_URL || 'http://localhost:4200';

    // Construct the URL that the QR code will point to
    const municipalitySlug =
      organizationData.municipalitySlug || 'municipality';
    const issueUrl = `${domain}/m/${municipalitySlug}/building-permits/inspections/inspection-issue/${issueNumber}`;

    // Generate QR code as PNG buffer
    // Options:
    // - errorCorrectionLevel: 'H' (High) - allows 30% of image to be damaged
    // - type: 'png' - PNG format
    // - margin: 2 - quiet zone around QR code (in modules)
    // - width: 400 - size in pixels (large enough to scan easily)
    // - color: dark/light colors
    const qrCodeBuffer = await QRCode.toBuffer(issueUrl, {
      errorCorrectionLevel: 'H',
      type: 'png',
      margin: 2,
      width: 400,
      color: {
        dark: '#000000', // Black
        light: '#FFFFFF', // White
      },
    });

    // Generate storage path
    // Format: State/Municipality/building-permits/qr-codes/YYMMDD-AHSLN3.png
    const fileName = `${issueNumber}.png`;
    const storagePath = storageService.generateOrganizedPath(fileName, {
      state: organizationData.state,
      municipality: organizationData.municipality,
      municipalityId: organizationData.municipalityId,
      department: 'building-permits',
      folder: 'qr-codes',
    });

    // Upload to storage
    // Note: Using signed URLs instead of public visibility since QR codes are temporary
    // and bucket has uniform bucket-level access enabled
    const uploadResult = await storageService.uploadFile(
      qrCodeBuffer,
      storagePath,
      {
        contentType: 'image/png',
        visibility: 'private', // Use signed URL (valid for 7 days) instead of public
        issueNumber,
        generatedAt: new Date().toISOString(),
      },
    );

    return {
      issueNumber,
      issueUrl,
      qrCodeUrl: uploadResult.gcsUrl || uploadResult.localPath,
      storagePath,
      fileSize: uploadResult.fileSize,
    };
  } catch (error) {
    console.error('Error generating QR code:', error);
    throw new Error(`Failed to generate QR code: ${error.message}`);
  }
}

/**
 * Generate multiple QR codes in batch
 * @param {Array<string>} issueNumbers - Array of issue numbers
 * @param {Object} organizationData - Municipality and organization data
 * @returns {Promise<Array<Object>>} Array of QR code info objects
 */
async function generateBatchQRCodes(issueNumbers, organizationData = {}) {
  const results = [];
  const errors = [];

  // Process in parallel with a limit to avoid overwhelming the system
  const batchSize = 10;
  for (let i = 0; i < issueNumbers.length; i += batchSize) {
    const batch = issueNumbers.slice(i, i + batchSize);

    const batchPromises = batch.map(async (issueNumber) => {
      try {
        const result = await generateIssueQRCode(issueNumber, organizationData);
        results.push(result);
      } catch (error) {
        errors.push({
          issueNumber,
          error: error.message,
        });
      }
    });

    await Promise.all(batchPromises);
  }

  if (errors.length > 0) {
    console.warn(
      `Generated ${results.length} QR codes with ${errors.length} errors`,
    );
  }

  return {
    success: results,
    errors,
    totalGenerated: results.length,
    totalFailed: errors.length,
  };
}

/**
 * Regenerate a QR code for an existing issue
 * @param {string} issueNumber - Issue number
 * @param {Object} organizationData - Municipality and organization data
 * @returns {Promise<Object>} QR code info
 */
async function regenerateQRCode(issueNumber, organizationData = {}) {
  // Same as generateIssueQRCode - will overwrite existing file
  return generateIssueQRCode(issueNumber, organizationData);
}

/**
 * Delete a QR code image from storage (call after printing cards)
 * @param {string} storagePath - Storage path of the QR code image
 * @returns {Promise<void>}
 */
async function deleteQRCode(storagePath) {
  try {
    await storageService.deleteFile(storagePath);
    console.log(`✅ QR code deleted: ${storagePath}`);
  } catch (error) {
    console.error('Error deleting QR code:', error);
    throw new Error(`Failed to delete QR code: ${error.message}`);
  }
}

/**
 * Delete multiple QR codes in batch (call after printing batch)
 * @param {Array<string>} storagePaths - Array of storage paths
 * @returns {Promise<Object>} Delete results
 */
async function deleteBatchQRCodes(storagePaths) {
  const results = [];
  const errors = [];

  for (const storagePath of storagePaths) {
    try {
      await deleteQRCode(storagePath);
      results.push(storagePath);
    } catch (error) {
      errors.push({
        storagePath,
        error: error.message,
      });
    }
  }

  return {
    deleted: results.length,
    failed: errors.length,
    errors,
  };
}

/**
 * Delete QR codes for an array of issue numbers
 * @param {Array<string>} issueNumbers - Array of issue numbers
 * @param {Object} organizationData - Municipality data for generating storage paths
 * @returns {Promise<Object>} Delete results
 */
async function deleteQRCodesForIssues(issueNumbers, organizationData = {}) {
  const storagePaths = issueNumbers.map((issueNumber) => {
    const fileName = `${issueNumber}.png`;
    return storageService.generateOrganizedPath(fileName, {
      state: organizationData.state,
      municipality: organizationData.municipality,
      municipalityId: organizationData.municipalityId,
      department: 'building-permits',
      folder: 'qr-codes',
    });
  });

  return deleteBatchQRCodes(storagePaths);
}

module.exports = {
  generateIssueQRCode,
  generateBatchQRCodes,
  regenerateQRCode,
  deleteQRCode,
  deleteBatchQRCodes,
  deleteQRCodesForIssues,
};
