const mongoose = require('mongoose');
const InspectionIssue = require('../models/InspectionIssue');
const qrCodeGenerator = require('./qr-code-generator');

/**
 * Generate a unique 6-character alphanumeric code
 * Uses: A-Z (26) + 0-9 (10) = 36 characters
 * @returns {string} 6-character code (e.g., "A1B2C3")
 */
function generateUniqueCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Generate issue number in YYMMDD-AHSLN3 format
 * @param {Date} date - Date for issue number (defaults to today)
 * @returns {string} Issue number (e.g., "251215-A1B2C3")
 */
function generateIssueNumber(date = new Date()) {
  // Format: YYMMDD
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const datePrefix = `${year}${month}${day}`;

  // Generate unique 6-char code
  const uniqueCode = generateUniqueCode();

  return `${datePrefix}-${uniqueCode}`;
}

/**
 * Check if an issue number already exists
 * @param {string} issueNumber - Issue number to check
 * @returns {Promise<boolean>} True if exists
 */
async function issueNumberExists(issueNumber) {
  const existing = await InspectionIssue.findOne({ issueNumber });
  return !!existing;
}

/**
 * Generate a batch of unique issue numbers
 * @param {number} quantity - Number of issue numbers to generate
 * @param {Date} date - Date for issue numbers (defaults to today)
 * @param {number} maxRetries - Max attempts to generate unique number (default: 10)
 * @returns {Promise<Array<string>>} Array of unique issue numbers
 */
async function generateUniqueIssueNumbers(
  quantity,
  date = new Date(),
  maxRetries = 10,
) {
  const issueNumbers = new Set();

  while (issueNumbers.size < quantity) {
    let attempts = 0;
    let issueNumber;
    let isUnique = false;

    // Generate unique number with collision detection
    while (!isUnique && attempts < maxRetries) {
      issueNumber = generateIssueNumber(date);

      // Check against batch (in-memory check)
      if (issueNumbers.has(issueNumber)) {
        attempts++;
        continue;
      }

      // Check against database
      const exists = await issueNumberExists(issueNumber);
      if (exists) {
        attempts++;
        continue;
      }

      isUnique = true;
    }

    if (!isUnique) {
      throw new Error(
        `Failed to generate unique issue number after ${maxRetries} attempts`,
      );
    }

    issueNumbers.add(issueNumber);
  }

  return Array.from(issueNumbers);
}

/**
 * Generate a batch of inspection issue cards
 * @param {Object} options - Batch generation options
 * @param {string} options.municipalityId - Municipality ID
 * @param {number} options.quantity - Number of cards to generate
 * @param {Object} options.organizationData - Organization data for QR codes
 * @param {string} options.createdBy - User ID who created the batch
 * @param {Date} options.date - Date for issue numbers (optional, defaults to today)
 * @returns {Promise<Object>} Batch generation result
 */
async function generateBatch(options) {
  const {
    municipalityId,
    quantity,
    organizationData = {},
    createdBy,
    date = new Date(),
  } = options;

  // Validation
  if (!municipalityId) {
    throw new Error('Municipality ID is required');
  }
  if (!quantity || quantity < 1 || quantity > 1000) {
    throw new Error('Quantity must be between 1 and 1000');
  }

  try {
    // Generate unique batch ID
    const batchId = new mongoose.Types.ObjectId();

    console.log(`📦 Generating batch of ${quantity} inspection issue cards...`);

    // Step 1: Generate unique issue numbers
    console.log('   1️⃣  Generating unique issue numbers...');
    const issueNumbers = await generateUniqueIssueNumbers(quantity, date);
    console.log(`   ✅ Generated ${issueNumbers.length} unique issue numbers`);

    // Step 2: Create InspectionIssue records in pending status
    console.log('   2️⃣  Creating database records...');
    const issueRecords = issueNumbers.map((issueNumber) => ({
      issueNumber,
      municipalityId,
      // These will be filled in when the card is scanned and associated with a permit
      permitId: null,
      propertyId: null,
      inspectionId: null,
      status: 'pending',
      batchId,
      createdBy: createdBy || null,
      history: [
        {
          action: 'card_generated',
          performedBy: createdBy,
          performedAt: new Date(),
          details: {
            batchId: batchId.toString(),
            generatedAt: new Date(),
          },
        },
      ],
    }));

    // Bulk insert - but we need to handle the fact that permitId and propertyId are required
    // We'll create them one by one and catch errors
    const createdIssues = [];
    const errors = [];

    for (const record of issueRecords) {
      try {
        // Create a special placeholder for batch-generated issues
        // We'll use a temporary ObjectId that indicates it's pending assignment
        const tempObjectId = new mongoose.Types.ObjectId();

        const issue = new InspectionIssue({
          ...record,
          permitId: tempObjectId, // Temporary - will be updated when scanned
          propertyId: tempObjectId, // Temporary - will be updated when scanned
        });

        await issue.save();
        createdIssues.push(issue);
      } catch (error) {
        errors.push({
          issueNumber: record.issueNumber,
          error: error.message,
        });
      }
    }

    if (errors.length > 0) {
      console.warn(`   ⚠️  ${errors.length} records failed to create:`, errors);
    }

    console.log(`   ✅ Created ${createdIssues.length} database records`);

    // Step 3: Generate QR codes
    console.log('   3️⃣  Generating QR codes...');
    const qrResult = await qrCodeGenerator.generateBatchQRCodes(
      issueNumbers,
      organizationData,
    );

    console.log(`   ✅ Generated ${qrResult.totalGenerated} QR codes`);
    if (qrResult.totalFailed > 0) {
      console.warn(
        `   ⚠️  ${qrResult.totalFailed} QR codes failed to generate`,
      );
    }

    // Step 4: Update InspectionIssue records with QR code URLs
    console.log('   4️⃣  Updating records with QR code URLs...');
    const updates = qrResult.success.map((qr) =>
      InspectionIssue.updateOne(
        { issueNumber: qr.issueNumber },
        { $set: { qrCodeUrl: qr.qrCodeUrl } },
      ),
    );
    await Promise.all(updates);
    console.log(`   ✅ Updated ${updates.length} records with QR URLs`);

    console.log('   🎉 Batch generation complete!\n');

    // Return batch metadata
    return {
      batchId: batchId.toString(),
      municipalityId,
      quantity: createdIssues.length,
      issueNumbers,
      qrCodes: qrResult.success,
      errors: {
        database: errors,
        qrGeneration: qrResult.errors,
      },
      generatedAt: new Date(),
      createdBy,
      // For cleanup after printing
      storagePaths: qrResult.success.map((qr) => qr.storagePath),
    };
  } catch (error) {
    console.error('❌ Batch generation failed:', error);
    throw new Error(`Batch generation failed: ${error.message}`);
  }
}

/**
 * Get batch details and all associated issues
 * @param {string} batchId - Batch ID
 * @returns {Promise<Object>} Batch details with issues
 */
async function getBatchDetails(batchId) {
  const issues = await InspectionIssue.find({
    batchId: new mongoose.Types.ObjectId(batchId),
    isActive: true,
  }).sort({ issueNumber: 1 });

  if (issues.length === 0) {
    throw new Error('Batch not found');
  }

  // Count by status
  const statusCounts = issues.reduce((acc, issue) => {
    acc[issue.status] = (acc[issue.status] || 0) + 1;
    return acc;
  }, {});

  return {
    batchId,
    totalCards: issues.length,
    statusCounts,
    issues: issues.map((issue) => ({
      issueNumber: issue.issueNumber,
      status: issue.status,
      qrCodeUrl: issue.qrCodeUrl,
      permitId: issue.permitId,
      createdAt: issue.createdAt,
    })),
    generatedAt: issues[0].createdAt,
  };
}

/**
 * Delete a batch and all its QR codes
 * @param {string} batchId - Batch ID
 * @param {Object} organizationData - Organization data for storage paths
 * @returns {Promise<Object>} Deletion result
 */
async function deleteBatch(batchId, organizationData = {}) {
  // Find all issues in batch
  const issues = await InspectionIssue.find({
    batchId: new mongoose.Types.ObjectId(batchId),
    isActive: true,
  });

  if (issues.length === 0) {
    throw new Error('Batch not found');
  }

  // Only allow deletion if all cards are still in pending status
  const nonPendingCards = issues.filter((issue) => issue.status !== 'pending');
  if (nonPendingCards.length > 0) {
    throw new Error(
      `Cannot delete batch: ${nonPendingCards.length} cards have been used`,
    );
  }

  const issueNumbers = issues.map((issue) => issue.issueNumber);

  // Delete QR codes from storage
  const qrDeleteResult = await qrCodeGenerator.deleteQRCodesForIssues(
    issueNumbers,
    organizationData,
  );

  // Soft delete InspectionIssue records
  await InspectionIssue.updateMany(
    { batchId: new mongoose.Types.ObjectId(batchId) },
    { $set: { isActive: false, deletedAt: new Date() } },
  );

  return {
    batchId,
    cardsDeleted: issues.length,
    qrCodesDeleted: qrDeleteResult.deleted,
    qrCodesFailed: qrDeleteResult.failed,
  };
}

/**
 * Mark batch as printed (for cleanup purposes)
 * Deletes QR code images from storage after successful printing
 * @param {string} batchId - Batch ID
 * @param {Object} organizationData - Organization data for storage paths
 * @returns {Promise<Object>} Cleanup result
 */
async function markBatchAsPrinted(batchId, organizationData = {}) {
  const issues = await InspectionIssue.find({
    batchId: new mongoose.Types.ObjectId(batchId),
    isActive: true,
  });

  if (issues.length === 0) {
    throw new Error('Batch not found');
  }

  const issueNumbers = issues.map((issue) => issue.issueNumber);

  // Delete QR codes from storage to save space
  const deleteResult = await qrCodeGenerator.deleteQRCodesForIssues(
    issueNumbers,
    organizationData,
  );

  // Update issues to mark QR codes as deleted
  await InspectionIssue.updateMany(
    { batchId: new mongoose.Types.ObjectId(batchId) },
    {
      $set: {
        qrCodeUrl: null, // Clear URL since file is deleted
        'history.$[].printed': true, // Mark as printed in history
      },
    },
  );

  return {
    batchId,
    qrCodesDeleted: deleteResult.deleted,
    qrCodesFailed: deleteResult.failed,
    message: `Batch marked as printed and ${deleteResult.deleted} QR code images deleted from storage`,
  };
}

module.exports = {
  generateIssueNumber,
  generateUniqueIssueNumbers,
  generateBatch,
  getBatchDetails,
  deleteBatch,
  markBatchAsPrinted,
};
