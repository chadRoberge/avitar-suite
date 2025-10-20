const mongoose = require('mongoose');
const {
  addCardNumbersToFeatures,
} = require('./migrations/add-card-numbers-to-features');
const {
  addAssessmentYearToSketches,
} = require('./migrations/add-assessment-year-to-sketches');

// Load environment variables
require('dotenv').config();

async function runMigration() {
  try {
    // Connect to MongoDB
    const dbUrl =
      process.env.MONGODB_URI || 'mongodb://localhost:27017/avitar-suite';

    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(dbUrl, {
      useNewUrlParser: true,
    });

    console.log('✅ Connected to MongoDB');

    // Run the migrations
    await addCardNumbersToFeatures();
    await addAssessmentYearToSketches();

    console.log('🎉 Migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    // Close the connection
    await mongoose.connection.close();
    console.log('📴 MongoDB connection closed');
    process.exit(0);
  }
}

// Run the migration
runMigration();
