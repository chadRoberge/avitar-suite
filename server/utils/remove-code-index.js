const mongoose = require('mongoose');
require('dotenv').config();

async function removeCodeIndex() {
  try {
    await mongoose.connect(
      process.env.MONGODB_URI || 'mongodb://localhost:27017/avitar-suite',
    );
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;
    const collection = db.collection('propertyattributes');

    try {
      await collection.dropIndex('code_1_attributeType_1_municipalityId_1');
      console.log('✅ Dropped code index successfully');
    } catch (error) {
      if (error.code === 27) {
        console.log('ℹ️  Index does not exist (already removed)');
      } else {
        throw error;
      }
    }

    const indexes = await collection.indexes();
    console.log('\n📋 Remaining indexes:');
    indexes.forEach((idx) => console.log(`   - ${idx.name}`));

    await mongoose.disconnect();
    console.log('\n✅ Done!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

removeCodeIndex();
