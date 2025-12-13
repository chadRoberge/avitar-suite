/**
 * Check Land Assessment Individual Line Values
 *
 * This script verifies that individual land line values are being saved correctly
 * and that they sum to the calculated totals.
 *
 * Usage: node server/utils/check-land-values.js <property_id>
 */

require('dotenv').config();
const mongoose = require('mongoose');
const LandAssessment = require('../models/LandAssessment');

async function checkLandValues(propertyId) {
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to database\n');

    // Find the land assessment
    const assessment = await LandAssessment.findOne({
      property_id: new mongoose.Types.ObjectId(propertyId),
    })
      .sort({ effective_year: -1 })
      .populate('zone', 'name description');

    if (!assessment) {
      console.log(`❌ No land assessment found for property ${propertyId}`);
      process.exit(1);
    }

    console.log(`📋 Land Assessment for Property: ${propertyId}`);
    console.log(`   Year: ${assessment.effective_year}`);
    console.log(`   Zone: ${assessment.zone?.name || 'N/A'}`);
    console.log('');

    // Check land use details
    console.log(
      `📊 Land Use Details (${assessment.land_use_details?.length || 0} lines):`,
    );
    console.log('='.repeat(120));
    console.log(
      'Line | Land Use Type          | Size   | Market Value | CU Value  | Assessed Value | Base Rate | Factors',
    );
    console.log('-'.repeat(120));

    let sumMarketValue = 0;
    let sumCurrentUseValue = 0;
    let sumAssessedValue = 0;
    let sumAcreage = 0;

    if (assessment.land_use_details && assessment.land_use_details.length > 0) {
      assessment.land_use_details.forEach((line, index) => {
        const marketValue = line.marketValue || 0;
        const currentUseValue = line.currentUseValue || 0;
        const assessedValue = line.assessedValue || 0;
        const size = line.size || 0;
        const baseRate = line.baseRate || 0;

        // Calculate totals
        sumMarketValue += marketValue;
        sumCurrentUseValue += currentUseValue;
        sumAssessedValue += assessedValue;
        if (line.size_unit === 'AC') {
          sumAcreage += size;
        }

        // Format factors
        const factors = [];
        if (line.neighborhoodFactor)
          factors.push(`NH:${line.neighborhoodFactor.toFixed(2)}`);
        if (line.siteFactor) factors.push(`S:${line.siteFactor.toFixed(2)}`);
        if (line.topographyFactor)
          factors.push(`T:${line.topographyFactor.toFixed(2)}`);
        if (line.conditionFactor)
          factors.push(`C:${line.conditionFactor.toFixed(2)}`);
        if (line.economyOfScaleFactor)
          factors.push(`ES:${line.economyOfScaleFactor.toFixed(2)}`);

        console.log(
          `${String(index + 1).padStart(4)} | ` +
            `${(line.land_use_type || 'N/A').padEnd(22)} | ` +
            `${String(size).padStart(6)} | ` +
            `$${String(marketValue.toLocaleString()).padStart(11)} | ` +
            `$${String(currentUseValue.toLocaleString()).padStart(8)} | ` +
            `$${String(assessedValue.toLocaleString()).padStart(13)} | ` +
            `$${String(baseRate.toLocaleString()).padStart(8)} | ` +
            `${factors.join(', ')}`,
        );

        // Check for missing calculated values
        if (marketValue === 0 && size > 0) {
          console.log(
            `     ⚠️  WARNING: Line ${index + 1} has acreage but marketValue is 0`,
          );
        }
        if (baseRate === 0 && size > 0) {
          console.log(
            `     ⚠️  WARNING: Line ${index + 1} has acreage but baseRate is 0`,
          );
        }
      });
    } else {
      console.log('     No land use details found');
    }

    console.log('-'.repeat(120));
    console.log(
      `SUM  | ${String(sumAcreage.toFixed(2)).padStart(29)} AC | ` +
        `$${String(sumMarketValue.toLocaleString()).padStart(11)} | ` +
        `$${String(sumCurrentUseValue.toLocaleString()).padStart(8)} | ` +
        `$${String(sumAssessedValue.toLocaleString()).padStart(13)}`,
    );
    console.log('='.repeat(120));
    console.log('');

    // Check calculated totals
    console.log('📈 Calculated Totals (from database):');
    console.log(
      '   Total Acreage:                 ',
      assessment.calculated_totals?.totalAcreage || 0,
    );
    console.log(
      '   Land Details Market Value:    $',
      (
        assessment.calculated_totals?.landDetailsMarketValue || 0
      ).toLocaleString(),
    );
    console.log(
      '   Land Details Assessed Value:  $',
      (
        assessment.calculated_totals?.landDetailsAssessedValue || 0
      ).toLocaleString(),
    );
    console.log(
      '   Total Market Value:           $',
      (assessment.calculated_totals?.totalMarketValue || 0).toLocaleString(),
    );
    console.log(
      '   Total Assessed Value:         $',
      (assessment.calculated_totals?.totalAssessedValue || 0).toLocaleString(),
    );
    console.log(
      '   View Market Value:            $',
      (assessment.calculated_totals?.viewMarketValue || 0).toLocaleString(),
    );
    console.log(
      '   Waterfront Market Value:      $',
      (
        assessment.calculated_totals?.waterfrontMarketValue || 0
      ).toLocaleString(),
    );
    console.log('');

    // Compare sums to totals
    console.log('🔍 Verification:');
    const landDetailsTotalMarket =
      assessment.calculated_totals?.landDetailsMarketValue || 0;
    const landDetailsTotalAssessed =
      assessment.calculated_totals?.landDetailsAssessedValue || 0;
    const totalAcreageCalc = assessment.calculated_totals?.totalAcreage || 0;

    console.log(
      '   Market Value Match:    ',
      sumMarketValue === landDetailsTotalMarket
        ? '✅ MATCH'
        : `❌ MISMATCH (Sum: $${sumMarketValue.toLocaleString()}, Total: $${landDetailsTotalMarket.toLocaleString()}, Diff: $${(landDetailsTotalMarket - sumMarketValue).toLocaleString()})`,
    );
    console.log(
      '   Assessed Value Match:  ',
      sumAssessedValue === landDetailsTotalAssessed
        ? '✅ MATCH'
        : `❌ MISMATCH (Sum: $${sumAssessedValue.toLocaleString()}, Total: $${landDetailsTotalAssessed.toLocaleString()}, Diff: $${(landDetailsTotalAssessed - sumAssessedValue).toLocaleString()})`,
    );
    console.log(
      '   Acreage Match:         ',
      Math.abs(sumAcreage - totalAcreageCalc) < 0.01
        ? '✅ MATCH'
        : `❌ MISMATCH (Sum: ${sumAcreage.toFixed(2)}, Total: ${totalAcreageCalc.toFixed(2)}, Diff: ${(totalAcreageCalc - sumAcreage).toFixed(2)})`,
    );
    console.log('');

    // Additional diagnostics
    if (
      sumMarketValue === 0 &&
      assessment.calculated_totals?.landDetailsMarketValue > 0
    ) {
      console.log(
        '⚠️  CRITICAL: Individual line values are all 0, but total is not!',
      );
      console.log(
        '   This indicates that calculated values are not being saved to individual lines.',
      );
      console.log('');
    }

    if (sumMarketValue > 0 && sumMarketValue !== landDetailsTotalMarket) {
      console.log("⚠️  WARNING: Individual line values don't match total.");
      console.log(
        '   This could indicate a calculation error or data corruption.',
      );
      console.log('');
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed');
  }
}

// Get property ID from command line
const propertyId = process.argv[2];

if (!propertyId) {
  console.log('Usage: node server/utils/check-land-values.js <property_id>');
  console.log(
    'Example: node server/utils/check-land-values.js 507f1f77bcf86cd799439011',
  );
  process.exit(1);
}

checkLandValues(propertyId);
