const mongoose = require('mongoose');
const PropertyFeature = require('../models/PropertyFeature');

/**
 * Migration to add card_number to existing PropertyFeatures
 * All existing features without card_number will be assigned to card 1
 */
async function addCardNumbersToFeatures() {
  try {
    console.log(
      '🔄 Starting migration: Add card_number to existing features...',
    );

    // Find all features without card_number
    const featuresWithoutCardNumber = await PropertyFeature.find({
      $or: [{ card_number: { $exists: false } }, { card_number: null }],
    });

    console.log(
      `📊 Found ${featuresWithoutCardNumber.length} features without card_number`,
    );

    if (featuresWithoutCardNumber.length === 0) {
      console.log('✅ No features need migration');
      return;
    }

    // Update all features without card_number to card 1
    const result = await PropertyFeature.updateMany(
      {
        $or: [{ card_number: { $exists: false } }, { card_number: null }],
      },
      {
        $set: { card_number: 1 },
      },
    );

    console.log(
      `✅ Migration completed: ${result.modifiedCount} features updated to card_number: 1`,
    );

    // Verify the migration
    const remainingWithoutCardNumber = await PropertyFeature.countDocuments({
      $or: [{ card_number: { $exists: false } }, { card_number: null }],
    });

    if (remainingWithoutCardNumber === 0) {
      console.log(
        '✅ Migration verification passed: All features now have card_number',
      );
    } else {
      console.warn(
        `⚠️ Migration verification warning: ${remainingWithoutCardNumber} features still without card_number`,
      );
    }
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

// Export for use in other files
module.exports = { addCardNumbersToFeatures };

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

        await addCardNumbersToFeatures();

        console.log('🏁 Migration script completed');
        process.exit(0);
      })
      .catch((error) => {
        console.error('❌ MongoDB connection failed:', error);
        process.exit(1);
      });
  } else {
    // Already connected
    addCardNumbersToFeatures()
      .then(() => {
        console.log('🏁 Migration script completed');
      })
      .catch((error) => {
        console.error('❌ Migration failed:', error);
      });
  }
}
