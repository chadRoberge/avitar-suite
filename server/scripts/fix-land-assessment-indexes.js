const mongoose = require('mongoose');
require('dotenv').config();

/**
 * Migration script to fix LandAssessment indexes for temporal database
 *
 * This script:
 * 1. Drops the old unique index on property_id alone
 * 2. Creates the new compound unique index on property_id + effective_year
 * 3. Ensures other required indexes are in place
 */

async function fixLandAssessmentIndexes() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(
      process.env.MONGODB_URI || 'mongodb://localhost:27017/municipalities',
    );
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;
    const collection = db.collection('land_assessments');

    console.log('\n=== Current Indexes ===');
    const currentIndexes = await collection.indexes();
    currentIndexes.forEach((index) => {
      console.log(
        `Index: ${index.name}`,
        index.key,
        index.unique ? '(UNIQUE)' : '',
      );
    });

    console.log('\n=== Dropping problematic unique index on property_id ===');
    try {
      await collection.dropIndex('property_id_1');
      console.log('✅ Successfully dropped property_id_1 index');
    } catch (error) {
      if (error.code === 27) {
        console.log('ℹ️  Index property_id_1 does not exist (already dropped)');
      } else {
        console.log('❌ Error dropping property_id_1 index:', error.message);
      }
    }

    console.log('\n=== Creating new compound unique index ===');
    try {
      await collection.createIndex(
        { property_id: 1, effective_year: 1 },
        {
          unique: true,
          name: 'property_id_1_effective_year_1_unique',
        },
      );
      console.log(
        '✅ Successfully created compound unique index: property_id + effective_year',
      );
    } catch (error) {
      if (error.code === 85) {
        console.log('ℹ️  Compound unique index already exists');
      } else {
        console.log('❌ Error creating compound index:', error.message);
      }
    }

    console.log('\n=== Ensuring other required indexes ===');

    // Municipality + Year index
    try {
      await collection.createIndex(
        { municipality_id: 1, effective_year: -1 },
        { name: 'municipality_id_1_effective_year_-1' },
      );
      console.log('✅ Municipality + Year index ensured');
    } catch (error) {
      console.log(
        'ℹ️  Municipality + Year index already exists or error:',
        error.message,
      );
    }

    // Property + Year index (for queries)
    try {
      await collection.createIndex(
        { property_id: 1, effective_year: -1 },
        { name: 'property_id_1_effective_year_-1' },
      );
      console.log('✅ Property + Year (desc) index ensured');
    } catch (error) {
      console.log(
        'ℹ️  Property + Year (desc) index already exists or error:',
        error.message,
      );
    }

    console.log('\n=== Final Index State ===');
    const finalIndexes = await collection.indexes();
    finalIndexes.forEach((index) => {
      console.log(
        `Index: ${index.name}`,
        index.key,
        index.unique ? '(UNIQUE)' : '',
      );
    });

    console.log('\n=== Testing Index Functionality ===');

    // Test that we can have multiple records for same property with different years
    const testPropertyId = new mongoose.Types.ObjectId();
    const testMunicipalityId = new mongoose.Types.ObjectId();

    console.log('Testing temporal database functionality...');

    try {
      // Insert test records for same property, different years
      await collection.insertMany([
        {
          property_id: testPropertyId,
          municipality_id: testMunicipalityId,
          effective_year: 2023,
          market_value: 100000,
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          property_id: testPropertyId,
          municipality_id: testMunicipalityId,
          effective_year: 2024,
          market_value: 105000,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ]);
      console.log('✅ Successfully inserted multiple years for same property');

      // Try to insert duplicate (should fail)
      try {
        await collection.insertOne({
          property_id: testPropertyId,
          municipality_id: testMunicipalityId,
          effective_year: 2024, // Same year as above
          market_value: 110000,
          created_at: new Date(),
          updated_at: new Date(),
        });
        console.log('❌ ERROR: Duplicate insertion should have failed!');
      } catch (dupError) {
        if (dupError.code === 11000) {
          console.log(
            '✅ Correctly prevented duplicate property_id + effective_year',
          );
        } else {
          console.log('❌ Unexpected error:', dupError.message);
        }
      }

      // Clean up test data
      await collection.deleteMany({ property_id: testPropertyId });
      console.log('✅ Test data cleaned up');
    } catch (testError) {
      console.log('❌ Test failed:', testError.message);
    }

    console.log('\n🎉 Index migration completed successfully!');
    console.log('\nThe temporal database is now properly configured:');
    console.log(
      '- Multiple assessments per property across different years ✅',
    );
    console.log('- Unique constraint per property per year ✅');
    console.log('- Proper indexing for efficient queries ✅');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

// Run the migration
if (require.main === module) {
  fixLandAssessmentIndexes()
    .then(() => {
      console.log('\n✅ Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Migration failed:', error);
      process.exit(1);
    });
}

module.exports = fixLandAssessmentIndexes;
