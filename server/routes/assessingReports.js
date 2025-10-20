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

module.exports = router;
