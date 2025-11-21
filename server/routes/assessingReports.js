const express = require('express');
const router = express.Router();
const AssessingReport = require('../models/AssessingReport');
const { authenticateToken } = require('../middleware/auth');

// @route   GET /api/municipalities/:municipalityId/assessing-reports
// @desc    Get all assessing reports for a municipality
// @access  Private
router.get(
  '/municipalities/:municipalityId/assessing-reports',
  authenticateToken,
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
      const { category, active_only = 'true' } = req.query;

      // Get municipality and its available assessing reports
      const Municipality = require('../models/Municipality');
      const municipality = await Municipality.findById(municipalityId);

      if (!municipality) {
        return res.status(404).json({
          success: false,
          message: 'Municipality not found',
        });
      }

      // Get the available assessing report IDs for this municipality
      const availableReportIds =
        municipality.available_reports.get('assessing') || [];

      let reports;
      if (category) {
        reports = await AssessingReport.findByCategoryForMunicipality(
          availableReportIds,
          category,
          active_only === 'true',
        );
      } else {
        reports = await AssessingReport.findForMunicipality(
          availableReportIds,
          active_only === 'true',
        );
      }

      // Filter reports based on user permissions
      const accessibleReports = reports.filter((report) =>
        report.canUserAccess(req.user),
      );

      // Group reports by category for easier navigation
      const groupedReports = accessibleReports.reduce((groups, report) => {
        const category = report.category || 'other';
        if (!groups[category]) {
          groups[category] = [];
        }
        groups[category].push(report);
        return groups;
      }, {});

      res.json({
        success: true,
        reports: accessibleReports,
        grouped: groupedReports,
        total: accessibleReports.length,
      });
    } catch (error) {
      console.error('Error fetching assessing reports:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch assessing reports',
        error: error.message,
      });
    }
  },
);

// @route   GET /api/municipalities/:municipalityId/assessing-reports/:reportId
// @desc    Get a specific assessing report
// @access  Private
router.get(
  '/municipalities/:municipalityId/assessing-reports/:reportId',
  authenticateToken,
  async (req, res) => {
    try {
      const { municipalityId, reportId } = req.params;

      const report = await AssessingReport.findOne({
        _id: reportId,
        municipality_id: municipalityId,
      })
        .populate('created_by', 'name email')
        .populate('usage_stats.last_run_by', 'name email');

      if (!report) {
        return res.status(404).json({
          success: false,
          message: 'Report not found',
        });
      }

      // Check if user can access this report
      if (!report.canUserAccess(req.user)) {
        return res.status(403).json({
          success: false,
          message: 'Access denied to this report',
        });
      }

      res.json({
        success: true,
        report: report,
      });
    } catch (error) {
      console.error('Error fetching assessing report:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch assessing report',
        error: error.message,
      });
    }
  },
);

// @route   GET /api/municipalities/:municipalityId/assessing-reports/component/:componentName
// @desc    Get report by component name
// @access  Private
router.get(
  '/municipalities/:municipalityId/assessing-reports/component/:componentName',
  authenticateToken,
  async (req, res) => {
    try {
      const { municipalityId, componentName } = req.params;

      const report = await AssessingReport.findByComponentName(
        municipalityId,
        componentName,
      );

      if (!report) {
        return res.status(404).json({
          success: false,
          message: 'Report not found',
        });
      }

      // Check if user can access this report
      if (!report.canUserAccess(req.user)) {
        return res.status(403).json({
          success: false,
          message: 'Access denied to this report',
        });
      }

      res.json({
        success: true,
        report: report,
      });
    } catch (error) {
      console.error('Error fetching assessing report by component:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch assessing report',
        error: error.message,
      });
    }
  },
);

// @route   POST /api/municipalities/:municipalityId/assessing-reports
// @desc    Create a new assessing report
// @access  Private (Admin/Assessor only)
router.post(
  '/municipalities/:municipalityId/assessing-reports',
  authenticateToken,
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
      const {
        name,
        display_name,
        description,
        component_name,
        category = 'other',
        parameters = [],
        output_formats = ['pdf'],
        permissions = {},
        sort_order = 0,
        execution_settings = {},
      } = req.body;

      // Validate required fields
      if (!name || !display_name || !component_name) {
        return res.status(400).json({
          success: false,
          message: 'Name, display name, and component name are required',
        });
      }

      // Check if component name already exists for this municipality
      const existingReport = await AssessingReport.findOne({
        municipality_id: municipalityId,
        component_name: component_name,
      });

      if (existingReport) {
        return res.status(409).json({
          success: false,
          message: 'A report with this component name already exists',
        });
      }

      // Create new report
      const newReport = new AssessingReport({
        municipality_id: municipalityId,
        name,
        display_name,
        description,
        component_name,
        category,
        parameters,
        output_formats,
        permissions,
        sort_order,
        execution_settings: {
          timeout_minutes: execution_settings.timeout_minutes || 10,
          max_records: execution_settings.max_records || 10000,
          cache_duration_minutes:
            execution_settings.cache_duration_minutes || 0,
        },
        created_by: req.user.id,
        is_active: true,
      });

      await newReport.save();
      await newReport.populate('created_by', 'name email');

      res.status(201).json({
        success: true,
        report: newReport,
        message: 'Report created successfully',
      });
    } catch (error) {
      console.error('Error creating assessing report:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create assessing report',
        error: error.message,
      });
    }
  },
);

// @route   PUT /api/municipalities/:municipalityId/assessing-reports/:reportId
// @desc    Update an assessing report
// @access  Private (Admin/Assessor only)
router.put(
  '/municipalities/:municipalityId/assessing-reports/:reportId',
  authenticateToken,
  async (req, res) => {
    try {
      const { municipalityId, reportId } = req.params;

      const report = await AssessingReport.findOne({
        _id: reportId,
        municipality_id: municipalityId,
      });

      if (!report) {
        return res.status(404).json({
          success: false,
          message: 'Report not found',
        });
      }

      // Update allowed fields
      const allowedUpdates = [
        'name',
        'display_name',
        'description',
        'category',
        'parameters',
        'output_formats',
        'permissions',
        'sort_order',
        'execution_settings',
        'is_active',
      ];

      allowedUpdates.forEach((field) => {
        if (req.body[field] !== undefined) {
          report[field] = req.body[field];
        }
      });

      await report.save();
      await report.populate('created_by', 'name email');

      res.json({
        success: true,
        report: report,
        message: 'Report updated successfully',
      });
    } catch (error) {
      console.error('Error updating assessing report:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update assessing report',
        error: error.message,
      });
    }
  },
);

// @route   DELETE /api/municipalities/:municipalityId/assessing-reports/:reportId
// @desc    Delete an assessing report
// @access  Private (Admin only)
router.delete(
  '/municipalities/:municipalityId/assessing-reports/:reportId',
  authenticateToken,
  async (req, res) => {
    try {
      const { municipalityId, reportId } = req.params;

      const report = await AssessingReport.findOne({
        _id: reportId,
        municipality_id: municipalityId,
      });

      if (!report) {
        return res.status(404).json({
          success: false,
          message: 'Report not found',
        });
      }

      // Don't allow deletion of system reports
      if (report.is_system_report) {
        return res.status(403).json({
          success: false,
          message: 'Cannot delete system reports',
        });
      }

      await AssessingReport.findByIdAndDelete(reportId);

      res.json({
        success: true,
        message: 'Report deleted successfully',
      });
    } catch (error) {
      console.error('Error deleting assessing report:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete assessing report',
        error: error.message,
      });
    }
  },
);

// @route   POST /api/municipalities/:municipalityId/assessing-reports/:reportId/execute
// @desc    Execute a report and track usage
// @access  Private
router.post(
  '/municipalities/:municipalityId/assessing-reports/:reportId/execute',
  authenticateToken,
  async (req, res) => {
    try {
      const { municipalityId, reportId } = req.params;
      const { parameters = {}, output_format = 'pdf' } = req.body;

      // Get municipality and check if report is available to it
      const Municipality = require('../models/Municipality');
      const municipality = await Municipality.findById(municipalityId);

      if (!municipality) {
        return res.status(404).json({
          success: false,
          message: 'Municipality not found',
        });
      }

      const availableReportIds =
        municipality.available_reports.get('assessing') || [];

      // Check if the report is available to this municipality
      if (!availableReportIds.some((id) => id.toString() === reportId)) {
        return res.status(404).json({
          success: false,
          message: 'Report not available for this municipality',
        });
      }

      const report = await AssessingReport.findOne({
        _id: reportId,
        is_active: true,
      });

      if (!report) {
        return res.status(404).json({
          success: false,
          message: 'Report not found or inactive',
        });
      }

      // Check if user can access this report
      if (!report.canUserAccess(req.user)) {
        return res.status(403).json({
          success: false,
          message: 'Access denied to this report',
        });
      }

      // Validate output format
      if (!report.output_formats.includes(output_format)) {
        return res.status(400).json({
          success: false,
          message: `Output format '${output_format}' not supported for this report`,
        });
      }

      // Record execution start time
      const executionStart = Date.now();

      // Here you would implement the actual report execution logic
      // For now, we'll just return a success response with metadata
      const executionTime = Date.now() - executionStart;

      // Record the execution
      await report.recordExecution(req.user.id, executionTime);

      res.json({
        success: true,
        message: 'Report execution initiated',
        execution_id: `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        parameters: parameters,
        output_format: output_format,
        estimated_completion: new Date(
          Date.now() + report.execution_settings.timeout_minutes * 60 * 1000,
        ),
      });
    } catch (error) {
      console.error('Error executing assessing report:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to execute assessing report',
        error: error.message,
      });
    }
  },
);

// @route   GET /api/system/assessing-reports
// @desc    Get all system reports (for seeding municipalities)
// @access  Private (Admin only)
router.get('/system/assessing-reports', authenticateToken, async (req, res) => {
  try {
    const systemReports = await AssessingReport.getSystemReports();

    res.json({
      success: true,
      reports: systemReports,
      total: systemReports.length,
    });
  } catch (error) {
    console.error('Error fetching system reports:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch system reports',
      error: error.message,
    });
  }
});

// @route   POST /api/municipalities/:municipalityId/reports/ms1-summary-inventory
// @desc    Generate MS-1 Summary Inventory of Valuation report data
// @access  Private
router.post(
  '/municipalities/:municipalityId/reports/ms1-summary-inventory',
  authenticateToken,
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
      const { parameters } = req.body;

      const PropertyTreeNode = require('../models/PropertyTreeNode');
      const BuildingAssessment = require('../models/BuildingAssessment');
      const LandAssessment = require('../models/LandAssessment');
      const ParcelAssessment = require('../models/ParcelAssessment');
      const Municipality = require('../models/Municipality');
      const mongoose = require('mongoose');

      const municipalityObjectId = new mongoose.Types.ObjectId(municipalityId);
      const assessmentYear = parameters.assessment_year || new Date().getFullYear();

      // Get municipality information
      const municipality = await Municipality.findById(municipalityObjectId);
      if (!municipality) {
        return res.status(404).json({
          success: false,
          message: 'Municipality not found',
        });
      }

      console.log(`📋 Generating MS-1 report for ${municipality.name}, year ${assessmentYear}...`);

      // ===== LAND VALUATION AGGREGATION =====
      // Join LandAssessment with PropertyTreeNode to get property_class
      const landAggregation = await LandAssessment.aggregate([
        {
          $match: {
            municipality_id: municipalityObjectId,
            effective_year: assessmentYear,
          },
        },
        {
          $lookup: {
            from: 'propertytreenodes',
            localField: 'property_id',
            foreignField: '_id',
            as: 'property',
          },
        },
        {
          $unwind: {
            path: '$property',
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $group: {
            _id: {
              propertyClass: '$property.property_class',
              isExempt: '$property.is_exempt',
            },
            totalAcres: { $sum: '$calculated_totals.totalAcreage' },
            totalMarketValue: { $sum: '$market_value' },
            totalTaxableValue: { $sum: '$taxable_value' },
            totalCurrentUseCredit: { $sum: '$current_use_credit' },
          },
        },
      ]);

      console.log('Land aggregation results:', JSON.stringify(landAggregation, null, 2));

      // Map land types to MS-1 categories
      const landData = {
        currentUse: { acres: 0, value: 0 },
        conservationRestriction: { acres: 0, value: 0 },
        discretionaryEasements: { acres: 0, value: 0 },
        discretionaryPreservation: { acres: 0, value: 0 },
        farmStructures: { acres: 0, value: 0 },
        residential: { acres: 0, value: 0 },
        commercialIndustrial: { acres: 0, value: 0 },
        taxableTotal: { acres: 0, value: 0 },
        exempt: { acres: 0, value: 0 },
        total: { acres: 0, value: 0 },
      };

      landAggregation.forEach((item) => {
        const propertyClass = item._id?.propertyClass?.toUpperCase() || 'UNKNOWN';
        const isExempt = item._id?.isExempt || false;
        const acres = item.totalAcres || 0;
        const marketValue = item.totalMarketValue || 0;
        const taxableValue = item.totalTaxableValue || 0;
        const currentUseCredit = item.totalCurrentUseCredit || 0;

        console.log(`Processing: Class=${propertyClass}, Exempt=${isExempt}, Acres=${acres}, Value=${taxableValue}`);

        // Current Use (RSA 79-A) - properties with current use credit
        if (currentUseCredit > 0) {
          landData.currentUse.acres += acres;
          landData.currentUse.value += taxableValue;
        }

        // Exempt properties (1I)
        if (isExempt) {
          landData.exempt.acres += acres;
          landData.exempt.value += marketValue;
        } else {
          // Taxable properties by class
          if (propertyClass === 'R' || propertyClass === 'RESIDENTIAL') {
            landData.residential.acres += acres;
            landData.residential.value += taxableValue;
            landData.taxableTotal.acres += acres;
            landData.taxableTotal.value += taxableValue;
          } else if (propertyClass === 'C' || propertyClass === 'COMMERCIAL' ||
                     propertyClass === 'I' || propertyClass === 'INDUSTRIAL') {
            landData.commercialIndustrial.acres += acres;
            landData.commercialIndustrial.value += taxableValue;
            landData.taxableTotal.acres += acres;
            landData.taxableTotal.value += taxableValue;
          } else if (propertyClass !== 'U') {
            // Other taxable classes (not utilities)
            landData.taxableTotal.acres += acres;
            landData.taxableTotal.value += taxableValue;
          }
        }

        landData.total.acres += acres;
        landData.total.value += marketValue;
      });

      console.log('Final land data:', JSON.stringify(landData, null, 2));

      // ===== BUILDING VALUATION AGGREGATION =====
      const buildingAggregation = await BuildingAssessment.aggregate([
        {
          $match: {
            municipality_id: municipalityObjectId,
            effective_year: assessmentYear,
          },
        },
        {
          $lookup: {
            from: 'propertytreenodes',
            localField: 'property_id',
            foreignField: '_id',
            as: 'property',
          },
        },
        {
          $unwind: {
            path: '$property',
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $group: {
            _id: {
              propertyClass: '$property.property_class',
              isExempt: '$property.is_exempt',
            },
            totalValue: { $sum: '$assessed_value' },
            count: { $sum: 1 },
          },
        },
      ]);

      console.log('Building aggregation results:', JSON.stringify(buildingAggregation, null, 2));

      const buildingData = {
        residential: 0,
        manufacturedHousing: 0,
        commercialIndustrial: 0,
        taxableTotal: 0,
        exempt: 0,
        total: 0,
      };

      buildingAggregation.forEach((item) => {
        const propertyClass = item._id?.propertyClass?.toUpperCase() || 'UNKNOWN';
        const isExempt = item._id?.isExempt || false;
        const value = item.totalValue || 0;

        console.log(`Building: Class=${propertyClass}, Exempt=${isExempt}, Value=${value}`);

        if (isExempt) {
          buildingData.exempt += value;
        } else {
          if (propertyClass === 'R' || propertyClass === 'RESIDENTIAL') {
            buildingData.residential += value;
            buildingData.taxableTotal += value;
          } else if (propertyClass === 'C' || propertyClass === 'COMMERCIAL' ||
                     propertyClass === 'I' || propertyClass === 'INDUSTRIAL') {
            buildingData.commercialIndustrial += value;
            buildingData.taxableTotal += value;
          } else if (propertyClass === 'M' || propertyClass === 'MANUFACTURED') {
            buildingData.manufacturedHousing += value;
            buildingData.taxableTotal += value;
          } else if (propertyClass !== 'U') {
            // Other taxable classes (not utilities)
            buildingData.taxableTotal += value;
          }
        }

        buildingData.total += value;
      });

      console.log('Final building data:', JSON.stringify(buildingData, null, 2));

      // ===== UTILITIES VALUATION =====
      // Get utilities (property_class = 'U')
      const utilitiesAggregation = await ParcelAssessment.aggregate([
        {
          $match: {
            municipality_id: municipalityObjectId,
            assessment_year: assessmentYear,
          },
        },
        {
          $lookup: {
            from: 'propertytreenodes',
            localField: 'property_id',
            foreignField: '_id',
            as: 'property',
          },
        },
        {
          $unwind: {
            path: '$property',
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $match: {
            'property.property_class': 'U',
          },
        },
        {
          $group: {
            _id: '$property.owner_name',
            totalValue: { $sum: '$total_assessed_value' },
          },
        },
      ]);

      console.log('Utilities aggregation results:', JSON.stringify(utilitiesAggregation, null, 2));

      const utilitiesData = {
        electricCompanies: utilitiesAggregation.map(item => ({
          name: item._id || 'Unknown Utility',
          value: item.totalValue || 0,
        })),
        total: utilitiesAggregation.reduce((sum, item) => sum + (item.totalValue || 0), 0),
      };

      console.log('Final utilities data:', JSON.stringify(utilitiesData, null, 2));

      // ===== EXEMPTIONS AGGREGATION =====
      const PropertyExemption = require('../models/PropertyExemption');
      const ExemptionType = require('../models/ExemptionType');

      const exemptionsAggregation = await PropertyExemption.aggregate([
        {
          $match: {
            municipality_id: municipalityObjectId,
            start_year: { $lte: assessmentYear },
            $or: [
              { end_year: { $exists: false } },
              { end_year: null },
              { end_year: { $gte: assessmentYear } },
            ],
          },
        },
        {
          $lookup: {
            from: 'exemptiontypes',
            localField: 'exemption_type_id',
            foreignField: '_id',
            as: 'exemption_type',
          },
        },
        {
          $unwind: {
            path: '$exemption_type',
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $group: {
            _id: '$exemption_type.category',
            count: { $sum: 1 },
            totalValue: { $sum: '$exemption_value' },
          },
        },
      ]);

      console.log('Exemptions aggregation results:', JSON.stringify(exemptionsAggregation, null, 2));

      const exemptionsData = {
        blind: { count: 0, value: 0 },
        elderly: { count: 0, value: 0 },
        disabled: { count: 0, value: 0 },
        woodHeating: { count: 0, value: 0 },
        solarWind: { count: 0, value: 0 },
        waterPollution: { count: 0, value: 0 },
        airPollution: { count: 0, value: 0 },
        total: 0,
      };

      exemptionsAggregation.forEach((item) => {
        const category = item._id?.toLowerCase() || 'other';
        const count = item.count || 0;
        const value = item.totalValue || 0;

        if (category === 'blind') {
          exemptionsData.blind = { count, value };
        } else if (category === 'elderly') {
          exemptionsData.elderly = { count, value };
        } else if (category === 'disabled') {
          exemptionsData.disabled = { count, value };
        } else if (category === 'solar') {
          exemptionsData.solarWind.count += count;
          exemptionsData.solarWind.value += value;
        }

        exemptionsData.total += value;
      });

      console.log('Final exemptions data:', JSON.stringify(exemptionsData, null, 2));

      // ===== VETERAN'S CREDITS =====
      const veteransCreditsAggregation = await PropertyExemption.aggregate([
        {
          $match: {
            municipality_id: municipalityObjectId,
            start_year: { $lte: assessmentYear },
            $or: [
              { end_year: { $exists: false } },
              { end_year: null },
              { end_year: { $gte: assessmentYear } },
            ],
          },
        },
        {
          $lookup: {
            from: 'exemptiontypes',
            localField: 'exemption_type_id',
            foreignField: '_id',
            as: 'exemption_type',
          },
        },
        {
          $unwind: {
            path: '$exemption_type',
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $match: {
            'exemption_type.category': 'veteran',
          },
        },
        {
          $group: {
            _id: '$exemption_type.subcategory',
            count: { $sum: 1 },
            totalAmount: { $sum: '$credit_value' },
          },
        },
      ]);

      console.log('Veterans credits aggregation results:', JSON.stringify(veteransCreditsAggregation, null, 2));

      const veteransCreditsData = {
        standard: { count: 0, amount: 0 },
        serviceConnectedDisability: { count: 0, amount: 0 },
        allVeterans: { count: 0, amount: 0 },
        total: { count: 0, amount: 0 },
      };

      veteransCreditsAggregation.forEach((item) => {
        const subcategory = item._id?.toLowerCase() || 'standard';
        const count = item.count || 0;
        const amount = item.totalAmount || 0;

        if (subcategory.includes('service') || subcategory.includes('disability')) {
          veteransCreditsData.serviceConnectedDisability.count += count;
          veteransCreditsData.serviceConnectedDisability.amount += amount;
        } else if (subcategory.includes('all')) {
          veteransCreditsData.allVeterans.count += count;
          veteransCreditsData.allVeterans.amount += amount;
        } else {
          veteransCreditsData.standard.count += count;
          veteransCreditsData.standard.amount += amount;
        }

        veteransCreditsData.total.count += count;
        veteransCreditsData.total.amount += amount;
      });

      console.log('Final veterans credits data:', JSON.stringify(veteransCreditsData, null, 2));

      // ===== CURRENT USE DETAILS =====
      const currentUseProperties = await PropertyTreeNode.find({
        municipality_id: municipalityObjectId,
        'current_use.enrolled': true,
      }).countDocuments();

      const totalAcres = landData.total.acres;

      const currentUseData = {
        parcels: currentUseProperties,
        acres: landData.currentUse.acres,
        totalAcres: totalAcres,
        removedAcres: 0, // Would need to track removals in change log
        landUseChangeTax: 0, // Would need to track from tax collection
      };

      // ===== CONSERVATION RESTRICTION DETAILS =====
      const conservationProperties = await PropertyTreeNode.find({
        municipality_id: municipalityObjectId,
        'conservation_restriction.exists': true,
      }).countDocuments();

      const conservationData = {
        parcels: conservationProperties,
        acres: landData.conservationRestriction.acres,
        assessedValue: landData.conservationRestriction.value,
      };

      // ===== MUNICIPAL ADOPTION QUESTIONS =====
      const municipalAdoptions = {
        deafDisabledExemption: municipality.adopted_exemptions?.includes('deaf_disabled') || false,
        elderlyExemption: municipality.adopted_exemptions?.includes('elderly') || false,
        commercialConstructionExemption: municipality.adopted_exemptions?.includes('commercial_construction') || false,
        communityRevitalizationIncentive: municipality.adopted_incentives?.includes('community_revitalization') || false,
      };

      // ===== DISCRETIONARY EASEMENTS & FARM STRUCTURES =====
      const discretionaryEasements = {
        adopted: municipality.adopted_easements?.includes('discretionary_preservation') || false,
        count: 0,
      };

      const farmStructures = {
        adopted: municipality.adopted_exemptions?.includes('farm_structures') || false,
      };

      // ===== PILOT PAYMENTS =====
      const pilotPayments = 0; // Would need to aggregate from tax collection

      // ===== COMPILE REPORT DATA =====
      const reportData = {
        assessmentYear: assessmentYear,
        assessor: municipality.assessor_name || 'Not Specified',
        preparedBy: req.user.name || req.user.email,
        preparedDate: new Date().toISOString().split('T')[0],
        land: landData,
        buildings: buildingData,
        utilities: utilitiesData,
        exemptions: exemptionsData,
        veteransCredits: veteransCreditsData,
        currentUse: currentUseData,
        conservationRestriction: conservationData,
        municipalAdoptions: municipalAdoptions,
        discretionaryEasements: discretionaryEasements,
        farmStructures: farmStructures,
        pilotPayments: pilotPayments,
      };

      console.log(`✓ MS-1 report generated successfully for ${municipality.name}`);

      res.json({
        success: true,
        data: reportData,
      });
    } catch (error) {
      console.error('Error generating MS-1 report:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate MS-1 report',
        error: error.message,
      });
    }
  },
);

// @route   POST /api/municipalities/:municipalityId/reports/ms1-summary-inventory/export
// @desc    Export MS-1 report as PDF
// @access  Private
router.post(
  '/municipalities/:municipalityId/reports/ms1-summary-inventory/export',
  authenticateToken,
  async (req, res) => {
    try {
      const { data, format } = req.body;

      if (format !== 'pdf') {
        return res.status(400).json({
          success: false,
          message: 'Only PDF format is currently supported for MS-1 reports',
        });
      }

      // TODO: Implement PDF generation using a library like puppeteer or PDFKit
      // For now, return a placeholder response
      res.status(501).json({
        success: false,
        message: 'PDF export not yet implemented. Please use browser print function.',
      });
    } catch (error) {
      console.error('Error exporting MS-1 report:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to export MS-1 report',
        error: error.message,
      });
    }
  },
);

module.exports = router;
