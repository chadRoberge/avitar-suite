const mongoose = require('mongoose');
require('dotenv').config();

async function fixWaterfrontIndexes() {
  try {
    // Connect to MongoDB
    await mongoose.connect(
      process.env.MONGODB_URI || 'mongodb://localhost:27017/municipalities',
    );
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;
    const collection = db.collection('waterfrontattributes');

    // Get existing indexes
    console.log('Current indexes:');
    const indexes = await collection.indexes();
    indexes.forEach((index) => {
      console.log('Index:', index.key, index.unique ? '(unique)' : '');
    });

    // Drop the old problematic index
    try {
      await collection.dropIndex({
        municipalityId: 1,
        attributeType: 1,
        isActive: 1,
      });
      console.log(
        '✅ Dropped old index: { municipalityId: 1, attributeType: 1, isActive: 1 }',
      );
    } catch (error) {
      if (error.code === 27) {
        console.log('Old index not found (already dropped)');
      } else {
        console.error('Error dropping old index:', error.message);
      }
    }

    // Create new indexes
    await collection.createIndex(
      { municipalityId: 1, name: 1, isActive: 1 },
      { unique: true },
    );
    console.log(
      '✅ Created new index: { municipalityId: 1, name: 1, isActive: 1 } (unique)',
    );

    await collection.createIndex(
      { municipalityId: 1, displayText: 1, isActive: 1 },
      { unique: true },
    );
    console.log(
      '✅ Created new index: { municipalityId: 1, displayText: 1, isActive: 1 } (unique)',
    );

    console.log('\n✅ Index migration completed successfully!');
    console.log(
      'You can now create multiple waterfront attributes per type per municipality.',
    );
  } catch (error) {
    console.error('Error fixing indexes:', error);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed');
  }
}

fixWaterfrontIndexes();
