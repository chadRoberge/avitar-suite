require('dotenv').config();
const mongoose = require('mongoose');
const Zone = require('../models/Zone');
const NeighborhoodCode = require('../models/NeighborhoodCode');
const SiteCondition = require('../models/SiteCondition');
const DrivewayType = require('../models/DrivewayType');
const RoadType = require('../models/RoadType');

const municipalityId = '68b1ee91e6f6ded2c46824f9'; // Replace with actual municipality ID

async function seedReferenceData() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('🔗 Connected to MongoDB');
    console.log('🌱 Seeding reference data...');

    // Seed Zones
    const zones = [
      {
        name: 'R1',
        description: 'Residential Single Family',
        minimumAcreage: 1.0,
        minimumFrontage: 150,
        municipalityId,
      },
      {
        name: 'R2',
        description: 'Residential Multi Family',
        minimumAcreage: 0.5,
        minimumFrontage: 100,
        municipalityId,
      },
      {
        name: 'C1',
        description: 'Commercial',
        minimumAcreage: 0.25,
        minimumFrontage: 75,
        municipalityId,
      },
      {
        name: 'I1',
        description: 'Industrial',
        minimumAcreage: 2.0,
        minimumFrontage: 200,
        municipalityId,
      },
      {
        name: 'A1',
        description: 'Agricultural',
        minimumAcreage: 5.0,
        minimumFrontage: 300,
        municipalityId,
      },
    ];
    await Zone.insertMany(zones);
    console.log('✅ Seeded zones');

    // Seed Neighborhood Codes
    const neighborhoods = [
      { code: 'DT', description: 'Downtown', rate: 1.2, municipalityId },
      {
        code: 'RS',
        description: 'Residential Suburban',
        rate: 1.0,
        municipalityId,
      },
      {
        code: 'RR',
        description: 'Rural Residential',
        rate: 0.9,
        municipalityId,
      },
      {
        code: 'CM',
        description: 'Commercial Main Street',
        rate: 1.3,
        municipalityId,
      },
      { code: 'IN', description: 'Industrial Zone', rate: 0.8, municipalityId },
    ];
    await NeighborhoodCode.insertMany(neighborhoods);
    console.log('✅ Seeded neighborhood codes');

    // Seed Site Conditions
    const siteConditions = [
      {
        name: 'Level',
        description: 'Level building site',
        adjustmentFactor: 1.0,
        municipalityId,
      },
      {
        name: 'Sloped',
        description: 'Gently sloped site',
        adjustmentFactor: 0.95,
        municipalityId,
      },
      {
        name: 'Steep',
        description: 'Steep slope requiring grading',
        adjustmentFactor: 0.85,
        municipalityId,
      },
      {
        name: 'Flood Plain',
        description: 'Located in flood zone',
        adjustmentFactor: 0.8,
        municipalityId,
      },
      {
        name: 'Rocky',
        description: 'Rocky terrain',
        adjustmentFactor: 0.9,
        municipalityId,
      },
    ];
    await SiteCondition.insertMany(siteConditions);
    console.log('✅ Seeded site conditions');

    // Seed Driveway Types
    const drivewayTypes = [
      {
        name: 'Paved',
        description: 'Asphalt or concrete driveway',
        adjustmentFactor: 1.0,
        municipalityId,
      },
      {
        name: 'Gravel',
        description: 'Gravel surface driveway',
        adjustmentFactor: 0.95,
        municipalityId,
      },
      {
        name: 'Dirt',
        description: 'Unpaved dirt driveway',
        adjustmentFactor: 0.9,
        municipalityId,
      },
      {
        name: 'None',
        description: 'No driveway access',
        adjustmentFactor: 0.85,
        municipalityId,
      },
    ];
    await DrivewayType.insertMany(drivewayTypes);
    console.log('✅ Seeded driveway types');

    // Seed Road Types
    const roadTypes = [
      {
        name: 'Paved',
        description: 'Paved public road',
        adjustmentFactor: 1.0,
        municipalityId,
      },
      {
        name: 'Gravel',
        description: 'Gravel public road',
        adjustmentFactor: 0.95,
        municipalityId,
      },
      {
        name: 'Dirt',
        description: 'Dirt/unpaved road',
        adjustmentFactor: 0.9,
        municipalityId,
      },
      {
        name: 'Private',
        description: 'Private road access',
        adjustmentFactor: 0.92,
        municipalityId,
      },
    ];
    await RoadType.insertMany(roadTypes);
    console.log('✅ Seeded road types');

    console.log('🎉 Reference data seeding complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding reference data:', error);
    process.exit(1);
  }
}

seedReferenceData();
