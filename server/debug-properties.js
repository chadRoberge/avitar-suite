const mongoose = require('mongoose');
require('dotenv').config();

const PropertyTreeNode = require('./models/PropertyTreeNode');
const Municipality = require('./models/Municipality');

async function debugProperties() {
  try {
    // Connect to MongoDB
    await mongoose.connect(
      process.env.MONGODB_URI || 'mongodb://localhost:27017/avitar-dev',
    );
    console.log('Connected to MongoDB');

    // Get total property count
    const totalProperties = await PropertyTreeNode.countDocuments();
    console.log(`Total properties in database: ${totalProperties}`);

    // Get municipalities and their property counts
    const municipalities = await Municipality.find({}).lean();
    console.log(`Total municipalities: ${municipalities.length}`);

    for (const municipality of municipalities) {
      const propertyCount = await PropertyTreeNode.countDocuments({
        municipality_id: municipality._id,
      });
      console.log(
        `Municipality "${municipality.name}" (${municipality._id}): ${propertyCount} properties`,
      );

      // Show first few properties for this municipality
      const sampleProperties = await PropertyTreeNode.find({
        municipality_id: municipality._id,
      })
        .limit(3)
        .lean();

      sampleProperties.forEach((prop, index) => {
        console.log(
          `  Property ${index + 1}: PID ${prop.pid_formatted || prop.pid_raw}, Address: ${prop.location?.address || 'N/A'}`,
        );
      });
    }

    // Show recent properties
    console.log('\nRecent properties:');
    const recentProperties = await PropertyTreeNode.find({})
      .sort({ last_updated: -1 })
      .limit(5)
      .lean();

    recentProperties.forEach((prop, index) => {
      console.log(
        `  ${index + 1}. PID: ${prop.pid_formatted || prop.pid_raw}, Address: ${prop.location?.address || 'N/A'}, Updated: ${prop.last_updated}`,
      );
    });
  } catch (error) {
    console.error('Error debugging properties:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

debugProperties();
