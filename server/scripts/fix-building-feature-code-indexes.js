const mongoose = require('mongoose');
require('dotenv').config();

async function fixBuildingFeatureCodeIndexes() {
  try {
    // Connect to MongoDB
    await mongoose.connect(
      process.env.MONGODB_URI || 'mongodb://localhost:27017/municipalities',
    );
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;
    const collection = db.collection('buildingfeaturecodes');

    // Get existing indexes
    console.log('Current indexes:');
    const indexes = await collection.indexes();
    indexes.forEach((index) => {
      console.log(`- ${index.name}:`, JSON.stringify(index.key));
    });

    // List of old indexes to drop (these don't include effective_year)
    const oldIndexesToDrop = [
      'displayText_1_featureType_1_municipalityId_1',
      'code_1_featureType_1_municipalityId_1',
    ];

    for (const indexName of oldIndexesToDrop) {
      try {
        await collection.dropIndex(indexName);
        console.log(`\nDropped old index: ${indexName}`);
      } catch (error) {
        if (error.code === 27) {
          console.log(`\nIndex ${indexName} doesn't exist, skipping drop`);
        } else {
          console.error(`Error dropping index ${indexName}:`, error.message);
        }
      }
    }

    // Ensure the correct indexes exist
    // 1. Unique index for code per feature type per municipality per year
    const correctUniqueIndex = {
      code: 1,
      featureType: 1,
      municipalityId: 1,
      effective_year: 1,
    };
    try {
      await collection.createIndex(correctUniqueIndex, {
        unique: true,
        name: 'code_1_featureType_1_municipalityId_1_effective_year_1',
      });
      console.log('\nCreated correct unique index:', JSON.stringify(correctUniqueIndex));
    } catch (error) {
      if (error.code === 85) {
        console.log('\nCorrect unique index already exists');
      } else if (error.code === 86) {
        console.log('\nIndex with same fields but different options exists');
      } else {
        console.error('Error creating unique index:', error.message);
      }
    }

    // 2. Index for municipality and year queries
    const municipalityYearIndex = {
      municipalityId: 1,
      effective_year: 1,
    };
    try {
      await collection.createIndex(municipalityYearIndex, {
        name: 'municipalityId_1_effective_year_1',
      });
      console.log('Created municipality/year index:', JSON.stringify(municipalityYearIndex));
    } catch (error) {
      if (error.code === 85 || error.code === 86) {
        console.log('Municipality/year index already exists');
      } else {
        console.error('Error creating municipality/year index:', error.message);
      }
    }

    // 3. Index for effective_year (single field)
    try {
      await collection.createIndex({ effective_year: 1 }, {
        name: 'effective_year_1',
      });
      console.log('Created effective_year index');
    } catch (error) {
      if (error.code === 85 || error.code === 86) {
        console.log('effective_year index already exists');
      } else {
        console.error('Error creating effective_year index:', error.message);
      }
    }

    // 4. Index for effective_year_end (for temporal queries)
    try {
      await collection.createIndex({ effective_year_end: 1 }, {
        name: 'effective_year_end_1',
      });
      console.log('Created effective_year_end index');
    } catch (error) {
      if (error.code === 85 || error.code === 86) {
        console.log('effective_year_end index already exists');
      } else {
        console.error('Error creating effective_year_end index:', error.message);
      }
    }

    // Show final indexes
    console.log('\nFinal indexes:');
    const finalIndexes = await collection.indexes();
    finalIndexes.forEach((index) => {
      console.log(`- ${index.name}:`, JSON.stringify(index.key));
    });

    console.log('\nBuildingFeatureCode index fix completed successfully!');
  } catch (error) {
    console.error('Error fixing indexes:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run the fix
fixBuildingFeatureCodeIndexes();
