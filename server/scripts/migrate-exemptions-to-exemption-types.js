#!/usr/bin/env node

/**
 * Migration script to move data from ExemptionsCreditsSettings to ExemptionType model
 * This script migrates existing exemption/credit data to the new structure
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const Municipality = require('../models/Municipality');
const ExemptionType = require('../models/ExemptionType');
const ExemptionsCreditsSettings = require('../models/ExemptionsCreditsSettings');

async function migrateExemptionsToExemptionTypes() {
  try {
    // Connect to MongoDB
    await mongoose.connect(
      process.env.MONGODB_URI || 'mongodb://localhost:27017/avitar-suite',
    );
    console.log('📊 Connected to MongoDB');

    // Get all municipalities
    const municipalities = await Municipality.find({ is_active: true });
    console.log(`📋 Found ${municipalities.length} active municipalities`);

    let totalMigrated = 0;
    let totalSkipped = 0;

    for (const municipality of municipalities) {
      console.log(`\\n🏛️  Processing municipality: ${municipality.name}`);

      // Get existing exemptions/credits settings for this municipality
      const settings = await ExemptionsCreditsSettings.findOne({
        municipalityId: municipality._id,
      });

      if (!settings) {
        console.log(`   ⏭️  No settings found, skipping`);
        continue;
      }

      let municipalityMigrated = 0;
      let municipalitySkipped = 0;

      // Define the exemption types to create/update
      const exemptionTypesData = [
        // Elderly exemptions
        {
          name: 'elderly_65_74',
          display_name: 'Elderly Exemption (65-74)',
          description:
            'Property tax exemption for elderly residents aged 65-74',
          category: 'elderly',
          subcategory: '65_74',
          exemption_type: 'exemption',
          default_exemption_value: settings.elderlyExemptions?.elderly6574 || 0,
          income_requirements: {
            has_income_limit: true,
            single_income_limit: settings.elderlyLimits?.singleIncomeLimit || 0,
            married_income_limit:
              settings.elderlyLimits?.marriedIncomeLimit || 0,
          },
          asset_requirements: {
            has_asset_limit: true,
            single_asset_limit: settings.elderlyLimits?.singleAssetLimit || 0,
            married_asset_limit: settings.elderlyLimits?.marriedAssetLimit || 0,
          },
          age_requirements: {
            min_age: 65,
            max_age: 74,
          },
          sort_order: 1,
        },
        {
          name: 'elderly_75_79',
          display_name: 'Elderly Exemption (75-79)',
          description:
            'Property tax exemption for elderly residents aged 75-79',
          category: 'elderly',
          subcategory: '75_79',
          exemption_type: 'exemption',
          default_exemption_value: settings.elderlyExemptions?.elderly7579 || 0,
          income_requirements: {
            has_income_limit: true,
            single_income_limit: settings.elderlyLimits?.singleIncomeLimit || 0,
            married_income_limit:
              settings.elderlyLimits?.marriedIncomeLimit || 0,
          },
          asset_requirements: {
            has_asset_limit: true,
            single_asset_limit: settings.elderlyLimits?.singleAssetLimit || 0,
            married_asset_limit: settings.elderlyLimits?.marriedAssetLimit || 0,
          },
          age_requirements: {
            min_age: 75,
            max_age: 79,
          },
          sort_order: 2,
        },
        {
          name: 'elderly_80_plus',
          display_name: 'Elderly Exemption (80+)',
          description:
            'Property tax exemption for elderly residents aged 80 and above',
          category: 'elderly',
          subcategory: '80_plus',
          exemption_type: 'exemption',
          default_exemption_value:
            settings.elderlyExemptions?.elderly80plus || 0,
          income_requirements: {
            has_income_limit: true,
            single_income_limit: settings.elderlyLimits?.singleIncomeLimit || 0,
            married_income_limit:
              settings.elderlyLimits?.marriedIncomeLimit || 0,
          },
          asset_requirements: {
            has_asset_limit: true,
            single_asset_limit: settings.elderlyLimits?.singleAssetLimit || 0,
            married_asset_limit: settings.elderlyLimits?.marriedAssetLimit || 0,
          },
          age_requirements: {
            min_age: 80,
          },
          sort_order: 3,
        },

        // Disability exemptions
        {
          name: 'blind_exemption',
          display_name: 'Blind Exemption',
          description: 'Property tax exemption for legally blind residents',
          category: 'blind',
          subcategory: 'standard',
          exemption_type: 'exemption',
          default_exemption_value:
            settings.disabilityExemptions?.blindExemption || 0,
          sort_order: 1,
        },
        {
          name: 'disabled_exemption',
          display_name: 'Physical Handicap Exemption',
          description:
            'Property tax exemption for residents with physical disabilities',
          category: 'disabled',
          subcategory: 'standard',
          exemption_type: 'exemption',
          default_exemption_value:
            settings.disabilityExemptions?.physicalHandicapExemption || 0,
          sort_order: 1,
        },

        // Veteran credits
        {
          name: 'veteran_standard',
          display_name: 'Standard Veteran Credit',
          description: 'Tax credit for qualified veterans',
          category: 'veteran',
          subcategory: 'standard',
          exemption_type: 'credit',
          default_credit_value: settings.veteranCredits?.veteranCredit || 0,
          sort_order: 1,
        },
        {
          name: 'veteran_all',
          display_name: 'All Veteran Credit',
          description:
            'Enhanced tax credit for veterans who served in multiple conflicts',
          category: 'veteran',
          subcategory: 'all',
          exemption_type: 'credit',
          default_credit_value: settings.veteranCredits?.allVeteranCredit || 0,
          sort_order: 2,
        },
        {
          name: 'veteran_disabled',
          display_name: 'Disabled Veteran Credit',
          description:
            'Tax credit for veterans with service-connected disabilities',
          category: 'veteran',
          subcategory: 'disabled',
          exemption_type: 'credit',
          default_credit_value:
            settings.veteranCredits?.disabledVeteranCredit || 0,
          sort_order: 3,
        },
        {
          name: 'veteran_surviving_spouse',
          display_name: 'Surviving Spouse Credit',
          description:
            'Tax credit for unmarried surviving spouses of qualified veterans',
          category: 'veteran',
          subcategory: 'surviving_spouse',
          exemption_type: 'credit',
          default_credit_value:
            settings.veteranCredits?.survivingSpouseCredit || 0,
          sort_order: 4,
        },
      ];

      // Create/update each exemption type
      for (const exemptionTypeData of exemptionTypesData) {
        // Check if exemption type already exists
        const existingExemptionType = await ExemptionType.findOne({
          municipality_id: municipality._id,
          name: exemptionTypeData.name,
        });

        if (existingExemptionType) {
          // Update existing exemption type with data from settings
          await ExemptionType.findByIdAndUpdate(existingExemptionType._id, {
            ...exemptionTypeData,
            municipality_id: municipality._id,
            is_active: true,
            updated_at: new Date(),
          });
          console.log(`   ✅ Updated: ${exemptionTypeData.display_name}`);
          municipalityMigrated++;
        } else {
          // Create new exemption type
          const newExemptionType = new ExemptionType({
            ...exemptionTypeData,
            municipality_id: municipality._id,
            is_active: true,
          });

          await newExemptionType.save();
          console.log(`   ✅ Created: ${exemptionTypeData.display_name}`);
          municipalityMigrated++;
        }
      }

      console.log(
        `   📊 Municipality Summary: ${municipalityMigrated} migrated, ${municipalitySkipped} skipped`,
      );
      totalMigrated += municipalityMigrated;
      totalSkipped += municipalitySkipped;
    }

    console.log(`\\n🎉 Migration Complete!`);
    console.log(`📈 Total Results:`);
    console.log(`   ✅ Migrated: ${totalMigrated} exemption types`);
    console.log(`   ⏭️  Skipped: ${totalSkipped} exemption types`);
    console.log(`   🏛️  Municipalities processed: ${municipalities.length}`);
  } catch (error) {
    console.error('❌ Error during migration:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
    process.exit(0);
  }
}

// Handle command line arguments
const args = process.argv.slice(2);
const shouldRun = args.includes('--run') || args.includes('-r');

if (!shouldRun) {
  console.log('🚨 ExemptionsCreditsSettings to ExemptionType Migration Script');
  console.log(
    '📋 This script will migrate data from ExemptionsCreditsSettings to ExemptionType model',
  );
  console.log('');
  console.log('📝 Migration will:');
  console.log(
    '   • Create ExemptionType records from existing ExemptionsCreditsSettings',
  );
  console.log('   • Preserve all amounts, limits, and configuration data');
  console.log(
    '   • Update existing ExemptionType records if they already exist',
  );
  console.log('   • Set proper qualification criteria and requirements');
  console.log('');
  console.log(
    '⚠️  This migration is designed to be safe and can be run multiple times.',
  );
  console.log('');
  console.log('🚀 To run: node migrate-exemptions-to-exemption-types.js --run');
  process.exit(0);
}

// Run the migration
migrateExemptionsToExemptionTypes();
