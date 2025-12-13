/**
 * Migration script to rename 'value' field to 'factor' in WaterBodyLadder collection
 *
 * Run with: node server/utils/migrate-ladder-value-to-factor.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI =
  process.env.MONGODB_URI || 'mongodb://localhost:27017/municipalities';

async function migrateLadderValueToFactor() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected successfully');

    const db = mongoose.connection.db;
    const collection = db.collection('waterbodyladders');

    // Count documents that need migration (have 'value' but not 'factor')
    const needsMigration = await collection.countDocuments({
      value: { $exists: true },
      factor: { $exists: false },
    });

    console.log(`Found ${needsMigration} ladder entries that need migration`);

    if (needsMigration === 0) {
      console.log('No migration needed!');
      await mongoose.disconnect();
      return;
    }

    // Update all documents: rename 'value' to 'factor'
    const result = await collection.updateMany(
      { value: { $exists: true } },
      {
        $rename: { value: 'factor' },
      },
    );

    console.log(`Migration complete!`);
    console.log(`- Matched: ${result.matchedCount}`);
    console.log(`- Modified: ${result.modifiedCount}`);

    // Verify migration
    const remaining = await collection.countDocuments({
      value: { $exists: true },
      factor: { $exists: false },
    });

    console.log(`Verification: ${remaining} entries still need migration`);

    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

// Run migration
migrateLadderValueToFactor();
