const mongoose = require('mongoose');
require('dotenv').config();

// Import models and helpers
const Municipality = require('../models/Municipality');
const {
  ModuleHelpers,
  MODULES,
  MODULE_FEATURES,
} = require('../config/modules');

async function testModuleSystem() {
  try {
    console.log('🧪 Testing New Flexible Module System');
    console.log('=====================================\n');

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Test 1: Create a test municipality with new structure
    console.log(
      '📝 Test 1: Creating municipality with new Map-based structure',
    );

    const timestamp = Date.now();
    const testMunicipality = new Municipality({
      name: `Test Township ${timestamp}`,
      code: `TEST${timestamp}`.slice(-10), // Keep to 10 chars max
      state: 'NH',
      county: 'Test County',
      type: 'township',
      contact_info: {
        address: {
          street: '123 Test Street',
          city: 'Test City',
          zipCode: '12345',
        },
        phone: '555-123-4567',
        email: 'admin@testtownship.gov',
        assessor_name: 'John Smith',
        tax_collector_name: 'Jane Doe',
      },
      branding_config: {
        primary_color: '#2d5a27',
        secondary_color: '#f4c430',
        header_text: 'Welcome to Test Township',
      },
      module_config: {
        billing_tier: 'premium',
        modules: new Map(),
      },
    });

    await testMunicipality.save();
    console.log(
      `✅ Created municipality: ${testMunicipality.name} (slug: ${testMunicipality.slug})\n`,
    );

    // Test 2: Enable assessing module with AI features
    console.log('📝 Test 2: Enabling assessing module with AI features');

    await testMunicipality.enableModule(MODULES.ASSESSING, {
      tier: 'enterprise',
      version: '2.1.0',
      features: {
        [MODULE_FEATURES.assessing.AI_ABATEMENT_REVIEW]: { enabled: true },
        [MODULE_FEATURES.assessing.ADVANCED_REPORTING]: { enabled: true },
        [MODULE_FEATURES.assessing.GIS_INTEGRATION]: { enabled: true },
      },
      settings: {
        aiModelVersion: 'v2.1',
        reportingInterval: 'monthly',
      },
      permissions: {
        assessor: ['read', 'write', 'approve'],
        clerk: ['read'],
      },
      expirationDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
    });

    console.log('✅ Enabled assessing module with enterprise features\n');

    // Test 3: Enable tax collection module
    console.log('📝 Test 3: Enabling tax collection module');

    await testMunicipality.enableModule(MODULES.TAX_COLLECTION, {
      tier: 'professional',
      features: {
        [MODULE_FEATURES.taxCollection.ONLINE_PAYMENTS]: { enabled: true },
        [MODULE_FEATURES.taxCollection.PAYMENT_PLANS]: { enabled: true },
        [MODULE_FEATURES.taxCollection.AUTOMATED_REMINDERS]: { enabled: true },
      },
      settings: {
        paymentGateway: 'stripe',
        reminderFrequency: 'weekly',
      },
    });

    console.log(
      '✅ Enabled tax collection module with professional features\n',
    );

    // Test 4: Test module access methods
    console.log('📝 Test 4: Testing module access methods');

    console.log(
      `Has assessing module: ${testMunicipality.hasModule(MODULES.ASSESSING)}`,
    );
    console.log(
      `Has AI abatement review: ${testMunicipality.hasFeature(MODULES.ASSESSING, MODULE_FEATURES.assessing.AI_ABATEMENT_REVIEW)}`,
    );
    console.log(
      `Has building permits (not enabled): ${testMunicipality.hasModule(MODULES.BUILDING_PERMITS)}`,
    );
    console.log(
      `Assessing tier: ${testMunicipality.getModuleTier(MODULES.ASSESSING)}`,
    );
    console.log(
      `Tax collection tier: ${testMunicipality.getModuleTier(MODULES.TAX_COLLECTION)}\n`,
    );

    // Test 5: Get enabled modules
    console.log('📝 Test 5: Getting enabled modules');

    const enabledModules = testMunicipality.getEnabledModules();
    console.log('Enabled modules:');
    enabledModules.forEach((module) => {
      console.log(
        `- ${module.name} (${module.tier}) - Features: ${module.features.join(', ')}`,
      );
    });
    console.log('');

    // Test 6: Add a custom feature
    console.log('📝 Test 6: Adding custom feature to assessing module');

    await testMunicipality.addModuleFeature(
      MODULES.ASSESSING,
      'customValuationAlgorithm',
      {
        enabled: true,
        tier_required: 'enterprise',
        config: {
          algorithm: 'neural_network',
          accuracy: 95,
        },
      },
    );

    console.log('✅ Added custom feature: customValuationAlgorithm\n');

    // Test 7: Disable a module with reason
    console.log('📝 Test 7: Disabling tax collection module');

    await testMunicipality.disableModule(
      MODULES.TAX_COLLECTION,
      'Switching to external system until 2025',
    );
    console.log('✅ Disabled tax collection module with reason\n');

    // Test 8: Test module helpers
    console.log('📝 Test 8: Testing module helpers');

    const navigation = ModuleHelpers.getNavigationForModules(
      testMunicipality.getEnabledModules(),
    );
    console.log('Navigation items:');
    navigation.forEach((nav) => {
      console.log(`- ${nav.name}: ${nav.path} (${nav.color})`);
    });
    console.log('');

    // Test 9: Test validation
    console.log('📝 Test 9: Testing module validation');

    const validation = ModuleHelpers.validateModuleConfiguration(
      MODULES.BUILDING_PERMITS,
      'basic',
      [MODULE_FEATURES.buildingPermits.WORKFLOW_AUTOMATION], // This should fail - enterprise feature on basic tier
    );

    console.log(`Validation result: ${validation.valid}`);
    if (!validation.valid) {
      console.log(`Validation errors: ${validation.errors.join(', ')}`);
    }
    console.log('');

    // Final status
    console.log('📊 Final Municipality Status:');
    console.log(`Name: ${testMunicipality.name}`);
    console.log(`Slug: ${testMunicipality.slug}`);
    console.log(`Billing Tier: ${testMunicipality.module_config.billing_tier}`);
    console.log(
      `Subscription Status: ${testMunicipality.subscription.payment_status}`,
    );
    console.log(
      `Total Modules: ${testMunicipality.module_config.modules.size}`,
    );
    console.log(
      `Enabled Modules: ${testMunicipality.getEnabledModules().length}`,
    );

    // Clean up
    await Municipality.findByIdAndDelete(testMunicipality._id);
    console.log('\n🧹 Cleaned up test municipality');

    console.log('\n🎉 All tests completed successfully!');
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n📡 Database connection closed');
  }
}

// Run the test
if (require.main === module) {
  testModuleSystem();
}

module.exports = testModuleSystem;
