const express = require('express');
const router = express.Router();
const SalesHistory = require('../models/SalesHistory');
const PropertyTreeNode = require('../models/PropertyTreeNode');
const LandAssessment = require('../models/LandAssessment');
const BuildingAssessment = require('../models/BuildingAssessment');
const mongoose = require('mongoose');
const { authenticateToken } = require('../middleware/auth');

// GET /api/municipalities/:municipalityId/sales-history - Get all sales for municipality (for revaluation analysis)
router.get(
  '/municipalities/:municipalityId/sales-history',
  authenticateToken,
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
      const municipalityObjectId = new mongoose.Types.ObjectId(municipalityId);

      // Query params for filtering
      const limit = parseInt(req.query.limit) || 100;
      const offset = parseInt(req.query.offset) || 0;
      const sort = req.query.sort || '-saleDate'; // Default: newest first
      const dateFrom = req.query.dateFrom;
      const dateTo = req.query.dateTo;
      const minPrice = req.query.minPrice;
      const maxPrice = req.query.maxPrice;
      const validOnly = req.query.validOnly === 'true';

      // Build match query
      const matchQuery = {
        municipality_id: municipalityObjectId,
      };

      // Date filtering
      if (dateFrom || dateTo) {
        matchQuery.sale_date = {};
        if (dateFrom) matchQuery.sale_date.$gte = new Date(dateFrom);
        if (dateTo) matchQuery.sale_date.$lte = new Date(dateTo);
      }

      // Price filtering
      if (minPrice || maxPrice) {
        matchQuery.sale_price = {};
        if (minPrice) matchQuery.sale_price.$gte = parseFloat(minPrice);
        if (maxPrice) matchQuery.sale_price.$lte = parseFloat(maxPrice);
      }

      // Valid sales only
      if (validOnly) {
        matchQuery.is_valid_sale = true;
      }

      // Aggregate sales with property, land, and building data
      const salesAggregation = await SalesHistory.aggregate([
        {
          $match: matchQuery,
        },
        {
          $lookup: {
            from: 'property_tree_nodes',
            let: { propertyId: '$property_id' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$_id', '$$propertyId'] },
                      { $eq: ['$municipality_id', municipalityObjectId] },
                    ],
                  },
                },
              },
            ],
            as: 'property',
          },
        },
        {
          $unwind: {
            path: '$property',
            preserveNullAndEmptyArrays: false, // Only include sales with valid properties
          },
        },
        {
          $lookup: {
            from: 'land_assessments',
            let: { propertyId: '$property_id' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$property_id', '$$propertyId'] },
                      { $eq: ['$municipality_id', municipalityObjectId] },
                    ],
                  },
                },
              },
              {
                $sort: { effective_year: -1 },
              },
              {
                $limit: 1,
              },
            ],
            as: 'land_assessment',
          },
        },
        {
          $unwind: {
            path: '$land_assessment',
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $lookup: {
            from: 'building_assessments',
            let: { propertyId: '$property_id' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$property_id', '$$propertyId'] },
                      { $eq: ['$municipality_id', municipalityObjectId] },
                    ],
                  },
                },
              },
              {
                $sort: { effective_year: -1 },
              },
              {
                $limit: 1,
              },
            ],
            as: 'building_assessment',
          },
        },
        {
          $unwind: {
            path: '$building_assessment',
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $lookup: {
            from: 'buildingcodes',
            let: { baseTypeId: '$building_assessment.base_type' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$_id', '$$baseTypeId'] },
                      { $eq: ['$municipalityId', municipalityObjectId] },
                    ],
                  },
                },
              },
            ],
            as: 'base_type_details',
          },
        },
        {
          $unwind: {
            path: '$base_type_details',
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $project: {
            _id: 1,
            property_id: 1,
            sale_date: 1,
            sale_price: 1,
            buyer_name: 1,
            seller_name: 1,
            sale_code: 1,
            sale_type: 1,
            book: 1,
            page: 1,
            is_valid_sale: 1,
            is_vacant: 1,
            verification_source: 1,
            notes: 1,
            property_address: '$property.location.address',
            property_class: '$property.property_class',
            pid: '$property.pid_formatted',
            // Land data
            acreage: '$land_assessment.calculated_totals.totalAcreage',
            land_value: '$land_assessment.taxable_value',
            property_use_code: '$land_assessment.property_use_code',
            property_use_category: '$land_assessment.property_use_category',
            neighborhood: '$land_assessment.neighborhood_code',
            site_factor: '$land_assessment.site_factor',
            driveway_factor: '$land_assessment.driveway_factor',
            road_factor: '$land_assessment.road_factor',
            // Building data
            building_sf: '$building_assessment.gross_living_area',
            building_value: '$building_assessment.taxable_value',
            building_model: '$building_assessment.building_model',
            building_year_built: '$building_assessment.year_built',
            // Base type details (for filtering by RSA, COM, etc.)
            base_type: {
              _id: '$base_type_details._id',
              code: '$base_type_details.code',
              description: '$base_type_details.description',
              rate: '$base_type_details.rate',
              buildingType: '$base_type_details.buildingType',
            },
          },
        },
        {
          $sort:
            sort === '-saleDate' || sort === '-sale_date'
              ? { sale_date: -1 }
              : sort === 'saleDate' || sort === 'sale_date'
                ? { sale_date: 1 }
                : sort === '-salePrice' || sort === '-sale_price'
                  ? { sale_price: -1 }
                  : { sale_price: 1 },
        },
        {
          $skip: offset,
        },
        {
          $limit: limit,
        },
      ]);

      // Get total count
      const totalCount = await SalesHistory.countDocuments(matchQuery);

      // Debug: Log first sale to check field paths
      if (salesAggregation.length > 0) {
        console.log('📊 Sample sale data:', JSON.stringify(salesAggregation[0], null, 2));
      }

      res.json({
        sales: salesAggregation,
        total: totalCount,
        limit,
        offset,
      });
    } catch (error) {
      console.error('Error fetching sales history:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

module.exports = router;
