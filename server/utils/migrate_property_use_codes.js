const mongoose = require('mongoose');
const LandAssessment = require('../models/LandAssessment');
require('dotenv').config();

/**
 * Migration script to populate property_use_code from first land detail line
 *
 * This script:
 * 1. Finds all land assessments
 * 2. Takes the land_use_type from the first land_use_details entry
 * 3. Sets it as the property_use_code (property-level classification)
 */

async function migratePropertyUseCodes() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find all land assessments
    const landAssessments = await LandAssessment.find({});
    console.log(`📊 Found ${landAssessments.length} land assessments\n`);

    let updated = 0;
    let skipped = 0;
    let noLandDetails = 0;

    for (const assessment of landAssessments) {
      // Skip if property_use_code is already set
      if (assessment.property_use_code) {
        skipped++;
        continue;
      }

      // Get the first land detail
      if (
        !assessment.land_use_details ||
        assessment.land_use_details.length === 0
      ) {
        noLandDetails++;
        console.log(`⚠️  No land details for assessment ${assessment._id}`);
        continue;
      }

      const firstLandDetail = assessment.land_use_details[0];
      const landUseType = firstLandDetail.land_use_type;

      if (!landUseType) {
        console.log(
          `⚠️  First land detail has no land_use_type for assessment ${assessment._id}`,
        );
        noLandDetails++;
        continue;
      }

      // Set property_use_code from first land detail
      assessment.property_use_code = landUseType;
      await assessment.save();
      updated++;

      if (updated % 100 === 0) {
        console.log(`✓ Processed ${updated} assessments...`);
      }
    }

    console.log('\n📈 Migration Summary:');
    console.log(`   ✅ Updated: ${updated}`);
    console.log(`   ⏭️  Skipped (already set): ${skipped}`);
    console.log(`   ⚠️  No land details: ${noLandDetails}`);
    console.log(`   📊 Total: ${landAssessments.length}`);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Run the migration
migratePropertyUseCodes()
  .then(() => {
    console.log('\n✅ Migration completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  });
