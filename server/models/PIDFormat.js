const mongoose = require('mongoose');

// PID Format configuration for municipalities
const pidFormatSchema = new mongoose.Schema({
  municipality_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Municipality',
    required: true,
    unique: true,
  },

  // Format definition - total must equal 18 digits
  format: {
    map: {
      digits: { type: Number, required: true, min: 1, max: 18 },
      position: { type: Number, required: true, min: 0 }, // Starting position (0-based)
      label: { type: String, default: 'Map' },
      description: String,
    },
    lot: {
      digits: { type: Number, required: true, min: 1, max: 18 },
      position: { type: Number, required: true, min: 0 },
      label: { type: String, default: 'Lot' },
      description: String,
    },
    sublot: {
      digits: { type: Number, required: true, min: 0, max: 18 }, // Can be 0 if not used
      position: { type: Number, required: true, min: 0 },
      label: { type: String, default: 'Sublot' },
      description: String,
      optional: { type: Boolean, default: true },
    },
    // Additional segments for complex municipalities
    unit: {
      digits: { type: Number, default: 0 },
      position: { type: Number, default: 0 },
      label: { type: String, default: 'Unit' },
      description: String,
      optional: { type: Boolean, default: true },
    },
    building: {
      digits: { type: Number, default: 0 },
      position: { type: Number, default: 0 },
      label: { type: String, default: 'Building' },
      description: String,
      optional: { type: Boolean, default: true },
    },
    condo: {
      digits: { type: Number, default: 0 },
      position: { type: Number, default: 0 },
      label: { type: String, default: 'Condo' },
      description: String,
      optional: { type: Boolean, default: true },
    },
    mobile: {
      digits: { type: Number, default: 0 },
      position: { type: Number, default: 0 },
      label: { type: String, default: 'Mobile' },
      description: String,
      optional: { type: Boolean, default: true },
    },
  },

  // Display configuration
  display: {
    separator: { type: String, default: '-' }, // Character between segments
    show_leading_zeros: { type: Boolean, default: true },
    compact_optional: { type: Boolean, default: true }, // Hide optional segments if zero
    custom_format_string: String, // Optional: "MMM-LLLL-SSSS" style format
  },

  // Validation rules
  validation: {
    required_segments: [{ type: String }], // Which segments are required (e.g., ['map', 'lot'])
    total_digits: { type: Number, default: 18, min: 18, max: 18 }, // Must be 18
    allow_alpha: { type: Boolean, default: false }, // Future: allow letters in certain segments
  },

  // Examples for documentation
  examples: [
    {
      raw_pid: String,
      formatted_pid: String,
      description: String,
    },
  ],

  // Metadata
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  created_at: { type: Date, default: Date.now },
  last_modified: { type: Date, default: Date.now },
  is_active: { type: Boolean, default: true },
});

// Pre-save validation
pidFormatSchema.pre('save', function (next) {
  const format = this.format;
  let totalDigits = 0;
  const positions = [];

  // Calculate total digits and check for overlapping positions
  Object.keys(format).forEach((segment) => {
    const config = format[segment];
    if (config.digits > 0) {
      totalDigits += config.digits;

      // Check for position overlaps
      for (let i = config.position; i < config.position + config.digits; i++) {
        if (positions.includes(i)) {
          return next(new Error(`Position ${i} is used by multiple segments`));
        }
        positions.push(i);
      }
    }
  });

  if (totalDigits > 18) {
    return next(
      new Error(`Total digits (${totalDigits}) exceeds maximum of 18`),
    );
  }

  this.validation.total_digits = totalDigits;
  this.last_modified = new Date();
  next();
});

// Method to format a raw 18-digit PID according to this municipality's rules
pidFormatSchema.methods.formatPID = function (rawPID) {
  if (!rawPID || rawPID.length !== 18) {
    throw new Error('PID must be exactly 18 digits');
  }

  const segments = [];
  const format = this.format;

  // Extract each segment according to the format
  const segmentOrder = [
    'map',
    'lot',
    'sublot',
    'unit',
    'building',
    'condo',
    'mobile',
  ];

  segmentOrder.forEach((segmentName) => {
    const config = format[segmentName];
    if (config && config.digits > 0) {
      const value = rawPID.substr(config.position, config.digits);

      // Skip optional segments that are all zeros if compact_optional is true
      if (
        config.optional &&
        this.display.compact_optional &&
        parseInt(value) === 0
      ) {
        return;
      }

      // Add leading zeros if configured
      const displayValue = this.display.show_leading_zeros
        ? value.padStart(config.digits, '0')
        : parseInt(value).toString();

      segments.push(displayValue);
    }
  });

  return segments.join(this.display.separator);
};

// Method to parse a formatted PID back to raw 18-digit format
pidFormatSchema.methods.parsePID = function (formattedPID) {
  if (!formattedPID) {
    throw new Error('Formatted PID is required');
  }

  const segments = formattedPID.split(this.display.separator);
  let rawPID = '000000000000000000'; // Start with 18 zeros

  const format = this.format;
  const segmentOrder = [
    'map',
    'lot',
    'sublot',
    'unit',
    'building',
    'condo',
    'mobile',
  ];
  let segmentIndex = 0;

  segmentOrder.forEach((segmentName) => {
    const config = format[segmentName];
    if (config && config.digits > 0) {
      if (segmentIndex < segments.length) {
        const value = segments[segmentIndex].padStart(config.digits, '0');
        rawPID =
          rawPID.substr(0, config.position) +
          value +
          rawPID.substr(config.position + config.digits);
        segmentIndex++;
      }
    }
  });

  return rawPID;
};

// Method to get segment values from raw PID
pidFormatSchema.methods.getSegments = function (rawPID) {
  if (!rawPID || rawPID.length !== 18) {
    throw new Error('PID must be exactly 18 digits');
  }

  const segments = {};
  const format = this.format;

  Object.keys(format).forEach((segmentName) => {
    const config = format[segmentName];
    if (config && config.digits > 0) {
      segments[segmentName] = rawPID.substr(config.position, config.digits);
    }
  });

  return segments;
};

// Static method to create default format for new municipalities
pidFormatSchema.statics.createDefaultFormat = async function (
  municipalityId,
  formatType = 'standard',
) {
  const formats = {
    standard: {
      format: {
        map: { digits: 6, position: 0, label: 'Map' },
        lot: { digits: 6, position: 6, label: 'Lot' },
        sublot: { digits: 6, position: 12, label: 'Sublot', optional: true },
      },
      display: {
        separator: '-',
        show_leading_zeros: true,
        compact_optional: true,
      },
      examples: [
        {
          raw_pid: '001000001000000000',
          formatted_pid: '001000-001000',
          description: 'Map 1000, Lot 1000, no sublot',
        },
        {
          raw_pid: '001000001000000001',
          formatted_pid: '001000-001000-000001',
          description: 'Map 1000, Lot 1000, Sublot 1',
        },
      ],
    },

    complex: {
      format: {
        map: { digits: 3, position: 0, label: 'Map' },
        lot: { digits: 4, position: 3, label: 'Lot' },
        sublot: { digits: 4, position: 7, label: 'Sublot', optional: true },
        condo: { digits: 3, position: 11, label: 'Condo', optional: true },
        mobile: { digits: 4, position: 14, label: 'Mobile', optional: true },
      },
      display: {
        separator: '-',
        show_leading_zeros: true,
        compact_optional: true,
      },
      examples: [
        {
          raw_pid: '001000100000000000',
          formatted_pid: '001-0001',
          description: 'Map 1, Lot 1',
        },
        {
          raw_pid: '001000100010010001',
          formatted_pid: '001-0001-0001-001-0001',
          description: 'Map 1, Lot 1, Sublot 1, Condo 1, Mobile 1',
        },
      ],
    },

    simple: {
      format: {
        map: { digits: 9, position: 0, label: 'Map/Lot' },
        lot: { digits: 9, position: 9, label: 'Unit/Sublot' },
      },
      display: {
        separator: '-',
        show_leading_zeros: false,
        compact_optional: true,
      },
      examples: [
        {
          raw_pid: '000001000000001000',
          formatted_pid: '1000-1000',
          description: 'Map/Lot 1000, Unit 1000',
        },
      ],
    },
  };

  const formatConfig = formats[formatType] || formats.standard;

  return this.create({
    municipality_id: municipalityId,
    ...formatConfig,
    validation: {
      required_segments: ['map', 'lot'],
      total_digits: 18,
    },
  });
};

module.exports = mongoose.model('PIDFormat', pidFormatSchema);
