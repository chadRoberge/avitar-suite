const express = require('express');
const router = express.Router();
const Revaluation = require('../models/Revaluation');
const RevaluationAnalysisSheet = require('../models/RevaluationAnalysisSheet');
const RevaluationSaleAdjustment = require('../models/RevaluationSaleAdjustment');
const SalesHistory = require('../models/SalesHistory');
const BuildingAssessment = require('../models/BuildingAssessment');
const PIDFormat = require('../models/PIDFormat');
const BuildingAssessmentCalculator = require('../utils/building-assessment-calculator');
const mongoose = require('mongoose');
const { authenticateToken } = require('../middleware/auth');
const { formatPid } = require('../utils/pidFormatter');

// =============================================================================
// REVALUATION ENDPOINTS
// =============================================================================

// GET /api/municipalities/:municipalityId/revaluations/active - Get active revaluation
router.get(
  '/municipalities/:municipalityId/revaluations/active',
  authenticateToken,
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
      const municipalityObjectId = new mongoose.Types.ObjectId(municipalityId);

      const revaluation = await Revaluation.getActive(municipalityObjectId);

      if (!revaluation) {
        return res.json({ revaluation: null });
      }

      res.json({ revaluation });
    } catch (error) {
      console.error('Error fetching active revaluation:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// POST /api/municipalities/:municipalityId/revaluations - Create new revaluation
router.post(
  '/municipalities/:municipalityId/revaluations',
  authenticateToken,
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
      const municipalityObjectId = new mongoose.Types.ObjectId(municipalityId);
      const userId = req.user._id;

      const { effective_year, global_settings, notes } = req.body;

      // Create default global settings if not provided
      const defaultSettings = {
        base_year: effective_year || new Date().getFullYear(),
        time_trend: [],
        current_use: {
          max_current_use_acreage: 2.0,
          current_use_rate_multiplier: 1.0,
        },
      };

      const revaluation = new Revaluation({
        municipality_id: municipalityObjectId,
        effective_year: effective_year || new Date().getFullYear(),
        global_settings: global_settings || defaultSettings,
        status: 'in_progress',
        notes: notes || '',
        created_by: userId,
      });

      await revaluation.save();

      res.status(201).json({ revaluation });
    } catch (error) {
      console.error('Error creating revaluation:', error);
      if (error.code === 11000) {
        return res.status(400).json({
          error: 'Revaluation already exists for this year',
        });
      }
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// PUT /api/municipalities/:municipalityId/revaluations/:revId/settings - Update global settings
router.put(
  '/municipalities/:municipalityId/revaluations/:revId/settings',
  authenticateToken,
  async (req, res) => {
    try {
      const { revId } = req.params;
      const userId = req.user._id;
      const { base_year, time_trend, current_use } = req.body;

      const revaluation = await Revaluation.findById(revId);
      if (!revaluation) {
        return res.status(404).json({ error: 'Revaluation not found' });
      }

      // Update global settings
      if (base_year !== undefined) {
        revaluation.global_settings.base_year = base_year;
      }
      if (time_trend !== undefined) {
        revaluation.global_settings.time_trend = time_trend;
      }
      if (current_use !== undefined) {
        revaluation.global_settings.current_use = current_use;
      }

      revaluation.updated_by = userId;
      await revaluation.save();

      res.json({ revaluation });
    } catch (error) {
      console.error('Error updating global settings:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// =============================================================================
// ANALYSIS SHEET ENDPOINTS
// =============================================================================

// GET /api/revaluations/:revId/sheets - Get all sheets for revaluation
router.get(
  '/revaluations/:revId/sheets',
  authenticateToken,
  async (req, res) => {
    try {
      const { revId } = req.params;
      const revObjectId = new mongoose.Types.ObjectId(revId);

      const sheets =
        await RevaluationAnalysisSheet.getSheetsForRevaluation(revObjectId);

      res.json({ sheets });
    } catch (error) {
      console.error('Error fetching sheets:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// POST /api/revaluations/:revId/sheets - Create new analysis sheet
router.post(
  '/revaluations/:revId/sheets',
  authenticateToken,
  async (req, res) => {
    try {
      const { revId } = req.params;
      const revObjectId = new mongoose.Types.ObjectId(revId);
      const userId = req.user._id;

      const { sheet_name, sheet_type, sales, sheet_settings, display_order } =
        req.body;

      // Create the sheet
      const sheet = new RevaluationAnalysisSheet({
        revaluation_id: revObjectId,
        sheet_name,
        sheet_type,
        sheet_settings: sheet_settings || {},
        display_order: display_order || 0,
        status: 'draft',
        created_by: userId,
      });

      await sheet.save();

      // Add sales to the sheet if provided
      if (sales && sales.length > 0) {
        await RevaluationSaleAdjustment.addSalesToSheet(
          revObjectId,
          sheet._id,
          sales,
          userId,
        );

        // Update sales count
        sheet.results.total_sales_count = sales.length;
        await sheet.save();
      }

      res.status(201).json({ sheet });
    } catch (error) {
      console.error('Error creating sheet:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// GET /api/revaluations/:revId/sheets/:sheetId - Get specific sheet
router.get(
  '/revaluations/:revId/sheets/:sheetId',
  authenticateToken,
  async (req, res) => {
    try {
      const { sheetId } = req.params;

      const sheet = await RevaluationAnalysisSheet.findById(sheetId).lean();
      if (!sheet) {
        return res.status(404).json({ error: 'Sheet not found' });
      }

      res.json({ sheet });
    } catch (error) {
      console.error('Error fetching sheet:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// PUT /api/revaluations/:revId/sheets/:sheetId - Update sheet
router.put(
  '/revaluations/:revId/sheets/:sheetId',
  authenticateToken,
  async (req, res) => {
    try {
      const { sheetId } = req.params;
      const userId = req.user._id;
      const { sheet_name, sheet_settings, status, results } = req.body;

      const sheet = await RevaluationAnalysisSheet.findById(sheetId);
      if (!sheet) {
        return res.status(404).json({ error: 'Sheet not found' });
      }

      if (sheet_name !== undefined) sheet.sheet_name = sheet_name;
      if (sheet_settings !== undefined) {
        // Merge sheet_settings to preserve existing fields
        sheet.sheet_settings = { ...sheet.sheet_settings, ...sheet_settings };
        // Mark the nested object as modified so Mongoose saves it
        sheet.markModified('sheet_settings');
      }
      if (status !== undefined) sheet.status = status;
      if (results !== undefined)
        sheet.results = { ...sheet.results, ...results };

      sheet.updated_by = userId;
      await sheet.save();

      console.log('Sheet saved successfully:', {
        _id: sheet._id,
        sheet_name: sheet.sheet_name,
        sheet_settings: sheet.sheet_settings,
      });

      res.json({ sheet });
    } catch (error) {
      console.error('Error updating sheet:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// DELETE /api/revaluations/:revId/sheets/:sheetId - Delete sheet
router.delete(
  '/revaluations/:revId/sheets/:sheetId',
  authenticateToken,
  async (req, res) => {
    try {
      const { sheetId } = req.params;

      // Delete all sale adjustments for this sheet
      await RevaluationSaleAdjustment.deleteMany({
        analysis_sheet_id: sheetId,
      });

      // Delete the sheet
      await RevaluationAnalysisSheet.findByIdAndDelete(sheetId);

      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting sheet:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// =============================================================================
// SALE ADJUSTMENT ENDPOINTS
// =============================================================================

// POST /api/revaluations/:revId/sheets/:sheetId/sales - Add sales to sheet
router.post(
  '/revaluations/:revId/sheets/:sheetId/sales',
  authenticateToken,
  async (req, res) => {
    try {
      const { revId, sheetId } = req.params;
      const revObjectId = new mongoose.Types.ObjectId(revId);
      const sheetObjectId = new mongoose.Types.ObjectId(sheetId);
      const userId = req.user._id;
      const { sales } = req.body; // Array of sale IDs

      if (!sales || sales.length === 0) {
        return res.status(400).json({ error: 'No sales provided' });
      }

      const result = await RevaluationSaleAdjustment.addSalesToSheet(
        revObjectId,
        sheetObjectId,
        sales,
        userId,
      );

      // Update sheet sales count
      const count = await RevaluationSaleAdjustment.countDocuments({
        analysis_sheet_id: sheetObjectId,
        is_included: true,
      });

      await RevaluationAnalysisSheet.findByIdAndUpdate(sheetObjectId, {
        'results.total_sales_count': count,
      });

      res.status(201).json({
        success: true,
        added: result.inserted?.length || sales.length,
        duplicates: result.duplicates || 0,
      });
    } catch (error) {
      console.error('Error adding sales to sheet:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// GET /api/revaluations/:revId/sheets/:sheetId/sales - Get sales for sheet
router.get(
  '/revaluations/:revId/sheets/:sheetId/sales',
  authenticateToken,
  async (req, res) => {
    try {
      const { revId, sheetId } = req.params;
      const revObjectId = new mongoose.Types.ObjectId(revId);
      const sheetObjectId = new mongoose.Types.ObjectId(sheetId);

      // Get revaluation to access municipality_id
      const revaluation = await Revaluation.findById(revObjectId);
      if (!revaluation) {
        return res.status(404).json({ error: 'Revaluation not found' });
      }

      // Get PID format for the municipality
      const pidFormat = await PIDFormat.findOne({
        municipality_id: revaluation.municipality_id,
      });

      const adjustments = await RevaluationSaleAdjustment.getSalesForSheet(
        sheetObjectId,
        true, // Only included sales
      );

      // Collect all property IDs to fetch building assessments
      const propertyIds = adjustments
        .map((adj) => adj.sale_id?.property_id?._id)
        .filter(Boolean);

      // Fetch building assessments for all properties in one query
      const buildingAssessments = await BuildingAssessment.find({
        property_id: { $in: propertyIds },
      })
        .select('property_id year_built effective_area')
        .lean();

      // Create a map of property_id to building assessment for quick lookup
      const buildingMap = {};
      buildingAssessments.forEach((building) => {
        buildingMap[building.property_id.toString()] = building;
      });

      // Flatten the sale data structure - merge sale_id fields with adjustment data
      const sales = adjustments.map((adj) => {
        const sale = adj.sale_id || {};
        const property = sale.property_id || {};
        const rawPid = property.pid_raw || property.pid_formatted || '';
        const formattedPid = rawPid ? formatPid(rawPid, pidFormat) : '';

        // Get building data from the map
        const building = buildingMap[property._id?.toString()] || {};

        return {
          _id: adj._id,
          sale_id: sale._id,
          property_id: property._id,
          property_address: property.location?.address || '',
          pid: formattedPid,
          sale_date: sale.sale_date,
          sale_price: sale.sale_price,
          acreage: sale.acreage,
          is_vacant: sale.is_vacant,
          is_valid_sale: sale.is_valid_sale,
          land_use_code: sale.land_use_code,
          base_type: sale.base_type,
          // Building assessment data
          building_year_built: building.year_built || null,
          building_sf: building.effective_area || 0,
          // Include adjustment-specific fields
          adjustments: adj.adjustments || {},
          is_included: adj.is_included,
          exclusion_reason: adj.exclusion_reason,
          notes: adj.notes,
        };
      });

      res.json({ sales });
    } catch (error) {
      console.error('Error fetching sheet sales:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// PUT /api/revaluations/:revId/sheets/:sheetId/sales/:adjId - Update sale adjustment
router.put(
  '/revaluations/:revId/sheets/:sheetId/sales/:adjId',
  authenticateToken,
  async (req, res) => {
    try {
      const { adjId } = req.params;
      const userId = req.user._id;
      const { adjustments, is_included, exclusion_reason, notes } = req.body;

      const adjustment = await RevaluationSaleAdjustment.findById(adjId);
      if (!adjustment) {
        return res.status(404).json({ error: 'Adjustment not found' });
      }

      if (adjustments !== undefined) {
        adjustment.adjustments = { ...adjustment.adjustments, ...adjustments };
      }
      if (is_included !== undefined) adjustment.is_included = is_included;
      if (exclusion_reason !== undefined)
        adjustment.exclusion_reason = exclusion_reason;
      if (notes !== undefined) adjustment.notes = notes;

      adjustment.modified_by = userId;
      adjustment.modified_at = new Date();

      await adjustment.save();

      res.json({ adjustment });
    } catch (error) {
      console.error('Error updating adjustment:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// DELETE /api/revaluations/:revId/sheets/:sheetId/sales/:adjId - Remove sale from sheet
router.delete(
  '/revaluations/:revId/sheets/:sheetId/sales/:adjId',
  authenticateToken,
  async (req, res) => {
    try {
      const { sheetId, adjId } = req.params;

      await RevaluationSaleAdjustment.findByIdAndDelete(adjId);

      // Update sheet sales count
      const count = await RevaluationSaleAdjustment.countDocuments({
        analysis_sheet_id: sheetId,
        is_included: true,
      });

      await RevaluationAnalysisSheet.findByIdAndUpdate(sheetId, {
        'results.total_sales_count': count,
      });

      res.json({ success: true });
    } catch (error) {
      console.error('Error removing sale from sheet:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// GET /api/revaluations/:revId/sales/:saleId/usage - Check where sale is used
router.get(
  '/revaluations/:revId/sales/:saleId/usage',
  authenticateToken,
  async (req, res) => {
    try {
      const { revId, saleId } = req.params;
      const revObjectId = new mongoose.Types.ObjectId(revId);
      const saleObjectId = new mongoose.Types.ObjectId(saleId);

      const usage = await RevaluationSaleAdjustment.getSheetsUsingSale(
        revObjectId,
        saleObjectId,
      );

      res.json({
        used_in_sheets: usage.map((u) => ({
          sheet_id: u.analysis_sheet_id._id,
          sheet_name: u.analysis_sheet_id.sheet_name,
          sheet_type: u.analysis_sheet_id.sheet_type,
        })),
      });
    } catch (error) {
      console.error('Error checking sale usage:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// =============================================================================
// RECALCULATION ENDPOINT (Placeholder - will implement calculation service)
// =============================================================================

// POST /api/revaluations/:revId/recalculate-all - Recalculate all sheets
router.post(
  '/revaluations/:revId/recalculate-all',
  authenticateToken,
  async (req, res) => {
    try {
      const { revId } = req.params;
      const revObjectId = new mongoose.Types.ObjectId(revId);

      // Load revaluation with global settings
      const revaluation = await Revaluation.findById(revObjectId).lean();
      if (!revaluation) {
        return res.status(404).json({ error: 'Revaluation not found' });
      }

      // Load all sheets
      const sheets = await RevaluationAnalysisSheet.find({
        revaluation_id: revObjectId,
      });

      // TODO: Implement calculation service to recalculate each sheet
      // For now, just return the sheets and revaluation
      // The calculation service will:
      // 1. Apply time trend adjustments
      // 2. Calculate age from base_year
      // 3. Apply depreciation
      // 4. Calculate average/median rates

      res.json({
        revaluation,
        sheets,
        message:
          'Calculation service not yet implemented. Sheets will be recalculated once service is ready.',
      });
    } catch (error) {
      console.error('Error recalculating sheets:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

module.exports = router;
