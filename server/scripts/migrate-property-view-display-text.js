const mongoose = require('mongoose');
require('dotenv').config({ path: '../.env' });

// Import models
const PropertyView = require('../models/PropertyView');
const ViewAttribute = require('../models/ViewAttribute');

async function migratePropertyViewDisplayText() {
  try {
    console.log('Starting PropertyView displayText migration...');

    // Connect to MongoDB
    await mongoose.connect(
      process.env.MONGODB_URI || 'mongodb://localhost:27017/avitar',
    );
    console.log('Connected to MongoDB');

    // Find all PropertyView records that are missing displayText fields
    const viewsNeedingUpdate = await PropertyView.find({
      $or: [
        { subjectDisplayText: { $exists: false } },
        { subjectDisplayText: '' },
        { widthDisplayText: { $exists: false } },
        { widthDisplayText: '' },
        { distanceDisplayText: { $exists: false } },
        { distanceDisplayText: '' },
        { depthDisplayText: { $exists: false } },
        { depthDisplayText: '' },
      ],
      isActive: true,
    });

    console.log(
      `Found ${viewsNeedingUpdate.length} PropertyView records needing displayText updates`,
    );

    let updatedCount = 0;

    for (const view of viewsNeedingUpdate) {
      try {
        let needsUpdate = false;
        const updates = {};

        // Get subject attribute if missing displayText
        if (!view.subjectDisplayText) {
          const subjectAttr = await ViewAttribute.findById(view.subjectId);
          if (subjectAttr) {
            updates.subjectDisplayText = subjectAttr.displayText;
            needsUpdate = true;
          }
        }

        // Get width attribute if missing displayText
        if (!view.widthDisplayText) {
          const widthAttr = await ViewAttribute.findById(view.widthId);
          if (widthAttr) {
            updates.widthDisplayText = widthAttr.displayText;
            needsUpdate = true;
          }
        }

        // Get distance attribute if missing displayText
        if (!view.distanceDisplayText) {
          const distanceAttr = await ViewAttribute.findById(view.distanceId);
          if (distanceAttr) {
            updates.distanceDisplayText = distanceAttr.displayText;
            needsUpdate = true;
          }
        }

        // Get depth attribute if missing displayText
        if (!view.depthDisplayText) {
          const depthAttr = await ViewAttribute.findById(view.depthId);
          if (depthAttr) {
            updates.depthDisplayText = depthAttr.displayText;
            needsUpdate = true;
          }
        }

        if (needsUpdate) {
          await PropertyView.findByIdAndUpdate(view._id, updates);
          updatedCount++;
          console.log(
            `Updated PropertyView ${view._id} for property ${view.propertyId}`,
          );
        }
      } catch (error) {
        console.error(
          `Error updating PropertyView ${view._id}:`,
          error.message,
        );
      }
    }

    console.log(
      `Migration completed. Updated ${updatedCount} PropertyView records`,
    );
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run the migration
if (require.main === module) {
  migratePropertyViewDisplayText()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { migratePropertyViewDisplayText };
