const mongoose = require('mongoose');

/**
 * Billing Period Validation Utility
 *
 * Handles temporal database validation to ensure changes are only allowed
 * before final billing, with proper error handling and redirection logic.
 */

class BillingPeriodValidator {
  /**
   * Check if changes are allowed for a given municipality and year
   * @param {String} municipalityId - Municipality ID
   * @param {Number} effectiveYear - Assessment year
   * @returns {Object} Validation result with status and details
   */
  static async validateChangeAllowed(municipalityId, effectiveYear) {
    try {
      // Get current tax year
      const currentYear = new Date().getFullYear();

      // Check if trying to modify a future year (not allowed)
      if (effectiveYear > currentYear) {
        return {
          allowed: false,
          error: 'FUTURE_YEAR_MODIFICATION',
          message: `Cannot modify assessments for future year ${effectiveYear}`,
          redirect_year: currentYear,
          current_year: currentYear,
        };
      }

      // For current year, always allow changes
      if (effectiveYear === currentYear) {
        return {
          allowed: true,
          is_current_year: true,
          effective_year: effectiveYear,
          current_year: currentYear,
        };
      }

      // For past years, check final billing status
      const billingStatus = await this.getFinalBillingStatus(
        municipalityId,
        effectiveYear,
      );

      if (billingStatus.is_final_billed) {
        return {
          allowed: false,
          error: 'FINAL_BILLING_COMPLETED',
          message: `Final billing has been completed for ${effectiveYear}. Changes can only be made to ${currentYear} assessments.`,
          final_billing_date: billingStatus.final_billing_date,
          redirect_year: currentYear,
          current_year: currentYear,
          effective_year: effectiveYear,
        };
      }

      // Past year, not final billed - allow changes but flag as historical
      return {
        allowed: true,
        is_historical_year: true,
        effective_year: effectiveYear,
        current_year: currentYear,
        warning: `Modifying historical year ${effectiveYear}. Current year is ${currentYear}.`,
      };
    } catch (error) {
      console.error('Error validating billing period:', error);
      return {
        allowed: false,
        error: 'VALIDATION_ERROR',
        message: 'Unable to validate billing period status',
        details: error.message,
      };
    }
  }

  /**
   * Get final billing status for a municipality and year
   * @param {String} municipalityId - Municipality ID
   * @param {Number} effectiveYear - Assessment year
   * @returns {Object} Billing status information
   */
  static async getFinalBillingStatus(municipalityId, effectiveYear) {
    // This would typically check a billing_periods or municipality_years collection
    // For now, we'll create a simple check - in production this would be more complex

    try {
      // Check if there's a billing record indicating final billing
      // This is a placeholder - you would implement based on your billing system

      // For demonstration, let's say years before 2023 are final billed
      const currentYear = new Date().getFullYear();
      const cutoffYear = currentYear - 2; // Years older than 2 years are final billed

      if (effectiveYear < cutoffYear) {
        return {
          is_final_billed: true,
          final_billing_date: new Date(`${effectiveYear}-12-31`),
          billing_period_locked: true,
        };
      }

      // In a real implementation, you might query a collection like:
      /*
      const BillingPeriod = require('../models/BillingPeriod');
      const billingRecord = await BillingPeriod.findOne({
        municipality_id: municipalityId,
        effective_year: effectiveYear,
      });
      
      return {
        is_final_billed: billingRecord ? billingRecord.is_final_billed : false,
        final_billing_date: billingRecord ? billingRecord.final_billing_date : null,
        billing_period_locked: billingRecord ? billingRecord.is_locked : false,
      };
      */

      return {
        is_final_billed: false,
        final_billing_date: null,
        billing_period_locked: false,
      };
    } catch (error) {
      console.error('Error getting billing status:', error);
      throw error;
    }
  }

  /**
   * Validate and prepare audit info for assessment changes
   * @param {Object} req - Express request object
   * @param {String} municipalityId - Municipality ID
   * @param {Number} effectiveYear - Assessment year
   * @param {String} userId - User ID making the change
   * @returns {Object} Validation result with audit info
   */
  static async validateWithAuditInfo(
    req,
    municipalityId,
    effectiveYear,
    userId,
  ) {
    const validation = await this.validateChangeAllowed(
      municipalityId,
      effectiveYear,
    );

    if (!validation.allowed) {
      return validation;
    }

    // Prepare audit information
    const auditInfo = {
      user_id: userId,
      user_name: req.user?.name || req.user?.email || 'Unknown',
      session_id: req.sessionID || req.headers['x-session-id'],
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.headers['user-agent'],
      is_after_final_billing:
        validation.is_historical_year && validation.allowed,
      effective_year: effectiveYear,
      municipality_id: municipalityId,
    };

    return {
      ...validation,
      audit_info: auditInfo,
    };
  }

  /**
   * Create a billing period validation error response
   * @param {Object} validation - Validation result
   * @returns {Object} Formatted error response
   */
  static createValidationErrorResponse(validation) {
    const errorResponse = {
      success: false,
      error: validation.error,
      message: validation.message,
      current_year: validation.current_year,
      effective_year: validation.effective_year,
    };

    // Add redirect information if needed
    if (validation.redirect_year) {
      errorResponse.redirect = {
        year: validation.redirect_year,
        url: `/municipality/assessments/${validation.redirect_year}`,
        message: `Please navigate to ${validation.redirect_year} to make changes`,
      };
    }

    // Add additional context
    if (validation.final_billing_date) {
      errorResponse.final_billing_date = validation.final_billing_date;
    }

    return errorResponse;
  }

  /**
   * Middleware function for Express routes to validate billing periods
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   * @param {Function} next - Next middleware function
   */
  static async billingValidationMiddleware(req, res, next) {
    try {
      // Extract municipality and year from request
      const municipalityId =
        req.params.municipalityId || req.body.municipality_id;
      const effectiveYear = parseInt(
        req.params.year || req.body.effective_year || new Date().getFullYear(),
      );
      const userId = req.user?.id || req.user?._id;

      if (!municipalityId || !effectiveYear || !userId) {
        return res.status(400).json({
          success: false,
          error: 'MISSING_REQUIRED_PARAMS',
          message: 'Municipality ID, effective year, and user ID are required',
        });
      }

      // Validate the billing period
      const validation = await this.validateWithAuditInfo(
        req,
        municipalityId,
        effectiveYear,
        userId,
      );

      if (!validation.allowed) {
        return res
          .status(403)
          .json(this.createValidationErrorResponse(validation));
      }

      // Add validation info to request for downstream use
      req.billingValidation = validation;
      req.auditInfo = validation.audit_info;

      next();
    } catch (error) {
      console.error('Billing validation middleware error:', error);
      res.status(500).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Unable to validate billing period',
        details: error.message,
      });
    }
  }

  /**
   * Check if a specific assessment can be modified
   * @param {Object} assessment - Assessment document
   * @param {String} userId - User ID attempting modification
   * @returns {Object} Validation result
   */
  static async validateAssessmentModification(assessment, userId) {
    if (!assessment) {
      return {
        allowed: false,
        error: 'ASSESSMENT_NOT_FOUND',
        message: 'Assessment record not found',
      };
    }

    return this.validateChangeAllowed(
      assessment.municipality_id,
      assessment.effective_year,
    );
  }
}

module.exports = BillingPeriodValidator;
