const mongoose = require('mongoose');
const LandAssessment = require('../models/LandAssessment');
const LandUseDetail = require('../models/LandUseDetail');
require('dotenv').config();

/**
 * Migration script to convert land use strings to ObjectId references
 *
 * This script:
 * 1. Maps category abbreviations (RES, COM, etc.) to default land use detail codes
 * 2. Updates land_use_details with land_use_detail_id references
 * 3. Sets property_use_code to the specific code (R1, R1A, etc.)
 * 4. Sets property_use_category to the category (RES, COM, etc.)
 */

// Default mapping for categories to specific codes
const CATEGORY_TO_DEFAULT_CODE = {
  RES: 'R1', // Residential → Single Family Residential
  COM: 'CI', // Commercial → Commercial/Industrial
  IND: 'CI', // Industrial → Commercial/Industrial
  MXU: 'MXU', // Mixed Use → Mixed Use
  AG: 'R1', // Agricultural → Residential (fallback, adjust if you have AG codes)
  EX: 'EX-M', // Exempt → Exempt Municipal
  UTL: 'UTL', // Utility → Utility
};

// Map landUseType to category abbreviations
const LAND_USE_TYPE_TO_CATEGORY = {
  residential: 'RES',
  commercial: 'COM',
  industrial: 'IND',
  mixed_use: 'MXU',
  agricultural: 'AG',
  exempt: 'EX',
  utility: 'UTL',
};

async function migrateLandUseReferences() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // First, load all LandUseDetail documents into a map
    console.log('📚 Loading LandUseDetail codes...');
    const landUseDetails = await LandUseDetail.find({});
    const codeToIdMap = {};
    const codeToTypeMap = {};

    landUseDetails.forEach((detail) => {
      codeToIdMap[detail.code] = detail._id;
      codeToTypeMap[detail.code] = detail.landUseType;
    });

    console.log(`✅ Loaded ${landUseDetails.length} land use codes\n`);

    // Find all land assessments
    const landAssessments = await LandAssessment.find({});
    console.log(`📊 Found ${landAssessments.length} land assessments\n`);

    let updated = 0;
    let skipped = 0;
    let errors = 0;
    let noLandDetails = 0;

    for (const assessment of landAssessments) {
      try {
        let needsUpdate = false;

        // Skip if already has land_use_detail_id references
        const hasReferences = assessment.land_use_details?.some(
          (detail) => detail.land_use_detail_id,
        );

        if (
          hasReferences &&
          assessment.property_use_code &&
          assessment.property_use_category
        ) {
          skipped++;
          continue;
        }

        // Get the first land detail
        if (
          !assessment.land_use_details ||
          assessment.land_use_details.length === 0
        ) {
          noLandDetails++;
          continue;
        }

        const firstLandDetail = assessment.land_use_details[0];

        // Determine the land use code and category
        let landUseCode = firstLandDetail.land_use_code;
        let landUseCategory = firstLandDetail.land_use_type; // This is currently "RES", "COM", etc.

        // If we don't have a specific code, map the category to default code
        if (!landUseCode || !codeToIdMap[landUseCode]) {
          const defaultCode = CATEGORY_TO_DEFAULT_CODE[landUseCategory];
          if (defaultCode && codeToIdMap[defaultCode]) {
            landUseCode = defaultCode;
            console.log(
              `  Mapping ${landUseCategory} → ${landUseCode} for property ${assessment.property_id}`,
            );
          } else {
            console.log(
              `  ⚠️  No mapping found for category "${landUseCategory}" on property ${assessment.property_id}`,
            );
            errors++;
            continue;
          }
        }

        // Update each land detail line with the reference
        assessment.land_use_details.forEach((detail) => {
          // If detail doesn't have land_use_code, use the default
          let detailCode = detail.land_use_code || landUseCode;
          let detailCategory = detail.land_use_type || landUseCategory;

          // Map to default if needed
          if (!codeToIdMap[detailCode]) {
            detailCode =
              CATEGORY_TO_DEFAULT_CODE[detailCategory] || landUseCode;
          }

          if (codeToIdMap[detailCode]) {
            detail.land_use_detail_id = codeToIdMap[detailCode];
            detail.land_use_code = detailCode;
            detail.land_use_type = detailCategory;
            needsUpdate = true;
          }
        });

        // Set property-level codes
        assessment.property_use_code = landUseCode;
        assessment.property_use_category = landUseCategory;

        if (needsUpdate) {
          await assessment.save();
          updated++;

          if (updated % 100 === 0) {
            console.log(`✓ Processed ${updated} assessments...`);
          }
        }
      } catch (error) {
        console.error(
          `❌ Error processing assessment ${assessment._id}:`,
          error.message,
        );
        errors++;
      }
    }

    console.log('\n📈 Migration Summary:');
    console.log(`   ✅ Updated: ${updated}`);
    console.log(`   ⏭️  Skipped (already migrated): ${skipped}`);
    console.log(`   ⚠️  No land details: ${noLandDetails}`);
    console.log(`   ❌ Errors: ${errors}`);
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
migrateLandUseReferences()
  .then(() => {
    console.log('\n✅ Migration completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  });
