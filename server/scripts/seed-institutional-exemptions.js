#!/usr/bin/env node

/**
 * Script to seed institutional exemption types including solar, school dining, etc.
 * This script creates the new flexible exemption types that support different calculation methods
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const Municipality = require('../models/Municipality');
const ExemptionType = require('../models/ExemptionType');

async function seedInstitutionalExemptions() {
  try {
    // Connect to MongoDB
    await mongoose.connect(
      process.env.MONGODB_URI || 'mongodb://localhost:27017/avitar-suite',
    );
    console.log('📊 Connected to MongoDB');

    // Get all municipalities
    const municipalities = await Municipality.find({ is_active: true });
    console.log(`📋 Found ${municipalities.length} active municipalities`);

    let totalCreated = 0;
    let totalSkipped = 0;

    for (const municipality of municipalities) {
      console.log(`\n🏛️  Processing municipality: ${municipality.name}`);

      let municipalityCreated = 0;
      let municipalitySkipped = 0;

      // Define the new institutional exemption types
      const institutionalExemptionTypes = [
        // Solar exemptions
        {
          name: 'solar_renewable_energy',
          display_name: 'Solar/Renewable Energy Exemption',
          description:
            'Property tax exemption for solar panels and renewable energy systems',
          category: 'solar',
          subcategory: 'renewable_energy',
          exemption_type: 'exemption',
          calculation_method: 'user_entered_amount',
          min_exemption_amount: 0,
          max_exemption_amount: 50000,
          qualification_criteria:
            'Property must have qualifying solar panels or renewable energy systems installed',
          requires_documentation: true,
          required_documents: [
            'Solar panel installation certificate',
            'Renewable energy system documentation',
            'Property assessment showing system value',
          ],
          sort_order: 1,
        },
        {
          name: 'solar_percentage_exemption',
          display_name: 'Solar System Percentage Exemption',
          description: 'Percentage-based exemption for solar energy systems',
          category: 'solar',
          subcategory: 'percentage_based',
          exemption_type: 'exemption',
          calculation_method: 'user_entered_percentage',
          min_percentage: 0,
          max_percentage: 100,
          qualification_criteria:
            'Property must have qualifying solar energy systems',
          requires_documentation: true,
          required_documents: [
            'Solar panel installation certificate',
            'Energy system assessment documentation',
          ],
          sort_order: 2,
        },

        // School dining exemptions
        {
          name: 'school_dining_facility',
          display_name: 'School Dining Facility Exemption',
          description: 'Property tax exemption for school dining facilities',
          category: 'school_dining',
          subcategory: 'facility_based',
          exemption_type: 'exemption',
          calculation_method: 'user_entered_amount',
          min_exemption_amount: 0,
          max_exemption_amount: 100000,
          qualification_criteria:
            'Property must be used primarily for school dining services',
          requires_documentation: true,
          required_documents: [
            'School district verification',
            'Property use documentation',
            'Facility operating permits',
          ],
          sort_order: 1,
        },
        {
          name: 'school_dining_percentage',
          display_name: 'School Dining Percentage Exemption',
          description:
            'Percentage-based exemption for school dining operations',
          category: 'school_dining',
          subcategory: 'percentage_based',
          exemption_type: 'exemption',
          calculation_method: 'percentage_of_assessment',
          default_percentage: 100, // Full exemption by default
          qualification_criteria:
            'Property must be used for educational dining services',
          requires_documentation: true,
          required_documents: [
            'Educational institution verification',
            'Property use certification',
          ],
          sort_order: 2,
        },

        // Traditional institutional exemptions with new calculation methods
        {
          name: 'charitable_organization_amount',
          display_name: 'Charitable Organization - Amount Based',
          description: 'Fixed amount exemption for charitable organizations',
          category: 'charitable',
          subcategory: 'amount_based',
          exemption_type: 'exemption',
          calculation_method: 'user_entered_amount',
          min_exemption_amount: 0,
          max_exemption_amount: 250000,
          qualification_criteria:
            'Organization must have valid 501(c)(3) status and use property for charitable purposes',
          requires_documentation: true,
          required_documents: [
            '501(c)(3) determination letter',
            'Property use documentation',
            'Annual financial reports',
          ],
          sort_order: 1,
        },
        {
          name: 'charitable_organization_percentage',
          display_name: 'Charitable Organization - Percentage Based',
          description:
            'Percentage-based exemption for charitable organizations',
          category: 'charitable',
          subcategory: 'percentage_based',
          exemption_type: 'exemption',
          calculation_method: 'user_entered_percentage',
          min_percentage: 0,
          max_percentage: 100,
          qualification_criteria:
            'Organization must have valid 501(c)(3) status',
          requires_documentation: true,
          required_documents: [
            '501(c)(3) determination letter',
            'Property use documentation',
          ],
          sort_order: 2,
        },

        // Religious institutions
        {
          name: 'religious_institution_amount',
          display_name: 'Religious Institution - Amount Based',
          description: 'Fixed amount exemption for religious institutions',
          category: 'institutional',
          subcategory: 'religious_amount',
          exemption_type: 'exemption',
          calculation_method: 'user_entered_amount',
          min_exemption_amount: 0,
          max_exemption_amount: 500000,
          qualification_criteria:
            'Property must be used primarily for religious worship and activities',
          requires_documentation: true,
          required_documents: [
            'Religious organization documentation',
            'Property use certification',
            'Tax-exempt status verification',
          ],
          sort_order: 1,
        },
        {
          name: 'religious_institution_percentage',
          display_name: 'Religious Institution - Percentage Based',
          description: 'Percentage-based exemption for religious institutions',
          category: 'institutional',
          subcategory: 'religious_percentage',
          exemption_type: 'exemption',
          calculation_method: 'percentage_of_assessment',
          default_percentage: 100, // Full exemption by default
          qualification_criteria:
            'Property must be used for religious purposes',
          requires_documentation: true,
          required_documents: [
            'Religious organization documentation',
            'Tax-exempt status verification',
          ],
          sort_order: 2,
        },

        // Educational institutions
        {
          name: 'educational_institution_amount',
          display_name: 'Educational Institution - Amount Based',
          description: 'Fixed amount exemption for educational institutions',
          category: 'institutional',
          subcategory: 'educational_amount',
          exemption_type: 'exemption',
          calculation_method: 'user_entered_amount',
          min_exemption_amount: 0,
          max_exemption_amount: 1000000,
          qualification_criteria:
            'Property must be used primarily for educational purposes',
          requires_documentation: true,
          required_documents: [
            'Educational institution accreditation',
            'Property use documentation',
            'Non-profit status verification',
          ],
          sort_order: 3,
        },
        {
          name: 'educational_institution_percentage',
          display_name: 'Educational Institution - Percentage Based',
          description:
            'Percentage-based exemption for educational institutions',
          category: 'institutional',
          subcategory: 'educational_percentage',
          exemption_type: 'exemption',
          calculation_method: 'percentage_of_assessment',
          default_percentage: 100, // Full exemption by default
          qualification_criteria:
            'Property must be used for educational purposes',
          requires_documentation: true,
          required_documents: [
            'Educational institution accreditation',
            'Non-profit status verification',
          ],
          sort_order: 4,
        },
      ];

      // Create/update each exemption type
      for (const exemptionTypeData of institutionalExemptionTypes) {
        // Check if exemption type already exists
        const existingExemptionType = await ExemptionType.findOne({
          municipality_id: municipality._id,
          name: exemptionTypeData.name,
        });

        if (existingExemptionType) {
          console.log(
            `   ⏭️  Skipped (exists): ${exemptionTypeData.display_name}`,
          );
          municipalitySkipped++;
        } else {
          // Create new exemption type
          const newExemptionType = new ExemptionType({
            ...exemptionTypeData,
            municipality_id: municipality._id,
            is_active: true,
          });

          await newExemptionType.save();
          console.log(
            `   ✅ Created: ${exemptionTypeData.display_name} (${exemptionTypeData.calculation_method})`,
          );
          municipalityCreated++;
        }
      }

      console.log(
        `   📊 Municipality Summary: ${municipalityCreated} created, ${municipalitySkipped} skipped`,
      );
      totalCreated += municipalityCreated;
      totalSkipped += municipalitySkipped;
    }

    console.log(`\n🎉 Seeding Complete!`);
    console.log(`📈 Total Results:`);
    console.log(`   ✅ Created: ${totalCreated} exemption types`);
    console.log(`   ⏭️  Skipped: ${totalSkipped} exemption types`);
    console.log(`   🏛️  Municipalities processed: ${municipalities.length}`);
  } catch (error) {
    console.error('❌ Error during seeding:', error);
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
  console.log('🚨 Institutional Exemption Types Seeding Script');
  console.log(
    '📋 This script will create new institutional exemption types with flexible calculation methods',
  );
  console.log('');
  console.log('📝 Script will create:');
  console.log(
    '   • Solar/renewable energy exemptions (amount and percentage based)',
  );
  console.log('   • School dining facility exemptions');
  console.log('   • Enhanced charitable organization exemptions');
  console.log(
    '   • Religious institution exemptions (amount and percentage based)',
  );
  console.log(
    '   • Educational institution exemptions (amount and percentage based)',
  );
  console.log('');
  console.log(
    '⚠️  This script will skip existing exemption types and only create new ones.',
  );
  console.log('');
  console.log('🚀 To run: node seed-institutional-exemptions.js --run');
  process.exit(0);
}

// Run the seeding
seedInstitutionalExemptions();
