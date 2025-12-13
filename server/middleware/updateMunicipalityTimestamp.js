/**
 * Middleware to update Municipality.lastModified timestamp when configuration data changes
 *
 * This middleware intercepts successful POST/PUT/DELETE requests to configuration endpoints
 * and updates the municipality's lastModified field to invalidate client caches.
 *
 * Usage:
 *   router.post('/zones', updateMunicipalityTimestamp, handler);
 *   router.put('/zones/:id', updateMunicipalityTimestamp, handler);
 */

const Municipality = require('../models/Municipality');

const updateMunicipalityTimestamp = async (req, res, next) => {
  // Store original send function
  const originalSend = res.send;

  // Override res.send to intercept response
  res.send = async function (data) {
    // Only update timestamp on successful mutations (2xx status codes)
    if (res.statusCode >= 200 && res.statusCode < 300) {
      // Get municipality ID from params or body
      const municipalityId =
        req.params.municipalityId ||
        req.body?.municipalityId ||
        req.body?.municipality_id;

      if (municipalityId) {
        try {
          await Municipality.findByIdAndUpdate(
            municipalityId,
            { lastModified: new Date() },
            { timestamps: false }, // Don't update createdAt/updatedAt
          );

          console.log(
            `✅ Updated municipality ${municipalityId} lastModified timestamp`,
          );
        } catch (error) {
          // Log error but don't fail the request
          console.error('Error updating municipality timestamp:', error);
        }
      }
    }

    // Call original send
    originalSend.call(this, data);
  };

  next();
};

module.exports = updateMunicipalityTimestamp;
