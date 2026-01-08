const Municipality = require('../models/Municipality');
const AssessmentYear = require('../models/AssessmentYear');
const mongoose = require('mongoose');

/**
 * Middleware to check if a configuration year is locked
 * Prevents modifications to configuration tables for locked years
 *
 * Usage:
 * - Add to POST/PUT/DELETE routes for year-aware configuration tables
 * - Requires municipalityId in req.params
 * - Reads year from req.body.effective_year or req.query.year
 */
const checkYearLock = async (req, res, next) => {
  try {
    const { municipalityId } = req.params;

    // Get the year from body or query
    const year =
      req.body.effective_year || parseInt(req.query.year) || null;

    // If no year specified, skip the check (legacy behavior)
    if (!year) {
      return next();
    }

    const municipalityObjectId = new mongoose.Types.ObjectId(municipalityId);

    // Check AssessmentYear model for lock status
    const assessmentYear = await AssessmentYear.findOne({
      municipalityId: municipalityObjectId,
      year: year,
    });

    if (assessmentYear?.isLocked) {
      return res.status(403).json({
        success: false,
        message: `Configuration for year ${year} is locked and cannot be modified.`,
        isYearLocked: true,
      });
    }

    next();
  } catch (error) {
    console.error('Check year lock error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check year lock status',
    });
  }
};

/**
 * Helper to get the effective year for queries
 * Returns the year from query params, or defaults to current year
 */
const getEffectiveYear = (req) => {
  return parseInt(req.query.year) || new Date().getFullYear();
};

/**
 * Helper to check if a year is locked for a municipality
 * Uses AssessmentYear model as source of truth
 */
const isYearLocked = async (municipalityId, year) => {
  const municipalityObjectId = new mongoose.Types.ObjectId(municipalityId);

  const assessmentYear = await AssessmentYear.findOne({
    municipalityId: municipalityObjectId,
    year: year,
  });

  return assessmentYear?.isLocked || false;
};

/**
 * Lock a configuration year for a municipality
 * Updates AssessmentYear model
 */
const lockYear = async (municipalityId, year) => {
  const municipalityObjectId = new mongoose.Types.ObjectId(municipalityId);

  const assessmentYear = await AssessmentYear.findOneAndUpdate(
    { municipalityId: municipalityObjectId, year: year },
    { $set: { isLocked: true } },
    { new: true },
  );

  if (!assessmentYear) {
    // Create AssessmentYear if it doesn't exist
    await AssessmentYear.create({
      municipalityId: municipalityObjectId,
      year: year,
      isLocked: true,
      isHidden: false,
    });
  }

  return true;
};

module.exports = {
  checkYearLock,
  getEffectiveYear,
  isYearLocked,
  lockYear,
};
