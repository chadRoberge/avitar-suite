# Land Use Import Guide

## Overview

Land use data should now store ObjectId references to the `LandUseDetail` collection instead of storing raw strings. This ensures data integrity and enables proper filtering by both category and specific land use code.

## Data Structure

### LandAssessment Schema

Each `LandAssessment` document has:

```javascript
{
  // Property-level classification
  property_use_code: String,        // e.g., "R1", "R1A", "CI", "MXU"
  property_use_category: String,    // e.g., "RES", "COM", "IND", "MXU"

  // Land detail lines
  land_use_details: [{
    land_use_detail_id: ObjectId,   // Reference to LandUseDetail document
    land_use_code: String,           // Cached code for backward compatibility
    land_use_type: String,           // Cached category for backward compatibility
    size: Number,
    // ... other fields
  }]
}
```

## Import Process

### Step 1: Load LandUseDetail Mapping

Before importing land assessments, load all `LandUseDetail` documents into a lookup map:

```javascript
const LandUseDetail = require('./models/LandUseDetail');

// Create lookup maps
const codeToIdMap = {};
const codeToTypeMap = {};
const codeToCategoryMap = {};

const landUseDetails = await LandUseDetail.find({ municipalityId: municipalityId });

landUseDetails.forEach(detail => {
  codeToIdMap[detail.code] = detail._id;
  codeToTypeMap[detail.code] = detail.landUseType;

  // Map landUseType to category abbreviation
  const categoryMap = {
    'residential': 'RES',
    'commercial': 'COM',
    'industrial': 'IND',
    'mixed_use': 'MXU',
    'agricultural': 'AG',
    'exempt': 'EX',
    'utility': 'UTL'
  };
  codeToCategoryMap[detail.code] = categoryMap[detail.landUseType] || detail.landUseType;
});
```

### Step 2: Map Import Data

When processing each land assessment from the import:

```javascript
async function importLandAssessment(importData, municipalityId) {
  // Get the primary land use code from the import data
  const primaryLandUseCode = importData.landUseCode; // e.g., "R1", "CI"

  // Look up the ObjectId and category
  const landUseDetailId = codeToIdMap[primaryLandUseCode];
  const landUseCategory = codeToCategoryMap[primaryLandUseCode];

  if (!landUseDetailId) {
    console.warn(`Land use code "${primaryLandUseCode}" not found in LandUseDetail collection`);
    // Handle missing code - either skip or create a default
    return;
  }

  // Create land assessment with proper references
  const landAssessment = new LandAssessment({
    property_id: propertyId,
    municipality_id: municipalityId,
    effective_year: effectiveYear,

    // Set property-level classification
    property_use_code: primaryLandUseCode,    // "R1"
    property_use_category: landUseCategory,   // "RES"

    // Map land detail lines
    land_use_details: importData.landLines.map(line => ({
      land_use_detail_id: codeToIdMap[line.code],
      land_use_code: line.code,                  // Cache for backward compatibility
      land_use_type: codeToCategoryMap[line.code], // Cache for backward compatibility
      size: line.size,
      size_unit: line.unit,
      // ... other fields
    }))
  });

  await landAssessment.save();
}
```

### Step 3: Validation

Before saving, validate that:

1. All land use codes exist in `LandUseDetail` collection
2. ObjectId references are properly set
3. Cached string values match the referenced documents

```javascript
function validateLandUseReferences(landAssessment) {
  // Check property-level codes
  if (!landAssessment.property_use_code) {
    throw new Error('Missing property_use_code');
  }

  if (!landAssessment.property_use_category) {
    throw new Error('Missing property_use_category');
  }

  // Check each land detail line
  landAssessment.land_use_details.forEach((detail, idx) => {
    if (!detail.land_use_detail_id) {
      throw new Error(`Land detail line ${idx} missing land_use_detail_id`);
    }

    if (!detail.land_use_code) {
      throw new Error(`Land detail line ${idx} missing land_use_code`);
    }
  });
}
```

## Category Mappings

### landUseType → Category Abbreviation

| landUseType   | Category | Description        |
|---------------|----------|--------------------|
| residential   | RES      | Residential        |
| commercial    | COM      | Commercial         |
| industrial    | IND      | Industrial         |
| mixed_use     | MXU      | Mixed Use          |
| agricultural  | AG       | Agricultural       |
| exempt        | EX       | Exempt             |
| utility       | UTL      | Utility            |

### Default Code Mappings (for legacy data)

If import data only has category abbreviations, map to default codes:

| Category | Default Code | Description                    |
|----------|--------------|--------------------------------|
| RES      | R1           | Single Family Residential      |
| COM      | CI           | Commercial/Industrial          |
| IND      | CI           | Commercial/Industrial          |
| MXU      | MXU          | Mixed Use                      |
| AG       | R1           | Residential (adjust if needed) |
| EX       | EX-M         | Exempt Municipal               |
| UTL      | UTL          | Utility                        |

## Migration Scripts

### Existing Data Migration

The migration script at `server/utils/migrate_land_use_references.js` has already been run to convert existing data.

To re-run if needed:
```bash
node server/utils/migrate_land_use_references.js
```

### Future Use

For ongoing imports, integrate the mapping logic into your import service:

```javascript
// server/services/camaImportService.js (or similar)
const { mapLandUseToObjectId } = require('../utils/landUseMapper');

// During import
const landUseDetailId = await mapLandUseToObjectId(
  importedCode,
  municipalityId
);
```

## Testing

After updating the import process, test with:

1. **Existing codes**: Import a property with known codes (R1, R1A, CI)
2. **New codes**: Import a property with a code not in LandUseDetail (should warn/error)
3. **Missing codes**: Import without land use codes (should use defaults)
4. **Multiple lines**: Import a property with multiple land detail lines

## API Updates

The sales history API now returns both fields:
- `property_use_code`: Specific code for exact matching (e.g., "R1A" for waterfront)
- `property_use_category`: Category for broad filtering (e.g., "RES" for all residential)

This enables the revaluation view to have two separate filters:
- **Category filter**: Show all Residential, all Commercial, etc.
- **Land use code filter**: Show only R1A (waterfront), only CI (commercial/industrial), etc.

## Questions?

For questions about the land use data structure, contact the development team or refer to:
- `server/models/LandAssessment.js` - Schema definition
- `server/models/LandUseDetail.js` - Reference collection
- `server/routes/salesHistory.js` - API projection
