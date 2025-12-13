/**
 * Script to check the current indexes on the propertyattributes collection
 */

const mongoose = require('mongoose');
require('dotenv').config();

async function checkIndexes() {
  try {
    await mongoose.connect(
      process.env.MONGODB_URI || 'mongodb://localhost:27017/avitar-suite',
    );
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;
    const collection = db.collection('propertyattributes');

    const indexes = await collection.indexes();

    console.log('\n📋 Current indexes on propertyattributes collection:');
    console.log(JSON.stringify(indexes, null, 2));

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

checkIndexes();
