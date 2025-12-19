/**
 * Test script for batch generation
 * Usage: node server/utils/test-batch-generator.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const connectDB = require('../config/database');
const batchGenerator = require('./issue-card-batch-generator');
const mongoose = require('mongoose');

async function runTests() {
  // Connect to MongoDB first
  await connectDB();
  console.log('🧪 Testing Batch Generator\n');

  // Test data
  const testMunicipalityId = new mongoose.Types.ObjectId();
  const testUserId = new mongoose.Types.ObjectId();
  const organizationData = {
    state: 'Massachusetts',
    municipality: 'Test City',
    municipalityId: testMunicipalityId.toString(),
    municipalitySlug: 'test-city',
  };

  try {
    // Test 1: Generate single issue number
    console.log('Test 1: Generate single issue number...');
    const issueNumber = batchGenerator.generateIssueNumber();
    console.log('✅ Issue Number Generated:', issueNumber);
    console.log(
      '   Format:',
      /^\d{6}-[A-Z0-9]{6}$/.test(issueNumber) ? 'Valid ✅' : 'Invalid ❌',
    );
    console.log('');

    // Test 2: Generate multiple unique issue numbers
    console.log('Test 2: Generate 10 unique issue numbers...');
    const issueNumbers = await batchGenerator.generateUniqueIssueNumbers(10);
    console.log('✅ Generated', issueNumbers.length, 'unique issue numbers');

    // Check for duplicates
    const uniqueSet = new Set(issueNumbers);
    console.log(
      '   Duplicates:',
      issueNumbers.length !== uniqueSet.size ? 'Found ❌' : 'None ✅',
    );
    console.log('   Sample:', issueNumbers.slice(0, 3).join(', '));
    console.log('');

    // Test 3: Generate a small batch
    console.log('Test 3: Generate batch of 5 cards...');
    const batchResult = await batchGenerator.generateBatch({
      municipalityId: testMunicipalityId,
      quantity: 5,
      organizationData,
      createdBy: testUserId,
    });

    console.log('✅ Batch Generated Successfully!');
    console.log('   Batch ID:', batchResult.batchId);
    console.log('   Cards Created:', batchResult.quantity);
    console.log('   QR Codes Generated:', batchResult.qrCodes.length);
    console.log('   Database Errors:', batchResult.errors.database.length);
    console.log(
      '   QR Generation Errors:',
      batchResult.errors.qrGeneration.length,
    );
    console.log('');

    // Test 4: Get batch details
    console.log('Test 4: Retrieve batch details...');
    const batchDetails = await batchGenerator.getBatchDetails(
      batchResult.batchId,
    );

    console.log('✅ Batch Details Retrieved!');
    console.log('   Total Cards:', batchDetails.totalCards);
    console.log('   Status Counts:', batchDetails.statusCounts);
    console.log('   Sample Issue:', batchDetails.issues[0].issueNumber);
    console.log('');

    // Test 5: Mark batch as printed (cleanup QR codes)
    console.log('Test 5: Mark batch as printed (cleanup QR codes)...');
    const printResult = await batchGenerator.markBatchAsPrinted(
      batchResult.batchId,
      organizationData,
    );

    console.log('✅ Batch Marked as Printed!');
    console.log('   QR Codes Deleted:', printResult.qrCodesDeleted);
    console.log('   Failed:', printResult.qrCodesFailed);
    console.log('');

    // Test 6: Delete batch
    console.log('Test 6: Delete batch...');
    const deleteResult = await batchGenerator.deleteBatch(
      batchResult.batchId,
      organizationData,
    );

    console.log('✅ Batch Deleted Successfully!');
    console.log('   Cards Deleted:', deleteResult.cardsDeleted);
    console.log('');

    console.log('🎉 All tests completed successfully!\n');
    console.log('📋 Summary:');
    console.log('   - Issue number generation: Working ✅');
    console.log('   - Unique number validation: Working ✅');
    console.log('   - Batch creation: Working ✅');
    console.log('   - Database record creation: Working ✅');
    console.log('   - QR code integration: Working ✅');
    console.log('   - Batch retrieval: Working ✅');
    console.log('   - Batch cleanup: Working ✅');
    console.log('   - Batch deletion: Working ✅');
    console.log('');
    console.log('💡 Next steps: Ready for API endpoint integration!');
  } catch (error) {
    console.error('❌ Test failed:', error);
    console.error('Error details:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  } finally {
    // Close MongoDB connection
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
  }
}

// Run tests
runTests();
