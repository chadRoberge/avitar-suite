const mongoose = require('mongoose');
require('dotenv').config();

async function fixViewAttributesIndex() {
  try {
    // Connect to MongoDB
    await mongoose.connect(
      process.env.MONGODB_URI || 'mongodb://localhost:27017/municipalities',
    );
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;
    const collection = db.collection('viewattributes');

    // Get existing indexes
    console.log('Current indexes:');
    const indexes = await collection.indexes();
    indexes.forEach((index) => {
      console.log(`- ${index.name}:`, index.key);
    });

    // Drop the incorrect index if it exists
    const incorrectIndexName = 'municipalityId_1_attributeType_1_isActive_1';
    try {
      await collection.dropIndex(incorrectIndexName);
      console.log(`\nDropped incorrect index: ${incorrectIndexName}`);
    } catch (error) {
      if (error.code === 27) {
        console.log(
          `\nIndex ${incorrectIndexName} doesn't exist, skipping drop`,
        );
      } else {
        console.error('Error dropping index:', error);
      }
    }

    // Ensure the correct index exists
    const correctIndex = {
      municipalityId: 1,
      attributeType: 1,
      name: 1,
      isActive: 1,
    };
    try {
      await collection.createIndex(correctIndex, { unique: true });
      console.log('Created correct unique index:', correctIndex);
    } catch (error) {
      if (error.code === 85) {
        console.log('Correct index already exists');
      } else {
        console.error('Error creating index:', error);
      }
    }

    // Show final indexes
    console.log('\nFinal indexes:');
    const finalIndexes = await collection.indexes();
    finalIndexes.forEach((index) => {
      console.log(`- ${index.name}:`, index.key);
    });

    console.log('\nIndex fix completed successfully!');
  } catch (error) {
    console.error('Error fixing indexes:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run the fix
fixViewAttributesIndex();
