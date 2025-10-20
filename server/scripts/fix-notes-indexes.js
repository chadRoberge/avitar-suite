const mongoose = require('mongoose');
require('dotenv').config({ path: './server/.env' });

/**
 * Script to fix PropertyNotes and ListingHistory indexes
 * This will drop old indexes and create new ones with card_number
 */
async function fixIndexes() {
  try {
    // Connect to MongoDB
    const dbUrl = process.env.MONGODB_URI || 'mongodb://localhost:27017/avitar-suite';

    await mongoose.connect(dbUrl, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('📡 Connected to MongoDB');

    // Get the database
    const db = mongoose.connection.db;

    // Fix PropertyNotes indexes
    console.log('\n📝 Fixing PropertyNotes indexes...');
    const notesCollection = db.collection('propertynotes');

    // Get existing indexes
    const notesIndexes = await notesCollection.indexes();
    console.log('Current PropertyNotes indexes:', notesIndexes.map(i => i.name));

    // Drop the old unique index if it exists
    try {
      await notesCollection.dropIndex('propertyId_1_municipalityId_1');
      console.log('✅ Dropped old PropertyNotes unique index');
    } catch (error) {
      if (error.code === 27) {
        console.log('ℹ️  Old PropertyNotes index already removed');
      } else {
        console.log('⚠️  Error dropping old index:', error.message);
      }
    }

    // Create new unique index with card_number
    try {
      await notesCollection.createIndex(
        { propertyId: 1, municipalityId: 1, card_number: 1 },
        { unique: true, name: 'propertyId_1_municipalityId_1_card_number_1' }
      );
      console.log('✅ Created new PropertyNotes unique index with card_number');
    } catch (error) {
      console.log('ℹ️  New index already exists or error:', error.message);
    }

    // Fix ListingHistory indexes
    console.log('\n📋 Fixing ListingHistory indexes...');
    const listingCollection = db.collection('listinghistories');

    // Get existing indexes
    const listingIndexes = await listingCollection.indexes();
    console.log('Current ListingHistory indexes:', listingIndexes.map(i => i.name));

    // Drop the old index if it exists
    try {
      await listingCollection.dropIndex('propertyId_1_visitDate_-1');
      console.log('✅ Dropped old ListingHistory index');
    } catch (error) {
      if (error.code === 27) {
        console.log('ℹ️  Old ListingHistory index already removed');
      } else {
        console.log('⚠️  Error dropping old index:', error.message);
      }
    }

    // Create new index with card_number
    try {
      await listingCollection.createIndex(
        { propertyId: 1, card_number: 1, visitDate: -1 },
        { name: 'propertyId_1_card_number_1_visitDate_-1' }
      );
      console.log('✅ Created new ListingHistory index with card_number');
    } catch (error) {
      console.log('ℹ️  New index already exists or error:', error.message);
    }

    // Show final indexes
    console.log('\n📊 Final indexes:');
    const finalNotesIndexes = await notesCollection.indexes();
    console.log('PropertyNotes:', finalNotesIndexes.map(i => i.name));

    const finalListingIndexes = await listingCollection.indexes();
    console.log('ListingHistory:', finalListingIndexes.map(i => i.name));

    console.log('\n✅ Index fix completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error fixing indexes:', error);
    process.exit(1);
  }
}

// Run the fix
fixIndexes();
