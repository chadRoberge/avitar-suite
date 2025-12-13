/**
 * Script to check for property attributes with null codes
 */

const mongoose = require('mongoose');
require('dotenv').config();

async function checkNullCodes() {
  try {
    await mongoose.connect(
      process.env.MONGODB_URI || 'mongodb://localhost:27017/avitar-suite',
    );
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;
    const collection = db.collection('propertyattributes');

    // Find all documents with code: null
    const nullCodeDocs = await collection
      .find({
        code: null,
      })
      .toArray();

    console.log(`\n📊 Found ${nullCodeDocs.length} documents with code: null`);

    if (nullCodeDocs.length > 0) {
      console.log('\n📋 Documents with null codes:');
      nullCodeDocs.forEach((doc, index) => {
        console.log(`\n${index + 1}. ${doc.attributeType} (${doc._id})`);
        console.log(`   Municipality: ${doc.municipalityId}`);
        console.log(`   DisplayText: ${doc.displayText}`);
        console.log(`   Code: ${doc.code}`);
      });

      // Remove code field from all documents where it's null
      console.log(
        '\n⚠️  Removing code field from documents with null values...',
      );
      const result = await collection.updateMany(
        {
          $or: [{ code: null }, { code: { $exists: false } }],
        },
        { $unset: { code: '' } },
      );
      console.log(`\n✅ Matched ${result.matchedCount} documents`);
      console.log(`✅ Modified ${result.modifiedCount} documents`);
      console.log(
        '✅ Code field removed from documents with null/undefined values',
      );
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

checkNullCodes();
