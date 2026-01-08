const mongoose = require('mongoose');

/**
 * Copy-on-Write Helper for Temporal Database Pattern
 *
 * Purpose: Provides utility methods for temporal queries and copy-on-write operations
 * - Gets effective records for a given year (most recent effective_year <= requested)
 * - Creates new records only when modifications occur (copy-on-write)
 * - Supports bulk operations for recalculation scenarios
 *
 * Key Concepts:
 * - Temporal inheritance: Records inherit from previous years until explicitly modified
 * - Copy-on-write: Only create new records when data actually changes
 * - Change detection: Compare values to avoid creating unnecessary records
 */
class CopyOnWriteHelper {
  /**
   * Get the effective record for a given year
   * Returns the most recent record where effective_year <= requested year
   *
   * @param {Model} Model - Mongoose model to query
   * @param {Object} query - Base query to identify the record (e.g., { property_id, card_number })
   * @param {number} year - The year to get the effective record for
   * @returns {Object|null} - The effective record or null if not found
   */
  static async getEffectiveRecord(Model, query, year) {
    return Model.findOne({
      ...query,
      effective_year: { $lte: year },
    }).sort({ effective_year: -1 });
  }

  /**
   * Get or create a record for a specific year
   * If a record exists for the year, returns it
   * If not, optionally creates a copy from the effective record
   *
   * @param {Model} Model - Mongoose model to query
   * @param {Object} query - Base query to identify the record
   * @param {number} year - The year to get/create the record for
   * @param {Object} options - Options for creation
   * @param {boolean} options.createIfMissing - Whether to create if no current year record exists
   * @param {Object} options.defaults - Default values for new records
   * @returns {Object} - The record for the specified year
   */
  static async getOrCreateForYear(Model, query, year, options = {}) {
    const { createIfMissing = false, defaults = {} } = options;

    // First, check if there's already a record for this exact year
    const exactMatch = await Model.findOne({
      ...query,
      effective_year: year,
    });

    if (exactMatch) {
      return exactMatch;
    }

    // Get the effective record (most recent <= year)
    const effectiveRecord = await this.getEffectiveRecord(Model, query, year);

    if (!createIfMissing) {
      // Return the effective record without creating a new one
      return effectiveRecord;
    }

    if (!effectiveRecord) {
      // No prior record exists - create new with defaults
      return Model.create({
        ...query,
        ...defaults,
        effective_year: year,
      });
    }

    // Create a copy from the effective record with new year
    const recordData = effectiveRecord.toObject();
    delete recordData._id;
    delete recordData.createdAt;
    delete recordData.updatedAt;

    return Model.create({
      ...recordData,
      effective_year: year,
      source_effective_year: effectiveRecord.effective_year,
      copied_at: new Date(),
    });
  }

  /**
   * Update a record for a specific year using copy-on-write semantics
   * If the record for the year doesn't exist, creates it first (copying from effective)
   * Then applies the update
   *
   * @param {Model} Model - Mongoose model to update
   * @param {Object} query - Base query to identify the record
   * @param {number} year - The year to update
   * @param {Object} updateData - Data to update
   * @param {Object} options - Options for the operation
   * @param {boolean} options.createNew - Force creation of new record even if one exists
   * @param {string} options.userId - User ID for audit trail
   * @returns {Object} - The updated or created record
   */
  static async updateForYear(Model, query, year, updateData, options = {}) {
    const { createNew = false, userId = null } = options;

    // Check if record for this year exists
    let record = await Model.findOne({
      ...query,
      effective_year: year,
    });

    if (record && !createNew) {
      // Update existing record
      Object.assign(record, updateData);
      if (userId) {
        record.updated_by = userId;
      }
      record.updated_at = new Date();
      await record.save();
      return record;
    }

    // Need to create a new record - get effective record to copy from
    const effectiveRecord = await this.getEffectiveRecord(Model, query, year);

    if (effectiveRecord) {
      // Copy from effective record
      const recordData = effectiveRecord.toObject();
      delete recordData._id;
      delete recordData.createdAt;
      delete recordData.updatedAt;

      record = await Model.create({
        ...recordData,
        ...updateData,
        effective_year: year,
        source_effective_year: effectiveRecord.effective_year,
        copied_at: new Date(),
        created_by: userId,
      });
    } else {
      // No prior record - create new
      record = await Model.create({
        ...query,
        ...updateData,
        effective_year: year,
        created_by: userId,
      });
    }

    return record;
  }

  /**
   * Compare assessment values to detect actual changes
   * Used during recalculation to avoid creating unnecessary records
   *
   * @param {Object} existing - Existing record values
   * @param {Object} calculated - Newly calculated values
   * @param {Array} fieldsToCompare - Fields to compare (dot notation supported)
   * @param {number} tolerance - Tolerance for floating point comparison
   * @returns {boolean} - True if values differ, false if unchanged
   */
  static compareValues(
    existing,
    calculated,
    fieldsToCompare = [],
    tolerance = 0.01,
  ) {
    for (const field of fieldsToCompare) {
      const existingValue = this.getNestedValue(existing, field);
      const calculatedValue = this.getNestedValue(calculated, field);

      // Handle null/undefined
      if (existingValue === null || existingValue === undefined) {
        if (calculatedValue !== null && calculatedValue !== undefined) {
          return true; // New value where there was none
        }
        continue;
      }

      // Handle numbers with tolerance
      if (typeof existingValue === 'number' && typeof calculatedValue === 'number') {
        if (Math.abs(existingValue - calculatedValue) > tolerance) {
          return true; // Values differ beyond tolerance
        }
        continue;
      }

      // Direct comparison for other types
      if (existingValue !== calculatedValue) {
        return true;
      }
    }

    return false; // No changes detected
  }

  /**
   * Get a nested value from an object using dot notation
   *
   * @param {Object} obj - Object to get value from
   * @param {string} path - Dot-notation path (e.g., 'parcel_totals.land_value')
   * @returns {*} - The value at the path, or undefined if not found
   */
  static getNestedValue(obj, path) {
    if (!obj || !path) return undefined;

    const parts = path.split('.');
    let current = obj;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = current[part];
    }

    return current;
  }

  /**
   * Bulk create records for a year during recalculation
   * Only creates records where values actually changed
   *
   * @param {Model} Model - Mongoose model
   * @param {ObjectId} municipalityId - Municipality ID
   * @param {number} year - Target year
   * @param {Function} calculateFn - Function to calculate new values for a property
   * @param {Array} fieldsToCompare - Fields to compare for change detection
   * @param {Object} options - Additional options
   * @returns {Object} - Results of the operation
   */
  static async bulkRecalculateForYear(
    Model,
    municipalityId,
    year,
    calculateFn,
    fieldsToCompare,
    options = {},
  ) {
    const { batchSize = 100, userId = null } = options;

    const results = {
      recordsCreated: 0,
      recordsUnchanged: 0,
      recordsUpdated: 0,
      errors: [],
      totalProcessed: 0,
    };

    // Get all properties with records that would be effective for this year
    const effectiveRecords = await Model.aggregate([
      {
        $match: {
          municipality_id: municipalityId,
          effective_year: { $lte: year },
        },
      },
      { $sort: { property_id: 1, effective_year: -1 } },
      {
        $group: {
          _id: '$property_id',
          doc: { $first: '$$ROOT' },
        },
      },
    ]);

    // Process in batches
    for (let i = 0; i < effectiveRecords.length; i += batchSize) {
      const batch = effectiveRecords.slice(i, i + batchSize);

      for (const { _id: propertyId, doc: effectiveRecord } of batch) {
        try {
          // Calculate new values
          const newValues = await calculateFn(propertyId, year);

          // Check if there's already a record for this year
          const existingYearRecord = await Model.findOne({
            property_id: propertyId,
            municipality_id: municipalityId,
            effective_year: year,
          });

          if (existingYearRecord) {
            // Compare with existing year record
            const hasChanges = this.compareValues(
              existingYearRecord.toObject(),
              newValues,
              fieldsToCompare,
            );

            if (hasChanges) {
              // Update existing record
              Object.assign(existingYearRecord, newValues);
              existingYearRecord.recalculated_at = new Date();
              existingYearRecord.recalculated_by = userId;
              await existingYearRecord.save();
              results.recordsUpdated++;
            } else {
              results.recordsUnchanged++;
            }
          } else {
            // Compare with effective record (inherited from previous year)
            const hasChanges = this.compareValues(
              effectiveRecord,
              newValues,
              fieldsToCompare,
            );

            if (hasChanges) {
              // Create new record only if values changed
              const recordData = { ...effectiveRecord };
              delete recordData._id;
              delete recordData.createdAt;
              delete recordData.updatedAt;

              await Model.create({
                ...recordData,
                ...newValues,
                effective_year: year,
                source_effective_year: effectiveRecord.effective_year,
                created_from_recalculation: true,
                recalculated_at: new Date(),
                recalculated_by: userId,
              });
              results.recordsCreated++;
            } else {
              // Values unchanged - continue to inherit from effective record
              results.recordsUnchanged++;
            }
          }

          results.totalProcessed++;
        } catch (error) {
          results.errors.push({
            propertyId,
            error: error.message,
          });
        }
      }
    }

    return results;
  }

  /**
   * Get all effective records for a municipality in a specific year
   * Uses aggregation to efficiently get the most recent record per property
   *
   * @param {Model} Model - Mongoose model to query
   * @param {ObjectId} municipalityId - Municipality ID
   * @param {number} year - The year to get effective records for
   * @param {Object} options - Additional query options
   * @returns {Array} - Array of effective records
   */
  static async getEffectiveRecordsForMunicipality(
    Model,
    municipalityId,
    year,
    options = {},
  ) {
    const { limit = 0, skip = 0, sort = {} } = options;

    const pipeline = [
      {
        $match: {
          municipality_id: municipalityId,
          effective_year: { $lte: year },
        },
      },
      { $sort: { property_id: 1, effective_year: -1 } },
      {
        $group: {
          _id: '$property_id',
          doc: { $first: '$$ROOT' },
        },
      },
      { $replaceRoot: { newRoot: '$doc' } },
    ];

    // Add optional sorting
    if (Object.keys(sort).length > 0) {
      pipeline.push({ $sort: sort });
    }

    // Add pagination
    if (skip > 0) {
      pipeline.push({ $skip: skip });
    }
    if (limit > 0) {
      pipeline.push({ $limit: limit });
    }

    return Model.aggregate(pipeline);
  }

  /**
   * Get full year history for a property
   * Shows which years have explicit records vs inherited values
   *
   * @param {Model} Model - Mongoose model to query
   * @param {ObjectId} propertyId - Property ID
   * @param {number} startYear - Start year for history
   * @param {number} endYear - End year for history
   * @param {Array} valueFields - Fields to include in history
   * @returns {Array} - Array of year records with inheritance info
   */
  static async getYearHistory(
    Model,
    propertyId,
    startYear,
    endYear,
    valueFields = [],
  ) {
    const history = [];

    for (let year = startYear; year <= endYear; year++) {
      const record = await this.getEffectiveRecord(
        Model,
        { property_id: propertyId },
        year,
      );

      const yearEntry = {
        year,
        effectiveYear: record?.effective_year || null,
        isInherited: record ? record.effective_year !== year : true,
        hasData: !!record,
      };

      // Add requested value fields
      if (record) {
        for (const field of valueFields) {
          yearEntry[field] = this.getNestedValue(record.toObject(), field);
        }
      }

      history.push(yearEntry);
    }

    return history;
  }
}

module.exports = CopyOnWriteHelper;
