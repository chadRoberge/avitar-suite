/**
 * Script to fix invalid zone data in land assessments
 * Run this once to clean up "true" values and other invalid ObjectIds
 */

const mongoose = require('mongoose');
require('dotenv').config();

async function fixInvalidZoneData() {
  try {
    // Connect to MongoDB
    await mongoose.connect(
      process.env.MONGODB_URI || 'mongodb://localhost:27017/avitar-suite',
    );
    console.log('✅ Connected to MongoDB');

    const LandAssessment = mongoose.model('LandAssessment');

    // Find all land assessments with invalid zone values
    const invalidAssessments = await LandAssessment.find({
      $or: [
        { zone: 'true' },
        { zone: 'false' },
        { zone: { $type: 'string', $not: { $regex: /^[0-9a-fA-F]{24}$/ } } },
      ],
    });

    console.log(
      `\n📊 Found ${invalidAssessments.length} land assessments with invalid zone values`,
    );

    if (invalidAssessments.length === 0) {
      console.log('✅ No invalid zone data found!');
      await mongoose.disconnect();
      return;
    }

    // Show some examples
    console.log('\n📋 Examples of invalid values:');
    invalidAssessments.slice(0, 5).forEach((assessment, index) => {
      console.log(
        `  ${index + 1}. Property ${assessment.property_id}: zone = "${assessment.zone}" (type: ${typeof assessment.zone})`,
      );
    });

    // Prompt for confirmation
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const answer = await new Promise((resolve) => {
      readline.question(
        '\n⚠️  Do you want to clear these invalid zone values? (yes/no): ',
        resolve,
      );
    });
    readline.close();

    if (answer.toLowerCase() !== 'yes') {
      console.log('❌ Operation cancelled');
      await mongoose.disconnect();
      return;
    }

    // Update all invalid zone values to null
    const result = await LandAssessment.updateMany(
      {
        $or: [
          { zone: 'true' },
          { zone: 'false' },
          { zone: { $type: 'string', $not: { $regex: /^[0-9a-fA-F]{24}$/ } } },
        ],
      },
      {
        $unset: { zone: '' }, // Remove the invalid zone field entirely
      },
    );

    console.log(`\n✅ Updated ${result.modifiedCount} land assessments`);
    console.log('✅ Invalid zone values have been cleared');
    console.log('ℹ️  Users will need to select valid zones from the dropdown');

    await mongoose.disconnect();
    console.log('\n✅ Done!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Run the script
fixInvalidZoneData();
