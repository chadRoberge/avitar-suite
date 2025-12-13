/**
 * Script to fix the PropertyAttribute index to allow null codes
 * Run this once to drop the old unique index and allow it to be recreated as sparse
 */

const mongoose = require('mongoose');
require('dotenv').config();

async function fixPropertyAttributesIndex() {
  try {
    // Connect to MongoDB
    await mongoose.connect(
      process.env.MONGODB_URI || 'mongodb://localhost:27017/avitar-suite',
    );
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;
    const collection = db.collection('propertyattributes');

    // Get existing indexes
    const indexes = await collection.indexes();
    console.log(
      '\n📋 Current indexes:',
      indexes.map((idx) => idx.name),
    );

    // Find the problematic index
    const oldIndexName = 'code_1_attributeType_1_municipalityId_1';
    const hasOldIndex = indexes.some((idx) => idx.name === oldIndexName);

    if (hasOldIndex) {
      console.log(`\n⚠️  Found old index: ${oldIndexName}`);
      console.log('Dropping old index...');

      await collection.dropIndex(oldIndexName);
      console.log('✅ Old index dropped successfully');

      // Create new sparse index
      console.log('\nCreating new sparse index...');
      await collection.createIndex(
        {
          code: 1,
          attributeType: 1,
          municipalityId: 1,
        },
        {
          unique: true,
          sparse: true,
          name: oldIndexName,
        },
      );
      console.log('✅ New sparse index created successfully');
      console.log('ℹ️  The index now allows multiple null code values');
    } else {
      console.log(
        '\n✅ Index already has correct configuration or does not exist',
      );
    }

    await mongoose.disconnect();
    console.log(
      '\n✅ Done! Server will recreate indexes on next restart if needed.',
    );
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Run the script
fixPropertyAttributesIndex();
