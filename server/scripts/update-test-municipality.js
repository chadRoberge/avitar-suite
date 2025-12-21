const mongoose = require('mongoose');
const Municipality = require('../models/Municipality');
const path = require('path');

// Try to load .env from multiple locations
require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
require('dotenv').config();

async function updateTestMunicipality() {
  try {
    // Debug: Show available environment variables
    console.log('Available MongoDB environment variables:');
    Object.keys(process.env)
      .filter(
        (key) =>
          key.toLowerCase().includes('mongo') ||
          key.toLowerCase().includes('db'),
      )
      .forEach((key) => {
        console.log(`${key}: ${process.env[key] ? '[SET]' : '[NOT SET]'}`);
      });

    const mongoUri =
      process.env.MONGODB_URI ||
      process.env.DATABASE_URL ||
      process.env.MONGO_URL;
    if (!mongoUri) {
      throw new Error(
        'MongoDB URI not found. Please set MONGODB_URI, DATABASE_URL, or MONGO_URL environment variable.',
      );
    }

    // Connect to MongoDB
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    // Find the test municipality (assuming it's the first one or has a specific code)
    let municipality = await Municipality.findOne({
      $or: [
        { code: 'TEST_TOWNSHIP' },
        { name: /test/i },
        { slug: 'test-township' },
      ],
    });

    if (!municipality) {
      console.log('Test municipality not found, creating one...');
      // Create a test municipality if none exists
      municipality = new Municipality({
        name: 'Test Township',
        code: 'TEST_TOWNSHIP',
        state: 'NH',
        county: 'Test County',
        type: 'township',
        contact_info: {
          address: {
            street: '123 Test Street',
            city: 'Test Township',
            zipCode: '03244',
          },
          phone: '603-555-0123',
          email: 'admin@test-township.nh.gov',
          website: 'https://www.test-township.nh.gov',
        },
        branding_config: {
          primary_color: '#1f4788',
          secondary_color: '#ffffff',
          header_text: 'Test Municipal Government',
        },
        taxYear: 2024,
        fiscalYearStart: 'january',
      });
    }

    console.log(
      `Updating municipality: ${municipality.name} (${municipality.code})`,
    );

    // Initialize module_config if it doesn't exist
    if (!municipality.module_config) {
      municipality.module_config = {
        billing_tier: 'professional',
        modules: new Map(),
      };
    }

    if (!municipality.module_config.modules) {
      municipality.module_config.modules = new Map();
    }

    // Add Assessing Module
    municipality.module_config.modules.set('assessing', {
      enabled: true,
      version: '2.1.0',
      tier: 'professional',
      features: new Map([
        [
          'aiAbatementReview',
          {
            enabled: true,
            tier_required: 'enterprise',
            config: {
              ai_provider: 'openai',
              confidence_threshold: 0.85,
            },
          },
        ],
        [
          'bulkValuationUpdates',
          {
            enabled: true,
            tier_required: 'professional',
            config: {
              max_batch_size: 1000,
            },
          },
        ],
        [
          'advancedReporting',
          {
            enabled: true,
            tier_required: 'professional',
            config: {},
          },
        ],
        [
          'gisIntegration',
          {
            enabled: false,
            tier_required: 'enterprise',
            config: {},
          },
        ],
      ]),
      permissions: new Map([
        ['assessor', ['read', 'write', 'approve']],
        ['deputy_assessor', ['read', 'write']],
        ['clerk', ['read']],
      ]),
      settings: new Map([
        ['auto_calculate_values', true],
        ['require_approval_threshold', 50000],
        ['notification_emails', ['assessor@test-township.nh.gov']],
      ]),
      activated_date: new Date('2024-01-15'),
      expiration_date: new Date('2025-01-15'),
    });

    // Add Building Permits Module
    municipality.module_config.modules.set('buildingPermits', {
      enabled: true,
      version: '1.8.2',
      tier: 'basic',
      features: new Map([
        [
          'onlineApplications',
          {
            enabled: true,
            tier_required: 'basic',
            config: {
              payment_integration: true,
              document_upload_limit: '10MB',
            },
          },
        ],
        [
          'digitalPlanReview',
          {
            enabled: true,
            tier_required: 'professional',
            config: {
              supported_formats: ['pdf', 'dwg', 'dxf'],
            },
          },
        ],
        [
          'inspectionScheduling',
          {
            enabled: true,
            tier_required: 'basic',
            config: {
              auto_scheduling: false,
              reminder_notifications: true,
            },
          },
        ],
        [
          'workflowAutomation',
          {
            enabled: false,
            tier_required: 'enterprise',
            config: {},
          },
        ],
      ]),
      permissions: new Map([
        ['building_inspector', ['read', 'write', 'approve', 'inspect']],
        ['code_enforcement', ['read', 'write']],
        ['permit_clerk', ['read', 'write']],
      ]),
      settings: new Map([
        [
          'inspection_types',
          ['foundation', 'framing', 'electrical', 'plumbing', 'final'],
        ],
        ['fee_schedule_id', 'standard_nh_2024'],
        ['require_contractor_license', true],
      ]),
      activated_date: new Date('2024-02-01'),
      expiration_date: new Date('2025-02-01'),
    });

    // Update subscription info
    municipality.subscription = {
      start_date: new Date('2024-01-15'),
      end_date: new Date('2025-01-15'),
      auto_renew: true,
      payment_status: 'active',
      billing_email: 'finance@test-township.nh.gov',
      last_payment_date: new Date('2024-01-15'),
    };

    // Update stats
    municipality.stats = {
      totalUsers: 8,
      activeUsers: 6,
      totalProperties: 1247,
      activePermits: 18,
      lastStatsUpdate: new Date(),
    };

    municipality.setup_completed = true;
    municipality.is_active = true;

    // Save the municipality
    await municipality.save();

    console.log('✅ Successfully updated test municipality with modules:');
    console.log('   - Assessing Module (Professional tier)');
    console.log('   - Building Permits Module (Standard tier)');
    console.log(`   - Municipality ID: ${municipality._id}`);
    console.log(`   - Slug: ${municipality.slug}`);

    // Display enabled features
    console.log('\nEnabled Features:');
    const assessingModule = municipality.module_config.modules.get('assessing');
    if (assessingModule) {
      console.log('  Assessing:');
      for (const [featureName, feature] of assessingModule.features) {
        if (feature.enabled) {
          console.log(`    ✓ ${featureName} (${feature.tier_required} tier)`);
        }
      }
    }

    const buildingModule =
      municipality.module_config.modules.get('buildingPermits');
    if (buildingModule) {
      console.log('  Building Permits:');
      for (const [featureName, feature] of buildingModule.features) {
        if (feature.enabled) {
          console.log(`    ✓ ${featureName} (${feature.tier_required} tier)`);
        }
      }
    }
  } catch (error) {
    console.error('Error updating municipality:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\nMongoDB connection closed');
  }
}

// Run the script
updateTestMunicipality();
