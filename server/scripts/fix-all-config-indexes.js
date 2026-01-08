const mongoose = require('mongoose');
require('dotenv').config();

/**
 * This script checks and fixes indexes for all configuration models
 * that use the version tracking pattern (effective_year, effective_year_end, etc.)
 *
 * Models affected:
 * - BuildingCode
 * - BuildingFeatureCode
 * - SketchSubAreaFactor
 * - NeighborhoodCode
 * - LandLadder
 * - WaterBodyLadder
 */

async function fixAllConfigIndexes() {
  try {
    await mongoose.connect(
      process.env.MONGODB_URI || 'mongodb://localhost:27017/municipalities',
    );
    console.log('Connected to MongoDB\n');

    const db = mongoose.connection.db;

    // Define the collections and their index configurations
    const collections = [
      {
        name: 'building_calculation_configs',
        oldIndexPatterns: ['municipality_id_1'],
        correctIndexes: [
          {
            key: { municipality_id: 1, effective_year: 1 },
            options: { unique: true }
          },
          { key: { municipality_id: 1 } },
          { key: { effective_year: 1 } },
          { key: { effective_year_end: 1 } },
        ],
      },
      {
        name: 'buildingcodes',
        oldIndexPatterns: ['code_1_municipalityId_1', 'municipalityId_1_code_1'],
        correctIndexes: [
          {
            key: { code: 1, municipalityId: 1, effective_year: 1 },
            options: { unique: true }
          },
          { key: { municipalityId: 1, effective_year: 1 } },
          { key: { effective_year: 1 } },
          { key: { effective_year_end: 1 } },
        ],
      },
      {
        name: 'sketchsubareafactors',
        oldIndexPatterns: [
          'code_1_municipalityId_1',
          'municipalityId_1_code_1',
          'displayText_1_municipalityId_1',
        ],
        correctIndexes: [
          {
            key: { displayText: 1, municipalityId: 1, effective_year: 1 },
            options: { unique: true }
          },
          { key: { municipalityId: 1, effective_year: 1 } },
          { key: { effective_year: 1 } },
          { key: { effective_year_end: 1 } },
        ],
      },
      {
        name: 'neighborhoodcodes',
        oldIndexPatterns: ['code_1_municipalityId_1', 'municipalityId_1_code_1'],
        correctIndexes: [
          {
            key: { code: 1, municipalityId: 1, effective_year: 1 },
            options: { unique: true }
          },
          { key: { municipalityId: 1, effective_year: 1 } },
          { key: { effective_year: 1 } },
          { key: { effective_year_end: 1 } },
        ],
      },
      {
        name: 'landladders',
        oldIndexPatterns: ['zoneId_1_acreage_1', 'acreage_1_zoneId_1'],
        correctIndexes: [
          {
            key: { zoneId: 1, acreage: 1, effective_year: 1 },
            options: { unique: true }
          },
          { key: { zoneId: 1, order: 1 } },
          { key: { municipalityId: 1, zoneId: 1 } },
          { key: { municipalityId: 1, effective_year: 1 } },
          { key: { effective_year: 1 } },
          { key: { effective_year_end: 1 } },
        ],
      },
      {
        name: 'waterbodyladders',
        oldIndexPatterns: [
          'waterBodyId_1_frontage_1',
          'frontage_1_waterBodyId_1',
          'waterBodyId_1_frontage_1_isActive_1',
        ],
        correctIndexes: [
          {
            key: { waterBodyId: 1, frontage: 1, effective_year: 1, isActive: 1 },
            options: { unique: true }
          },
          { key: { waterBodyId: 1, order: 1 } },
          { key: { municipalityId: 1, effective_year: 1 } },
          { key: { effective_year: 1 } },
          { key: { effective_year_end: 1 } },
        ],
      },
    ];

    for (const collectionConfig of collections) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Processing: ${collectionConfig.name}`);
      console.log('='.repeat(60));

      const collection = db.collection(collectionConfig.name);

      // Check if collection exists
      const collectionExists = await db
        .listCollections({ name: collectionConfig.name })
        .hasNext();

      if (!collectionExists) {
        console.log(`Collection ${collectionConfig.name} does not exist, skipping`);
        continue;
      }

      // Get current indexes
      console.log('\nCurrent indexes:');
      const indexes = await collection.indexes();
      indexes.forEach((index) => {
        console.log(`  - ${index.name}: ${JSON.stringify(index.key)}${index.unique ? ' (unique)' : ''}`);
      });

      // Drop old indexes that don't include effective_year
      for (const pattern of collectionConfig.oldIndexPatterns) {
        const matchingIndex = indexes.find((idx) => idx.name === pattern);
        if (matchingIndex) {
          try {
            await collection.dropIndex(pattern);
            console.log(`\n  Dropped old index: ${pattern}`);
          } catch (error) {
            console.log(`  Could not drop ${pattern}: ${error.message}`);
          }
        }
      }

      // Ensure correct indexes exist
      console.log('\nEnsuring correct indexes...');
      for (const indexConfig of collectionConfig.correctIndexes) {
        const indexName = Object.keys(indexConfig.key).join('_') +
          Object.keys(indexConfig.key).map(() => '_1').join('');

        try {
          await collection.createIndex(indexConfig.key, indexConfig.options || {});
          console.log(`  ✓ Index exists: ${JSON.stringify(indexConfig.key)}`);
        } catch (error) {
          if (error.code === 85 || error.code === 86) {
            console.log(`  ✓ Index already exists: ${JSON.stringify(indexConfig.key)}`);
          } else {
            console.log(`  ✗ Error creating index: ${error.message}`);
          }
        }
      }
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log('All configuration indexes checked and fixed!');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('Error fixing indexes:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

// Run the fix
fixAllConfigIndexes();
