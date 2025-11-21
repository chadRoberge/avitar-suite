const XLSX = require('xlsx');
const mongoose = require('mongoose');

/**
 * CAMA Import Service
 * Handles two-phase import of CAMA data from Excel:
 * - Phase 1: Reference Data (Building Codes, Zones, Neighborhoods, Feature Codes)
 * - Phase 2: Property Data (Properties, Buildings, Land, Features)
 */
class CAMAImportService {
  constructor() {
    // Mapping templates for different CAMA systems
    this.templates = {
      'avitar-desktop': this.getAvitarDesktopTemplate(),
      'vision-appraisal': this.getVisionAppraisalTemplate(),
      'harris-govern': this.getHarrisGovernTemplate(),
    };
  }

  /**
   * Parse Excel file and extract data
   * @param {Buffer} fileBuffer - Excel file buffer
   * @returns {Object} Parsed workbook data
   */
  parseExcelFile(fileBuffer) {
    try {
      const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
      const sheets = {};

      workbook.SheetNames.forEach((sheetName) => {
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        // Extract headers (first row) and data rows
        const headers = data[0] || [];
        const rows = data.slice(1);

        sheets[sheetName] = {
          headers,
          rows,
          data: XLSX.utils.sheet_to_json(worksheet), // Object format with headers as keys
        };
      });

      return {
        sheetNames: workbook.SheetNames,
        sheets,
      };
    } catch (error) {
      throw new Error(`Failed to parse Excel file: ${error.message}`);
    }
  }

  /**
   * Get Avitar Desktop mapping template
   * Note: Avitar Desktop exports all data in a single sheet
   */
  getAvitarDesktopTemplate() {
    return {
      name: 'Avitar Desktop',
      // Phase 1: Extract unique reference data from the main sheet
      phase1: {
        // Extract unique zones from Zone column
        zones: {
          sheetName: 'Sheet1',  // Avitar exports to single sheet
          extractUnique: 'Zone',
          fieldMappings: {
            Zone: 'code',  // Use zone code as both code and name
          },
        },
        // Extract unique neighborhoods from NeighCode column
        neighborhoods: {
          sheetName: 'Sheet1',
          extractUnique: 'NeighCode',
          fieldMappings: {
            NeighCode: 'code',
          },
        },
        // Extract unique building types from BaseRateCode column
        buildingCodes: {
          sheetName: 'Sheet1',
          extractUnique: 'BaseRateCode',
          filterNonEmpty: true,  // Only include rows with building data
          fieldMappings: {
            BaseRateCode: 'code',
            BaseRateAmt: 'rate',
          },
        },
      },
      phase2: {
        // All property data comes from the same sheet
        combinedData: {
          sheetName: 'Sheet1',
          fieldMappings: {
            // Property/Parcel Info
            PID: 'pid_raw',
            Cards: 'card_number',
            LandUse: 'property_class',
            Street: 'location.street',
            Street_1: 'location.street_number',

            // Owner Info
            Owner1: 'owner.primary_name',
            Owner2: 'owner.secondary_name',
            OwnerAddr1: 'owner.mailing_address',
            OwnerAddr2: 'owner.mailing_address_2',
            OwnerCity: 'owner.mailing_city',
            OwnerState: 'owner.mailing_state',
            OwnerZip: 'owner.mailing_zipcode',

            // Location
            Zone: 'location.zone',
            NeighCode: 'location.neighborhood',
            Acres: 'land.size_acres',

            // Building Info (only for rows with building data)
            Model: 'building.building_model',
            Condition: 'building.condition',
            ActYrBuilt: 'building.year_built',
            BldgArea: 'building.gross_area',
            BldgEffArea: 'building.effective_area',
            GrossLivingArea: 'building.gross_living_area',

            // Building Details
            Bedrooms: 'building.bedrooms',
            Bathrooms: 'building.bathrooms',
            RoofType: 'building.roof_style',
            RoofCover: 'building.roof_cover',
            ExtWall1: 'building.exterior_wall_1',
            ExtWall2: 'building.exterior_wall_2',
            IntWall1: 'building.interior_wall_1',
            IntWall2: 'building.interior_wall_2',
            Flooring1: 'building.flooring_1',
            Flooring2: 'building.flooring_2',
            HeatingFuel: 'building.heating_fuel',
            HeatingSys: 'building.heating_type',
            AC: 'building.air_conditioning',
            CommWall: 'building.frame',
            ExtraKitchens: 'building.extra_kitchen',
            Fireplaces: 'building.fireplaces',
            Generators: 'building.generator',

            // Building Quality/Points
            QualCode: 'building.quality_grade',
            QualFactor: 'building.quality_factor',
            StoryHeight: 'building.story_height',
            BaseRateCode: 'building.base_type',
            BaseRateAmt: 'building.base_rate',

            // Assessment Values (for verification)
            CardBldgValue: 'verification.card_building_value',
            CardFeatValue: 'verification.card_feature_value',
            CardLandValue: 'verification.card_land_value',
            CardTotalAssessed: 'verification.card_total_assessed',

            // Sales Data
            SaleDate: 'sales.sale_date',
            SaleBook: 'sales.sale_book',
            SalePage: 'sales.sale_page',
            SaleQual: 'sales.sale_quality',
            SaleImpr: 'sales.sale_improvements',
            SaleQualCode: 'sales.sale_quality_code',
            SalePrice: 'sales.sale_price',
            SaleGrantor: 'sales.seller_name',

            // Property Notes (card-specific)
            Notes: 'notes',
          },
        },
      },
    };
  }

  /**
   * Get Vision Appraisal mapping template
   */
  getVisionAppraisalTemplate() {
    return {
      name: 'Vision Appraisal',
      phase1: {
        buildingCodes: {
          sheetName: 'Building Types',
          fieldMappings: {
            'Building Code': 'code',
            'Building Description': 'description',
            'Base Rate': 'rate',
            'Depreciation Rate': 'depreciation',
            Category: 'buildingType',
          },
        },
        zones: {
          sheetName: 'Zoning',
          fieldMappings: {
            'Zoning Code': 'name',
            'Zoning Description': 'description',
            'Minimum Lot Size': 'minimumAcreage',
            'Minimum Frontage': 'minimumFrontage',
          },
        },
        neighborhoods: {
          sheetName: 'Neighborhoods',
          fieldMappings: {
            'Nbhd Code': 'code',
            'Nbhd Name': 'name',
            'Nbhd Description': 'description',
          },
        },
        featureCodes: {
          sheetName: 'Extra Features',
          fieldMappings: {
            'Feature Category': 'featureType',
            'Feature Description': 'displayText',
            'Point Value': 'points',
            'Factor Value': 'factor',
          },
        },
      },
      phase2: {
        properties: {
          sheetName: 'Parcels',
          fieldMappings: {
            'Parcel ID': 'pid_raw',
            'Property Type': 'property_class',
            'Street No': 'location.street_number',
            'Street Name': 'location.street',
            'Owner 1': 'owner.primary_name',
            'Mail Address': 'owner.mailing_address',
            'Mail City': 'owner.mailing_city',
            'Mail State': 'owner.mailing_state',
            'Mail ZIP': 'owner.mailing_zipcode',
            'Zoning Code': 'location.zone',
            'Neighborhood Code': 'location.neighborhood',
          },
        },
        buildings: {
          sheetName: 'Improvements',
          fieldMappings: {
            'Parcel ID': 'pid_raw',
            'Card #': 'card_number',
            'Building Code': 'base_type',
            'Year Built': 'year_built',
            'Living Area': 'gross_living_area',
            'Total Area': 'effective_area',
            Grade: 'quality_grade',
            'Story Height': 'story_height',
            'Frame Type': 'frame',
            'Ceiling Ht': 'ceiling_height',
            'Roof Type': 'roof_style',
            'Roof Material': 'roof_cover',
            'Exterior 1': 'exterior_wall_1',
            'Exterior 2': 'exterior_wall_2',
            'Interior 1': 'interior_wall_1',
            'Interior 2': 'interior_wall_2',
            'Floor 1': 'flooring_1',
            'Floor 2': 'flooring_2',
            'Heat Fuel': 'heating_fuel',
            'Heat Type': 'heating_type',
            'AC Type': 'air_conditioning',
            Bedrooms: 'bedrooms',
            'Full Baths': 'full_baths',
            'Half Baths': 'half_baths',
            'Add Kitchen': 'extra_kitchen',
            Generator: 'generator',
          },
        },
        land: {
          sheetName: 'Land',
          fieldMappings: {
            'Parcel ID': 'pid_raw',
            'Land Type': 'land_use_type',
            'Land Area': 'size_acres',
            'Front Feet': 'frontage',
            'Depth Feet': 'depth',
            Topo: 'topography',
            'Land Condition': 'condition',
            'Zoning Code': 'zone',
            'Neighborhood Code': 'neighborhood',
          },
        },
        features: {
          sheetName: 'Extra Features',
          fieldMappings: {
            'Parcel ID': 'pid_raw',
            'Card #': 'card_number',
            'Feature Code': 'feature_type',
            'Feature Desc': 'description',
            Length: 'length',
            Width: 'width',
            Quantity: 'units',
            'Unit Rate': 'rate',
            Quality: 'condition',
          },
        },
      },
    };
  }

  /**
   * Get Harris Govern mapping template
   */
  getHarrisGovernTemplate() {
    return {
      name: 'Harris Govern',
      phase1: {
        buildingCodes: {
          sheetName: 'Structure Types',
          fieldMappings: {
            'Type Code': 'code',
            'Type Name': 'description',
            'Cost/SF': 'rate',
            'Depr %': 'depreciation',
            Class: 'buildingType',
          },
        },
        zones: {
          sheetName: 'Zones',
          fieldMappings: {
            'Zone': 'name',
            'Zone Desc': 'description',
            'Min Acres': 'minimumAcreage',
            'Min Front Ft': 'minimumFrontage',
          },
        },
        neighborhoods: {
          sheetName: 'Nbhds',
          fieldMappings: {
            'Nbhd': 'code',
            'Nbhd Desc': 'name',
            Notes: 'description',
          },
        },
        featureCodes: {
          sheetName: 'Amenities',
          fieldMappings: {
            'Amenity Type': 'featureType',
            'Amenity Desc': 'displayText',
            Points: 'points',
            Multiplier: 'factor',
          },
        },
      },
      phase2: {
        properties: {
          sheetName: 'Properties',
          fieldMappings: {
            'Property ID': 'pid_raw',
            'Prop Class': 'property_class',
            'House #': 'location.street_number',
            'Street': 'location.street',
            'Owner Name': 'owner.primary_name',
            'Owner Addr': 'owner.mailing_address',
            'Owner City': 'owner.mailing_city',
            'Owner State': 'owner.mailing_state',
            'Owner ZIP': 'owner.mailing_zipcode',
            Zone: 'location.zone',
            Nbhd: 'location.neighborhood',
          },
        },
        buildings: {
          sheetName: 'Structures',
          fieldMappings: {
            'Property ID': 'pid_raw',
            Card: 'card_number',
            'Structure Type': 'base_type',
            'Yr Built': 'year_built',
            'Liv Area': 'gross_living_area',
            'Eff Area': 'effective_area',
            Grade: 'quality_grade',
            'No Stories': 'story_height',
            'Frame': 'frame',
            'Ceil Ht': 'ceiling_height',
            'Roof': 'roof_style',
            'Roof Matl': 'roof_cover',
            'Ext Wall': 'exterior_wall_1',
            'Int Wall': 'interior_wall_1',
            'Floor': 'flooring_1',
            'Heat': 'heating_fuel',
            'Heat Sys': 'heating_type',
            'AC': 'air_conditioning',
            'No BR': 'bedrooms',
            'No FB': 'full_baths',
            'No HB': 'half_baths',
            'Extra Kitchen': 'extra_kitchen',
            Gen: 'generator',
          },
        },
        land: {
          sheetName: 'Land',
          fieldMappings: {
            'Property ID': 'pid_raw',
            'Use Type': 'land_use_type',
            Acres: 'size_acres',
            'Frontage': 'frontage',
            'Depth': 'depth',
            'Topo': 'topography',
            'Cond': 'condition',
            Zone: 'zone',
            Nbhd: 'neighborhood',
          },
        },
        features: {
          sheetName: 'Amenities',
          fieldMappings: {
            'Property ID': 'pid_raw',
            Card: 'card_number',
            'Amenity Type': 'feature_type',
            Desc: 'description',
            Len: 'length',
            Wid: 'width',
            Qty: 'units',
            Rate: 'rate',
            Qual: 'condition',
          },
        },
      },
    };
  }

  /**
   * Get mapping template for a specific CAMA system
   * @param {String} systemKey - 'avitar-desktop', 'vision-appraisal', or 'harris-govern'
   * @returns {Object} Template configuration
   */
  getTemplate(systemKey) {
    if (!this.templates[systemKey]) {
      throw new Error(`Unknown CAMA system: ${systemKey}`);
    }
    return this.templates[systemKey];
  }

  /**
   * Apply field mapping to data row
   * @param {Object} row - Raw data row from Excel
   * @param {Object} fieldMappings - Field mapping configuration
   * @returns {Object} Mapped data object
   */
  applyFieldMapping(row, fieldMappings) {
    const mapped = {};

    Object.entries(fieldMappings).forEach(([excelColumn, targetField]) => {
      const value = row[excelColumn];

      if (value !== undefined && value !== null && value !== '') {
        // Handle nested fields (e.g., 'location.street')
        if (targetField.includes('.')) {
          const parts = targetField.split('.');
          let current = mapped;

          for (let i = 0; i < parts.length - 1; i++) {
            if (!current[parts[i]]) {
              current[parts[i]] = {};
            }
            current = current[parts[i]];
          }

          current[parts[parts.length - 1]] = value;
        } else {
          mapped[targetField] = value;
        }
      }
    });

    return mapped;
  }

  /**
   * Find or create an Owner record based on name and address
   * Deduplicates owners by matching name and mailing address
   * @param {Object} ownerData - Owner information from import
   * @param {String} municipalityId - Municipality ID
   * @returns {Promise<Object>} Owner document
   */
  async findOrCreateOwner(ownerData, municipalityId) {
    const Owner = require('../models/Owner');

    // Skip if no owner name provided
    if (!ownerData.primary_name || ownerData.primary_name.trim() === '') {
      return null;
    }

    // Create search criteria for deduplication
    const ownerName = ownerData.primary_name.trim().toUpperCase();
    const mailingAddress = (ownerData.mailing_address || '').toString().trim().toUpperCase();
    const mailingCity = (ownerData.mailing_city || '').toString().trim().toUpperCase();
    const mailingZip = (ownerData.mailing_zipcode || '').toString().trim();

    // Try to find existing owner by name and address
    let owner = await Owner.findOne({
      municipality_id: municipalityId,
      $or: [
        {
          // Match by full name and mailing address
          business_name: { $regex: new RegExp(`^${this.escapeRegex(ownerName)}$`, 'i') },
          'mailing_address.street': { $regex: new RegExp(`^${this.escapeRegex(mailingAddress)}$`, 'i') },
          'mailing_address.city': { $regex: new RegExp(`^${this.escapeRegex(mailingCity)}$`, 'i') },
        },
        {
          // Match by name and zip (in case address format varies)
          business_name: { $regex: new RegExp(`^${this.escapeRegex(ownerName)}$`, 'i') },
          'mailing_address.zip_code': mailingZip,
        },
      ],
    });

    if (owner) {
      // Found existing owner - return it
      return owner;
    }

    // Parse owner name to determine type
    const ownerType = this.determineOwnerType(ownerData.primary_name);

    // Create new owner
    const ownerDoc = {
      municipality_id: municipalityId,
      owner_type: ownerType,
    };

    // Set name fields based on owner type
    if (ownerType === 'individual') {
      // For individuals, use the full name as-is (don't parse it)
      ownerDoc.first_name = ownerData.primary_name || '';
      ownerDoc.last_name = '';
    } else {
      ownerDoc.business_name = ownerData.primary_name;
    }

    // Set mailing address (only if we have actual address data)
    if (ownerData.mailing_address) {
      // Clean and validate zip code - extract only digits and format as 5 or 9 digit zip
      let cleanZip = undefined; // Use undefined instead of empty string to avoid validation
      if (ownerData.mailing_zipcode) {
        const zipStr = ownerData.mailing_zipcode.toString().trim().replace(/\D/g, ''); // Remove non-digits
        if (zipStr.length > 0) {
          // Pad with leading zeros if needed (Excel removes leading zeros)
          const paddedZip = zipStr.padStart(5, '0');
          if (paddedZip.length >= 5) {
            cleanZip = paddedZip.substring(0, 5);
            if (zipStr.length >= 9) {
              cleanZip += '-' + zipStr.substring(5, 9);
            }
          }
        }
      }

      ownerDoc.mailing_address = {
        is_different: true, // Assume mailing is different from property address
        street: ownerData.mailing_address ? ownerData.mailing_address.toString() : '',
        city: ownerData.mailing_city ? ownerData.mailing_city.toString() : '',
        state: ownerData.mailing_state ? ownerData.mailing_state.toString() : '',
        country: 'US',
      };

      // Only add zip_code if we have a valid one
      if (cleanZip) {
        ownerDoc.mailing_address.zip_code = cleanZip;
      }
    }

    // Create and return new owner
    owner = await Owner.create(ownerDoc);
    return owner;
  }

  /**
   * Create PropertyOwner relationship
   * @param {String} propertyId - Property ID
   * @param {String} ownerId - Owner ID
   * @param {String} municipalityId - Municipality ID
   * @param {Boolean} isPrimary - Whether this is the primary owner
   * @returns {Promise<Object>} PropertyOwner document
   */
  async createPropertyOwner(propertyId, ownerId, municipalityId, isPrimary = true) {
    const PropertyOwner = require('../models/PropertyOwner');

    // Check if relationship already exists
    let propertyOwner = await PropertyOwner.findOne({
      property_id: propertyId,
      owner_id: ownerId,
      municipality_id: municipalityId,
    });

    if (propertyOwner) {
      // Update is_primary if needed
      if (isPrimary && !propertyOwner.is_primary) {
        await propertyOwner.setPrimary();
      }
      return propertyOwner;
    }

    // Create new property-owner relationship
    propertyOwner = await PropertyOwner.create({
      municipality_id: municipalityId,
      property_id: propertyId,
      owner_id: ownerId,
      is_primary: isPrimary,
      ownership_percentage: 100,
      ownership_type: 'fee_simple',
      receives_tax_bills: true,
      receives_notices: true,
      is_active: true,
    });

    return propertyOwner;
  }

  /**
   * Determine if owner is individual or business based on name
   * @param {String} name - Owner name
   * @returns {String} 'individual' or 'business'
   */
  determineOwnerType(name) {
    if (!name) return 'individual';

    const businessIndicators = [
      'LLC', 'INC', 'CORP', 'LTD', 'CO', 'COMPANY', 'CORPORATION',
      'TRUST', 'ESTATE', 'PARTNERSHIP', 'L.L.C.', 'L.P.', 'ASSOCIATION',
      'BANK', 'PROPERTIES', 'INVESTMENTS', 'MANAGEMENT', 'GROUP',
      'REALTY', 'DEVELOPMENT', 'HOLDINGS'
    ];

    const upperName = name.toUpperCase();
    const hasBusinessIndicator = businessIndicators.some(indicator =>
      upperName.includes(indicator)
    );

    return hasBusinessIndicator ? 'business' : 'individual';
  }

  /**
   * Parse individual owner name into parts
   * @param {String} fullName - Full name string
   * @returns {Object} {firstName, lastName, middleInitial}
   */
  parseOwnerName(fullName) {
    if (!fullName) {
      return { firstName: '', lastName: '', middleInitial: '' };
    }

    // Remove common suffixes
    let cleanName = fullName.replace(/\s+(JR|SR|II|III|IV)\s*$/i, '').trim();

    const parts = cleanName.split(/\s+/);

    if (parts.length === 1) {
      return { firstName: '', lastName: parts[0], middleInitial: '' };
    } else if (parts.length === 2) {
      return { firstName: parts[0], lastName: parts[1], middleInitial: '' };
    } else if (parts.length >= 3) {
      // First name, middle initial(s), last name
      const firstName = parts[0];
      const lastName = parts[parts.length - 1];
      const middleParts = parts.slice(1, -1);
      const middleInitial = middleParts.map(p => p.charAt(0)).join('');

      return { firstName, lastName, middleInitial };
    }

    return { firstName: '', lastName: fullName, middleInitial: '' };
  }

  /**
   * Escape special regex characters
   * @param {String} string - String to escape
   * @returns {String} Escaped string
   */
  escapeRegex(string) {
    if (!string) return '';
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

module.exports = new CAMAImportService();
