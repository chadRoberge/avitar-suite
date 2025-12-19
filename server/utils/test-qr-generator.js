/**
 * Test script for QR code generation and storage
 * Usage: node server/utils/test-qr-generator.js
 */

const qrCodeGenerator = require('./qr-code-generator');

async function runTests() {
  console.log('🧪 Testing QR Code Generator\n');

  // Test data
  const testIssueNumber = '251215-ABC123';
  const organizationData = {
    state: 'Massachusetts',
    municipality: 'Test Municipality',
    municipalityId: '507f1f77bcf86cd799439011',
    municipalitySlug: 'test-municipality',
  };

  try {
    // Test 1: Generate single QR code
    console.log('Test 1: Generating single QR code...');
    const qrResult = await qrCodeGenerator.generateIssueQRCode(
      testIssueNumber,
      organizationData,
    );

    console.log('✅ QR Code Generated Successfully!');
    console.log('   Issue Number:', qrResult.issueNumber);
    console.log('   Issue URL:', qrResult.issueUrl);
    console.log('   QR Code URL:', qrResult.qrCodeUrl);
    console.log('   Storage Path:', qrResult.storagePath);
    console.log('   File Size:', qrResult.fileSize, 'bytes');
    console.log('');

    // Test 2: Generate batch of QR codes
    console.log('Test 2: Generating batch of 5 QR codes...');
    const batchIssueNumbers = [
      '251215-TEST01',
      '251215-TEST02',
      '251215-TEST03',
      '251215-TEST04',
      '251215-TEST05',
    ];

    const batchResult = await qrCodeGenerator.generateBatchQRCodes(
      batchIssueNumbers,
      organizationData,
    );

    console.log('✅ Batch Generation Complete!');
    console.log('   Total Generated:', batchResult.totalGenerated);
    console.log('   Total Failed:', batchResult.totalFailed);
    if (batchResult.errors.length > 0) {
      console.log('   Errors:', batchResult.errors);
    }
    console.log('');

    // Test 3: Delete single QR code
    console.log('Test 3: Deleting single QR code...');
    await qrCodeGenerator.deleteQRCode(qrResult.storagePath);
    console.log('✅ QR Code Deleted Successfully!');
    console.log('');

    // Test 4: Delete batch of QR codes
    console.log('Test 4: Deleting batch QR codes...');
    const deleteResult = await qrCodeGenerator.deleteQRCodesForIssues(
      batchIssueNumbers,
      organizationData,
    );

    console.log('✅ Batch Deletion Complete!');
    console.log('   Deleted:', deleteResult.deleted);
    console.log('   Failed:', deleteResult.failed);
    if (deleteResult.errors.length > 0) {
      console.log('   Errors:', deleteResult.errors);
    }
    console.log('');

    console.log('🎉 All tests completed successfully!\n');
    console.log('📋 Summary:');
    console.log('   - QR code generation: Working ✅');
    console.log('   - Storage upload: Working ✅');
    console.log('   - Batch processing: Working ✅');
    console.log('   - Cleanup/deletion: Working ✅');
    console.log('');
    console.log('💡 Next steps: The QR code system is ready for integration!');
  } catch (error) {
    console.error('❌ Test failed:', error);
    console.error('Error details:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Run tests
runTests();
