const mongoose = require('mongoose');
require('dotenv').config({
  path: require('path').join(__dirname, '../../.env'),
});

const PropertyTreeNode = require('../models/PropertyTreeNode');
const PropertyAssessment = require('../models/PropertyAssessment');
const Municipality = require('../models/Municipality');
const PIDFormat = require('../models/PIDFormat');
const SalesHistory = require('../models/SalesHistory');

// Property generation data
const streetNames = [
  'Main Street',
  'Oak Avenue',
  'Maple Drive',
  'Pine Road',
  'Cedar Lane',
  'Elm Street',
  'First Street',
  'Second Street',
  'Third Street',
  'Park Avenue',
  'Church Street',
  'School Street',
  'Mill Road',
  'River Road',
  'Hill Street',
  'Grove Street',
  'Spring Street',
  'Summer Street',
  'Winter Street',
  'Pleasant Street',
  'High Street',
  'Water Street',
  'Forest Drive',
  'Meadow Lane',
  'Valley Road',
  'Ridge Road',
  'Commerce Street',
  'Industrial Drive',
  'Town Road',
  'Country Lane',
];

const firstNames = [
  'James',
  'Mary',
  'John',
  'Patricia',
  'Robert',
  'Jennifer',
  'Michael',
  'Linda',
  'William',
  'Elizabeth',
  'David',
  'Barbara',
  'Richard',
  'Susan',
  'Joseph',
  'Jessica',
  'Thomas',
  'Sarah',
  'Christopher',
  'Karen',
  'Charles',
  'Nancy',
  'Daniel',
  'Lisa',
  'Matthew',
  'Betty',
  'Anthony',
  'Helen',
  'Mark',
  'Sandra',
  'Donald',
  'Donna',
  'Steven',
  'Carol',
  'Paul',
  'Ruth',
  'Andrew',
  'Sharon',
  'Joshua',
  'Michelle',
  'Kenneth',
  'Laura',
  'Kevin',
  'Sarah',
  'Brian',
  'Kimberly',
  'George',
  'Deborah',
];

const lastNames = [
  'Smith',
  'Johnson',
  'Williams',
  'Brown',
  'Jones',
  'Garcia',
  'Miller',
  'Davis',
  'Rodriguez',
  'Martinez',
  'Hernandez',
  'Lopez',
  'Gonzalez',
  'Wilson',
  'Anderson',
  'Thomas',
  'Taylor',
  'Moore',
  'Jackson',
  'Martin',
  'Lee',
  'Perez',
  'Thompson',
  'White',
  'Harris',
  'Sanchez',
  'Clark',
  'Ramirez',
  'Lewis',
  'Robinson',
  'Walker',
  'Young',
  'Allen',
  'King',
  'Wright',
  'Scott',
  'Torres',
  'Nguyen',
  'Hill',
  'Flores',
  'Green',
  'Adams',
  'Nelson',
  'Baker',
  'Hall',
  'Rivera',
  'Campbell',
  'Mitchell',
];

const propertyTypes = [
  { type: 'Single Family Residence', class: 'R', weight: 70 },
  { type: 'Multi-Family', class: 'R', weight: 15 },
  { type: 'Condominium', class: 'R', weight: 8 },
  { type: 'Commercial Building', class: 'C', weight: 4 },
  { type: 'Industrial', class: 'I', weight: 2 },
  { type: 'Vacant Land', class: 'R', weight: 1 },
];

const neighborhoods = [
  'Downtown',
  'Residential District',
  'Historic District',
  'Village Center',
  'North End',
  'South End',
  'East Side',
  'West Side',
  'Hillside',
  'Riverside',
];

const zones = ['R1', 'R2', 'R3', 'C1', 'C2', 'I1', 'M1'];

function random(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function weightedChoice(options) {
  const totalWeight = options.reduce((sum, option) => sum + option.weight, 0);
  let randomNum = Math.random() * totalWeight;

  for (const option of options) {
    if (randomNum < option.weight) {
      return option;
    }
    randomNum -= option.weight;
  }
  return options[0];
}

function generatePID(map, lot, sublot = 0) {
  // 18-digit format: MMLLLSSSCCCCCCCCCC
  const mapStr = map.toString().padStart(2, '0');
  const lotStr = lot.toString().padStart(3, '0');
  const sublotStr = sublot.toString().padStart(3, '0');
  return `${mapStr}${lotStr}${sublotStr}0000000000`;
}

function calculateLandValue(propertyType, lotSize, neighborhood) {
  let baseRate = 50; // base $/sq ft

  // Adjust by property type
  if (propertyType.type === 'Commercial Building') baseRate *= 1.8;
  else if (propertyType.type === 'Industrial') baseRate *= 1.2;
  else if (propertyType.type === 'Vacant Land') baseRate *= 0.7;

  // Adjust by neighborhood
  if (neighborhood === 'Downtown' || neighborhood === 'Historic District')
    baseRate *= 1.3;
  else if (neighborhood === 'Village Center') baseRate *= 1.2;
  else if (neighborhood.includes('End')) baseRate *= 0.9;

  // Add some randomness
  baseRate *= 0.85 + Math.random() * 0.3; // ±15% variation

  return Math.round(lotSize * baseRate);
}

function calculateBuildingValue(
  propertyType,
  squareFootage,
  yearBuilt,
  quality,
) {
  if (propertyType.type === 'Vacant Land') return 0;

  let baseRate = 120; // base $/sq ft

  // Adjust by property type
  if (propertyType.type === 'Commercial Building') baseRate = 180;
  else if (propertyType.type === 'Industrial') baseRate = 90;
  else if (propertyType.type === 'Multi-Family') baseRate = 110;
  else if (propertyType.type === 'Condominium') baseRate = 140;

  // Adjust by quality
  const qualityMultipliers = { A: 1.4, B: 1.2, C: 1.0, D: 0.8 };
  baseRate *= qualityMultipliers[quality];

  // Depreciation based on age
  const currentYear = new Date().getFullYear();
  const age = currentYear - yearBuilt;
  let depreciation = 1.0;

  if (age > 50) depreciation = 0.7;
  else if (age > 30) depreciation = 0.8;
  else if (age > 15) depreciation = 0.9;
  else if (age > 5) depreciation = 0.95;

  // Add randomness
  baseRate *= 0.9 + Math.random() * 0.2; // ±10% variation

  return Math.round(squareFootage * baseRate * depreciation);
}

function generateNotes(propertyType, yearBuilt, hasLiens, needsInspection) {
  const notes = [];
  const currentYear = new Date().getFullYear();
  const age = currentYear - yearBuilt;

  // Age-based notes
  if (age < 5) notes.push('Recently constructed property');
  else if (age > 80) notes.push('Historic property with original character');
  else if (age > 50) notes.push('Well-established property');

  // Type-based notes
  if (propertyType.type === 'Commercial Building') {
    notes.push('Multi-use commercial space');
  } else if (propertyType.type === 'Single Family Residence') {
    const styles = [
      'Colonial',
      'Ranch',
      'Cape Cod',
      'Contemporary',
      'Victorian',
    ];
    notes.push(`${randomChoice(styles)} style home`);
  }

  // Condition notes
  if (hasLiens) notes.push('Tax lien in place - payment plan active');
  if (needsInspection) notes.push('Scheduled for assessment review');

  // Random improvements
  if (Math.random() < 0.3) {
    const improvements = [
      'Updated kitchen',
      'New roof',
      'Renovated bathrooms',
      'Finished basement',
    ];
    notes.push(randomChoice(improvements));
  }

  return notes.join('. ') + '.';
}

function generateProperties(municipalityId, count) {
  const properties = [];
  const usedPIDs = new Set();

  for (let i = 0; i < count; i++) {
    // Generate unique PID
    let pid;
    do {
      const map = random(1, 20);
      const lot = random(1, 120);
      const sublot = Math.random() < 0.15 ? random(1, 10) : 0; // 15% chance of sublot
      pid = generatePID(map, lot, sublot);
    } while (usedPIDs.has(pid));
    usedPIDs.add(pid);

    // Basic property info
    const propertyType = weightedChoice(propertyTypes);
    const street = randomChoice(streetNames);
    const neighborhood = randomChoice(neighborhoods);
    const zone = randomChoice(zones);

    // Generate address
    const streetNumber =
      propertyType.type === 'Vacant Land' ? null : random(1, 999);
    const address = streetNumber
      ? `${streetNumber} ${street}`
      : `Vacant Land - ${street}`;

    // Owner info
    const firstName = randomChoice(firstNames);
    const lastName = randomChoice(lastNames);
    const ownerName = `${lastName}, ${firstName}`;

    // Property characteristics
    const yearBuilt =
      propertyType.type === 'Vacant Land' ? null : random(1920, 2023);
    const quality = randomChoice(['A', 'B', 'B', 'C', 'C', 'C']); // Weighted toward C

    // Calculate lot size and square footage
    const lotSize =
      propertyType.type === 'Commercial Building'
        ? random(20000, 100000)
        : random(5000, 50000);
    const squareFootage =
      propertyType.type === 'Vacant Land'
        ? 0
        : propertyType.type === 'Commercial Building'
          ? random(2000, 20000)
          : propertyType.type === 'Multi-Family'
            ? random(2000, 8000)
            : random(800, 4000);

    // Calculate values
    const landValue = calculateLandValue(propertyType, lotSize, neighborhood);
    const buildingValue = calculateBuildingValue(
      propertyType,
      squareFootage,
      yearBuilt,
      quality,
    );
    const otherValue = Math.random() < 0.2 ? random(5000, 25000) : 0; // 20% have other improvements
    const totalValue = landValue + buildingValue + otherValue;

    // Module flags
    const hasLiens = Math.random() < 0.08; // 8%
    const hasAppeals = Math.random() < 0.05; // 5%
    const hasPermits = Math.random() < 0.15; // 15%
    const needsInspection = Math.random() < 0.12; // 12%
    const isNewConstruction = yearBuilt && yearBuilt > 2020;

    properties.push({
      municipality_id: municipalityId,
      pid_raw: pid,
      account_number: `${propertyType.class}-${pid.substr(0, 3)}-${pid.substr(3, 4)}${pid.substr(7, 4) !== '0000' ? '-' + pid.substr(7, 4) : ''}`,
      location: {
        street: street,
        street_number: streetNumber?.toString(),
        address: address,
        neighborhood: neighborhood,
        zone: zone,
      },
      owner: {
        primary_name: ownerName,
        mailing_address: `${streetNumber ? streetNumber + ' ' : ''}${street}, Test Township, NH 03255`,
        properties_count: 1,
        owner_id: `OWNER_${String(i + 1).padStart(4, '0')}`,
      },
      property_class: propertyType.class,
      property_type: propertyType.type,
      assessed_value: totalValue,
      tax_status: Math.random() < 0.95 ? 'taxable' : 'exempt',
      notes: generateNotes(propertyType, yearBuilt, hasLiens, needsInspection),
      module_flags: {
        has_building_permits: hasPermits,
        has_recent_permits: hasPermits && Math.random() < 0.3,
        has_pending_appeals: hasAppeals,
        has_liens: hasLiens,
        needs_inspection: needsInspection,
        is_new_construction: isNewConstruction,
      },
    });
  }

  return properties;
}

async function seedProperties() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Get the test municipality
    const municipality = await Municipality.findOne({ code: 'TEST' });
    if (!municipality) {
      console.error('Test municipality not found');
      return;
    }

    console.log(`Seeding properties for ${municipality.name}`);

    // Clear existing test data
    await PropertyTreeNode.deleteMany({ municipality_id: municipality._id });
    await PropertyAssessment.deleteMany({ municipality_id: municipality._id });
    await SalesHistory.deleteMany({ municipality_id: municipality._id });
    await PIDFormat.deleteMany({ municipality_id: municipality._id });

    // Create PID format for this municipality (using complex format as example)
    const pidFormat = await PIDFormat.createDefaultFormat(
      municipality._id,
      'complex',
    );
    console.log('Created PID format:', pidFormat.format);

    // Generate 1000 properties programmatically
    console.log('Generating 1000 properties...');

    const properties = generateProperties(municipality._id, 1000);

    // Insert properties and get their IDs
    const createdProperties = await PropertyTreeNode.insertMany(properties);
    console.log(`Created ${createdProperties.length} properties`);

    // Generate assessments for a sample of properties
    console.log('Generating assessment history for properties...');

    const assessmentData = [];
    const sampleSize = Math.min(200, createdProperties.length); // Create assessments for first 200 properties

    for (let i = 0; i < sampleSize; i++) {
      const property = createdProperties[i];
      const currentValue = property.assessed_value;

      // Create 2024 current assessment
      assessmentData.push({
        property_id: property._id,
        municipality_id: municipality._id,
        effective_year: 2024,
        land: {
          value: Math.round(currentValue * 0.3),
          last_changed: 2024,
        },
        building: {
          value: Math.round(currentValue * 0.7),
          last_changed: 2024,
        },
        total_value: currentValue,
        assessment_method: 'market',
        change_reason: 'cyclical_review',
        listing_history: [
          {
            visit_date: new Date(2024, random(0, 11), random(1, 28)),
            visit_code: randomChoice(['CYCL', 'INSP', 'MEAS']),
            notes: 'Property inspection and measurement verification.',
          },
        ],
      });

      // 30% chance of having previous year assessment
      if (Math.random() < 0.3) {
        const previousValue = Math.round(
          currentValue * (0.85 + Math.random() * 0.2),
        ); // ±10% from current
        assessmentData.push({
          property_id: property._id,
          municipality_id: municipality._id,
          effective_year: random(2019, 2023),
          land: {
            value: Math.round(previousValue * 0.3),
            last_changed: random(2019, 2023),
          },
          building: {
            value: Math.round(previousValue * 0.7),
            last_changed: random(2019, 2023),
          },
          total_value: previousValue,
          assessment_method: randomChoice(['market', 'cost']),
          change_reason: randomChoice([
            'revaluation',
            'renovation',
            'market_correction',
          ]),
          listing_history: [
            {
              visit_date: new Date(
                random(2019, 2023),
                random(0, 11),
                random(1, 28),
              ),
              visit_code: randomChoice(['RENO', 'APPE', 'MARK']),
              notes: 'Assessment change documentation and review.',
            },
          ],
        });
      }
    }

    // Batch insert assessments
    if (assessmentData.length > 0) {
      const batchSize = 100;
      for (let i = 0; i < assessmentData.length; i += batchSize) {
        const batch = assessmentData.slice(i, i + batchSize);
        await PropertyAssessment.insertMany(batch);
      }
      console.log(`Created ${assessmentData.length} assessment records`);
    }

    // Generate sales history for properties
    console.log('Generating sales history...');

    const salesHistoryData = [];
    const salesSampleSize = Math.min(
      400,
      Math.floor(createdProperties.length * 0.4),
    ); // 40% of properties have sales

    const saleCodes = ['ARM', 'EST', 'FAM', 'NEW', 'TAX', 'COM', 'REO', 'AUC'];
    const deedTypes = [
      'Warranty Deed',
      'Quitclaim Deed',
      'Executors Deed',
      'Municipal Deed',
      'Foreclosure Deed',
    ];

    for (let i = 0; i < salesSampleSize; i++) {
      const property = createdProperties[i];
      const numSales = Math.random() < 0.7 ? 1 : Math.random() < 0.9 ? 2 : 3; // Most have 1 sale, some have 2-3

      for (let s = 0; s < numSales; s++) {
        const saleYear = random(2003, 2024);
        const baseValue = property.assessed_value;

        // Calculate sale amount with market fluctuation
        let saleAmount = baseValue * (0.8 + Math.random() * 0.4); // ±20% from assessment

        // Apply year-based market trends
        if (saleYear < 2008)
          saleAmount *= 0.85; // Pre-recession
        else if (saleYear < 2012)
          saleAmount *= 0.75; // Recession years
        else if (saleYear < 2020)
          saleAmount *= 0.95; // Recovery
        else saleAmount *= 1.05; // Recent years

        saleAmount = Math.round(saleAmount);

        const qualified = Math.random() > 0.15; // 85% qualified sales
        const saleCode = qualified
          ? randomChoice(['ARM', 'ARM', 'ARM', 'EST', 'NEW'])
          : randomChoice(['FAM', 'REO']);

        salesHistoryData.push({
          property_id: property._id,
          municipality_id: municipality._id,
          sale_date: new Date(saleYear, random(0, 11), random(1, 28)),
          sale_amount: saleAmount,
          grantor: `${randomChoice(lastNames)}, ${randomChoice(firstNames)}`,
          grantee: property.owner.primary_name,
          book: random(1000, 2000).toString(),
          page: random(1, 999).toString(),
          deed_type: randomChoice(deedTypes),
          qualified: qualified,
          sale_code: saleCode,
          assessment_at_sale: Math.round(
            baseValue * (0.9 + Math.random() * 0.2),
          ),
          assessment_year: saleYear,
          financing: randomChoice([
            'Cash',
            'Conventional',
            'FHA',
            'VA',
            'Commercial',
          ]),
          conditions: qualified
            ? 'Standard sale'
            : 'Non-arms length transaction',
          verified: Math.random() > 0.2, // 80% verified
        });
      }
    }

    // Batch insert sales
    if (salesHistoryData.length > 0) {
      const batchSize = 100;
      for (let i = 0; i < salesHistoryData.length; i += batchSize) {
        const batch = salesHistoryData.slice(i, i + batchSize);
        await SalesHistory.insertMany(batch);
      }
      console.log(`Created ${salesHistoryData.length} sales history records`);
    }

    console.log('✅ Property seeding completed successfully!');
  } catch (error) {
    console.error('Error seeding properties:', error);
  } finally {
    await mongoose.connection.close();
  }
}

// Run if called directly
if (require.main === module) {
  seedProperties();
}

module.exports = seedProperties;
