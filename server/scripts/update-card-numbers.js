const mongoose = require('mongoose');
require('dotenv').config({ path: './server/.env' });

/**
 * Script to update existing records without card_number
 */
async function updateCardNumbers() {
  try {
    // Connect to MongoDB
    const dbUrl =
      process.env.MONGODB_URI || 'mongodb://localhost:27017/avitar-suite';

    await mongoose.connect(dbUrl);

    console.log('📡 Connected to MongoDB');

    // Get the database
    const db = mongoose.connection.db;

    // Update PropertyNotes
    console.log('\n📝 Updating PropertyNotes records...');
    const notesCollection = db.collection('propertynotes');

    const notesUpdateResult = await notesCollection.updateMany(
      { card_number: { $exists: false } },
      { $set: { card_number: 1 } },
    );

    console.log(
      `✅ Updated ${notesUpdateResult.modifiedCount} PropertyNotes records`,
    );

    // Update ListingHistory
    console.log('\n📋 Updating ListingHistory records...');
    const listingCollection = db.collection('listinghistories');

    const listingUpdateResult = await listingCollection.updateMany(
      { card_number: { $exists: false } },
      { $set: { card_number: 1 } },
    );

    console.log(
      `✅ Updated ${listingUpdateResult.modifiedCount} ListingHistory records`,
    );

    // Verify
    const notesWithoutCard = await notesCollection.countDocuments({
      card_number: { $exists: false },
    });
    const listingWithoutCard = await listingCollection.countDocuments({
      card_number: { $exists: false },
    });

    console.log('\n🔍 Verification:');
    console.log(`PropertyNotes without card_number: ${notesWithoutCard}`);
    console.log(`ListingHistory without card_number: ${listingWithoutCard}`);

    if (notesWithoutCard === 0 && listingWithoutCard === 0) {
      console.log('\n✅ All records updated successfully!');
    } else {
      console.log('\n⚠️  Some records still need updating');
    }

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error updating records:', error);
    process.exit(1);
  }
}

// Run the update
updateCardNumbers();
