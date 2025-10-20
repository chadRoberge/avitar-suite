const express = require('express');
const router = express.Router();
const ListingHistory = require('../models/ListingHistory');
const PropertyNotes = require('../models/PropertyNotes');
const SalesHistory = require('../models/SalesHistory');
const { authenticateToken } = require('../middleware/auth');
const { requireModuleAccess } = require('../middleware/moduleAuth');

// GET /api/municipalities/:municipalityId/properties/:propertyId/listing-history - Get all listing history for a property
router.get(
  '/municipalities/:municipalityId/properties/:propertyId/listing-history',
  authenticateToken,
  requireModuleAccess('assessing'),
  async (req, res) => {
    try {
      const { municipalityId, propertyId } = req.params;
      const cardNumber = parseInt(req.query.card) || 1;

      const listingHistory = await ListingHistory.find({
        municipalityId,
        propertyId,
        card_number: cardNumber,
      })
        .sort({ visitDate: -1 })
        .populate('createdBy', 'firstName lastName')
        .populate('updatedBy', 'firstName lastName');

      const propertyNotes = await PropertyNotes.findOne({
        municipalityId,
        propertyId,
        card_number: cardNumber,
      }).populate('createdBy updatedBy', 'firstName lastName');

      const salesHistory = await SalesHistory.find({
        municipalityId,
        propertyId,
      })
        .sort({ saleDate: -1 })
        .populate('createdBy', 'firstName lastName')
        .populate('updatedBy', 'firstName lastName');

      res.json({
        listingHistory,
        propertyNotes: propertyNotes || {
          notes: '',
        },
        salesHistory,
      });
    } catch (error) {
      console.error('Error fetching listing history:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// POST /api/municipalities/:municipalityId/properties/:propertyId/listing-history - Create new listing history entry
router.post(
  '/municipalities/:municipalityId/properties/:propertyId/listing-history',
  authenticateToken,
  requireModuleAccess('assessing'),
  async (req, res) => {
    try {
      const { municipalityId, propertyId } = req.params;
      const { visitDate, visitorCode, reasonCode, notes, card_number } = req.body;
      const cardNumber = card_number || parseInt(req.query.card) || 1;

      // Validation
      if (!visitDate || !visitorCode || !reasonCode) {
        return res.status(400).json({
          error: 'visitDate, visitorCode, and reasonCode are required',
        });
      }

      if (visitorCode.length !== 2 || reasonCode.length !== 2) {
        return res.status(400).json({
          error: 'visitorCode and reasonCode must be exactly 2 characters',
        });
      }

      const listingEntry = new ListingHistory({
        propertyId,
        municipalityId,
        card_number: cardNumber,
        visitDate: new Date(visitDate),
        visitorCode: visitorCode.toUpperCase(),
        reasonCode: reasonCode.toUpperCase(),
        notes: notes || '',
        createdBy: req.user.id,
      });

      await listingEntry.save();
      await listingEntry.populate('createdBy', 'firstName lastName');

      res.status(201).json({
        success: true,
        message: 'Listing history entry created successfully',
        listingEntry,
      });
    } catch (error) {
      console.error('Error creating listing history entry:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// PUT /api/municipalities/:municipalityId/properties/:propertyId/listing-history/:entryId - Update listing history entry
router.put(
  '/municipalities/:municipalityId/properties/:propertyId/listing-history/:entryId',
  authenticateToken,
  requireModuleAccess('assessing'),
  async (req, res) => {
    try {
      const { municipalityId, propertyId, entryId } = req.params;
      const { visitDate, visitorCode, reasonCode, notes, card_number } = req.body;
      const cardNumber = card_number || parseInt(req.query.card) || 1;

      const listingEntry = await ListingHistory.findOne({
        _id: entryId,
        propertyId,
        municipalityId,
        card_number: cardNumber,
      });

      if (!listingEntry) {
        return res
          .status(404)
          .json({ error: 'Listing history entry not found' });
      }

      // Validation
      if (visitorCode && visitorCode.length !== 2) {
        return res.status(400).json({
          error: 'visitorCode must be exactly 2 characters',
        });
      }

      if (reasonCode && reasonCode.length !== 2) {
        return res.status(400).json({
          error: 'reasonCode must be exactly 2 characters',
        });
      }

      // Update fields
      if (visitDate !== undefined) listingEntry.visitDate = new Date(visitDate);
      if (visitorCode !== undefined)
        listingEntry.visitorCode = visitorCode.toUpperCase();
      if (reasonCode !== undefined)
        listingEntry.reasonCode = reasonCode.toUpperCase();
      if (notes !== undefined) listingEntry.notes = notes;

      listingEntry.updatedBy = req.user.id;
      await listingEntry.save();
      await listingEntry.populate('createdBy updatedBy', 'firstName lastName');

      res.json({
        success: true,
        message: 'Listing history entry updated successfully',
        listingEntry,
      });
    } catch (error) {
      console.error('Error updating listing history entry:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// DELETE /api/municipalities/:municipalityId/properties/:propertyId/listing-history/:entryId - Delete listing history entry
router.delete(
  '/municipalities/:municipalityId/properties/:propertyId/listing-history/:entryId',
  authenticateToken,
  requireModuleAccess('assessing'),
  async (req, res) => {
    try {
      const { municipalityId, propertyId, entryId } = req.params;
      const cardNumber = parseInt(req.query.card) || 1;

      const result = await ListingHistory.findOneAndDelete({
        _id: entryId,
        propertyId,
        municipalityId,
        card_number: cardNumber,
      });

      if (!result) {
        return res
          .status(404)
          .json({ error: 'Listing history entry not found' });
      }

      res.json({
        success: true,
        message: 'Listing history entry deleted successfully',
      });
    } catch (error) {
      console.error('Error deleting listing history entry:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// PUT /api/municipalities/:municipalityId/properties/:propertyId/notes - Update property notes
router.put(
  '/municipalities/:municipalityId/properties/:propertyId/notes',
  authenticateToken,
  requireModuleAccess('assessing'),
  async (req, res) => {
    try {
      const { municipalityId, propertyId } = req.params;
      const { notes, card_number } = req.body;
      const cardNumber = card_number || parseInt(req.query.card) || 1;

      let propertyNotes = await PropertyNotes.findOne({
        propertyId,
        municipalityId,
        card_number: cardNumber,
      });

      if (!propertyNotes) {
        propertyNotes = new PropertyNotes({
          propertyId,
          municipalityId,
          card_number: cardNumber,
          createdBy: req.user.id,
        });
      }

      // Update field
      if (notes !== undefined) propertyNotes.notes = notes;

      propertyNotes.updatedBy = req.user.id;
      await propertyNotes.save();

      res.json({
        success: true,
        message: 'Property notes updated successfully',
        propertyNotes,
      });
    } catch (error) {
      console.error('Error updating property notes:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// POST /api/municipalities/:municipalityId/properties/:propertyId/sales-history - Create new sales history entry
router.post(
  '/municipalities/:municipalityId/properties/:propertyId/sales-history',
  authenticateToken,
  requireModuleAccess('assessing'),
  async (req, res) => {
    try {
      const { municipalityId, propertyId } = req.params;
      const { saleDate, salePrice, buyer, seller, saleType, verified, notes } =
        req.body;

      // Validation
      if (!saleDate || !salePrice) {
        return res.status(400).json({
          error: 'saleDate and salePrice are required',
        });
      }

      const salesEntry = new SalesHistory({
        propertyId,
        municipalityId,
        saleDate: new Date(saleDate),
        salePrice: parseFloat(salePrice),
        buyer: buyer || '',
        seller: seller || '',
        saleType: saleType || '',
        verified: Boolean(verified),
        notes: notes || '',
        createdBy: req.user.id,
      });

      await salesEntry.save();
      await salesEntry.populate('createdBy', 'firstName lastName');

      res.status(201).json({
        success: true,
        message: 'Sales entry created successfully',
        salesEntry,
      });
    } catch (error) {
      console.error('Error creating sales entry:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// PUT /api/municipalities/:municipalityId/properties/:propertyId/sales-history/:entryId - Update sales history entry
router.put(
  '/municipalities/:municipalityId/properties/:propertyId/sales-history/:entryId',
  authenticateToken,
  requireModuleAccess('assessing'),
  async (req, res) => {
    try {
      const { municipalityId, propertyId, entryId } = req.params;
      const { saleDate, salePrice, buyer, seller, saleType, verified, notes } =
        req.body;

      const salesEntry = await SalesHistory.findOne({
        _id: entryId,
        propertyId,
        municipalityId,
      });

      if (!salesEntry) {
        return res.status(404).json({ error: 'Sales entry not found' });
      }

      // Update fields
      if (saleDate !== undefined) salesEntry.saleDate = new Date(saleDate);
      if (salePrice !== undefined) salesEntry.salePrice = parseFloat(salePrice);
      if (buyer !== undefined) salesEntry.buyer = buyer;
      if (seller !== undefined) salesEntry.seller = seller;
      if (saleType !== undefined) salesEntry.saleType = saleType;
      if (verified !== undefined) salesEntry.verified = Boolean(verified);
      if (notes !== undefined) salesEntry.notes = notes;

      salesEntry.updatedBy = req.user.id;
      await salesEntry.save();
      await salesEntry.populate('createdBy updatedBy', 'firstName lastName');

      res.json({
        success: true,
        message: 'Sales entry updated successfully',
        salesEntry,
      });
    } catch (error) {
      console.error('Error updating sales entry:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// DELETE /api/municipalities/:municipalityId/properties/:propertyId/sales-history/:entryId - Delete sales history entry
router.delete(
  '/municipalities/:municipalityId/properties/:propertyId/sales-history/:entryId',
  authenticateToken,
  requireModuleAccess('assessing'),
  async (req, res) => {
    try {
      const { municipalityId, propertyId, entryId } = req.params;

      const result = await SalesHistory.findOneAndDelete({
        _id: entryId,
        propertyId,
        municipalityId,
      });

      if (!result) {
        return res.status(404).json({ error: 'Sales entry not found' });
      }

      res.json({
        success: true,
        message: 'Sales entry deleted successfully',
      });
    } catch (error) {
      console.error('Error deleting sales entry:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

module.exports = router;
