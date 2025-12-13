const mongoose = require('mongoose');
const LandAssessmentCalculator = require('../../app/utils/land-assessment-calculator');
const LandAssessment = require('../models/LandAssessment');
const Zone = require('../models/Zone');
const LandLadder = require('../models/LandLadder');
const NeighborhoodCode = require('../models/NeighborhoodCode');
const { PropertyAttribute } = require('../models/PropertyAttribute');
const CurrentUse = require('../models/CurrentUse');
const LandTaxationCategory = require('../models/LandTaxationCategory');

/**
 * Backend service for land assessment calculations
 * Uses shared calculation logic for consistency with frontend
 */
class LandAssessmentCalculationService {
  constructor() {
    this.calculator = null;
    this.referenceData = {};
  }

  /**
   * Initialize the service with reference data for a municipality
   * @param {String} municipalityId - Municipality ID
   */
  async initialize(municipalityId) {
    try {
      console.log(
        `Initializing land assessment calculator for municipality: ${municipalityId}`,
      );

      // Load all reference data in parallel
      const [
        zones,
        landLadders,
        neighborhoodCodes,
        siteAttributes,
        drivewayAttributes,
        roadAttributes,
        topologyAttributes,
        currentUseCategories,
        landTaxationCategories,
      ] = await Promise.all([
        Zone.find({ municipalityId }),
        LandLadder.find({ municipalityId }),
        NeighborhoodCode.find({ municipalityId }),
        PropertyAttribute.find({
          municipalityId,
          attributeType: 'SiteAttribute',
        }),
        PropertyAttribute.find({
          municipalityId,
          attributeType: 'DrivewayAttribute',
        }),
        PropertyAttribute.find({
          municipalityId,
          attributeType: 'RoadAttribute',
        }),
        PropertyAttribute.find({
          municipalityId,
          attributeType: 'TopologyAttribute',
        }),
        CurrentUse.find({ municipalityId, isActive: true }),
        LandTaxationCategory.find({ municipalityId }),
      ]);

      // Group land ladders by zone ID
      const landLaddersByZone = {};
      landLadders.forEach((ladder, index) => {
        const zoneId = ladder.zoneId.toString(); // Convert ObjectId to string
        console.log(
          `Processing ladder ${index + 1}: zoneId=${zoneId}, acreage=${ladder.acreage}, value=${ladder.value}`,
        );

        if (!landLaddersByZone[zoneId]) {
          landLaddersByZone[zoneId] = [];
        }

        // Each ladder IS a tier - add it directly to the zone's tier array
        landLaddersByZone[zoneId].push({
          id: ladder._id.toString(),
          acreage: ladder.acreage,
          value: ladder.value,
          order: ladder.order,
        });
        console.log(
          `  - Added tier: ${ladder.acreage}AC @ $${ladder.value} to zone ${zoneId}`,
        );
      });

      // Sort tiers within each zone by order/acreage for proper interpolation
      Object.keys(landLaddersByZone).forEach((zoneId) => {
        landLaddersByZone[zoneId].sort(
          (a, b) => a.order - b.order || a.acreage - b.acreage,
        );
        console.log(
          `Final zone ${zoneId} has ${landLaddersByZone[zoneId].length} tiers:`,
          landLaddersByZone[zoneId].map((t) => `${t.acreage}AC@$${t.value}`),
        );
      });

      // Log zone and ladder mapping for debugging
      console.log(
        `Calculator initialized with ${zones.length} zones, ${landLadders.length} ladders, ${currentUseCategories.length} current use categories`,
      );
      console.log(
        `Zone IDs with land ladders:`,
        Object.keys(landLaddersByZone),
      );
      if (zones.length > 0) {
        console.log(
          `Zone IDs from zones:`,
          zones.map((z) => z._id.toString()),
        );
      }

      // Prepare reference data for calculator
      this.referenceData = {
        landLadders: landLaddersByZone,
        topologyAttributes,
        currentUseCategories,
        landTaxationCategories,
        neighborhoodCodes,
        siteAttributes,
        drivewayAttributes,
        roadAttributes,
        zones,
      };

      // Initialize calculator with reference data (handle ES6 module export)
      const Calculator =
        LandAssessmentCalculator.default || LandAssessmentCalculator;
      this.calculator = new Calculator(this.referenceData);

      console.log(
        `Calculator initialized with ${zones.length} zones, ${landLadders.length} ladders, ${currentUseCategories.length} current use categories`,
      );
      return true;
    } catch (error) {
      console.error('Failed to initialize land assessment calculator:', error);
      throw error;
    }
  }

  /**
   * Calculate assessment values for a single land assessment
   * @param {Object} landAssessment - LandAssessment document
   * @returns {Object} Calculated assessment values
   */
  async calculateLandAssessment(landAssessment) {
    if (!this.calculator) {
      throw new Error(
        'Calculator not initialized. Call initialize(municipalityId) first.',
      );
    }

    if (!landAssessment) {
      return this.getDefaultTotals();
    }

    const assessmentData = landAssessment.toObject();
    // Ensure zone ID is a string for the calculator
    if (assessmentData.zone && typeof assessmentData.zone === 'object') {
      // Zone is a Mongoose ObjectId or populated document - extract the ID
      assessmentData.zone = assessmentData.zone._id
        ? assessmentData.zone._id.toString()
        : assessmentData.zone.toString();
    } else if (
      assessmentData.zone &&
      assessmentData.zone instanceof mongoose.Types.ObjectId
    ) {
      assessmentData.zone = assessmentData.zone.toString();
    }

    // Log zone ID for debugging missing ladder issues
    if (assessmentData.zone) {
      const hasLadder =
        this.referenceData.landLadders &&
        this.referenceData.landLadders[assessmentData.zone];
      if (!hasLadder) {
        console.warn(
          `Assessment for property ${landAssessment.property_id} uses zone ${assessmentData.zone} but no land ladder found. Available zones:`,
          Object.keys(this.referenceData.landLadders || {}),
        );
      }
    }

    // Fetch property views to include in calculation
    let views = [];
    try {
      const PropertyView = require('../models/PropertyView');
      views = await PropertyView.findByProperty(landAssessment.property_id);
      console.log(
        `Found ${views.length} views for property ${landAssessment.property_id}`,
      );
    } catch (error) {
      console.warn(
        'Failed to fetch property views for calculation:',
        error.message,
      );
      views = [];
    }

    // Fetch property waterfronts to include in calculation
    let waterfronts = [];
    try {
      const PropertyWaterfront = require('../models/PropertyWaterfront');
      waterfronts = await PropertyWaterfront.findByProperty(
        landAssessment.property_id,
      );
      console.log(
        `Found ${waterfronts.length} waterfronts for property ${landAssessment.property_id}`,
      );
    } catch (error) {
      console.warn(
        'Failed to fetch property waterfronts for calculation:',
        error.message,
      );
      waterfronts = [];
    }

    return this.calculator.calculatePropertyAssessment(
      assessmentData,
      views,
      waterfronts,
    );
  }

  /**
   * Recalculate all land assessments for a municipality (OPTIMIZED)
   * @param {String} municipalityId - Municipality ID
   * @param {Object} options - Calculation options
   * @returns {Object} Summary of recalculation results
   */
  async recalculateAllProperties(municipalityId, options = {}) {
    await this.initialize(municipalityId);

    const effectiveYear = options.effectiveYear || new Date().getFullYear();
    const jobId = options.jobId || `recalc-${municipalityId}-${Date.now()}`;

    console.log(
      `🚀 Starting OPTIMIZED municipality-wide recalculation for: ${municipalityId}, year: ${effectiveYear}, jobId: ${jobId}`,
    );

    const batchSize = options.batchSize || 500; // Increased from 100 to 500
    let processedCount = 0;
    let updatedCount = 0;
    let errorCount = 0;
    const errors = [];
    const startTime = Date.now();

    try {
      // First, ensure all properties have assessments for the target year
      await this.ensureAssessmentsForYear(
        municipalityId,
        effectiveYear,
        options.userId,
      );

      // Build query to only process assessments for the specified year
      const query = {
        municipality_id: municipalityId,
        effective_year: effectiveYear,
      };

      // Get total count for progress tracking
      const totalCount = await LandAssessment.countDocuments(query);

      console.log(
        `📊 Found ${totalCount} properties with land assessments for year ${effectiveYear} to recalculate`,
      );

      // Store initial progress
      if (options.progressTracker) {
        await options.progressTracker.update(jobId, {
          status: 'running',
          progress: 0,
          totalCount,
          processedCount: 0,
          updatedCount: 0,
          errorCount: 0,
        });
      }

      // USE STREAMING CURSOR to avoid loading all into memory
      const cursor = LandAssessment.find(query).cursor({ batchSize });
      let batch = [];
      let batchNumber = 0;

      for await (const landAssessment of cursor) {
        batch.push(landAssessment);

        // Process when batch is full
        if (batch.length >= batchSize) {
          batchNumber++;
          const batchResult = await this.processBatchOptimized(
            batch,
            options,
            batchNumber,
          );

          processedCount += batchResult.processedCount;
          updatedCount += batchResult.updatedCount;
          errorCount += batchResult.errorCount;
          errors.push(...batchResult.errors);

          // Update progress
          const progress = Math.round((processedCount / totalCount) * 100);
          const elapsed = Date.now() - startTime;
          const rate = processedCount / (elapsed / 1000); // per second
          const remaining = totalCount - processedCount;
          const eta = Math.round(remaining / rate);

          console.log(
            `⚡ Progress: ${progress}% (${processedCount}/${totalCount}) - Rate: ${rate.toFixed(1)}/sec - ETA: ${eta}s - Updated: ${updatedCount}, Errors: ${errorCount}`,
          );

          if (options.progressTracker) {
            await options.progressTracker.update(jobId, {
              status: 'running',
              progress,
              totalCount,
              processedCount,
              updatedCount,
              errorCount,
              rate: rate.toFixed(1),
              eta,
            });
          }

          // Clear batch
          batch = [];
        }
      }

      // Process remaining items in last batch
      if (batch.length > 0) {
        batchNumber++;
        const batchResult = await this.processBatchOptimized(
          batch,
          options,
          batchNumber,
        );

        processedCount += batchResult.processedCount;
        updatedCount += batchResult.updatedCount;
        errorCount += batchResult.errorCount;
        errors.push(...batchResult.errors);
      }

      const duration = Date.now() - startTime;
      const summary = {
        municipalityId,
        totalProperties: totalCount,
        processedCount,
        updatedCount,
        errorCount,
        errors: errors.slice(0, 10), // Limit error details
        duration: `${(duration / 1000).toFixed(2)}s`,
        rate: `${(processedCount / (duration / 1000)).toFixed(1)}/sec`,
        completedAt: new Date(),
      };

      console.log('✅ Municipality-wide recalculation completed:', summary);

      if (options.progressTracker) {
        await options.progressTracker.update(jobId, {
          status: 'completed',
          progress: 100,
          totalCount,
          processedCount,
          updatedCount,
          errorCount,
          duration: summary.duration,
          rate: summary.rate,
        });
      }

      return summary;
    } catch (error) {
      console.error(
        '❌ Failed to complete municipality-wide recalculation:',
        error,
      );

      if (options.progressTracker) {
        await options.progressTracker.update(jobId, {
          status: 'failed',
          error: error.message,
        });
      }

      throw error;
    }
  }

  /**
   * Process a batch of assessments with optimization (BULK OPERATIONS)
   * @param {Array} batch - Array of land assessments to process
   * @param {Object} options - Processing options
   * @param {Number} batchNumber - Batch number for logging
   * @returns {Object} Batch processing results
   */
  async processBatchOptimized(batch, options, batchNumber) {
    const PropertyView = require('../models/PropertyView');
    const PropertyWaterfront = require('../models/PropertyWaterfront');

    let processedCount = 0;
    let updatedCount = 0;
    let errorCount = 0;
    const errors = [];

    try {
      // OPTIMIZATION 1: BULK FETCH views and waterfronts for entire batch
      const propertyIds = batch.map((la) => la.property_id);

      const [allViews, allWaterfronts] = await Promise.all([
        PropertyView.find({ propertyId: { $in: propertyIds } }).lean(),
        PropertyWaterfront.find({ propertyId: { $in: propertyIds } }).lean(),
      ]);

      // Group by property ID for fast lookup
      const viewsByProperty = {};
      const waterfrontsByProperty = {};

      allViews.forEach((view) => {
        const propId = view.propertyId.toString();
        if (!viewsByProperty[propId]) viewsByProperty[propId] = [];
        viewsByProperty[propId].push(view);
      });

      allWaterfronts.forEach((wf) => {
        const propId = wf.propertyId.toString();
        if (!waterfrontsByProperty[propId]) waterfrontsByProperty[propId] = [];
        waterfrontsByProperty[propId].push(wf);
      });

      console.log(
        `  📦 Batch ${batchNumber}: Fetched ${allViews.length} views and ${allWaterfronts.length} waterfronts for ${batch.length} properties`,
      );

      // OPTIMIZATION 2: Process all calculations in memory (no individual saves)
      const bulkOps = [];

      for (const landAssessment of batch) {
        try {
          processedCount++;

          // Get views and waterfronts from bulk-fetched data
          const propId = landAssessment.property_id.toString();
          const views = viewsByProperty[propId] || [];
          const waterfronts = waterfrontsByProperty[propId] || [];

          // Clear values if requested
          if (options.forceClearValues) {
            landAssessment.land_use_details?.forEach((landLine) => {
              landLine.baseRate = 0;
              landLine.baseValue = 0;
              landLine.neighborhoodFactor = 0;
              landLine.economyOfScaleFactor = 0;
              landLine.siteFactor = 0;
              landLine.drivewayFactor = 0;
              landLine.roadFactor = 0;
              landLine.topographyFactor = 0;
              landLine.conditionFactor = 0;
              landLine.marketValue = 0;
              landLine.currentUseValue = 0;
              landLine.currentUseCredit = 0;
              landLine.assessedValue = 0;
            });
          }

          // Calculate using the pre-fetched views and waterfronts
          const assessmentData = landAssessment.toObject();

          // Ensure zone ID is a string
          if (assessmentData.zone && typeof assessmentData.zone === 'object') {
            assessmentData.zone = assessmentData.zone._id
              ? assessmentData.zone._id.toString()
              : assessmentData.zone.toString();
          } else if (
            assessmentData.zone &&
            assessmentData.zone instanceof mongoose.Types.ObjectId
          ) {
            assessmentData.zone = assessmentData.zone.toString();
          }

          const calculationResult = this.calculator.calculatePropertyAssessment(
            assessmentData,
            views,
            waterfronts,
          );

          // Update land line values if requested
          if (options.forceClearValues && calculationResult.land_use_details) {
            for (let i = 0; i < landAssessment.land_use_details.length; i++) {
              const calculatedLine = calculationResult.land_use_details[i];
              if (calculatedLine) {
                Object.assign(landAssessment.land_use_details[i], {
                  baseRate: calculatedLine.baseRate || 0,
                  baseValue: calculatedLine.baseValue || 0,
                  neighborhoodFactor: calculatedLine.neighborhoodFactor || 0,
                  economyOfScaleFactor:
                    calculatedLine.economyOfScaleFactor || 0,
                  siteFactor: calculatedLine.siteFactor || 0,
                  drivewayFactor: calculatedLine.drivewayFactor || 0,
                  roadFactor: calculatedLine.roadFactor || 0,
                  topographyFactor: calculatedLine.topographyFactor || 0,
                  conditionFactor: calculatedLine.conditionFactor || 0,
                  marketValue: calculatedLine.marketValue || 0,
                  currentUseValue: calculatedLine.currentUseValue || 0,
                  currentUseCredit: calculatedLine.currentUseCredit || 0,
                  assessedValue: calculatedLine.assessedValue || 0,
                });
              }
            }
          }

          // Prepare bulk update operation (no save yet)
          if (options.save !== false) {
            bulkOps.push({
              updateOne: {
                filter: { _id: landAssessment._id },
                update: {
                  $set: {
                    calculated_totals: calculationResult.calculated_totals,
                    land_use_details: landAssessment.land_use_details,
                    last_calculated: new Date(),
                  },
                },
              },
            });
          }

          updatedCount++;
        } catch (error) {
          console.error(
            `  ❌ Error calculating assessment ${landAssessment._id}:`,
            error.message,
          );

          errorCount++;
          errors.push({
            success: false,
            propertyId: landAssessment.property_id,
            assessmentId: landAssessment._id,
            error: error.message,
          });
        }
      }

      // OPTIMIZATION 3: BULK SAVE - Single database operation for entire batch
      if (bulkOps.length > 0 && options.save !== false) {
        const bulkResult = await LandAssessment.bulkWrite(bulkOps, {
          ordered: false,
        });
        console.log(
          `  💾 Batch ${batchNumber}: Bulk saved ${bulkResult.modifiedCount} assessments`,
        );
      }

      return {
        processedCount,
        updatedCount,
        errorCount,
        errors,
      };
    } catch (error) {
      console.error(`  ❌ Batch ${batchNumber} processing failed:`, error);
      throw error;
    }
  }

  /**
   * Recalculate land assessment for a single property
   * @param {String} propertyId - Property ID to recalculate
   * @param {Object} options - Calculation options
   * @returns {Object} Recalculation result
   */
  async recalculatePropertyAssessment(propertyId, options = {}) {
    try {
      console.log(
        `🔄 Recalculating land assessment for property: ${propertyId}`,
      );

      // Find the land assessment for this property
      const landAssessment = await LandAssessment.findOne({
        property_id: propertyId,
        effective_year: options.effectiveYear || new Date().getFullYear(),
      });

      if (!landAssessment) {
        console.warn(`No land assessment found for property ${propertyId}`);
        return {
          success: false,
          message: `No land assessment found for property ${propertyId}`,
        };
      }

      // Initialize calculator with the municipality data
      await this.initialize(landAssessment.municipality_id);

      // Calculate new totals
      const calculatedTotals =
        await this.calculateLandAssessment(landAssessment);

      // Update the land assessment with new calculated values
      landAssessment.calculated_totals = calculatedTotals.calculated_totals;
      landAssessment.last_calculated = new Date();

      if (options.save !== false) {
        await landAssessment.save();
      }

      console.log(
        `✅ Land assessment recalculated successfully for property: ${propertyId}`,
        {
          totals: calculatedTotals,
        },
      );

      return {
        success: true,
        propertyId,
        totals: calculatedTotals,
        recalculatedAt: new Date(),
      };
    } catch (error) {
      console.error(
        `❌ Failed to recalculate land assessment for property ${propertyId}:`,
        error,
      );
      return {
        success: false,
        propertyId,
        error: error.message,
      };
    }
  }

  /**
   * Recalculate properties affected by reference data changes
   * @param {String} municipalityId - Municipality ID
   * @param {String} changeType - Type of change (zone, ladder, category, etc.)
   * @param {String} changeId - ID of changed reference data
   * @returns {Object} Summary of selective recalculation
   */
  async recalculateAffectedProperties(municipalityId, changeType, changeId) {
    await this.initialize(municipalityId);

    let query = { municipality_id: municipalityId };

    // Build selective query based on change type
    switch (changeType) {
      case 'zone':
        query['zone'] = changeId;
        break;
      case 'neighborhood':
        query['neighborhood'] = changeId;
        break;
      case 'current_use':
        query['land_use_details.land_use_type'] = changeId;
        break;
      case 'taxation_category':
        query['taxation_category'] = changeId;
        break;
      case 'view_attribute':
        // For view attribute changes, we need to find properties that have views using this attribute
        const PropertyView = require('../models/PropertyView');

        const attributeObjectId = mongoose.Types.ObjectId.isValid(changeId)
          ? new mongoose.Types.ObjectId(changeId)
          : changeId;

        // Find all property views that reference this attribute
        const affectedViews = await PropertyView.find({
          $or: [
            { subjectId: attributeObjectId },
            { widthId: attributeObjectId },
            { distanceId: attributeObjectId },
            { depthId: attributeObjectId },
          ],
          isActive: true,
        });

        // Get unique property IDs
        const affectedPropertyIds = [
          ...new Set(affectedViews.map((view) => view.propertyId)),
        ];

        if (affectedPropertyIds.length > 0) {
          query['property_id'] = { $in: affectedPropertyIds };
        } else {
          // No properties affected, return early
          return {
            success: true,
            affected: 0,
            recalculated: 0,
            errors: 0,
            message: 'No properties use this view attribute',
          };
        }
        break;
      default:
        // For global changes (like ladder updates), recalculate all
        break;
    }

    console.log(
      `Recalculating properties affected by ${changeType} change:`,
      changeId,
    );

    const affectedLandAssessments = await LandAssessment.find(query);
    console.log(
      `Found ${affectedLandAssessments.length} affected land assessments`,
    );

    let updatedCount = 0;
    let errorCount = 0;

    for (const landAssessment of affectedLandAssessments) {
      try {
        const calculatedTotals =
          await this.calculateLandAssessment(landAssessment);

        landAssessment.calculated_totals = calculatedTotals.calculated_totals;
        landAssessment.last_calculated = new Date();
        await landAssessment.save();

        updatedCount++;
      } catch (error) {
        console.error(
          `Error recalculating land assessment ${landAssessment._id}:`,
          error,
        );
        errorCount++;
      }
    }

    return {
      municipalityId,
      changeType,
      changeId,
      affectedCount: affectedLandAssessments.length,
      updatedCount,
      errorCount,
      completedAt: new Date(),
    };
  }

  /**
   * Validate calculation consistency across properties
   * @param {String} municipalityId - Municipality ID
   * @param {Number} sampleSize - Number of properties to validate
   * @returns {Object} Validation results
   */
  async validateCalculations(municipalityId, sampleSize = 50) {
    await this.initialize(municipalityId);

    const landAssessments = await LandAssessment.aggregate([
      { $match: { municipality_id: municipalityId } },
      { $sample: { size: sampleSize } },
    ]);

    const validationResults = [];

    for (const landAssessment of landAssessments) {
      const storedTotals = landAssessment.calculated_totals || {};
      const recalculatedTotals =
        await this.calculateLandAssessment(landAssessment);

      const discrepancies = {};
      Object.keys(recalculatedTotals).forEach((key) => {
        const stored = storedTotals[key] || 0;
        const calculated = recalculatedTotals[key] || 0;
        const difference = Math.abs(stored - calculated);

        if (difference > 1) {
          // Allow for rounding differences
          discrepancies[key] = {
            stored,
            calculated,
            difference,
          };
        }
      });

      if (Object.keys(discrepancies).length > 0) {
        validationResults.push({
          propertyId: landAssessment.property_id,
          discrepancies,
        });
      }
    }

    return {
      municipalityId,
      sampleSize: landAssessments.length,
      propertiesWithDiscrepancies: validationResults.length,
      discrepancies: validationResults,
      validatedAt: new Date(),
    };
  }

  /**
   * Mass recalculation with zone minimum acreage adjustments
   * @param {String} municipalityId - Municipality ID
   * @param {Number} effectiveYear - Assessment year
   * @param {String} userId - User ID for audit trail
   * @param {Object} options - Calculation options
   * @returns {Object} Summary of recalculation results with zone adjustments
   */
  async massRecalculateWithZoneAdjustments(
    municipalityId,
    effectiveYear,
    userId,
    options = {},
  ) {
    await this.initialize(municipalityId);

    console.log(
      `Starting mass land recalculation with zone adjustments for municipality ${municipalityId}, year ${effectiveYear}`,
    );

    const results = {
      processed: 0,
      updated: 0,
      errors: 0,
      zoneAdjustments: 0,
      excessAcreageCreated: 0,
      startTime: new Date(),
      details: [],
    };

    try {
      // Get all land assessments for the municipality and year
      const assessments = await LandAssessment.find({
        municipality_id: municipalityId,
        effective_year: effectiveYear,
      }).populate('zone');

      console.log(`Found ${assessments.length} land assessments to process`);

      // Process in batches to avoid memory issues
      const batchSize = options.batchSize || 50;
      for (let i = 0; i < assessments.length; i += batchSize) {
        const batch = assessments.slice(i, i + batchSize);
        await this.processZoneAdjustmentBatch(batch, userId, results);
        console.log(
          `Processed batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(assessments.length / batchSize)}`,
        );
      }

      results.endTime = new Date();
      results.duration = results.endTime - results.startTime;

      console.log('Mass land recalculation with zone adjustments completed:', {
        processed: results.processed,
        updated: results.updated,
        errors: results.errors,
        zoneAdjustments: results.zoneAdjustments,
        excessAcreageCreated: results.excessAcreageCreated,
        duration: `${results.duration}ms`,
      });

      return results;
    } catch (error) {
      console.error('Mass land recalculation failed:', error);
      results.error = error.message;
      throw error;
    }
  }

  /**
   * Process a batch of assessments for zone minimum acreage adjustments
   */
  async processZoneAdjustmentBatch(assessments, userId, results) {
    for (const assessment of assessments) {
      try {
        results.processed++;

        // Apply zone minimum acreage adjustments
        const adjustmentResult =
          await this.applyZoneMinimumAcreageAdjustments(assessment);

        if (adjustmentResult.adjusted) {
          results.zoneAdjustments++;
          if (adjustmentResult.excessAcreageCreated) {
            results.excessAcreageCreated++;
          }

          // Recalculate with the adjusted land use details
          const calculationResult =
            await this.calculateLandAssessment(assessment);

          // Update both the individual land line calculated values and the totals
          if (calculationResult.land_use_details) {
            // Update each land line with recalculated values
            for (let i = 0; i < assessment.land_use_details.length; i++) {
              const calculatedLine = calculationResult.land_use_details[i];
              if (calculatedLine) {
                // Copy calculated values back to the original land line
                Object.assign(assessment.land_use_details[i], {
                  baseRate: calculatedLine.baseRate || 0,
                  baseValue: calculatedLine.baseValue || 0,
                  neighborhoodFactor: calculatedLine.neighborhoodFactor || 0,
                  economyOfScaleFactor:
                    calculatedLine.economyOfScaleFactor || 0,
                  siteFactor: calculatedLine.siteFactor || 0,
                  drivewayFactor: calculatedLine.drivewayFactor || 0,
                  roadFactor: calculatedLine.roadFactor || 0,
                  topographyFactor: calculatedLine.topographyFactor || 0,
                  conditionFactor: calculatedLine.conditionFactor || 0,
                  marketValue: calculatedLine.marketValue || 0,
                  currentUseValue: calculatedLine.currentUseValue || 0,
                  currentUseCredit: calculatedLine.currentUseCredit || 0,
                  assessedValue: calculatedLine.assessedValue || 0,
                });
              }
            }
          }

          assessment.calculated_totals = calculationResult.calculated_totals;
          assessment.last_calculated = new Date();

          // Mark for audit trail
          assessment.updated_by = userId;
          assessment.updated_at = new Date();
          assessment.last_changed = new Date();
          assessment.change_reason = 'revaluation';

          await assessment.save();
          results.updated++;

          results.details.push({
            propertyId: assessment.property_id,
            adjustments: adjustmentResult.adjustments,
            excessAcreageCreated: adjustmentResult.excessAcreageCreated,
            newTotals: calculationResult.calculated_totals,
          });
        }
      } catch (error) {
        console.error(`Error processing assessment ${assessment._id}:`, error);
        results.errors++;
        results.details.push({
          propertyId: assessment.property_id,
          error: error.message,
        });
      }
    }
  }

  /**
   * Apply zone minimum acreage adjustments to a land assessment
   * @param {Object} assessment - LandAssessment document
   * @returns {Object} Adjustment results
   */
  async applyZoneMinimumAcreageAdjustments(assessment) {
    const result = {
      adjusted: false,
      adjustments: [],
      excessAcreageCreated: false,
    };

    if (
      !assessment.zone ||
      !assessment.land_use_details ||
      assessment.land_use_details.length === 0
    ) {
      return result;
    }

    // Get zone data (either populated object or find by ID)
    let zone = assessment.zone;
    if (typeof zone === 'string' || zone instanceof mongoose.Types.ObjectId) {
      zone = this.referenceData.zones.find(
        (z) => z._id.toString() === zone.toString(),
      );
    }

    if (!zone || !zone.minimumAcreage) {
      return result;
    }

    const minimumAcreage = zone.minimumAcreage;
    let totalExcessToRedistribute = 0;
    const adjustments = [];
    let firstContributingLine = null; // Track the first line that contributes excess acreage

    // First pass: Check non-excess land lines for acreage above zone minimum
    for (const landLine of assessment.land_use_details) {
      if (
        !landLine.is_excess_acreage &&
        landLine.size_unit === 'AC' &&
        landLine.size > minimumAcreage
      ) {
        const excessAcreage = landLine.size - minimumAcreage;
        totalExcessToRedistribute += excessAcreage;

        // Store the first contributing line for copying land use details
        if (!firstContributingLine) {
          firstContributingLine = landLine;
        }

        // Store original size for reporting
        const originalSize = landLine.size;

        // Adjust the land line to zone minimum
        landLine.size = minimumAcreage;

        // Clear calculated values so they get recalculated with new acreage
        landLine.baseRate = 0;
        landLine.baseValue = 0;
        landLine.marketValue = 0;
        landLine.currentUseValue = 0;
        landLine.currentUseCredit = 0;
        landLine.assessedValue = 0;

        adjustments.push({
          landLineId: landLine._id,
          landUseType: landLine.land_use_type,
          originalSize: originalSize,
          adjustedSize: landLine.size,
          excessRedistributed: excessAcreage,
        });

        result.adjusted = true;
      }
    }

    // Second pass: Redistribute excess acreage to existing excess acreage lines or create new one
    if (totalExcessToRedistribute > 0) {
      // Find existing excess acreage line
      let excessLine = assessment.land_use_details.find(
        (line) => line.is_excess_acreage && line.size_unit === 'AC',
      );

      if (excessLine) {
        // Add to existing excess acreage line
        const originalExcessSize = excessLine.size;
        excessLine.size += totalExcessToRedistribute;

        // Clear calculated values so they get recalculated with new acreage
        excessLine.baseRate = 0;
        excessLine.baseValue = 0;
        excessLine.marketValue = 0;
        excessLine.currentUseValue = 0;
        excessLine.currentUseCredit = 0;
        excessLine.assessedValue = 0;

        adjustments.push({
          landLineId: excessLine._id,
          type: 'excess_acreage_updated',
          landUseType: excessLine.land_use_type,
          originalSize: originalExcessSize,
          adjustedSize: excessLine.size,
          addedAcreage: totalExcessToRedistribute,
        });
      } else {
        // Create new excess acreage line, copying land use details from first contributing line
        // This ensures the excess acreage has the same land use type and topography as the source
        const newExcessLine = {
          // Copy land use details from the first contributing line
          land_use_detail_id: firstContributingLine?.land_use_detail_id || null,
          land_use_type: firstContributingLine?.land_use_type || 'RES',
          topography_id: firstContributingLine?.topography_id || null,
          topography: firstContributingLine?.topography || 'Level',
          size: totalExcessToRedistribute,
          size_unit: 'AC',
          is_excess_acreage: true,
          condition: 100, // 100% condition factor
          notes: `Excess acreage from zone minimum adjustment (${totalExcessToRedistribute.toFixed(2)} AC)`,
          // Initialize calculated values that will be properly computed
          baseRate: 0,
          baseValue: 0,
          neighborhoodFactor: 0,
          economyOfScaleFactor: 0,
          siteFactor: 0,
          drivewayFactor: 0,
          roadFactor: 0,
          topographyFactor: 0,
          conditionFactor: 0,
          marketValue: 0,
          currentUseValue: 0,
          currentUseCredit: 0,
          assessedValue: 0,
        };

        assessment.land_use_details.push(newExcessLine);
        result.excessAcreageCreated = true;

        adjustments.push({
          type: 'excess_acreage_created',
          landUseType: firstContributingLine?.land_use_type || 'RES',
          size: totalExcessToRedistribute,
          notes: `New excess acreage line created from zone minimum adjustments, using land use from contributing line`,
        });
      }
    }

    result.adjustments = adjustments;
    return result;
  }

  /**
   * Ensure all properties with land assessments have assessments for the target year
   * Creates new year assessments by copying from the most recent year
   * @param {String} municipalityId - Municipality ID
   * @param {Number} targetYear - Year to ensure assessments exist for
   * @param {String} userId - User ID for audit trail
   */
  async ensureAssessmentsForYear(municipalityId, targetYear, userId) {
    console.log(
      `Ensuring all properties have land assessments for year ${targetYear}`,
    );

    // Find all unique property IDs that have land assessments in any year
    const allPropertyIds = await LandAssessment.distinct('property_id', {
      municipality_id: municipalityId,
    });

    console.log(
      `Found ${allPropertyIds.length} properties with land assessments in municipality`,
    );

    // Find properties that already have assessments for the target year
    const existingTargetYearPropertyIds = await LandAssessment.distinct(
      'property_id',
      {
        municipality_id: municipalityId,
        effective_year: targetYear,
      },
    );

    console.log(
      `${existingTargetYearPropertyIds.length} properties already have ${targetYear} assessments`,
    );

    // Find properties missing target year assessments
    const missingPropertyIds = allPropertyIds.filter(
      (propertyId) =>
        !existingTargetYearPropertyIds.some(
          (existingId) => existingId.toString() === propertyId.toString(),
        ),
    );

    console.log(
      `${missingPropertyIds.length} properties need ${targetYear} assessments created`,
    );

    if (missingPropertyIds.length === 0) {
      console.log(
        'All properties already have assessments for the target year',
      );
      return;
    }

    // For each missing property, find their most recent assessment and copy to target year
    let createdCount = 0;
    let errorCount = 0;

    for (const propertyId of missingPropertyIds) {
      try {
        // Find the most recent assessment for this property (before target year)
        const mostRecentAssessment = await LandAssessment.findOne({
          property_id: propertyId,
          municipality_id: municipalityId,
          effective_year: { $lt: targetYear }, // Only look at years before target year
        }).sort({ effective_year: -1 }); // Most recent first

        if (mostRecentAssessment) {
          console.log(
            `Creating ${targetYear} assessment for property ${propertyId} from ${mostRecentAssessment.effective_year}`,
          );

          await LandAssessment.copyToNewYear(
            propertyId,
            mostRecentAssessment.effective_year,
            targetYear,
            userId,
            {
              change_reason: 'mass_recalculation_year_creation',
              notes: `Auto-created for ${targetYear} mass recalculation from ${mostRecentAssessment.effective_year} assessment`,
            },
          );

          createdCount++;
        } else {
          console.warn(
            `No previous land assessment found for property ${propertyId} to copy from`,
          );
          errorCount++;
        }
      } catch (error) {
        console.error(
          `Error creating ${targetYear} assessment for property ${propertyId}:`,
          error.message,
        );
        errorCount++;
      }
    }

    console.log(
      `Assessment creation completed: ${createdCount} created, ${errorCount} errors`,
    );
  }

  /**
   * Get default/empty totals structure
   */
  getDefaultTotals() {
    return {
      totalAcreage: 0,
      totalFrontage: 0,
      totalMarketValue: 0,
      totalCurrentUseValue: 0,
      totalAssessedValue: 0,
      totalCurrentUseCredit: 0,
      totalLNICU: 0,
      totalCUValue: 0,
    };
  }
}

module.exports = LandAssessmentCalculationService;
