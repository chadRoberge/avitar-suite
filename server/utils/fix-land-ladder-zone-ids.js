/**
 * Fix Land Ladder Zone IDs
 *
 * This script updates land ladders to use the correct zone ObjectIds
 * by matching zones by name instead of old ObjectIds.
 *
 * Usage: node server/utils/fix-land-ladder-zone-ids.js <municipality_id>
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Zone = require('../models/Zone');
const LandLadder = require('../models/LandLadder');

async function fixLandLadderZoneIds(municipalityId) {
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to database\n');

    const municipalityObjectId = new mongoose.Types.ObjectId(municipalityId);

    // Load all zones for this municipality
    const zones = await Zone.find({ municipalityId: municipalityObjectId });
    console.log(
      `📍 Found ${zones.length} zones in municipality ${municipalityId}`,
    );

    // Create zone name to ID mapping
    const zoneNameToId = new Map();
    zones.forEach((zone) => {
      zoneNameToId.set(zone.name, zone._id.toString());
      console.log(`   ${zone.name} -> ${zone._id}`);
    });
    console.log('');

    // Load all land ladders
    const landLadders = await LandLadder.find({
      municipalityId: municipalityObjectId,
    });
    console.log(`📊 Found ${landLadders.length} land ladders\n`);

    if (landLadders.length === 0) {
      console.log('❌ No land ladders found. Nothing to fix.');
      process.exit(0);
    }

    // Group land ladders by their current zone ID
    const laddersByOldZoneId = new Map();
    landLadders.forEach((ladder) => {
      const zoneIdStr = ladder.zoneId ? ladder.zoneId.toString() : 'null';
      if (!laddersByOldZoneId.has(zoneIdStr)) {
        laddersByOldZoneId.set(zoneIdStr, []);
      }
      laddersByOldZoneId.get(zoneIdStr).push(ladder);
    });

    console.log('📋 Current land ladder zone associations:');
    for (const [oldZoneId, ladders] of laddersByOldZoneId.entries()) {
      console.log(`   Zone ID ${oldZoneId}: ${ladders.length} ladders`);
    }
    console.log('');

    // Try to find zones by old IDs to get their names
    console.log('🔍 Attempting to match old zone IDs to current zones...\n');

    let updates = [];

    for (const [oldZoneId, ladders] of laddersByOldZoneId.entries()) {
      if (oldZoneId === 'null') {
        console.log(`⚠️  Skipping ${ladders.length} ladders with null zone ID`);
        continue;
      }

      // Check if old zone ID still exists
      const oldZone = await Zone.findById(oldZoneId);

      if (oldZone) {
        console.log(
          `✅ Zone ${oldZoneId} (${oldZone.name}) still exists - no update needed`,
        );
      } else {
        console.log(`❌ Zone ${oldZoneId} no longer exists`);

        // Since we can't find the old zone, we need to map by order
        // Land ladders are typically created in zone order (1, 2, 3, etc.)
        // Let's use the zone index as a hint
        const ladderIndex = Array.from(laddersByOldZoneId.keys()).indexOf(
          oldZoneId,
        );

        if (ladderIndex >= 0 && ladderIndex < zones.length) {
          const matchedZone = zones[ladderIndex];
          console.log(
            `   🔗 Mapping to zone ${matchedZone.name} (${matchedZone._id}) based on index ${ladderIndex + 1}`,
          );

          updates.push({
            oldZoneId,
            newZoneId: matchedZone._id,
            zoneName: matchedZone.name,
            ladderCount: ladders.length,
          });
        } else {
          console.log(
            `   ⚠️  Cannot auto-match - index ${ladderIndex} out of range`,
          );
        }
      }
    }

    if (updates.length === 0) {
      console.log('\n✅ All land ladders already have correct zone IDs!');
      process.exit(0);
    }

    // Show proposed updates
    console.log('\n📝 Proposed Updates:');
    console.log('═'.repeat(80));
    updates.forEach((update) => {
      console.log(`Zone "${update.zoneName}"`);
      console.log(`  Old ID: ${update.oldZoneId}`);
      console.log(`  New ID: ${update.newZoneId}`);
      console.log(`  Ladders to update: ${update.ladderCount}`);
      console.log('');
    });

    // Ask for confirmation (in production, you'd want user input here)
    console.log('⚠️  This will update land ladder zone IDs in the database.');
    console.log('⚠️  Make sure you have a backup before proceeding!\n');

    // Perform updates
    console.log('🔄 Updating land ladders...\n');
    let updatedCount = 0;

    for (const update of updates) {
      const result = await LandLadder.updateMany(
        {
          municipalityId: municipalityObjectId,
          zoneId: new mongoose.Types.ObjectId(update.oldZoneId),
        },
        {
          $set: { zoneId: new mongoose.Types.ObjectId(update.newZoneId) },
        },
      );

      console.log(
        `✅ Updated ${result.modifiedCount} ladders for zone "${update.zoneName}"`,
      );
      updatedCount += result.modifiedCount;
    }

    console.log('');
    console.log('═'.repeat(80));
    console.log(`✅ Successfully updated ${updatedCount} land ladders!`);
    console.log('');
    console.log('🔍 Verification:');

    // Verify updates
    const verifyLadders = await LandLadder.find({
      municipalityId: municipalityObjectId,
    });
    const verifyByZone = new Map();

    verifyLadders.forEach((ladder) => {
      const zoneIdStr = ladder.zoneId ? ladder.zoneId.toString() : 'null';
      if (!verifyByZone.has(zoneIdStr)) {
        verifyByZone.set(zoneIdStr, []);
      }
      verifyByZone.get(zoneIdStr).push(ladder);
    });

    for (const [zoneId, ladders] of verifyByZone.entries()) {
      const zone = zones.find((z) => z._id.toString() === zoneId);
      const zoneName = zone ? zone.name : 'Unknown';
      console.log(`   Zone ${zoneName} (${zoneId}): ${ladders.length} ladders`);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await mongoose.connection.close();
    console.log('\nDatabase connection closed');
  }
}

// Get municipality ID from command line
const municipalityId = process.argv[2];

if (!municipalityId) {
  console.log(
    'Usage: node server/utils/fix-land-ladder-zone-ids.js <municipality_id>',
  );
  console.log(
    'Example: node server/utils/fix-land-ladder-zone-ids.js 68b1ee91e6f6ded2c46824f9',
  );
  process.exit(1);
}

fixLandLadderZoneIds(municipalityId);
