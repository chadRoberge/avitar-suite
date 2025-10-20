const mongoose = require('mongoose');
const PropertySketch = require('../models/PropertySketch');

async function addAssessmentYearToSketches() {
  try {
    console.log(
      '🔧 Starting migration: Add assessment_year to existing sketches...',
    );

    // Find all sketches without assessment_year
    const sketchesWithoutYear = await PropertySketch.find({
      $or: [{ assessment_year: { $exists: false } }, { assessment_year: null }],
    });

    console.log(
      `📊 Found ${sketchesWithoutYear.length} sketches without assessment_year`,
    );

    if (sketchesWithoutYear.length === 0) {
      console.log('✅ No sketches need migration');
      return;
    }

    let updateCount = 0;
    const batchSize = 100;

    // Process in batches
    for (let i = 0; i < sketchesWithoutYear.length; i += batchSize) {
      const batch = sketchesWithoutYear.slice(i, i + batchSize);

      console.log(
        `🔄 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(sketchesWithoutYear.length / batchSize)}`,
      );

      // Update each sketch in the batch
      for (const sketch of batch) {
        // Use the year from created_at, or current year as fallback
        const assessmentYear = sketch.created_at
          ? sketch.created_at.getFullYear()
          : new Date().getFullYear();

        await PropertySketch.updateOne(
          { _id: sketch._id },
          {
            $set: {
              assessment_year: assessmentYear,
            },
          },
        );

        updateCount++;
      }
    }

    console.log(`✅ Migration completed: Updated ${updateCount} sketches`);

    // Verify the migration
    const verifyCount = await PropertySketch.countDocuments({
      $or: [{ assessment_year: { $exists: false } }, { assessment_year: null }],
    });

    if (verifyCount === 0) {
      console.log(
        '✅ Verification successful: All sketches now have assessment_year',
      );
    } else {
      console.warn(
        `⚠️  Warning: ${verifyCount} sketches still missing assessment_year`,
      );
    }
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

module.exports = { addAssessmentYearToSketches };
