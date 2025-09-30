const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const PropertyTreeNode = require('../models/PropertyTreeNode');
const PropertyAssessment = require('../models/PropertyAssessment');
const BuildingAssessment = require('../models/BuildingAssessment');
const LandAssessment = require('../models/LandAssessment');
const BuildingCalculationConfig = require('../models/BuildingCalculationConfig');
const BuildingAssessmentCalculationService = require('../services/buildingAssessmentCalculationService');
const LandAssessmentCalculationService = require('../services/landAssessmentCalculationService');
const SalesHistory = require('../models/SalesHistory');
const Municipality = require('../models/Municipality');
const PropertySketch = require('../models/PropertySketch');
const Zone = require('../models/Zone');
const NeighborhoodCode = require('../models/NeighborhoodCode');
const PropertyAttribute = require('../models/PropertyAttribute');
const PropertyFeature = require('../models/PropertyFeature');
const FeatureCode = require('../models/FeatureCode');
const Owner = require('../models/Owner');
const PropertyOwner = require('../models/PropertyOwner');
const {
  formatPid,
  getMapFromPid,
  getLotSubFromPid,
} = require('../utils/pidFormatter');
const {
  massRecalculateAssessments,
  massRevaluation,
  updatePropertyTotalAssessment,
  getPropertyAssessmentComponents,
  calculateTotalAssessedValue,
  roundToNearestHundred,
} = require('../utils/assessment');
const BillingPeriodValidator = require('../utils/billingPeriodValidator');
const {
  addCardNumbersToFeatures,
} = require('../migrations/add-card-numbers-to-features');

const router = express.Router();

// Helper function to build owner information for property responses
async function buildOwnerInfo(propertyId) {
  try {
    // Get all property owners with populated owner data
    const propertyOwners = await PropertyOwner.find({
      property_id: propertyId,
      is_active: true,
    })
      .populate('owner_id')
      .sort({ is_primary: -1, ownership_percentage: -1 });

    if (!propertyOwners.length) {
      return {
        primary: null,
        additional_owners: [],
      };
    }

    // Find primary owner
    const primaryOwner = propertyOwners.find((po) => po.is_primary);
    const additionalOwners = propertyOwners.filter((po) => !po.is_primary);

    // Build primary owner info
    let primary = null;
    if (primaryOwner && primaryOwner.owner_id) {
      const owner = primaryOwner.owner_id;
      const billingAddress = owner.getBillingAddress();

      primary = {
        primary_name: owner.display_name,
        mailing_street: billingAddress?.street || '',
        mailing_city: billingAddress?.city || '',
        mailing_state: billingAddress?.state || '',
        mailing_zipcode: billingAddress?.zip_code || '',
        ownership_percentage: primaryOwner.ownership_percentage,
      };
    }

    // Build additional owners info
    const additional_owners = additionalOwners
      .map((po) => {
        if (!po.owner_id) return null;

        const owner = po.owner_id;
        const billingAddress = owner.getBillingAddress();

        // Determine owner type flags
        const isMailTo =
          po.property_mailing_address?.use_override ||
          owner.mailing_address?.is_different ||
          false;
        const isBillCopy = po.receives_tax_bills && !po.is_primary;
        const hasAdditionalBilling = owner.additional_billing?.length > 0;

        return {
          id: po._id.toString(),
          owner_id: owner._id.toString(),
          owner_name: owner.display_name,
          mailing_street: billingAddress?.street || '',
          mailing_city: billingAddress?.city || '',
          mailing_state: billingAddress?.state || '',
          mailing_zipcode: billingAddress?.zip_code || '',
          ownership_percentage: po.ownership_percentage,
          ownership_type: po.ownership_type,
          // Identifier flags
          additional_owner: true,
          mail_to: isMailTo,
          bill_copy: isBillCopy,
          // Additional info
          receives_notices: po.receives_notices,
          has_additional_billing: hasAdditionalBilling,
        };
      })
      .filter(Boolean);

    return {
      primary,
      additional_owners,
    };
  } catch (error) {
    console.error('Error building owner info:', error);
    return {
      primary: null,
      additional_owners: [],
    };
  }
}

// @route   GET /api/municipalities/:municipalityId/properties
// @desc    Get all properties for a municipality
// @access  Private
router.get(
  '/municipalities/:municipalityId/properties',
  authenticateToken,
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
      console.log(
        'Loading properties for municipality ID:',
        municipalityId,
        typeof municipalityId,
      );
      const { year, assigned_to, has_flags } = req.query;
      const assessmentYear = year ? parseInt(year) : new Date().getFullYear();

      // Check if user has access to this municipality
      const hasAccess =
        ['avitar_staff', 'avitar_admin'].includes(req.user.global_role) ||
        req.user.municipal_permissions?.some(
          (perm) => perm.municipality_id.toString() === municipalityId,
        );

      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: 'Access denied to this municipality',
        });
      }

      try {
        // Build query filters - convert municipalityId to ObjectId
        const mongoose = require('mongoose');

        // Validate and convert municipalityId to ObjectId
        if (!mongoose.Types.ObjectId.isValid(municipalityId)) {
          throw new Error(`Invalid municipality ID: ${municipalityId}`);
        }

        const municipalityObjectId = new mongoose.Types.ObjectId(
          municipalityId,
        );
        let query = { municipality_id: municipalityObjectId };

        // Load municipality data for PID formatting
        const municipality =
          await Municipality.findById(municipalityObjectId).lean();
        if (!municipality) {
          throw new Error(`Municipality not found: ${municipalityId}`);
        }

        // Filter by assigned user if specified
        if (assigned_to) {
          query.assigned_to = assigned_to;
        }

        // Filter by module flags if specified
        if (has_flags) {
          const flags = has_flags.split(',');
          flags.forEach((flag) => {
            query[`module_flags.${flag}`] = true;
          });
        }

        // Get property tree nodes
        const properties = await PropertyTreeNode.find(query)
          .sort({ pid: 1 })
          .lean();

        // For each property, get current assessment and owner info
        const propertiesWithAssessments = await Promise.all(
          properties.map(async (property) => {
            const [assessment, ownerInfo] = await Promise.all([
              PropertyAssessment.getAssessmentForYear(
                property._id,
                assessmentYear,
              ),
              buildOwnerInfo(property._id),
            ]);

            // Format PID using municipality configuration
            let pid_formatted, mapNumber, lotSubDisplay;

            if (property.pid_raw) {
              // Use server-side formatter with municipality config
              pid_formatted = formatPid(property.pid_raw, municipality);
              mapNumber = getMapFromPid(property.pid_raw, municipality);
              lotSubDisplay = getLotSubFromPid(property.pid_raw, municipality);
            } else {
              pid_formatted = property.pid_formatted || null;
              mapNumber = 'Unknown';
              lotSubDisplay = 'Unknown';
            }

            return {
              id: property._id.toString(),
              property_id: property._id.toString(), // For frontend compatibility
              pid_raw: property.pid_raw,
              pid_formatted: pid_formatted,
              account_number: property.account_number,
              location: {
                street_number: property.location?.street_number,
                street: property.location?.street,
                address: property.location?.address,
                neighborhood: property.location?.neighborhood,
                zone: property.location?.zone,
              },
              // New owner structure
              owners: ownerInfo,
              property_class: property.property_class,
              property_type: property.property_type,
              tax_status: property.tax_status,
              assessed_value:
                assessment?.total_value || property.assessed_value || 0,
              tax_year: assessmentYear,
              assigned_to: property.assigned_to,
              module_flags: property.module_flags,
              last_updated: property.last_updated,
              // Legacy fields for backward compatibility
              pid: pid_formatted,
              mapNumber: mapNumber,
              lotSubDisplay: lotSubDisplay,
              streetNumber: property.location?.street_number,
              streetName: property.location?.street,
              streetAddress: property.location?.address,
              neighborhood: property.location?.neighborhood,
              zone: property.location?.zone,
              // Legacy owner fields (fallback to new structure)
              owner: {
                primary_name:
                  ownerInfo.primary?.primary_name ||
                  property.owner?.primary_name,
                mailing_address: ownerInfo.primary
                  ? `${ownerInfo.primary.mailing_street}, ${ownerInfo.primary.mailing_city}, ${ownerInfo.primary.mailing_state} ${ownerInfo.primary.mailing_zipcode}`.trim()
                  : property.owner?.mailing_address,
              },
              ownerName:
                ownerInfo.primary?.primary_name || property.owner?.primary_name,
              ownerMailingAddress: ownerInfo.primary
                ? `${ownerInfo.primary.mailing_street}, ${ownerInfo.primary.mailing_city}, ${ownerInfo.primary.mailing_state} ${ownerInfo.primary.mailing_zipcode}`.trim()
                : property.owner?.mailing_address,
              propertyClass: property.property_class,
              propertyType: property.property_type,
              taxStatus: property.tax_status,
              totalValue:
                assessment?.total_value || property.assessed_value || 0,
              landValue: assessment?.land?.value || 0,
              buildingValue: assessment?.building?.value || 0,
              otherValue: assessment?.other_improvements?.value || 0,
              taxYear: assessmentYear,
            };
          }),
        );

        res.json({
          success: true,
          properties: propertiesWithAssessments,
          total: propertiesWithAssessments.length,
          assessment_year: assessmentYear,
        });
      } catch (dbError) {
        console.error('Database error loading properties:', dbError);
        throw dbError; // Let the error bubble up to the outer catch block
      }
    } catch (error) {
      console.error('Get properties error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve properties',
      });
    }
  },
);

// @route   GET /api/properties/:id
// @desc    Get property details with assessment for specific year and card
// @access  Private
router.get('/properties/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const mongoose = require('mongoose');
    const { year, card } = req.query;
    const assessmentYear = year ? parseInt(year) : new Date().getFullYear();
    const cardNumber = card ? parseInt(card) : 1;

    try {
      // Get property from database - convert string ID to ObjectId
      const property = await PropertyTreeNode.findById(
        new mongoose.Types.ObjectId(id),
      ).lean();

      if (!property) {
        return res.status(404).json({
          success: false,
          message: 'Property not found',
        });
      }

      console.log('propertyData', property);
      // Load municipality data for PID formatting
      const municipality = await Municipality.findById(
        property.municipality_id,
      ).lean();
      if (!municipality) {
        throw new Error(
          `Municipality not found for property: ${property.municipality_id}`,
        );
      }

      // Get comprehensive assessment data for property
      const propertyObjectId = new mongoose.Types.ObjectId(id);

      // First try to get existing assessment
      let assessment = await PropertyAssessment.getAssessmentForYear(
        propertyObjectId,
        assessmentYear,
        cardNumber,
      );

      // If no assessment exists, get component values and create assessment
      if (!assessment) {
        try {
          const components = await getPropertyAssessmentComponents(
            propertyObjectId,
            assessmentYear,
          );
          const totalAssessedValue = calculateTotalAssessedValue(components);

          // Create a computed assessment object
          assessment = {
            property_id: propertyObjectId,
            effective_year: assessmentYear,
            total_value: totalAssessedValue,
            land: { value: components.landValue },
            building: { value: components.buildingValue },
            other_improvements: { value: components.featuresValue },
          };

          console.log(
            `Created computed assessment for property ${id}: $${totalAssessedValue.toLocaleString()}`,
          );
        } catch (error) {
          console.warn('Failed to compute assessment components:', error);
          // Fallback to zero values
          assessment = {
            property_id: propertyObjectId,
            effective_year: assessmentYear,
            total_value: 0,
            land: { value: 0 },
            building: { value: 0 },
            other_improvements: { value: 0 },
          };
        }
      }

      // Get assessment history (last 10 records)
      const assessmentHistory = await PropertyAssessment.find({
        property_id: propertyObjectId,
      })
        .sort({ effective_year: -1 })
        .limit(10)
        .select(
          'effective_year total_value change_reason created_at listing_history',
        )
        .lean();

      // Get sales history and owner info
      const [salesHistory, ownerInfo] = await Promise.all([
        SalesHistory.getSalesForProperty(propertyObjectId, 20),
        buildOwnerInfo(propertyObjectId),
      ]);

      // Format PID using municipality configuration
      let pid_formatted, mapNumber, lotSubDisplay;

      if (property.pid_raw) {
        // Use server-side formatter with municipality config
        pid_formatted = formatPid(property.pid_raw, municipality);
        mapNumber = getMapFromPid(property.pid_raw, municipality);
        lotSubDisplay = getLotSubFromPid(property.pid_raw, municipality);
      } else {
        pid_formatted = property.pid_formatted || null;
        mapNumber = 'Unknown';
        lotSubDisplay = 'Unknown';
      }

      const propertyWithAssessment = {
        id: property._id.toString(),
        pid_raw: property.pid_raw,
        pid_formatted: pid_formatted,
        account_number: property.account_number,
        location: {
          street_number: property.location?.street_number,
          street: property.location?.street,
          address: property.location?.address,
          neighborhood: property.location?.neighborhood,
          zone: property.location?.zone,
        },
        // New owner structure
        owners: ownerInfo,
        // Legacy owner field (for backward compatibility)
        owner: {
          primary_name:
            ownerInfo.primary?.primary_name || property.owner?.primary_name,
          mailing_address: ownerInfo.primary
            ? `${ownerInfo.primary.mailing_street}, ${ownerInfo.primary.mailing_city}, ${ownerInfo.primary.mailing_state} ${ownerInfo.primary.mailing_zipcode}`.trim()
            : property.owner?.mailing_address,
        },
        property_class: property.property_class,
        property_type: property.property_type,
        tax_status: property.tax_status,
        assessed_value: assessment?.total_value || property.assessed_value || 0,
        tax_year: assessmentYear,
        assigned_to: property.assigned_to,
        module_flags: property.module_flags,
        last_updated: property.last_updated,
        notes: property.notes,
        // Card information
        cards: property.cards || {
          total_cards: 1,
          active_card: 1,
          card_descriptions: [],
        },
        current_card: cardNumber,
        // Assessment data
        assessment: assessment,
        assessmentHistory: assessmentHistory,
        salesHistory: salesHistory,
        // Legacy fields for backward compatibility
        pid: pid_formatted,
        mapNumber: mapNumber,
        lotSubDisplay: lotSubDisplay,
        accountNumber: property.account_number,
        streetNumber: property.location?.street_number,
        streetName: property.location?.street,
        streetAddress: property.location?.address,
        neighborhood: property.location?.neighborhood,
        zone: property.location?.zone,
        ownerName:
          ownerInfo.primary?.primary_name || property.owner?.primary_name,
        ownerMailingAddress: ownerInfo.primary
          ? `${ownerInfo.primary.mailing_street}, ${ownerInfo.primary.mailing_city}, ${ownerInfo.primary.mailing_state} ${ownerInfo.primary.mailing_zipcode}`.trim()
          : property.owner?.mailing_address,
        propertyClass: property.property_class,
        propertyType: property.property_type,
        taxStatus: property.tax_status,
        totalValue: assessment?.total_value || property.assessed_value || 0,
        landValue: assessment?.land?.value || 0,
        buildingValue: assessment?.building?.value || 0,
        otherValue: assessment?.other_improvements?.value || 0,
        taxYear: assessmentYear,
        assignedTo: property.assigned_to,
        moduleFlags: property.module_flags,
        lastUpdated: property.last_updated,
      };

      res.json({
        success: true,
        property: propertyWithAssessment,
      });
    } catch (dbError) {
      console.error('Database error loading property:', dbError);
      throw dbError; // Let the error bubble up to the outer catch block
    }
  } catch (error) {
    console.error('Get property error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve property',
    });
  }
});

// @route   GET /api/properties/:id/assessment-history
// @desc    Get property assessment history
// @access  Private
router.get(
  '/properties/:id/assessment-history',
  authenticateToken,
  async (req, res) => {
    try {
      const { id } = req.params;
      const mongoose = require('mongoose');

      // Get all assessment records for this property, sorted by year
      const propertyObjectId = new mongoose.Types.ObjectId(id);
      const assessments = await PropertyAssessment.find({
        property_id: propertyObjectId,
      })
        .sort({ effective_year: -1 })
        .populate('created_by', 'first_name last_name')
        .populate('reviewed_by', 'first_name last_name')
        .lean();

      res.json({
        success: true,
        assessments: assessments,
      });
    } catch (error) {
      console.error('Get assessment history error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve assessment history',
      });
    }
  },
);

// @route   POST /api/properties/:id/assessment
// @desc    Create new assessment record (only stores what changed)
// @access  Private
router.post(
  '/properties/:id/assessment',
  authenticateToken,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { year, changes, change_reason } = req.body;
      const userId = req.user._id;

      // Validate required fields
      if (!year || !changes || !change_reason) {
        return res.status(400).json({
          success: false,
          message: 'Year, changes, and change_reason are required',
        });
      }

      // Check if user has permission to update assessments
      if (
        !req.user.municipal_permissions?.some((perm) =>
          perm.module_permissions
            ?.get?.('assessing')
            ?.permissions?.includes('update'),
        )
      ) {
        return res.status(403).json({
          success: false,
          message: 'Permission denied: Cannot update assessments',
        });
      }

      // Create the assessment change record
      const newAssessment = await PropertyAssessment.createAssessmentChange(
        id,
        year,
        changes,
        change_reason,
        userId,
      );

      // Update the property tree node with the new total value
      await PropertyTreeNode.findByIdAndUpdate(id, {
        assessed_value: newAssessment.total_value,
        last_updated: new Date(),
      });

      res.status(201).json({
        success: true,
        message: 'Assessment updated successfully',
        assessment: newAssessment,
      });
    } catch (error) {
      console.error('Update assessment error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update assessment',
      });
    }
  },
);

// @route   GET /api/properties/:id/assessment/current
// @desc    Get current assessment for property with computed values
// @access  Private
router.get(
  '/properties/:id/assessment/current',
  authenticateToken,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { card, assessment_year } = req.query;
      const mongoose = require('mongoose');
      const currentYear = assessment_year
        ? parseInt(assessment_year, 10)
        : new Date().getFullYear();
      const cardNumber = card ? parseInt(card) : 1;

      const propertyObjectId = new mongoose.Types.ObjectId(id);

      // Get existing assessment
      let assessment = await PropertyAssessment.getAssessmentForYear(
        propertyObjectId,
        currentYear,
        cardNumber,
      );

      // Always compute current values from component assessments
      try {
        const components = await getPropertyAssessmentComponents(
          propertyObjectId,
          currentYear,
        );
        const totalAssessedValue = calculateTotalAssessedValue(components);

        // Round component values for consistency with total calculation
        const roundedLandValue = roundToNearestHundred(components.landValue);
        const roundedBuildingValue = roundToNearestHundred(
          components.buildingValue,
        );
        const roundedFeaturesValue = roundToNearestHundred(
          components.featuresValue,
        );

        // Create or update assessment with computed values
        const computedAssessment = {
          property_id: propertyObjectId,
          effective_year: currentYear,
          card_number: cardNumber,
          total_value: totalAssessedValue,
          land: {
            value: roundedLandValue,
            last_changed: currentYear,
          },
          building: {
            value: roundedBuildingValue,
            last_changed: currentYear,
          },
          other_improvements: {
            value: roundedFeaturesValue,
            last_changed: currentYear,
          },
          assessment_method: assessment?.assessment_method || 'market',
          assessor_notes: assessment?.assessor_notes || '',
          reviewed_date: new Date(),
        };

        // Use computed assessment
        assessment = computedAssessment;

        console.log(`Computed current assessment for property ${id}:`, {
          land: roundedLandValue,
          building: roundedBuildingValue,
          features: roundedFeaturesValue,
          total: totalAssessedValue,
        });
      } catch (error) {
        console.warn('Failed to compute assessment components:', error);
        // Fallback to existing assessment or zero values
        if (!assessment) {
          assessment = {
            property_id: propertyObjectId,
            effective_year: currentYear,
            card_number: cardNumber,
            total_value: 0,
            land: { value: 0, last_changed: currentYear },
            building: { value: 0, last_changed: currentYear },
            other_improvements: { value: 0, last_changed: currentYear },
          };
        }
      }

      // Get assessment history
      const history = await PropertyAssessment.find({
        property_id: propertyObjectId,
      })
        .sort({ effective_year: -1 })
        .limit(10);

      res.json({
        success: true,
        assessment: assessment,
        history: history,
      });
    } catch (error) {
      console.error('Get current assessment error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get current assessment',
      });
    }
  },
);

// @route   GET /api/properties/:id/assessment/land
// @desc    Get land assessment data for property
// @access  Private
router.get(
  '/properties/:id/assessment/land',
  authenticateToken,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { assessment_year } = req.query;
      const mongoose = require('mongoose');
      const LandAssessment = require('../models/LandAssessment');
      const currentYear = assessment_year
        ? parseInt(assessment_year, 10)
        : new Date().getFullYear();

      const propertyObjectId = new mongoose.Types.ObjectId(id);

      // Get land assessment using temporal logic - most recent up to currentYear
      const landAssessment = await LandAssessment.findOne({
        property_id: propertyObjectId,
        effective_year: { $lte: currentYear },
      })
        .sort({ effective_year: -1 })
        .populate([
          {
            path: 'zone',
            select:
              'name description minimumAcreage minimumFrontage excessLandCostPerAcre',
          },
          { path: 'neighborhood', select: 'code description rate' },
          { path: 'site_conditions', select: 'displayText description' },
          { path: 'driveway_type', select: 'displayText description' },
          { path: 'road_type', select: 'displayText description' },
        ]);

      console.log('Looking for land assessment:', {
        propertyId: propertyObjectId,
        year: currentYear,
        found: landAssessment ? landAssessment._id : 'null',
        populated: landAssessment
          ? {
              zone: landAssessment.zone ? 'yes' : 'no',
              neighborhood: landAssessment.neighborhood ? 'yes' : 'no',
              site_conditions: landAssessment.site_conditions ? 'yes' : 'no',
              driveway_type: landAssessment.driveway_type ? 'yes' : 'no',
              road_type: landAssessment.road_type ? 'yes' : 'no',
            }
          : null,
      });

      // Debug: Check if the referenced documents actually exist
      if (
        landAssessment &&
        (!landAssessment.site_conditions ||
          !landAssessment.driveway_type ||
          !landAssessment.road_type)
      ) {
        const rawAssessment = await LandAssessment.findById(
          landAssessment._id,
        ).lean();
        console.log('Raw land assessment data:', {
          site_conditions_id: rawAssessment.site_conditions,
          driveway_type_id: rawAssessment.driveway_type,
          road_type_id: rawAssessment.road_type,
        });

        // Check if these IDs exist in their respective collections
        const [siteExists, drivewayExists, roadExists] = await Promise.all([
          rawAssessment.site_conditions
            ? SiteCondition.findById(rawAssessment.site_conditions)
            : null,
          rawAssessment.driveway_type
            ? DrivewayType.findById(rawAssessment.driveway_type)
            : null,
          rawAssessment.road_type
            ? RoadType.findById(rawAssessment.road_type)
            : null,
        ]);

        console.log('Reference documents exist?', {
          site_conditions: siteExists ? 'YES' : 'NO',
          driveway_type: drivewayExists ? 'YES' : 'NO',
          road_type: roadExists ? 'YES' : 'NO',
        });
      }

      // Get land assessment history
      const landHistory = await LandAssessment.find({
        property_id: propertyObjectId,
      })
        .sort({ effective_year: -1 })
        .limit(5);

      let assessmentData = {};

      if (landAssessment) {
        assessmentData = landAssessment.toObject();

        // Add display names from populated references
        if (assessmentData.zone) {
          assessmentData.zone_name = assessmentData.zone.name;
          assessmentData.zone_description = assessmentData.zone.description;
          assessmentData.zone_minimum_acreage =
            assessmentData.zone.minimumAcreage;
          assessmentData.zone_minimum_frontage =
            assessmentData.zone.minimumFrontage;
          assessmentData.zone_excess_land_cost =
            assessmentData.zone.excessLandCostPerAcre;
          assessmentData.zone = assessmentData.zone._id; // Keep just the ID for the client
        }
        if (assessmentData.neighborhood) {
          assessmentData.neighborhood_code = assessmentData.neighborhood.code;
          assessmentData.neighborhood_description =
            assessmentData.neighborhood.description;
          assessmentData.neighborhood_factor = assessmentData.neighborhood.rate;
          assessmentData.neighborhood = assessmentData.neighborhood._id;
        }
        if (assessmentData.site_conditions) {
          assessmentData.site_conditions_name =
            assessmentData.site_conditions.displayText;
          assessmentData.site_conditions = assessmentData.site_conditions._id;
        }
        if (assessmentData.driveway_type) {
          assessmentData.driveway_type_name =
            assessmentData.driveway_type.displayText;
          assessmentData.driveway_type = assessmentData.driveway_type._id;
        }
        if (assessmentData.road_type) {
          assessmentData.road_type_name = assessmentData.road_type.displayText;
          assessmentData.road_type = assessmentData.road_type._id;
        }
      }

      console.log('Final assessmentData being sent:', {
        site_conditions_name: assessmentData?.site_conditions_name,
        driveway_type_name: assessmentData?.driveway_type_name,
        road_type_name: assessmentData?.road_type_name,
        zone_name: assessmentData?.zone_name,
        neighborhood_name: assessmentData?.neighborhood_name,
      });

      res.json({
        success: true,
        assessment: assessmentData,
        history: landHistory,
        comparables: [], // Would be populated with comparable land sales
      });
    } catch (error) {
      console.error('Get land assessment error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get land assessment',
      });
    }
  },
);

// @route   PUT /api/municipalities/:municipalityId/properties/:propertyId/land-assessment
// @desc    Update land assessment for property
// @access  Private
router.put(
  '/municipalities/:municipalityId/properties/:propertyId/land-assessment',
  authenticateToken,
  async (req, res) => {
    try {
      const { municipalityId, propertyId } = req.params;
      const { assessment } = req.body; // Land is parcel-level, no card parameter needed
      const { assessment_year } = req.query;
      const mongoose = require('mongoose');
      const LandAssessment = require('../models/LandAssessment');
      const currentYear = assessment_year
        ? parseInt(assessment_year, 10)
        : new Date().getFullYear();

      // Check if user has access to this municipality and update permissions
      const hasAccess =
        ['avitar_staff', 'avitar_admin'].includes(req.user.global_role) ||
        req.user.municipal_permissions?.some(
          (perm) =>
            perm.municipality_id.toString() === municipalityId &&
            perm.modules?.assessing?.permissions?.includes('update'),
        );

      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: 'Access denied - insufficient permissions',
        });
      }

      const propertyObjectId = new mongoose.Types.ObjectId(propertyId);
      const municipalityObjectId = new mongoose.Types.ObjectId(municipalityId);

      // Prepare land assessment data
      const landData = {
        zone: assessment.zone,
        neighborhood: assessment.neighborhood,
        taxation_category: assessment.taxation_category,
        site_conditions: assessment.site || assessment.site_conditions,
        driveway_type: assessment.driveway || assessment.driveway_type,
        road_type: assessment.road || assessment.road_type,
        current_use_credit: parseFloat(assessment.current_use_credit) || 0,
        market_value: parseFloat(assessment.market_value) || 0,
        taxable_value: parseFloat(assessment.taxable_value) || 0,
        land_use_details: assessment.land_use_details || [],
        calculated_totals: assessment.calculated_totals || {},
        last_calculated: new Date(),
        effective_year: currentYear,
        municipality_id: municipalityObjectId,
      };

      // Prepare audit information
      const auditInfo = {
        user_id: req.user.id,
        user_name: req.user.name || req.user.email,
        session_id: req.sessionID,
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
        change_reason: req.body.change_reason || 'manual_adjustment',
        notes: req.body.notes,
      };

      // Update land assessment using the dedicated model with billing validation and audit
      let updatedLandAssessment;
      try {
        updatedLandAssessment = await LandAssessment.updateForProperty(
          propertyObjectId,
          municipalityObjectId,
          landData,
          req.user.id,
          currentYear,
          auditInfo,
        );
      } catch (saveError) {
        console.error('Error saving land assessment:', saveError);

        // Handle billing period validation errors specifically
        if (saveError.name === 'BillingPeriodValidationError') {
          return res.status(403).json({
            success: false,
            error: saveError.code,
            message: saveError.message,
            details: saveError.details,
            current_year: saveError.details?.current_year,
            effective_year: saveError.details?.effective_year,
            redirect: saveError.details?.redirect_year
              ? {
                  year: saveError.details.redirect_year,
                  url: `/municipality/${municipalityId}/properties/${propertyId}/land-assessment?year=${saveError.details.redirect_year}`,
                  message: `Please navigate to ${saveError.details.redirect_year} to make changes`,
                }
              : null,
          });
        }

        throw saveError;
      }

      res.json({
        success: true,
        message: 'Land assessment updated successfully',
        assessment: updatedLandAssessment,
      });
    } catch (error) {
      console.error('Update land assessment error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update land assessment',
      });
    }
  },
);

// @route   GET /api/properties/:id/assessment/building
// @desc    Get building assessment data for property
// @access  Private
router.get(
  '/properties/:id/assessment/building',
  authenticateToken,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { card = 1, assessment_year } = req.query;
      const mongoose = require('mongoose');
      const BuildingAssessment = require('../models/BuildingAssessment');
      const currentYear = assessment_year
        ? parseInt(assessment_year, 10)
        : new Date().getFullYear();

      const propertyObjectId = new mongoose.Types.ObjectId(id);

      // First get the property to extract municipality_id
      const property = await PropertyTreeNode.findById(propertyObjectId);
      if (!property) {
        return res.status(404).json({
          success: false,
          message: 'Property not found',
        });
      }

      // Get or create building assessment for this property/card
      const buildingAssessment =
        await BuildingAssessment.getOrCreateForPropertyCard(
          propertyObjectId,
          property.municipality_id,
          parseInt(card),
          currentYear,
        );

      // Get building assessment history
      const buildingHistory = await BuildingAssessment.find({
        property_id: propertyObjectId,
        card_number: parseInt(card),
      })
        .sort({ effective_year: -1 })
        .limit(5);

      res.json({
        success: true,
        assessment: buildingAssessment,
        history: buildingHistory,
        depreciation: buildingAssessment.depreciation || {},
        improvements: [], // Would be populated with improvement records
      });
    } catch (error) {
      console.error('Get building assessment error:', {
        propertyId: req.params.id,
        cardNumber: card,
        assessmentYear: assessment_year,
        municipalityId: property?.municipality_id || 'unknown',
        error: error.message,
        stack: error.stack,
      });

      // Provide more specific error messages
      let errorMessage = 'Failed to get building assessment';
      let statusCode = 500;

      if (
        error.message.includes('invalid ObjectId') ||
        error.message.includes('ObjectId')
      ) {
        errorMessage = 'Invalid property ID format';
        statusCode = 400;
      } else if (
        error.message.includes('municipality') ||
        error.message.includes('Municipality')
      ) {
        errorMessage =
          'Invalid municipality data - please check user permissions';
        statusCode = 403;
      } else if (
        error.message.includes('duplicate key') ||
        error.message.includes('E11000')
      ) {
        errorMessage = 'Building assessment record conflict - please try again';
        statusCode = 409;
      }

      res.status(statusCode).json({
        success: false,
        message: errorMessage,
        details:
          process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  },
);

// @route   PATCH /api/properties/:id/assessment/building
// @desc    Update building assessment data for property
// @access  Private
router.patch(
  '/properties/:id/assessment/building',
  authenticateToken,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { card = 1 } = req.query;
      const buildingData = req.body;
      const mongoose = require('mongoose');
      const currentYear = new Date().getFullYear();

      // Check if user has permission to update assessments
      if (
        !['avitar_staff', 'avitar_admin'].includes(req.user.global_role) &&
        !req.user.municipal_permissions?.some((perm) =>
          perm.module_permissions
            ?.get?.('assessing')
            ?.permissions?.includes('update'),
        )
      ) {
        return res.status(403).json({
          success: false,
          message: 'Permission denied: Cannot update building assessments',
        });
      }

      const propertyObjectId = new mongoose.Types.ObjectId(id);
      const cardNumber = parseInt(card);

      // Get the property to find the municipality ID
      const PropertyTreeNode = require('../models/PropertyTreeNode');
      const property = await PropertyTreeNode.findById(propertyObjectId);
      if (!property) {
        return res.status(404).json({
          success: false,
          message: 'Property not found',
        });
      }

      const municipalityId = property.municipality_id;

      // Prepare the building data for update - only include fields that are provided
      const buildingAssessmentData = {};

      // Add fields only if they are provided in the request
      if (buildingData.building_model !== undefined)
        buildingAssessmentData.building_model = buildingData.building_model;
      if (buildingData.frame !== undefined)
        buildingAssessmentData.frame = buildingData.frame;
      if (buildingData.year_built !== undefined)
        buildingAssessmentData.year_built =
          parseInt(buildingData.year_built) || null;
      if (buildingData.base_type !== undefined)
        buildingAssessmentData.base_type = buildingData.base_type;
      if (buildingData.quality_grade !== undefined)
        buildingAssessmentData.quality_grade = buildingData.quality_grade;
      if (buildingData.story_height !== undefined)
        buildingAssessmentData.story_height = buildingData.story_height;
      if (buildingData.roof_style !== undefined)
        buildingAssessmentData.roof_style = buildingData.roof_style;
      if (buildingData.roof_cover !== undefined)
        buildingAssessmentData.roof_cover = buildingData.roof_cover;
      if (buildingData.exterior_wall_1 !== undefined)
        buildingAssessmentData.exterior_wall_1 = buildingData.exterior_wall_1;
      if (buildingData.exterior_wall_2 !== undefined)
        buildingAssessmentData.exterior_wall_2 = buildingData.exterior_wall_2;
      if (buildingData.interior_wall_1 !== undefined)
        buildingAssessmentData.interior_wall_1 = buildingData.interior_wall_1;
      if (buildingData.interior_wall_2 !== undefined)
        buildingAssessmentData.interior_wall_2 = buildingData.interior_wall_2;
      if (buildingData.flooring_1 !== undefined)
        buildingAssessmentData.flooring_1 = buildingData.flooring_1;
      if (buildingData.flooring_2 !== undefined)
        buildingAssessmentData.flooring_2 = buildingData.flooring_2;
      if (buildingData.heating_fuel !== undefined)
        buildingAssessmentData.heating_fuel = buildingData.heating_fuel;
      if (buildingData.heating_type !== undefined)
        buildingAssessmentData.heating_type = buildingData.heating_type;
      if (buildingData.air_conditioning !== undefined)
        buildingAssessmentData.air_conditioning = buildingData.air_conditioning;
      if (buildingData.bedrooms !== undefined)
        buildingAssessmentData.bedrooms = parseInt(buildingData.bedrooms) || 0;
      if (buildingData.full_baths !== undefined)
        buildingAssessmentData.full_baths =
          parseFloat(buildingData.full_baths) || 0;
      if (buildingData.half_baths !== undefined)
        buildingAssessmentData.half_baths =
          parseFloat(buildingData.half_baths) || 0;
      if (buildingData.extra_kitchen !== undefined)
        buildingAssessmentData.extra_kitchen =
          parseInt(buildingData.extra_kitchen) || 0;
      if (buildingData.generator !== undefined)
        buildingAssessmentData.generator = buildingData.generator;
      if (buildingData.change_reason !== undefined)
        buildingAssessmentData.change_reason = buildingData.change_reason;

      // Set default change_reason if none provided
      if (!buildingAssessmentData.change_reason)
        buildingAssessmentData.change_reason = 'renovation';

      // Include depreciation data if provided
      if (buildingData.depreciation) {
        buildingAssessmentData.depreciation = buildingData.depreciation;
      }

      // Update building assessment using the model's static method
      console.log('Updating building assessment for property:', {
        propertyId: propertyObjectId,
        municipalityId,
        cardNumber,
        userId: req.user._id,
        dataKeys: Object.keys(buildingAssessmentData),
      });

      const buildingAssessment = await BuildingAssessment.updateForPropertyCard(
        propertyObjectId,
        municipalityId,
        cardNumber,
        buildingAssessmentData,
        req.user._id,
        currentYear,
      );

      res.json({
        success: true,
        message: 'Building assessment updated successfully',
        assessment: buildingAssessment,
      });
    } catch (error) {
      console.error('Update building assessment error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update building assessment',
      });
    }
  },
);

// @route   POST /api/properties/:id/assessment/building/calculate
// @desc    Trigger manual building value calculation
// @access  Private
router.post(
  '/properties/:id/assessment/building/calculate',
  authenticateToken,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { card = 1 } = req.query;
      const calculationConfig = req.body;
      const mongoose = require('mongoose');

      const propertyObjectId = new mongoose.Types.ObjectId(id);
      const cardNumber = parseInt(card);

      // Get the building assessment
      const buildingAssessment = await BuildingAssessment.findOne({
        property_id: propertyObjectId,
        card_number: cardNumber,
        effective_year: new Date().getFullYear(),
      });

      if (!buildingAssessment) {
        return res.status(404).json({
          success: false,
          message: 'Building assessment not found',
        });
      }

      // Calculate building value with provided config using service
      const calculationService = new BuildingAssessmentCalculationService();
      await calculationService.initialize(
        buildingAssessment.municipality_id,
        buildingAssessment.effective_year,
      );

      const calculations =
        calculationService.calculateBuildingAssessment(buildingAssessment);

      // Update the building assessment with calculated values (rounded to nearest hundred)
      buildingAssessment.building_value =
        Math.round((calculations.buildingValue || 0) / 100) * 100;
      buildingAssessment.replacement_cost_new = calculations.replacementCostNew;
      buildingAssessment.assessed_value =
        Math.round((calculations.buildingValue || 0) / 100) * 100;
      buildingAssessment.base_rate = calculations.baseRate;
      buildingAssessment.age = calculations.buildingAge;
      buildingAssessment.calculation_details = calculations;
      buildingAssessment.last_calculated = new Date();

      await buildingAssessment.save();

      res.json({
        success: true,
        message: 'Building value calculated successfully',
        calculations: calculations,
        buildingValue: buildingAssessment.building_value,
        marketValue: buildingAssessment.market_value,
        assessedValue: buildingAssessment.assessed_value,
      });
    } catch (error) {
      console.error('Calculate building value error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to calculate building value',
        error: error.message,
      });
    }
  },
);

// @route   GET /api/municipalities/:municipalityId/building-calculation-config
// @desc    Get building calculation configuration for municipality
// @access  Private
router.get(
  '/municipalities/:municipalityId/building-calculation-config',
  authenticateToken,
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
      const { year } = req.query;
      const currentYear = year ? parseInt(year) : new Date().getFullYear();

      // Check if user has access to this municipality
      const hasAccess =
        ['avitar_staff', 'avitar_admin'].includes(req.user.global_role) ||
        req.user.municipal_permissions?.some(
          (perm) => perm.municipality_id.toString() === municipalityId,
        );

      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: 'Access denied to this municipality',
        });
      }

      const config = await BuildingCalculationConfig.getOrCreateForMunicipality(
        municipalityId,
        currentYear,
      );

      res.json({
        success: true,
        config: config,
      });
    } catch (error) {
      console.error('Get building calculation config error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get building calculation configuration',
        error: error.message,
      });
    }
  },
);

// @route   PATCH /api/municipalities/:municipalityId/building-calculation-config
// @desc    Update building calculation configuration for municipality
// @access  Private
router.patch(
  '/municipalities/:municipalityId/building-calculation-config',
  authenticateToken,
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
      const { year } = req.query;
      const configData = req.body;
      const currentYear = year ? parseInt(year) : new Date().getFullYear();

      // Check if user has admin access to this municipality
      const hasAdminAccess =
        ['avitar_staff', 'avitar_admin'].includes(req.user.global_role) ||
        req.user.municipal_permissions?.some(
          (perm) =>
            perm.municipality_id.toString() === municipalityId &&
            perm.module_permissions
              ?.get?.('assessing')
              ?.permissions?.includes('admin'),
        );

      if (!hasAdminAccess) {
        return res.status(403).json({
          success: false,
          message:
            'Access denied: Admin privileges required to update calculation configuration',
        });
      }

      const config = await BuildingCalculationConfig.findOneAndUpdate(
        {
          municipality_id: municipalityId,
          effective_year: currentYear,
        },
        {
          ...configData,
          updated_by: req.user._id,
          updated_at: new Date(),
          last_changed: new Date(),
        },
        {
          new: true,
          upsert: true,
          setDefaultsOnInsert: true,
        },
      );

      res.json({
        success: true,
        message: 'Building calculation configuration updated successfully',
        config: config,
      });
    } catch (error) {
      console.error('Update building calculation config error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update building calculation configuration',
        error: error.message,
      });
    }
  },
);

// @route   POST /api/municipalities/:municipalityId/building-assessments/mass-recalculate
// @desc    Trigger mass recalculation of building assessments for municipality
// @access  Private
router.post(
  '/municipalities/:municipalityId/building-assessments/mass-recalculate',
  authenticateToken,
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
      const { year, filters, batchSize } = req.body;

      // Check if user has admin access to this municipality
      const hasAdminAccess =
        ['avitar_staff', 'avitar_admin'].includes(req.user.global_role) ||
        req.user.municipal_permissions?.some(
          (perm) =>
            perm.municipality_id.toString() === municipalityId &&
            perm.module_permissions
              ?.get?.('assessing')
              ?.permissions?.includes('admin'),
        );

      if (!hasAdminAccess) {
        return res.status(403).json({
          success: false,
          message:
            'Access denied: Admin privileges required for mass recalculation',
        });
      }

      // Use calculation service for mass recalculation
      const calculationService = new BuildingAssessmentCalculationService();
      let result;

      if (filters && Object.keys(filters).length > 0) {
        // For filtered recalculation, we'll use affected properties method
        // The service expects changeType and changeId, so we'll use 'filter' as changeType
        // and pass the first filter key as changeId for now
        const firstFilterKey = Object.keys(filters)[0];
        result = await calculationService.recalculateAffectedProperties(
          municipalityId,
          'filter',
          firstFilterKey,
          year,
        );
      } else {
        // For municipality-wide recalculation
        result = await calculationService.recalculateAllProperties(
          municipalityId,
          year,
          { batchSize },
        );
      }

      res.json({
        success: true,
        message: 'Mass building recalculation completed successfully',
        result: result,
      });
    } catch (error) {
      console.error('Mass building recalculation error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to complete mass building recalculation',
        error: error.message,
      });
    }
  },
);

// @route   GET /api/municipalities/:municipalityId/building-assessments/recalculation-status
// @desc    Get status/summary of building assessments for recalculation planning
// @access  Private
router.get(
  '/municipalities/:municipalityId/building-assessments/recalculation-status',
  authenticateToken,
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
      const { year } = req.query;
      const currentYear = year ? parseInt(year) : new Date().getFullYear();

      // Check if user has access to this municipality
      const hasAccess =
        ['avitar_staff', 'avitar_admin'].includes(req.user.global_role) ||
        req.user.municipal_permissions?.some(
          (perm) => perm.municipality_id.toString() === municipalityId,
        );

      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: 'Access denied to this municipality',
        });
      }

      // Get summary statistics
      const [
        totalAssessments,
        oldCalculations,
        recentCalculations,
        nullValueAssessments,
      ] = await Promise.all([
        BuildingAssessment.countDocuments({
          municipality_id: municipalityId,
          effective_year: currentYear,
        }),
        BuildingAssessment.countDocuments({
          municipality_id: municipalityId,
          effective_year: currentYear,
          last_calculated: {
            $lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          }, // Older than 7 days
        }),
        BuildingAssessment.countDocuments({
          municipality_id: municipalityId,
          effective_year: currentYear,
          last_calculated: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // Within last 24 hours
        }),
        BuildingAssessment.countDocuments({
          municipality_id: municipalityId,
          effective_year: currentYear,
          $or: [
            { building_value: { $exists: false } },
            { building_value: null },
            { building_value: 0 },
          ],
        }),
      ]);

      res.json({
        success: true,
        status: {
          municipalityId,
          year: currentYear,
          totalAssessments,
          oldCalculations,
          recentCalculations,
          nullValueAssessments,
          needsRecalculation: oldCalculations + nullValueAssessments,
          lastChecked: new Date(),
        },
      });
    } catch (error) {
      console.error('Get recalculation status error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get recalculation status',
        error: error.message,
      });
    }
  },
);

// @route   GET /api/properties/:id/features
// @desc    Get property features and amenities
// @access  Private
router.get('/properties/:id/features', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { card } = req.query; // Get card number from query parameter
    const mongoose = require('mongoose');

    // Build query filter
    const filter = { property_id: new mongoose.Types.ObjectId(id) };

    // Add card number filter if provided
    if (card) {
      const cardNum = parseInt(card);
      if (cardNum && cardNum > 0) {
        // Include features with the specified card_number OR features without card_number (legacy features)
        // Legacy features without card_number are treated as card 1
        if (cardNum === 1) {
          filter.$or = [
            { card_number: 1 },
            { card_number: { $exists: false } },
            { card_number: null },
          ];
        } else {
          filter.card_number = cardNum;
        }
      }
    }

    const features =
      await PropertyFeature.find(filter).populate('feature_code_id');

    // Add calculated fields to each feature
    const featuresWithCalculations = features.map((feature) => {
      const featureObj = feature.toObject({ virtuals: true });
      return {
        ...featureObj,
        calculatedArea: feature.calculated_area,
        calculatedValue: feature.calculated_value,
        measurementType: feature.measurement_type, // Ensure consistent naming
      };
    });

    res.json({
      success: true,
      features: featuresWithCalculations || [],
      categories: [
        { name: 'Exterior Features', type: 'exterior' },
        { name: 'Interior Features', type: 'interior' },
        { name: 'Site Features', type: 'site' },
        { name: 'Utilities', type: 'utilities' },
      ],
      history: [],
    });
  } catch (error) {
    console.error('Get property features error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get property features',
    });
  }
});

// @route   POST /api/properties/:id/features
// @desc    Add a new feature to a property
// @access  Private
router.post('/properties/:id/features', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      feature_code_id,
      description,
      length,
      width,
      units,
      size_adjustment,
      rate,
      condition,
      measurement_type,
      notes,
      card_number,
    } = req.body;

    const mongoose = require('mongoose');

    // Validate required fields
    if (
      !feature_code_id ||
      !description ||
      rate === undefined ||
      !measurement_type ||
      !condition ||
      !card_number
    ) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields (including card_number)',
      });
    }

    // Validate card_number is a positive integer
    const cardNum = parseInt(card_number);
    if (!cardNum || cardNum < 1) {
      return res.status(400).json({
        success: false,
        message: 'card_number must be a positive integer',
      });
    }

    // Check current feature count for this card (11 features per card limit)
    const currentFeatureCount = await PropertyFeature.countDocuments({
      property_id: new mongoose.Types.ObjectId(id),
      card_number: cardNum,
    });

    if (currentFeatureCount >= 11) {
      return res.status(400).json({
        success: false,
        message: `Maximum of 11 features allowed per card. Card ${cardNum} already has ${currentFeatureCount} features.`,
      });
    }

    const newFeature = new PropertyFeature({
      property_id: new mongoose.Types.ObjectId(id),
      card_number: cardNum,
      feature_code_id: new mongoose.Types.ObjectId(feature_code_id),
      description,
      length: parseFloat(length) || 0,
      width: parseFloat(width) || 0,
      units: parseFloat(units) || 1,
      size_adjustment: parseFloat(size_adjustment) || 1.0,
      rate: parseFloat(rate),
      condition,
      measurement_type,
      notes: notes || '',
    });

    const savedFeature = await newFeature.save();
    await savedFeature.populate('feature_code_id');

    res.status(201).json({
      success: true,
      feature: savedFeature,
    });
  } catch (error) {
    console.error('Create property feature error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create property feature',
    });
  }
});

// @route   PUT /api/properties/:id/features/:featureId
// @desc    Update a property feature
// @access  Private
router.put(
  '/properties/:id/features/:featureId',
  authenticateToken,
  async (req, res) => {
    try {
      const { id, featureId } = req.params;
      const {
        feature_code_id,
        description,
        length,
        width,
        units,
        size_adjustment,
        rate,
        condition,
        measurement_type,
        notes,
      } = req.body;

      const mongoose = require('mongoose');

      const updatedFeature = await PropertyFeature.findOneAndUpdate(
        {
          _id: new mongoose.Types.ObjectId(featureId),
          property_id: new mongoose.Types.ObjectId(id),
        },
        {
          feature_code_id: new mongoose.Types.ObjectId(feature_code_id),
          description,
          length: parseFloat(length) || 0,
          width: parseFloat(width) || 0,
          units: parseFloat(units) || 1,
          size_adjustment: parseFloat(size_adjustment) || 1.0,
          rate: parseFloat(rate),
          condition,
          measurement_type,
          notes: notes || '',
          updated_at: new Date(),
        },
        { new: true },
      ).populate('feature_code_id');

      if (!updatedFeature) {
        return res.status(404).json({
          success: false,
          message: 'Feature not found',
        });
      }

      res.json({
        success: true,
        feature: updatedFeature,
      });
    } catch (error) {
      console.error('Update property feature error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update property feature',
      });
    }
  },
);

// @route   DELETE /api/properties/:id/features/:featureId
// @desc    Delete a property feature
// @access  Private
router.delete(
  '/properties/:id/features/:featureId',
  authenticateToken,
  async (req, res) => {
    try {
      const { id, featureId } = req.params;
      const mongoose = require('mongoose');

      const deletedFeature = await PropertyFeature.findOneAndDelete({
        _id: new mongoose.Types.ObjectId(featureId),
        property_id: new mongoose.Types.ObjectId(id),
      });

      if (!deletedFeature) {
        return res.status(404).json({
          success: false,
          message: 'Feature not found',
        });
      }

      res.json({
        success: true,
        message: 'Feature deleted successfully',
      });
    } catch (error) {
      console.error('Delete property feature error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete property feature',
      });
    }
  },
);

// @route   POST /api/properties/:id/cards
// @desc    Add a new card to a property
// @access  Private
router.post('/properties/:id/cards', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { description } = req.body;
    const mongoose = require('mongoose');

    const property = await PropertyTreeNode.findById(
      new mongoose.Types.ObjectId(id),
    );
    if (!property) {
      return res.status(404).json({
        success: false,
        message: 'Property not found',
      });
    }

    await property.addCard(description, req.user._id);

    res.status(201).json({
      success: true,
      message: 'Card added successfully',
      cards: property.cards,
    });
  } catch (error) {
    console.error('Add card error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to add card',
    });
  }
});

// @route   PUT /api/properties/:id/cards/:cardNumber
// @desc    Update card description
// @access  Private
router.put(
  '/properties/:id/cards/:cardNumber',
  authenticateToken,
  async (req, res) => {
    try {
      const { id, cardNumber } = req.params;
      const { description } = req.body;
      const mongoose = require('mongoose');

      const property = await PropertyTreeNode.findById(
        new mongoose.Types.ObjectId(id),
      );
      if (!property) {
        return res.status(404).json({
          success: false,
          message: 'Property not found',
        });
      }

      await property.updateCardDescription(parseInt(cardNumber), description);

      res.json({
        success: true,
        message: 'Card updated successfully',
        cards: property.cards,
      });
    } catch (error) {
      console.error('Update card error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to update card',
      });
    }
  },
);

// @route   DELETE /api/properties/:id/cards/:cardNumber
// @desc    Remove a card from a property
// @access  Private
router.delete(
  '/properties/:id/cards/:cardNumber',
  authenticateToken,
  async (req, res) => {
    try {
      const { id, cardNumber } = req.params;
      const mongoose = require('mongoose');

      const property = await PropertyTreeNode.findById(
        new mongoose.Types.ObjectId(id),
      );
      if (!property) {
        return res.status(404).json({
          success: false,
          message: 'Property not found',
        });
      }

      await property.removeCard(parseInt(cardNumber));

      res.json({
        success: true,
        message: 'Card removed successfully',
        cards: property.cards,
      });
    } catch (error) {
      console.error('Remove card error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to remove card',
      });
    }
  },
);

// @route   PUT /api/properties/:id/cards/:cardNumber/activate
// @desc    Set the active card for a property (alternative endpoint)
// @access  Private
router.put(
  '/properties/:id/cards/:cardNumber/activate',
  authenticateToken,
  async (req, res) => {
    try {
      const { id, cardNumber } = req.params;
      const mongoose = require('mongoose');

      const property = await PropertyTreeNode.findById(
        new mongoose.Types.ObjectId(id),
      );
      if (!property) {
        return res.status(404).json({
          success: false,
          message: 'Property not found',
        });
      }

      await property.setActiveCard(parseInt(cardNumber));

      res.json({
        success: true,
        message: 'Active card updated successfully',
        cards: property.cards,
        active_card: parseInt(cardNumber),
      });
    } catch (error) {
      console.error('Set active card error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to set active card',
      });
    }
  },
);

// @route   PUT /api/properties/:id/active-card/:cardNumber
// @desc    Set the active card for a property
// @access  Private
router.put(
  '/properties/:id/active-card/:cardNumber',
  authenticateToken,
  async (req, res) => {
    try {
      const { id, cardNumber } = req.params;
      const mongoose = require('mongoose');

      const property = await PropertyTreeNode.findById(
        new mongoose.Types.ObjectId(id),
      );
      if (!property) {
        return res.status(404).json({
          success: false,
          message: 'Property not found',
        });
      }

      await property.setActiveCard(parseInt(cardNumber));

      res.json({
        success: true,
        message: 'Active card updated successfully',
        cards: property.cards,
        active_card: parseInt(cardNumber),
      });
    } catch (error) {
      console.error('Set active card error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to set active card',
      });
    }
  },
);

// === PROPERTY SKETCH ENDPOINTS ===

// @route   GET /api/properties/:id/sketches
// @desc    Get all sketches for a property and card
// @access  Private
router.get('/properties/:id/sketches', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { card = 1 } = req.query;
    const mongoose = require('mongoose');

    const propertyObjectId = new mongoose.Types.ObjectId(id);
    const cardNumber = parseInt(card);

    console.log('Sketch query:', {
      property_id: propertyObjectId,
      card_number: cardNumber,
    });

    const sketches = await PropertySketch.find({
      property_id: propertyObjectId,
      card_number: cardNumber,
    }).sort({ created_at: -1 });

    console.log(
      `Found ${sketches.length} sketches for property ${id}, card ${cardNumber}`,
    );

    res.json({
      success: true,
      sketches: sketches,
      areaDescriptions: getAreaDescriptionRates(),
    });
  } catch (error) {
    console.error('Get sketches error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve sketches',
    });
  }
});

// @route   POST /api/properties/:id/sketches
// @desc    Create a new sketch for a property
// @access  Private
router.post('/properties/:id/sketches', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const mongoose = require('mongoose');

    const propertyObjectId = new mongoose.Types.ObjectId(id);

    const sketchData = {
      ...req.body,
      property_id: propertyObjectId,
      created_by: req.user.id,
      updated_by: req.user.id,
    };

    const sketch = new PropertySketch(sketchData);
    sketch.calculateTotals();

    await sketch.save();

    // Update building assessment with new effective area from all sketches
    const cardNumber = parseInt(req.query.card) || 1;
    const assessmentUpdate = await updateBuildingAssessmentFromSketches(
      id,
      cardNumber,
    );

    res.status(201).json({
      success: true,
      sketch: sketch,
      buildingAssessmentUpdate: assessmentUpdate,
    });
  } catch (error) {
    console.error('Create sketch error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create sketch',
    });
  }
});

// @route   PUT /api/properties/:id/sketches/:sketchId
// @desc    Update a sketch
// @access  Private
router.put(
  '/properties/:id/sketches/:sketchId',
  authenticateToken,
  async (req, res) => {
    try {
      const { id, sketchId } = req.params;
      const mongoose = require('mongoose');

      const propertyObjectId = new mongoose.Types.ObjectId(id);
      const sketchObjectId = new mongoose.Types.ObjectId(sketchId);

      const sketch = await PropertySketch.findOne({
        _id: sketchObjectId,
        property_id: propertyObjectId,
      });

      if (!sketch) {
        return res.status(404).json({
          success: false,
          message: 'Sketch not found',
        });
      }

      // Update sketch data
      Object.assign(sketch, req.body);
      sketch.updated_by = req.user.id;
      sketch.calculateTotals();

      await sketch.save();

      // Update building assessment with new effective area from all sketches
      const cardNumber = parseInt(req.query.card) || 1;
      const assessmentUpdate = await updateBuildingAssessmentFromSketches(
        id,
        cardNumber,
      );

      res.json({
        success: true,
        sketch: sketch,
        buildingAssessmentUpdate: assessmentUpdate,
      });
    } catch (error) {
      console.error('Update sketch error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to update sketch',
      });
    }
  },
);

// @route   DELETE /api/properties/:id/sketches/:sketchId
// @desc    Delete a sketch
// @access  Private
router.delete(
  '/properties/:id/sketches/:sketchId',
  authenticateToken,
  async (req, res) => {
    try {
      const { id, sketchId } = req.params;
      const mongoose = require('mongoose');

      const propertyObjectId = new mongoose.Types.ObjectId(id);
      const sketchObjectId = new mongoose.Types.ObjectId(sketchId);

      const result = await PropertySketch.deleteOne({
        _id: sketchObjectId,
        property_id: propertyObjectId,
      });

      if (result.deletedCount === 0) {
        return res.status(404).json({
          success: false,
          message: 'Sketch not found',
        });
      }

      // Update building assessment with new effective area from all sketches
      const cardNumber = parseInt(req.query.card) || 1;
      const assessmentUpdate = await updateBuildingAssessmentFromSketches(
        id,
        cardNumber,
      );

      res.json({
        success: true,
        message: 'Sketch deleted successfully',
        buildingAssessmentUpdate: assessmentUpdate,
      });
    } catch (error) {
      console.error('Delete sketch error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete sketch',
      });
    }
  },
);

// @route   GET /api/sketches/search
// @desc    Search sketches by description codes or area
// @access  Private
router.get('/sketches/search', authenticateToken, async (req, res) => {
  try {
    const { codes, min_area, max_area, building_type } = req.query;

    let query = {};

    // Filter by description codes
    if (codes) {
      const codeArray = codes.split(',').map((c) => c.trim().toUpperCase());
      query.description_codes = { $in: codeArray };
    }

    // Filter by area range
    if (min_area || max_area) {
      const minArea = min_area ? parseFloat(min_area) : 0;
      const maxArea = max_area ? parseFloat(max_area) : Number.MAX_VALUE;

      query.$or = [
        { 'area_range.min': { $gte: minArea, $lte: maxArea } },
        { 'area_range.max': { $gte: minArea, $lte: maxArea } },
        {
          'area_range.min': { $lte: minArea },
          'area_range.max': { $gte: maxArea },
        },
      ];
    }

    // Filter by building type
    if (building_type) {
      query.building_type = building_type;
    }

    const sketches = await PropertySketch.find(query)
      .populate('property_id', 'pid_formatted location owner')
      .sort({ total_effective_area: -1 })
      .limit(100);

    res.json({
      success: true,
      sketches: sketches,
      count: sketches.length,
    });
  } catch (error) {
    console.error('Search sketches error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to search sketches',
    });
  }
});

// @route   POST /api/properties/:id/sketches/calculate-preview
// @desc    Calculate building value preview with proposed sketch changes (without saving)
// @access  Private
router.post(
  '/properties/:id/sketches/calculate-preview',
  authenticateToken,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { card = 1 } = req.query;
      const { proposedSketch } = req.body; // The sketch data to preview
      const mongoose = require('mongoose');

      const propertyObjectId = new mongoose.Types.ObjectId(id);
      const cardNumber = parseInt(card);

      // Get current sketches for this property and card (only latest to avoid double-counting)
      const existingSketches = await PropertySketch.find({
        property_id: propertyObjectId,
        card_number: cardNumber,
      })
        .sort({ created_at: -1 })
        .limit(1);

      // Calculate effective area including the proposed sketch (without saving it)
      let proposedEffectiveArea = 0;

      if (proposedSketch && proposedSketch.shapes) {
        // Create a temporary sketch object to calculate totals
        const tempSketch = new PropertySketch({
          ...proposedSketch,
          property_id: propertyObjectId,
          card_number: cardNumber,
        });
        tempSketch.calculateTotals();
        proposedEffectiveArea = tempSketch.total_effective_area || 0;
      }

      // Calculate total effective area from existing sketches
      const existingEffectiveArea = existingSketches.reduce((sum, sketch) => {
        return sum + (sketch.total_effective_area || 0);
      }, 0);

      // Total would be existing + proposed
      const totalEffectiveArea = existingEffectiveArea + proposedEffectiveArea;

      // Get current building assessment
      const currentAssessment = await BuildingAssessment.findOne({
        property_id: propertyObjectId,
        card_number: cardNumber,
      });

      if (!currentAssessment) {
        return res.status(404).json({
          success: false,
          message: 'Building assessment not found',
        });
      }

      // Calculate what the building value would be with the new effective area
      const currentBuildingValue = currentAssessment.building_value || 0;
      const currentEffectiveArea = currentAssessment.effective_area || 0;

      // Create a temporary assessment object with the new effective area
      const tempAssessmentData = {
        ...currentAssessment.toObject(),
        effective_area: totalEffectiveArea,
      };

      // Calculate the new building value using service
      const calculationService = new BuildingAssessmentCalculationService();
      await calculationService.initialize(
        currentAssessment.municipality_id,
        currentAssessment.effective_year,
      );

      // Create a temporary BuildingAssessment object for calculation
      const tempAssessment = new BuildingAssessment(tempAssessmentData);
      const calculations =
        calculationService.calculateBuildingAssessment(tempAssessment);
      const proposedBuildingValue = calculations.buildingValue || 0;

      // Calculate the difference
      const valueDifference = proposedBuildingValue - currentBuildingValue;
      const areaDifference = totalEffectiveArea - currentEffectiveArea;

      res.json({
        success: true,
        preview: {
          currentEffectiveArea,
          proposedEffectiveArea,
          totalEffectiveArea,
          areaDifference,
          currentBuildingValue,
          proposedBuildingValue,
          valueDifference,
          percentChange:
            currentBuildingValue > 0
              ? (valueDifference / currentBuildingValue) * 100
              : 0,
        },
      });
    } catch (error) {
      console.error('Calculate sketch preview error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to calculate preview',
      });
    }
  },
);

// Helper function to return area description rates
function getAreaDescriptionRates() {
  return [
    { code: 'HSF', description: 'Half Story Finished', rate: 0.5 },
    { code: 'FFF', description: 'Full Floor Finished', rate: 1.0 },
    { code: 'BMU', description: 'Basement Unfinished', rate: 0.75 },
    { code: 'BMF', description: 'Basement Finished', rate: 1.0 },
    { code: 'ATU', description: 'Attic Unfinished', rate: 0.5 },
    { code: 'ATF', description: 'Attic Finished', rate: 0.75 },
    { code: 'GAR', description: 'Garage', rate: 0.25 },
    { code: 'POR', description: 'Porch', rate: 0.1 },
    { code: 'DEC', description: 'Deck', rate: 0.1 },
    { code: 'BAL', description: 'Balcony', rate: 0.1 },
  ];
}

// Helper function to update building assessment effective area from sketches
async function updateBuildingAssessmentFromSketches(
  propertyId,
  cardNumber = 1,
) {
  try {
    const mongoose = require('mongoose');
    const propertyObjectId = new mongoose.Types.ObjectId(propertyId);

    console.log(
      `[SKETCH UPDATE] Starting update for property ${propertyId}, card ${cardNumber}`,
    );

    // Get the property to find the municipality ID
    const PropertyTreeNode = require('../models/PropertyTreeNode');
    const property = await PropertyTreeNode.findById(propertyObjectId);
    if (!property) {
      throw new Error('Property not found');
    }

    const municipalityId = property.municipality_id;
    console.log(`[SKETCH UPDATE] Found municipality ID: ${municipalityId}`);

    // Get only the most recent sketch for this property and card to avoid double-counting
    const sketches = await PropertySketch.find({
      property_id: propertyObjectId,
      card_number: cardNumber,
    })
      .sort({ created_at: -1 })
      .limit(1);

    console.log(`[SKETCH UPDATE] Found ${sketches.length} sketches`);

    // Calculate total effective area from all sketches
    const totalEffectiveArea = sketches.reduce((sum, sketch) => {
      // Ensure totals are calculated
      sketch.calculateTotals();
      console.log(
        `[SKETCH UPDATE] Sketch ${sketch._id}: total_effective_area = ${sketch.total_effective_area}, total_area = ${sketch.total_area}`,
      );
      console.log(
        `[SKETCH UPDATE] Sketch shapes: ${sketch.shapes.length} shapes`,
      );
      sketch.shapes.forEach((shape, index) => {
        const descLabels =
          shape.descriptions?.map(
            (desc) => `${desc.label || 'unknown'}:${desc.effective_area || 0}`,
          ) || [];
        console.log(
          `[SKETCH UPDATE]   Shape ${index}: area = ${shape.area}, effective_area = ${shape.effective_area}, descriptions = [${descLabels.join(', ') || 'none'}]`,
        );
      });
      return sum + (sketch.total_effective_area || 0);
    }, 0);

    console.log(
      `[SKETCH UPDATE] Total effective area calculated: ${totalEffectiveArea}`,
    );

    // Update the building assessment with the new effective area
    const buildingAssessmentData = {
      effective_area: totalEffectiveArea,
      change_reason: 'sketch_update',
    };

    console.log(
      `[SKETCH UPDATE] Updating building assessment with data:`,
      buildingAssessmentData,
    );

    // Update building assessment and recalculate
    const updatedAssessment = await BuildingAssessment.updateForPropertyCard(
      propertyObjectId,
      municipalityId,
      cardNumber,
      buildingAssessmentData,
    );

    console.log(
      `[SKETCH UPDATE] Updated assessment building_value: ${updatedAssessment?.building_value}`,
    );
    console.log(
      `[SKETCH UPDATE] Updated assessment effective_area: ${updatedAssessment?.effective_area}`,
    );

    return {
      success: true,
      totalEffectiveArea,
      buildingValue: updatedAssessment?.building_value || 0,
      assessment: updatedAssessment,
    };
  } catch (error) {
    console.error('Error updating building assessment from sketches:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

// @route   GET /api/municipalities/:municipalityId/building-type-statistics
// @desc    Get building type statistics (medians, counts, etc.) for a municipality
// @access  Private
router.get(
  '/municipalities/:municipalityId/building-type-statistics',
  authenticateToken,
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
      const { year } = req.query;
      const currentYear = year ? parseInt(year) : new Date().getFullYear();

      // Check if user has access to this municipality
      const hasAccess =
        ['avitar_staff', 'avitar_admin'].includes(req.user.global_role) ||
        req.user.municipal_permissions?.some(
          (perm) =>
            perm.municipality_id.toString() === municipalityId &&
            perm.module_permissions
              ?.get?.('assessing')
              ?.permissions?.includes('view'),
        );

      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message:
            'Permission denied: Cannot access building statistics for this municipality',
        });
      }

      const BuildingAssessment = require('../models/BuildingAssessment');
      const statistics = await BuildingAssessment.getBuildingTypeStatistics(
        municipalityId,
        currentYear,
      );

      res.json({
        success: true,
        statistics,
        year: currentYear,
      });
    } catch (error) {
      console.error('Error fetching building type statistics:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch building type statistics',
      });
    }
  },
);

// @route   PATCH /api/municipalities/:municipalityId/building-calculation-config/economies-of-scale
// @desc    Update economies of scale settings for building calculations
// @access  Private
router.patch(
  '/municipalities/:municipalityId/building-calculation-config/economies-of-scale',
  authenticateToken,
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
      const { economiesOfScale } = req.body;
      const currentYear = new Date().getFullYear();

      console.log('🏗️ Economies of Scale Update Request:', {
        municipalityId,
        economiesOfScale,
        currentYear,
      });

      // Check if user has admin access to this municipality
      const hasAdminAccess =
        ['avitar_staff', 'avitar_admin'].includes(req.user.global_role) ||
        req.user.municipal_permissions?.some(
          (perm) =>
            perm.municipality_id.toString() === municipalityId &&
            perm.module_permissions
              ?.get?.('assessing')
              ?.permissions?.includes('admin'),
        );

      if (!hasAdminAccess) {
        return res.status(403).json({
          success: false,
          message:
            'Permission denied: Cannot update building calculation settings',
        });
      }

      const BuildingCalculationConfig = require('../models/BuildingCalculationConfig');

      // Get or create the config for this municipality
      let config = await BuildingCalculationConfig.getOrCreateForMunicipality(
        municipalityId,
        currentYear,
      );

      // Update economies of scale settings
      config.economies_of_scale = {
        residential: {
          median_size:
            economiesOfScale.residential?.median_size ||
            config.economies_of_scale.residential.median_size,
          smallest_size:
            economiesOfScale.residential?.smallest_size ||
            config.economies_of_scale.residential.smallest_size,
          smallest_factor:
            economiesOfScale.residential?.smallest_factor ||
            config.economies_of_scale.residential.smallest_factor,
          largest_size:
            economiesOfScale.residential?.largest_size ||
            config.economies_of_scale.residential.largest_size,
          largest_factor:
            economiesOfScale.residential?.largest_factor ||
            config.economies_of_scale.residential.largest_factor,
          curve_type:
            economiesOfScale.residential?.curve_type ||
            config.economies_of_scale.residential.curve_type,
          curve_steepness:
            economiesOfScale.residential?.curve_steepness ||
            config.economies_of_scale.residential.curve_steepness,
        },
        commercial: {
          median_size:
            economiesOfScale.commercial?.median_size ||
            config.economies_of_scale.commercial.median_size,
          smallest_size:
            economiesOfScale.commercial?.smallest_size ||
            config.economies_of_scale.commercial.smallest_size,
          smallest_factor:
            economiesOfScale.commercial?.smallest_factor ||
            config.economies_of_scale.commercial.smallest_factor,
          largest_size:
            economiesOfScale.commercial?.largest_size ||
            config.economies_of_scale.commercial.largest_size,
          largest_factor:
            economiesOfScale.commercial?.largest_factor ||
            config.economies_of_scale.commercial.largest_factor,
          curve_type:
            economiesOfScale.commercial?.curve_type ||
            config.economies_of_scale.commercial.curve_type,
          curve_steepness:
            economiesOfScale.commercial?.curve_steepness ||
            config.economies_of_scale.commercial.curve_steepness,
        },
        industrial: {
          median_size:
            economiesOfScale.industrial?.median_size ||
            config.economies_of_scale.industrial.median_size,
          smallest_size:
            economiesOfScale.industrial?.smallest_size ||
            config.economies_of_scale.industrial.smallest_size,
          smallest_factor:
            economiesOfScale.industrial?.smallest_factor ||
            config.economies_of_scale.industrial.smallest_factor,
          largest_size:
            economiesOfScale.industrial?.largest_size ||
            config.economies_of_scale.industrial.largest_size,
          largest_factor:
            economiesOfScale.industrial?.largest_factor ||
            config.economies_of_scale.industrial.largest_factor,
          curve_type:
            economiesOfScale.industrial?.curve_type ||
            config.economies_of_scale.industrial.curve_type,
          curve_steepness:
            economiesOfScale.industrial?.curve_steepness ||
            config.economies_of_scale.industrial.curve_steepness,
        },
        manufactured: {
          median_size:
            economiesOfScale.manufactured?.median_size ||
            config.economies_of_scale.manufactured.median_size,
          smallest_size:
            economiesOfScale.manufactured?.smallest_size ||
            config.economies_of_scale.manufactured.smallest_size,
          smallest_factor:
            economiesOfScale.manufactured?.smallest_factor ||
            config.economies_of_scale.manufactured.smallest_factor,
          largest_size:
            economiesOfScale.manufactured?.largest_size ||
            config.economies_of_scale.manufactured.largest_size,
          largest_factor:
            economiesOfScale.manufactured?.largest_factor ||
            config.economies_of_scale.manufactured.largest_factor,
          curve_type:
            economiesOfScale.manufactured?.curve_type ||
            config.economies_of_scale.manufactured.curve_type,
          curve_steepness:
            economiesOfScale.manufactured?.curve_steepness ||
            config.economies_of_scale.manufactured.curve_steepness,
        },
      };

      config.updated_by = req.user._id;
      config.change_reason = 'economies_of_scale_update';

      await config.save();

      console.log('🏗️ Economies of Scale Successfully Saved:', {
        municipalityId,
        saved_economies_of_scale: config.economies_of_scale,
      });

      res.json({
        success: true,
        message: 'Economies of scale settings updated successfully',
        config: config.toCalculationConfig(),
      });
    } catch (error) {
      console.error('Error updating economies of scale settings:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update economies of scale settings',
      });
    }
  },
);

// @route   POST /api/municipalities/:municipalityId/properties/mass-recalculate
// @desc    Mass recalculate assessments for multiple properties
// @access  Private (requires admin privileges)
router.post(
  '/municipalities/:municipalityId/properties/mass-recalculate',
  authenticateToken,
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
      const { propertyIds, assessmentYear } = req.body;

      // Check admin privileges
      const hasAdminAccess =
        ['avitar_staff', 'avitar_admin'].includes(req.user.global_role) ||
        req.user.municipal_permissions?.some(
          (perm) =>
            perm.municipality_id.toString() === municipalityId &&
            perm.role === 'admin',
        );

      if (!hasAdminAccess) {
        return res.status(403).json({
          success: false,
          message: 'Admin access required for mass operations',
        });
      }

      if (!Array.isArray(propertyIds) || propertyIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Property IDs array is required',
        });
      }

      console.log(
        `Starting mass recalculation for ${propertyIds.length} properties`,
      );

      const results = await massRecalculateAssessments(
        propertyIds,
        municipalityId,
        assessmentYear,
        req.user.user_id,
      );

      res.json({
        success: true,
        message: 'Mass recalculation completed',
        results,
      });
    } catch (error) {
      console.error('Mass recalculation error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to perform mass recalculation',
        error: error.message,
      });
    }
  },
);

// @route   POST /api/municipalities/:municipalityId/properties/mass-revaluation
// @desc    Mass revaluation with new rates/factors
// @access  Private (requires admin privileges)
router.post(
  '/municipalities/:municipalityId/properties/mass-revaluation',
  authenticateToken,
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
      const { propertyIds, revaluationFactors, assessmentYear } = req.body;

      // Check admin privileges
      const hasAdminAccess =
        ['avitar_staff', 'avitar_admin'].includes(req.user.global_role) ||
        req.user.municipal_permissions?.some(
          (perm) =>
            perm.municipality_id.toString() === municipalityId &&
            perm.role === 'admin',
        );

      if (!hasAdminAccess) {
        return res.status(403).json({
          success: false,
          message: 'Admin access required for mass operations',
        });
      }

      if (!Array.isArray(propertyIds) || propertyIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Property IDs array is required',
        });
      }

      if (!revaluationFactors) {
        return res.status(400).json({
          success: false,
          message: 'Revaluation factors are required',
        });
      }

      console.log(
        `Starting mass revaluation for ${propertyIds.length} properties`,
      );

      const results = await massRevaluation(
        propertyIds,
        municipalityId,
        revaluationFactors,
        assessmentYear,
        req.user.user_id,
      );

      res.json({
        success: true,
        message: 'Mass revaluation completed',
        results,
      });
    } catch (error) {
      console.error('Mass revaluation error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to perform mass revaluation',
        error: error.message,
      });
    }
  },
);

// @route   POST /api/properties/:propertyId/recalculate-total
// @desc    Manually trigger total assessment recalculation for a single property
// @access  Private
router.post(
  '/properties/:propertyId/recalculate-total',
  authenticateToken,
  async (req, res) => {
    try {
      const { propertyId } = req.params;
      const { municipalityId, assessmentYear } = req.body;

      // Get property to verify access
      const property = await PropertyTreeNode.findById(propertyId);
      if (!property) {
        return res.status(404).json({
          success: false,
          message: 'Property not found',
        });
      }

      // Check access to municipality
      const hasAccess =
        ['avitar_staff', 'avitar_admin'].includes(req.user.global_role) ||
        req.user.municipal_permissions?.some(
          (perm) =>
            perm.municipality_id.toString() ===
            (municipalityId || property.municipality_id),
        );

      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: 'Access denied to this municipality',
        });
      }

      const result = await updatePropertyTotalAssessment(
        propertyId,
        municipalityId || property.municipality_id,
        assessmentYear,
        req.user.user_id,
      );

      res.json({
        success: true,
        message: 'Total assessment recalculated successfully',
        totalAssessedValue: result.totalAssessedValue,
        components: result.components,
      });
    } catch (error) {
      console.error('Total assessment recalculation error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to recalculate total assessment',
        error: error.message,
      });
    }
  },
);

// @route   POST /api/municipalities/:municipalityId/properties/query
// @desc    Enhanced property query with proper field mapping and AND/OR logic
// @access  Private
router.post(
  '/municipalities/:municipalityId/properties/query',
  authenticateToken,
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
      const queryParams = req.body; // Keep simple structure for now

      console.log('Property query request:', { municipalityId, queryParams });

      // Field mapping: frontend field -> {collection, field, type}
      const fieldMapping = {
        // Building data (needs join with BuildingAssessment)
        bedrooms: {
          collection: 'building_assessments',
          field: 'bedrooms',
          type: 'number',
        },
        bathrooms: {
          collection: 'building_assessments',
          field: 'full_baths',
          type: 'number',
        },
        buildingSizeMin: {
          collection: 'building_assessments',
          field: 'effective_area',
          type: 'range',
        },
        buildingSizeMax: {
          collection: 'building_assessments',
          field: 'effective_area',
          type: 'range',
        },
        buildingHeightMin: {
          collection: 'building_assessments',
          field: 'story_height',
          type: 'range',
        },
        buildingHeightMax: {
          collection: 'building_assessments',
          field: 'story_height',
          type: 'range',
        },
        yearBuiltMin: {
          collection: 'building_assessments',
          field: 'year_built',
          type: 'range',
        },
        yearBuiltMax: {
          collection: 'building_assessments',
          field: 'year_built',
          type: 'range',
        },

        // Assessment data (needs join with PropertyAssessment)
        assessmentMin: {
          collection: 'property_assessments',
          field: 'total_value',
          type: 'range',
        },
        assessmentMax: {
          collection: 'property_assessments',
          field: 'total_value',
          type: 'range',
        },

        // Land data (needs join with LandAssessment)
        landAreaMin: {
          collection: 'land_assessments',
          field: 'acreage',
          type: 'range',
          convert: 'sqft_to_acres',
        },
        landAreaMax: {
          collection: 'land_assessments',
          field: 'acreage',
          type: 'range',
          convert: 'sqft_to_acres',
        },

        // Property tree data (direct access)
        zone: {
          collection: 'property_tree_nodes',
          field: 'location.zone',
          type: 'string',
        },
      };

      // Range field pairs for automatic range detection
      const rangeFields = [
        {
          min: 'buildingSizeMin',
          max: 'buildingSizeMax',
          field: 'effective_area',
          collection: 'building_assessments',
        },
        {
          min: 'buildingHeightMin',
          max: 'buildingHeightMax',
          field: 'story_height',
          collection: 'building_assessments',
        },
        {
          min: 'yearBuiltMin',
          max: 'yearBuiltMax',
          field: 'year_built',
          collection: 'building_assessments',
        },
        {
          min: 'assessmentMin',
          max: 'assessmentMax',
          field: 'total_value',
          collection: 'property_assessments',
        },
        {
          min: 'landAreaMin',
          max: 'landAreaMax',
          field: 'acreage',
          collection: 'land_assessments',
        },
      ];

      // For now, let's start with a simpler approach
      // Build aggregation pipeline for PropertyTreeNode with joins
      const currentYear = new Date().getFullYear();
      const mongoose = require('mongoose');
      const { ObjectId } = mongoose.Types;

      const pipeline = [
        // Start with PropertyTreeNode for this municipality
        { $match: { municipality_id: new ObjectId(municipalityId) } },
      ];

      // Add lookup stages for each collection we might need
      const needsBuildingData = Object.keys(queryParams).some(
        (key) => fieldMapping[key]?.collection === 'building_assessments',
      );

      const needsAssessmentData = Object.keys(queryParams).some(
        (key) => fieldMapping[key]?.collection === 'property_assessments',
      );

      const needsLandData = Object.keys(queryParams).some(
        (key) => fieldMapping[key]?.collection === 'land_assessments',
      );

      if (needsBuildingData) {
        pipeline.push({
          $lookup: {
            from: 'building_assessments',
            let: { propertyId: '$_id' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$property_id', '$$propertyId'] },
                      { $eq: ['$effective_year', currentYear] },
                    ],
                  },
                },
              },
            ],
            as: 'building_assessments',
          },
        });
      }

      if (needsAssessmentData) {
        pipeline.push({
          $lookup: {
            from: 'property_assessments',
            let: { propertyId: '$_id' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$property_id', '$$propertyId'] },
                      { $eq: ['$effective_year', currentYear] },
                    ],
                  },
                },
              },
            ],
            as: 'property_assessments',
          },
        });
      }

      if (needsLandData) {
        pipeline.push({
          $lookup: {
            from: 'land_assessments',
            let: { propertyId: '$_id' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$property_id', '$$propertyId'] },
                      { $eq: ['$effective_year', currentYear] },
                    ],
                  },
                },
              },
            ],
            as: 'land_assessments',
          },
        });
      }

      // Build filter conditions
      const mongoQuery = {};

      // Process each query parameter
      Object.keys(queryParams).forEach((key) => {
        const value = queryParams[key];
        if (!value || value.toString().trim() === '') return;

        const mapping = fieldMapping[key];
        if (!mapping) return;

        // Handle different field types
        if (key === 'bedrooms') {
          if (value === '6+') {
            mongoQuery['building_assessments.0.bedrooms'] = { $gte: 6 };
          } else {
            mongoQuery['building_assessments.0.bedrooms'] = parseInt(value);
          }
        } else if (key === 'bathrooms') {
          if (value === '4+') {
            mongoQuery['building_assessments.0.full_baths'] = { $gte: 4 };
          } else {
            mongoQuery['building_assessments.0.full_baths'] = parseFloat(value);
          }
        } else if (key === 'zone') {
          mongoQuery['location.zone'] = value;
        }
      });

      // Handle range fields
      rangeFields.forEach((rangeField) => {
        const minValue = queryParams[rangeField.min];
        const maxValue = queryParams[rangeField.max];

        if (minValue || maxValue) {
          const dbPath = `${rangeField.collection}.0.${rangeField.field}`;
          const rangeCondition = {};

          if (minValue) {
            let convertedMin = parseFloat(minValue);
            if (rangeField.field === 'acreage') {
              convertedMin = convertedMin / 43560; // Convert sq ft to acres
            }
            rangeCondition.$gte = convertedMin;
          }

          if (maxValue) {
            let convertedMax = parseFloat(maxValue);
            if (rangeField.field === 'acreage') {
              convertedMax = convertedMax / 43560; // Convert sq ft to acres
            }
            rangeCondition.$lte = convertedMax;
          }

          mongoQuery[dbPath] = rangeCondition;
        }
      });

      // Add the filter stage if we have conditions
      if (Object.keys(mongoQuery).length > 0) {
        pipeline.push({ $match: mongoQuery });
      }

      // Limit results and project needed fields
      pipeline.push(
        { $limit: 1000 },
        {
          $project: {
            id: { $toString: '$_id' }, // Map MongoDB _id to string id (required for frontend routing)
            property_id: '$_id', // Map MongoDB _id to property_id for frontend
            pid_raw: 1,
            pid_formatted: 1,
            account_number: 1,
            location: 1,
            owner: 1,
            property_class: 1,
            property_type: 1,
            assessed_value: 1,
            tax_status: 1,
            last_updated: 1,
          },
        },
      );

      console.log('Aggregation pipeline:', JSON.stringify(pipeline, null, 2));

      // Execute the aggregation
      const PropertyTreeNode = require('../models/PropertyTreeNode');
      const properties = await PropertyTreeNode.aggregate(pipeline);

      console.log(`Found ${properties.length} properties matching query`);

      // Post-process query results to match regular properties format
      const PIDFormat = require('../models/PIDFormat');
      const pidFormat = await PIDFormat.findOne({
        municipality_id: new ObjectId(municipalityId),
      });

      const formattedProperties = properties.map((property) => {
        // Format PID
        let pid_formatted = property.pid_formatted;
        let mapNumber = 'Unknown';
        let lotSubDisplay = 'Unknown';

        if (property.pid_raw) {
          try {
            if (pidFormat) {
              pid_formatted = pidFormat.formatPID(property.pid_raw);
              const segments = pidFormat.getSegments(property.pid_raw);
              mapNumber = segments.map || 'Unknown';

              if (segments.sublot && parseInt(segments.sublot) > 0) {
                lotSubDisplay = `${segments.lot}-${segments.sublot}`;
              } else {
                lotSubDisplay = segments.lot || 'Unknown';
              }
            } else {
              // Default format: 6-6-6 with hyphens
              const map = property.pid_raw.substr(0, 6);
              const lot = property.pid_raw.substr(6, 6);
              const sublot = property.pid_raw.substr(12, 6);

              mapNumber = map;

              if (parseInt(sublot) > 0) {
                pid_formatted = `${map}-${lot}-${sublot}`;
                lotSubDisplay = `${lot}-${sublot}`;
              } else {
                pid_formatted = `${map}-${lot}`;
                lotSubDisplay = lot;
              }
            }
          } catch (error) {
            console.warn('Error formatting PID:', error.message);
            pid_formatted = property.pid_raw;
            mapNumber = 'Unknown';
            lotSubDisplay = 'Unknown';
          }
        }

        return {
          ...property,
          // Update PID formatting
          pid_formatted: pid_formatted,
          pid: pid_formatted, // Legacy field
          mapNumber: mapNumber,
          lotSubDisplay: lotSubDisplay,

          // Add legacy fields for backward compatibility
          streetNumber: property.location?.street_number,
          streetName: property.location?.street,
          streetAddress: property.location?.address,
          neighborhood: property.location?.neighborhood,
          zone: property.location?.zone,
          ownerName: property.owner?.primary_name,
          ownerMailingAddress: property.owner?.mailing_address,
          propertyClass: property.property_class,
          propertyType: property.property_type,
          taxStatus: property.tax_status,
          totalValue: property.assessed_value || 0,
          taxYear: new Date().getFullYear(),
        };
      });

      res.json({
        success: true,
        properties: formattedProperties,
        query: queryParams,
        count: formattedProperties.length,
      });
    } catch (error) {
      console.error('Property query error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to query properties',
        details: error.message,
      });
    }
  },
);

// @route   GET /api/municipalities/:municipalityId/properties/zones
// @desc    Get available zones for property queries
// @access  Private
router.get(
  '/municipalities/:municipalityId/properties/zones',
  authenticateToken,
  async (req, res) => {
    try {
      const { municipalityId } = req.params;

      // Check if user has access to this municipality
      const hasAccess =
        ['avitar_staff', 'avitar_admin'].includes(req.user.global_role) ||
        req.user.municipalities?.some(
          (userMun) => userMun.municipality_id === municipalityId,
        );

      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: 'Access denied to this municipality',
        });
      }

      // Get distinct zones from properties in this municipality
      const zones = await PropertyTreeNode.distinct('location.zone', {
        municipality_id: municipalityId,
        'location.zone': { $exists: true, $ne: null, $ne: '' },
      });

      // Sort zones alphabetically
      zones.sort();

      res.json({
        success: true,
        zones: zones,
      });
    } catch (error) {
      console.error('Failed to fetch zones:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch zones',
        error: error.message,
      });
    }
  },
);

// =================== PROPERTY OWNER ENDPOINTS ===================

// @route   PUT /api/properties/:id/owners/primary
// @desc    Update or create primary owner for property (handles legacy migration)
// @access  Private
router.put(
  '/properties/:id/owners/primary',
  authenticateToken,
  async (req, res) => {
    try {
      const { id: propertyId } = req.params;
      const ownerData = req.body;
      const mongoose = require('mongoose');
      const Owner = require('../models/Owner');
      const PropertyOwner = require('../models/PropertyOwner');
      const PropertyTreeNode = require('../models/PropertyTreeNode');

      const propertyObjectId = new mongoose.Types.ObjectId(propertyId);

      // Get the property to determine municipality
      const property = await PropertyTreeNode.findById(propertyObjectId);
      if (!property) {
        return res.status(404).json({
          success: false,
          message: 'Property not found',
        });
      }

      let owner;
      let propertyOwner;

      // Check if we're using an existing owner
      if (ownerData.existing_owner_id) {
        owner = await Owner.findById(ownerData.existing_owner_id);
        if (!owner) {
          return res.status(404).json({
            success: false,
            message: 'Existing owner not found',
          });
        }
      } else {
        // Create new owner
        const newOwnerData = {
          municipality_id: property.municipality_id,
          owner_type: ownerData.owner_type || 'individual',
          first_name: ownerData.first_name,
          last_name: ownerData.last_name,
          business_name: ownerData.business_name,
          email: ownerData.email,
          phone: ownerData.phone,
          address: {
            street: ownerData.mailing_street,
            city: ownerData.mailing_city,
            state: ownerData.mailing_state,
            zip_code: ownerData.mailing_zipcode,
            country: 'US',
          },
          mailing_address: {
            is_different: false,
            street: ownerData.mailing_street,
            city: ownerData.mailing_city,
            state: ownerData.mailing_state,
            zip_code: ownerData.mailing_zipcode,
            country: 'US',
          },
          created_by: req.user.userId,
          updated_by: req.user.userId,
        };

        owner = new Owner(newOwnerData);
        await owner.save();
      }

      // Check if primary owner relationship already exists
      propertyOwner = await PropertyOwner.findOne({
        property_id: propertyObjectId,
        is_primary: true,
        is_active: true,
      });

      if (propertyOwner) {
        // For temporal database: deactivate existing relationship and create new one
        propertyOwner.is_active = false;
        propertyOwner.updated_by = req.user.userId;
        await propertyOwner.save();
      }

      // Always create new primary owner relationship for temporal database
      propertyOwner = new PropertyOwner({
        municipality_id: property.municipality_id,
        property_id: propertyObjectId,
        owner_id: owner._id,
        ownership_percentage: ownerData.ownership_percentage || 100,
        ownership_type: ownerData.ownership_type || 'fee_simple',
        is_primary: true,
        receives_tax_bills: ownerData.receives_tax_bills !== false,
        receives_notices: ownerData.receives_notices !== false,
        notes: ownerData.notes || '',
        created_by: req.user.userId,
        updated_by: req.user.userId,
      });
      await propertyOwner.save();

      // Sync PropertyTreeNode cache
      await PropertyTreeNode.syncOwnerCache(propertyObjectId);

      res.json({
        success: true,
        message: 'Primary owner updated successfully',
        owner: owner,
        propertyOwner: propertyOwner,
      });
    } catch (error) {
      console.error('Update primary owner error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update primary owner',
        error: error.message,
      });
    }
  },
);

// @route   POST /api/properties/:id/owners
// @desc    Add new owner/recipient to property
// @access  Private
router.post('/properties/:id/owners', authenticateToken, async (req, res) => {
  try {
    const { id: propertyId } = req.params;
    const ownerData = req.body;
    const mongoose = require('mongoose');
    const Owner = require('../models/Owner');
    const PropertyOwner = require('../models/PropertyOwner');
    const PropertyTreeNode = require('../models/PropertyTreeNode');

    const propertyObjectId = new mongoose.Types.ObjectId(propertyId);

    let owner;

    // Check if we're using an existing owner
    if (ownerData.existing_owner_id) {
      owner = await Owner.findById(ownerData.existing_owner_id);
      if (!owner) {
        return res.status(404).json({
          success: false,
          message: 'Existing owner not found',
        });
      }
    } else {
      // Create new owner
      const newOwnerData = {
        municipality_id: property.municipality_id,
        owner_type: ownerData.owner_type || 'individual',
        first_name: ownerData.first_name,
        last_name: ownerData.last_name,
        business_name: ownerData.business_name,
        email: ownerData.email,
        phone: ownerData.phone,
        address: {
          street: ownerData.mailing_street,
          city: ownerData.mailing_city,
          state: ownerData.mailing_state,
          zip_code: ownerData.mailing_zipcode,
          country: 'US',
        },
        mailing_address: {
          is_different: false,
          street: ownerData.mailing_street,
          city: ownerData.mailing_city,
          state: ownerData.mailing_state,
          zip_code: ownerData.mailing_zipcode,
          country: 'US',
        },
        created_by: req.user.userId,
        updated_by: req.user.userId,
      };

      owner = new Owner(newOwnerData);
      await owner.save();
    }

    // Create property-owner relationship
    const propertyOwner = new PropertyOwner({
      municipality_id: property.municipality_id,
      property_id: propertyObjectId,
      owner_id: owner._id,
      ownership_percentage: ownerData.ownership_percentage || 0,
      ownership_type: ownerData.ownership_type || 'fee_simple',
      is_primary: ownerData.is_primary || false,
      receives_tax_bills: ownerData.receives_tax_bills !== false,
      receives_notices: ownerData.receives_notices !== false,
      notes: ownerData.notes || '',
      created_by: req.user.userId,
      updated_by: req.user.userId,
    });

    await propertyOwner.save();

    // Sync PropertyTreeNode cache
    await PropertyTreeNode.syncOwnerCache(propertyObjectId);

    res.json({
      success: true,
      message: 'Owner added successfully',
      owner: owner,
      propertyOwner: propertyOwner,
    });
  } catch (error) {
    console.error('Add owner error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add owner',
      error: error.message,
    });
  }
});

// @route   PUT /api/properties/:propertyId/owners/:ownerId
// @desc    Update existing owner relationship
// @access  Private
router.put(
  '/properties/:propertyId/owners/:ownerId',
  authenticateToken,
  async (req, res) => {
    try {
      const { propertyId, ownerId } = req.params;
      const ownerData = req.body;
      const mongoose = require('mongoose');
      const Owner = require('../models/Owner');
      const PropertyOwner = require('../models/PropertyOwner');
      const PropertyTreeNode = require('../models/PropertyTreeNode');

      const propertyObjectId = new mongoose.Types.ObjectId(propertyId);
      const ownerObjectId = new mongoose.Types.ObjectId(ownerId);

      // Find the property-owner relationship
      const propertyOwner = await PropertyOwner.findOne({
        property_id: propertyObjectId,
        owner_id: ownerObjectId,
        is_active: true,
      });

      if (!propertyOwner) {
        return res.status(404).json({
          success: false,
          message: 'Property-owner relationship not found',
        });
      }

      // For temporal database: deactivate existing relationship
      propertyOwner.is_active = false;
      propertyOwner.updated_by = req.user.userId;
      await propertyOwner.save();

      // Create new relationship record
      const newPropertyOwner = new PropertyOwner({
        municipality_id: propertyOwner.municipality_id,
        property_id: propertyOwner.property_id,
        owner_id: propertyOwner.owner_id,
        ownership_percentage:
          ownerData.ownership_percentage || propertyOwner.ownership_percentage,
        ownership_type:
          ownerData.ownership_type || propertyOwner.ownership_type,
        is_primary: propertyOwner.is_primary,
        receives_tax_bills:
          ownerData.receives_tax_bills !== undefined
            ? ownerData.receives_tax_bills
            : propertyOwner.receives_tax_bills,
        receives_notices:
          ownerData.receives_notices !== undefined
            ? ownerData.receives_notices
            : propertyOwner.receives_notices,
        notes:
          ownerData.notes !== undefined ? ownerData.notes : propertyOwner.notes,
        created_by: req.user.userId,
        updated_by: req.user.userId,
      });

      await newPropertyOwner.save();

      // If owner data is provided, update the owner too
      if (
        ownerData.first_name ||
        ownerData.last_name ||
        ownerData.business_name ||
        ownerData.email ||
        ownerData.phone ||
        ownerData.mailing_street
      ) {
        const owner = await Owner.findById(ownerObjectId);
        if (owner) {
          if (ownerData.first_name !== undefined)
            owner.first_name = ownerData.first_name;
          if (ownerData.last_name !== undefined)
            owner.last_name = ownerData.last_name;
          if (ownerData.business_name !== undefined)
            owner.business_name = ownerData.business_name;
          if (ownerData.email !== undefined) owner.email = ownerData.email;
          if (ownerData.phone !== undefined) owner.phone = ownerData.phone;

          if (
            ownerData.mailing_street ||
            ownerData.mailing_city ||
            ownerData.mailing_state ||
            ownerData.mailing_zipcode
          ) {
            owner.primary_mailing_address = {
              street:
                ownerData.mailing_street ||
                owner.primary_mailing_address?.street,
              city:
                ownerData.mailing_city || owner.primary_mailing_address?.city,
              state:
                ownerData.mailing_state || owner.primary_mailing_address?.state,
              zip_code:
                ownerData.mailing_zipcode ||
                owner.primary_mailing_address?.zip_code,
              country: 'US',
            };
          }

          owner.updated_by = req.user.userId;
          await owner.save();
        }
      }

      // Sync PropertyTreeNode cache
      await PropertyTreeNode.syncOwnerCache(propertyObjectId);

      res.json({
        success: true,
        message: 'Owner updated successfully',
        propertyOwner: propertyOwner,
      });
    } catch (error) {
      console.error('Update owner error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update owner',
        error: error.message,
      });
    }
  },
);

// @route   DELETE /api/properties/:propertyId/owners/:ownerId
// @desc    Remove owner from property
// @access  Private
router.delete(
  '/properties/:propertyId/owners/:ownerId',
  authenticateToken,
  async (req, res) => {
    try {
      const { propertyId, ownerId } = req.params;
      const mongoose = require('mongoose');
      const PropertyOwner = require('../models/PropertyOwner');
      const PropertyTreeNode = require('../models/PropertyTreeNode');

      const propertyObjectId = new mongoose.Types.ObjectId(propertyId);
      const ownerObjectId = new mongoose.Types.ObjectId(ownerId);

      // Find and deactivate the property-owner relationship
      const propertyOwner = await PropertyOwner.findOne({
        property_id: propertyObjectId,
        owner_id: ownerObjectId,
        is_active: true,
      });

      if (!propertyOwner) {
        return res.status(404).json({
          success: false,
          message: 'Property-owner relationship not found',
        });
      }

      // Don't allow removing primary owner
      if (propertyOwner.is_primary) {
        return res.status(400).json({
          success: false,
          message:
            'Cannot remove primary owner. Please set a different primary owner first.',
        });
      }

      // Deactivate the relationship
      propertyOwner.is_active = false;
      propertyOwner.updated_by = req.user.userId;
      await propertyOwner.save();

      // Sync PropertyTreeNode cache
      await PropertyTreeNode.syncOwnerCache(propertyObjectId);

      res.json({
        success: true,
        message: 'Owner removed successfully',
      });
    } catch (error) {
      console.error('Remove owner error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to remove owner',
        error: error.message,
      });
    }
  },
);

// ===== LAND MASS RECALCULATION ENDPOINTS =====

// Get land recalculation status
router.get(
  '/municipalities/:municipalityId/land-assessments/recalculation-status',
  authenticateToken,
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
      const { year } = req.query;
      const effectiveYear = parseInt(year) || new Date().getFullYear();

      const totalAssessments = await LandAssessment.countDocuments({
        municipality_id: municipalityId,
        effective_year: effectiveYear,
      });

      // Count assessments that need recalculation (older than 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const needsRecalculation = await LandAssessment.countDocuments({
        municipality_id: municipalityId,
        effective_year: effectiveYear,
        $or: [
          { last_calculated: { $lt: thirtyDaysAgo } },
          { last_calculated: { $exists: false } },
          { last_calculated: null },
        ],
      });

      // Count recent calculations (last 24 hours)
      const twentyFourHoursAgo = new Date();
      twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

      const recentCalculations = await LandAssessment.countDocuments({
        municipality_id: municipalityId,
        effective_year: effectiveYear,
        last_calculated: { $gte: twentyFourHoursAgo },
      });

      // Count assessments with null/missing values
      const nullValueAssessments = await LandAssessment.countDocuments({
        municipality_id: municipalityId,
        effective_year: effectiveYear,
        $or: [
          { market_value: { $in: [null, 0] } },
          { taxable_value: { $in: [null, 0] } },
          { 'calculated_totals.totalMarketValue': { $in: [null, 0] } },
        ],
      });

      res.json({
        success: true,
        status: {
          totalAssessments,
          needsRecalculation,
          recentCalculations,
          nullValueAssessments,
        },
      });
    } catch (error) {
      console.error('Error getting land recalculation status:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get recalculation status',
        error: error.message,
      });
    }
  },
);

// Mass recalculate land assessments with zone adjustments
router.post(
  '/municipalities/:municipalityId/land-assessments/mass-recalculate',
  authenticateToken,
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
      const { effectiveYear, batchSize, includeZoneAdjustments, onlyMissing } =
        req.body;
      const userId = req.user.id;

      const year = effectiveYear || new Date().getFullYear();
      const batch = batchSize || 50;

      console.log(
        `Starting land mass recalculation for municipality: ${municipalityId}, year: ${year}`,
      );

      // Check if warrant has been issued for this year before starting recalculation
      const { isWarrantIssued } = require('../utils/assessment');
      const warrantIssued = await isWarrantIssued(municipalityId, year);

      if (warrantIssued) {
        return res.status(400).json({
          success: false,
          message: `Cannot recalculate assessments for year ${year}: Final warrant has already been issued. Only the current year (${new Date().getFullYear()}) can be recalculated.`,
          error: 'WARRANT_ISSUED',
        });
      }

      const landCalculationService = new LandAssessmentCalculationService();

      let result;
      if (includeZoneAdjustments) {
        // Use the new zone adjustment method
        result =
          await landCalculationService.massRecalculateWithZoneAdjustments(
            municipalityId,
            year,
            userId,
            {
              batchSize: batch,
              onlyMissing: onlyMissing || false,
            },
          );
      } else {
        // Use the standard recalculation method with forced clearing of all calculated values
        result = await landCalculationService.recalculateAllProperties(
          municipalityId,
          {
            effectiveYear: year, // Only process assessments for the specified year
            batchSize: batch,
            onlyMissing: onlyMissing || false,
            forceClearValues: true, // Force clear and recalculate all land line values
            userId: userId, // Pass userId for creating missing year assessments
          },
        );
      }

      console.log('Land mass recalculation completed:', result);

      res.json({
        success: true,
        result: result,
        message: `Land recalculation completed. Processed ${result.processed} assessments.`,
      });
    } catch (error) {
      console.error('Error during land mass recalculation:', error);
      res.status(500).json({
        success: false,
        message: 'Mass recalculation failed',
        error: error.message,
      });
    }
  },
);

// @route   POST /api/properties/migrate-feature-card-numbers
// @desc    Migrate existing features to have card_number (run once)
// @access  Private
router.post(
  '/properties/migrate-feature-card-numbers',
  authenticateToken,
  async (req, res) => {
    try {
      console.log('🔄 Running feature card number migration via API...');
      await addCardNumbersToFeatures();

      res.json({
        success: true,
        message: 'Feature card number migration completed successfully',
      });
    } catch (error) {
      console.error('Migration API error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to run feature card number migration',
        error: error.message,
      });
    }
  },
);

module.exports = router;
