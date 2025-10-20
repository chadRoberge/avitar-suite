#!/usr/bin/env node

/**
 * Seed script to create default exemption types for municipalities
 * This script creates standard exemption types including veteran, elderly, blind, and disabled exemptions
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const Municipality = require('../models/Municipality');
const ExemptionType = require('../models/ExemptionType');

// Default exemption types to create
const defaultExemptionTypes = [
  // Veteran Credits
  {
    name: 'veteran_standard',
    display_name: 'Standard Veteran Credit',
    description: 'Tax credit for qualified veterans',
    category: 'veteran',
    subcategory: 'standard',
    exemption_type: 'credit',
    is_multiple_allowed: true,
    default_exemption_value: 0,
    default_credit_value: 0, // Municipality-specific
    qualification_criteria:
      'Must be a qualified veteran with DD-214 or equivalent documentation',
    requires_documentation: true,
    required_documents: ['DD-214', 'Military Service Records'],
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
    is_multiple_allowed: true,
    default_exemption_value: 0,
    default_credit_value: 0,
    qualification_criteria:
      'Must be a qualified veteran with service in multiple conflicts or extended service',
    requires_documentation: true,
    required_documents: [
      'DD-214',
      'Military Service Records',
      'Campaign/Service Medals',
    ],
    sort_order: 2,
  },
  {
    name: 'veteran_disabled',
    display_name: 'Disabled Veteran Credit',
    description: 'Tax credit for veterans with service-connected disabilities',
    category: 'veteran',
    subcategory: 'disabled',
    exemption_type: 'credit',
    is_multiple_allowed: true,
    default_exemption_value: 0,
    default_credit_value: 0,
    qualification_criteria:
      'Must be a veteran with documented service-connected disability rating',
    requires_documentation: true,
    required_documents: [
      'DD-214',
      'VA Disability Rating Letter',
      'Medical Documentation',
    ],
    sort_order: 3,
  },
  {
    name: 'veteran_surviving_spouse',
    display_name: 'Surviving Spouse Veteran Credit',
    description:
      'Tax credit for unmarried surviving spouses of qualified veterans',
    category: 'veteran',
    subcategory: 'surviving_spouse',
    exemption_type: 'credit',
    is_multiple_allowed: false,
    default_exemption_value: 0,
    default_credit_value: 0,
    qualification_criteria:
      'Must be unmarried surviving spouse of qualified veteran',
    requires_documentation: true,
    required_documents: [
      'Death Certificate',
      'Marriage Certificate',
      "Veteran's DD-214",
    ],
    sort_order: 4,
  },

  // Elderly Exemptions
  {
    name: 'elderly_65_74',
    display_name: 'Elderly Exemption (65-74)',
    description: 'Property tax exemption for elderly residents aged 65-74',
    category: 'elderly',
    subcategory: '65_74',
    exemption_type: 'exemption',
    is_multiple_allowed: false,
    default_exemption_value: 0,
    default_credit_value: 0,
    qualification_criteria:
      'Must be 65-74 years old and meet income and asset limits',
    requires_documentation: true,
    required_documents: [
      'Birth Certificate or Valid ID',
      'Income Documentation',
      'Asset Documentation',
    ],
    age_requirements: {
      min_age: 65,
      max_age: 74,
    },
    income_requirements: {
      has_income_limit: true,
    },
    asset_requirements: {
      has_asset_limit: true,
    },
    sort_order: 1,
  },
  {
    name: 'elderly_75_79',
    display_name: 'Elderly Exemption (75-79)',
    description: 'Property tax exemption for elderly residents aged 75-79',
    category: 'elderly',
    subcategory: '75_79',
    exemption_type: 'exemption',
    is_multiple_allowed: false,
    default_exemption_value: 0,
    default_credit_value: 0,
    qualification_criteria:
      'Must be 75-79 years old and meet income and asset limits',
    requires_documentation: true,
    required_documents: [
      'Birth Certificate or Valid ID',
      'Income Documentation',
      'Asset Documentation',
    ],
    age_requirements: {
      min_age: 75,
      max_age: 79,
    },
    income_requirements: {
      has_income_limit: true,
    },
    asset_requirements: {
      has_asset_limit: true,
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
    is_multiple_allowed: false,
    default_exemption_value: 0,
    default_credit_value: 0,
    qualification_criteria:
      'Must be 80 years or older and meet income and asset limits',
    requires_documentation: true,
    required_documents: [
      'Birth Certificate or Valid ID',
      'Income Documentation',
      'Asset Documentation',
    ],
    age_requirements: {
      min_age: 80,
    },
    income_requirements: {
      has_income_limit: true,
    },
    asset_requirements: {
      has_asset_limit: true,
    },
    sort_order: 3,
  },

  // Blind Exemptions
  {
    name: 'blind_exemption',
    display_name: 'Blind Exemption',
    description: 'Property tax exemption for legally blind residents',
    category: 'blind',
    subcategory: 'standard',
    exemption_type: 'exemption',
    is_multiple_allowed: false,
    default_exemption_value: 0,
    default_credit_value: 0,
    qualification_criteria: 'Must be legally blind with medical certification',
    requires_documentation: true,
    required_documents: [
      'Medical Certificate of Blindness',
      'Ophthalmologist Report',
    ],
    sort_order: 1,
  },

  // Disabled Exemptions
  {
    name: 'disabled_exemption',
    display_name: 'Disabled Exemption',
    description: 'Property tax exemption for disabled residents',
    category: 'disabled',
    subcategory: 'standard',
    exemption_type: 'exemption',
    is_multiple_allowed: false,
    default_exemption_value: 0,
    default_credit_value: 0,
    qualification_criteria:
      'Must have qualifying disability with medical documentation',
    requires_documentation: true,
    required_documents: ['Medical Documentation', 'Disability Certification'],
    sort_order: 1,
  },
  {
    name: 'disabled_permanent',
    display_name: 'Permanent Disability Exemption',
    description: 'Enhanced exemption for residents with permanent disabilities',
    category: 'disabled',
    subcategory: 'permanent',
    exemption_type: 'exemption',
    is_multiple_allowed: false,
    default_exemption_value: 0,
    default_credit_value: 0,
    qualification_criteria: 'Must have documented permanent disability status',
    requires_documentation: true,
    required_documents: [
      'Medical Documentation',
      'Permanent Disability Certification',
    ],
    sort_order: 2,
  },

  // Charitable/Institutional Exemptions
  {
    name: 'charitable_organization',
    display_name: 'Charitable Organization Exemption',
    description: 'Full exemption for qualified charitable organizations',
    category: 'charitable',
    subcategory: 'organization',
    exemption_type: 'exemption',
    is_multiple_allowed: false,
    default_exemption_value: 0,
    default_credit_value: 0,
    qualification_criteria:
      'Must be qualified 501(c)(3) charitable organization',
    requires_documentation: true,
    required_documents: [
      '501(c)(3) Determination Letter',
      'Articles of Incorporation',
    ],
    sort_order: 1,
  },
  {
    name: 'religious_organization',
    display_name: 'Religious Organization Exemption',
    description: 'Exemption for qualified religious organizations',
    category: 'institutional',
    subcategory: 'religious',
    exemption_type: 'exemption',
    is_multiple_allowed: false,
    default_exemption_value: 0,
    default_credit_value: 0,
    qualification_criteria:
      'Must be qualified religious organization using property for religious purposes',
    requires_documentation: true,
    required_documents: [
      'Religious Organization Certificate',
      'Property Use Documentation',
    ],
    sort_order: 1,
  },
  {
    name: 'educational_organization',
    display_name: 'Educational Organization Exemption',
    description: 'Exemption for qualified educational institutions',
    category: 'institutional',
    subcategory: 'educational',
    exemption_type: 'exemption',
    is_multiple_allowed: false,
    default_exemption_value: 0,
    default_credit_value: 0,
    qualification_criteria:
      'Must be qualified educational institution using property for educational purposes',
    requires_documentation: true,
    required_documents: [
      'Educational Institution Certificate',
      'Accreditation Documentation',
    ],
    sort_order: 2,
  },
];

async function seedExemptionTypes() {
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

      for (const exemptionTypeData of defaultExemptionTypes) {
        // Check if exemption type already exists
        const existingExemption = await ExemptionType.findOne({
          municipality_id: municipality._id,
          name: exemptionTypeData.name,
        });

        if (existingExemption) {
          console.log(
            `   ⏭️  Skipping existing: ${exemptionTypeData.display_name}`,
          );
          municipalitySkipped++;
          continue;
        }

        // Create new exemption type
        const newExemptionType = new ExemptionType({
          ...exemptionTypeData,
          municipality_id: municipality._id,
          is_active: true,
        });

        await newExemptionType.save();
        console.log(`   ✅ Created: ${exemptionTypeData.display_name}`);
        municipalityCreated++;
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
    console.log(`   ⏭️  Skipped: ${totalSkipped} existing exemption types`);
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
  console.log('🚨 Exemption Types Seeding Script');
  console.log(
    '📋 This script will create default exemption types for all active municipalities',
  );
  console.log('');
  console.log('📝 Default exemption types include:');
  console.log(
    '   • Veteran credits (Standard, All Veteran, Disabled, Surviving Spouse)',
  );
  console.log('   • Elderly exemptions (65-74, 75-79, 80+)');
  console.log('   • Blind exemption');
  console.log('   • Disabled exemptions (Standard, Permanent)');
  console.log('   • Charitable/Religious/Educational exemptions');
  console.log('');
  console.log(
    '⚠️  This is a one-time setup script. Existing exemption types will be skipped.',
  );
  console.log('');
  console.log('🚀 To run: node seed-exemption-types.js --run');
  process.exit(0);
}

// Run the seeding function
seedExemptionTypes();
