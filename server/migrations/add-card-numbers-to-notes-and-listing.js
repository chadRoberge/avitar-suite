const mongoose = require('mongoose');
const PropertyNotes = require('../models/PropertyNotes');
const ListingHistory = require('../models/ListingHistory');

/**
 * Migration to add card_number to existing PropertyNotes and ListingHistory
 * All existing records without card_number will be assigned to card 1
 */
async function addCardNumbersToNotesAndListing() {
  try {
    console.log(
      '🔄 Starting migration: Add card_number to PropertyNotes and ListingHistory...',
    );

    // Migrate PropertyNotes
    console.log('\n📝 Migrating PropertyNotes...');
    const notesWithoutCardNumber = await PropertyNotes.find({
      $or: [{ card_number: { $exists: false } }, { card_number: null }],
    });

    console.log(
      `📊 Found ${notesWithoutCardNumber.length} property notes without card_number`,
    );

    if (notesWithoutCardNumber.length > 0) {
      const notesResult = await PropertyNotes.updateMany(
        {
          $or: [{ card_number: { $exists: false } }, { card_number: null }],
        },
        {
          $set: { card_number: 1 },
        },
      );

      console.log(
        `✅ PropertyNotes migration completed: ${notesResult.modifiedCount} records updated to card_number: 1`,
      );
    } else {
      console.log('✅ No property notes need migration');
    }

    // Migrate ListingHistory
    console.log('\n📋 Migrating ListingHistory...');
    const listingWithoutCardNumber = await ListingHistory.find({
      $or: [{ card_number: { $exists: false } }, { card_number: null }],
    });

    console.log(
      `📊 Found ${listingWithoutCardNumber.length} listing history entries without card_number`,
    );

    if (listingWithoutCardNumber.length > 0) {
      const listingResult = await ListingHistory.updateMany(
        {
          $or: [{ card_number: { $exists: false } }, { card_number: null }],
        },
        {
          $set: { card_number: 1 },
        },
      );

      console.log(
        `✅ ListingHistory migration completed: ${listingResult.modifiedCount} records updated to card_number: 1`,
      );
    } else {
      console.log('✅ No listing history entries need migration');
    }

    // Verify the migration
    console.log('\n🔍 Verifying migration...');

    const remainingNotesWithoutCardNumber = await PropertyNotes.countDocuments({
      $or: [{ card_number: { $exists: false } }, { card_number: null }],
    });

    const remainingListingWithoutCardNumber =
      await ListingHistory.countDocuments({
        $or: [{ card_number: { $exists: false } }, { card_number: null }],
      });

    if (
      remainingNotesWithoutCardNumber === 0 &&
      remainingListingWithoutCardNumber === 0
    ) {
      console.log(
        '✅ Migration verification passed: All records now have card_number',
      );
    } else {
      if (remainingNotesWithoutCardNumber > 0) {
        console.warn(
          `⚠️ PropertyNotes verification warning: ${remainingNotesWithoutCardNumber} records still without card_number`,
        );
      }
      if (remainingListingWithoutCardNumber > 0) {
        console.warn(
          `⚠️ ListingHistory verification warning: ${remainingListingWithoutCardNumber} records still without card_number`,
        );
      }
    }

    console.log('\n✅ All migrations completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

// Export for use in other files
module.exports = { addCardNumbersToNotesAndListing };

// Run migration if called directly
if (require.main === module) {
  // Connect to MongoDB if not already connected
  if (mongoose.connection.readyState === 0) {
    // You'll need to set your MongoDB connection string
    const dbUrl =
      process.env.MONGODB_URI || 'mongodb://localhost:27017/avitar-suite';

    mongoose
      .connect(dbUrl, {
        useNewUrlParser: true,
      })
      .then(async () => {
        console.log('📡 Connected to MongoDB for migration');

        await addCardNumbersToNotesAndListing();

        console.log('🏁 Migration script completed');
        process.exit(0);
      })
      .catch((error) => {
        console.error('❌ MongoDB connection failed:', error);
        process.exit(1);
      });
  } else {
    // Already connected
    addCardNumbersToNotesAndListing()
      .then(() => {
        console.log('🏁 Migration script completed');
      })
      .catch((error) => {
        console.error('❌ Migration failed:', error);
      });
  }
}
