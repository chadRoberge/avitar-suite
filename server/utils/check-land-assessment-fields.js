const mongoose = require('mongoose');
const LandAssessment = require('../models/LandAssessment');
const PropertyAttribute = require('../models/PropertyAttribute');

/**
 * Utility script to check land assessment site_conditions, driveway_type, road_type fields
 * and show which ones are null vs populated
 */

async function checkLandAssessmentFields(propertyId) {
  try {
    // Find the land assessment for this property
    const landAssessment = await LandAssessment.findOne({
      property_id: propertyId,
    })
      .sort({ effective_year: -1 })
      .lean();

    if (!landAssessment) {
      console.log('❌ No land assessment found for property:', propertyId);
      return;
    }

    console.log('\n📋 Land Assessment Field Check:');
    console.log('Property ID:', propertyId);
    console.log('Assessment ID:', landAssessment._id);
    console.log('\n🔍 Field Values (raw):');
    console.log('  site_conditions:', landAssessment.site_conditions);
    console.log('  driveway_type:', landAssessment.driveway_type);
    console.log('  road_type:', landAssessment.road_type);

    // Check if these IDs exist in PropertyAttribute collection
    if (landAssessment.site_conditions) {
      const site = await PropertyAttribute.findById(
        landAssessment.site_conditions,
      );
      console.log(
        '\n✅ Site Conditions exists:',
        site ? site.displayText : 'NOT FOUND',
      );
    } else {
      console.log('\n❌ site_conditions is NULL in database');
    }

    if (landAssessment.driveway_type) {
      const driveway = await PropertyAttribute.findById(
        landAssessment.driveway_type,
      );
      console.log(
        '✅ Driveway Type exists:',
        driveway ? driveway.displayText : 'NOT FOUND',
      );
    } else {
      console.log('❌ driveway_type is NULL in database');
    }

    if (landAssessment.road_type) {
      const road = await PropertyAttribute.findById(landAssessment.road_type);
      console.log(
        '✅ Road Type exists:',
        road ? road.displayText : 'NOT FOUND',
      );
    } else {
      console.log('❌ road_type is NULL in database');
    }

    // Show available site/driveway/road options
    console.log('\n📚 Available Options:');
    const [sites, driveways, roads] = await Promise.all([
      PropertyAttribute.find({ attributeType: 'site', isActive: true }).limit(
        5,
      ),
      PropertyAttribute.find({
        attributeType: 'driveway',
        isActive: true,
      }).limit(5),
      PropertyAttribute.find({ attributeType: 'road', isActive: true }).limit(
        5,
      ),
    ]);

    console.log('\nSite Conditions (first 5):');
    sites.forEach((s) => console.log(`  - ${s._id}: ${s.displayText}`));

    console.log('\nDriveway Types (first 5):');
    driveways.forEach((d) => console.log(`  - ${d._id}: ${d.displayText}`));

    console.log('\nRoad Types (first 5):');
    roads.forEach((r) => console.log(`  - ${r._id}: ${r.displayText}`));
  } catch (error) {
    console.error('Error checking land assessment fields:', error);
  }
}

module.exports = checkLandAssessmentFields;

// If run directly
if (require.main === module) {
  const propertyId = process.argv[2] || '691a27d1f09e1dab3088d476';

  mongoose
    .connect(
      process.env.MONGODB_URI || 'mongodb://localhost:27017/avitar-suite',
    )
    .then(() => {
      console.log('Connected to MongoDB');
      return checkLandAssessmentFields(propertyId);
    })
    .then(() => {
      console.log('\n✅ Check complete');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Error:', error);
      process.exit(1);
    });
}
