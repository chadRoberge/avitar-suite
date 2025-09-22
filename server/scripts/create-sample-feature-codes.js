const mongoose = require('mongoose');
const FeatureCode = require('../models/FeatureCode');

// Connect to MongoDB
mongoose.connect('mongodb://127.0.0.1:27017/avitar_development', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const municipalityId = '68b1ee91e6f6ded2c46824f9'; // Test Township

const sampleFeatureCodes = [
  {
    municipalityId,
    code: 'DECK',
    description: 'Deck',
    rate: 15.5,
    sizeAdjustment: 'normal',
    measurementType: 'length_width',
  },
  {
    municipalityId,
    code: 'GARAGE',
    description: 'Garage',
    rate: 45.0,
    sizeAdjustment: 'normal',
    measurementType: 'length_width',
  },
  {
    municipalityId,
    code: 'PORCH',
    description: 'Porch',
    rate: 25.0,
    sizeAdjustment: 'normal',
    measurementType: 'length_width',
  },
  {
    municipalityId,
    code: 'SHED',
    description: 'Storage Shed',
    rate: 20.0,
    sizeAdjustment: 'normal',
    measurementType: 'length_width',
  },
  {
    municipalityId,
    code: 'POOL',
    description: 'Swimming Pool',
    rate: 5000,
    sizeAdjustment: 'zero',
    measurementType: 'units',
  },
  {
    municipalityId,
    code: 'FENCE',
    description: 'Fencing',
    rate: 8.5,
    sizeAdjustment: 'normal',
    measurementType: 'units',
  },
];

async function createFeatureCodes() {
  try {
    console.log('Creating sample feature codes...');

    // Remove existing feature codes for this municipality
    await FeatureCode.deleteMany({ municipalityId });
    console.log('Removed existing feature codes');

    // Insert new feature codes
    const created = await FeatureCode.insertMany(sampleFeatureCodes);
    console.log(`Created ${created.length} feature codes:`);

    created.forEach((fc) => {
      console.log(
        `- ${fc.code}: ${fc.description} (${fc.measurementType}) - $${fc.rate}`,
      );
    });
  } catch (error) {
    console.error('Error creating feature codes:', error);
  } finally {
    mongoose.disconnect();
    console.log('Database connection closed');
  }
}

createFeatureCodes();
