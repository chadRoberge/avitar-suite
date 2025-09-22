/**
 * Server-side PID formatting utility
 * Formats 18-digit raw PIDs according to municipality configuration
 */

/**
 * Format a raw 18-digit PID according to municipality settings
 * @param {string} pidRaw - The raw 18-digit PID
 * @param {object} municipalityConfig - Municipality PID configuration
 * @returns {string} - Formatted PID display string
 */
function formatPid(pidRaw, municipalityConfig) {
  if (!pidRaw || pidRaw.length !== 18) {
    return pidRaw || 'Invalid PID';
  }

  const config = getPidConfig(municipalityConfig);
  if (!config) {
    return pidRaw;
  }

  try {
    const parts = parsePidParts(pidRaw, config);
    return formatParts(parts, config);
  } catch (error) {
    console.warn('PID formatting error:', error);
    return pidRaw;
  }
}

/**
 * Parse raw PID into map, lot, sub parts based on municipality configuration
 * @param {string} pidRaw - Raw 18-digit PID
 * @param {object} config - Municipality PID configuration
 * @returns {object} - {map, lot, sub} parts
 */
function parsePidParts(pidRaw, config) {
  const mapDigits = config.mapDigits || 2;
  const lotDigits = config.lotDigits || 3;
  const subDigits = config.subDigits || 3;

  // Extract parts from raw PID
  const map = pidRaw.substring(0, mapDigits);
  const lot = pidRaw.substring(mapDigits, mapDigits + lotDigits);
  const sub = pidRaw.substring(
    mapDigits + lotDigits,
    mapDigits + lotDigits + subDigits,
  );

  return { map, lot, sub };
}

/**
 * Format the parsed parts into display string
 * @param {object} parts - {map, lot, sub} parts
 * @param {object} config - Municipality PID configuration
 * @returns {string} - Formatted display string
 */
function formatParts(parts, config) {
  const separator = config.separator || '-';
  const removeLeadingZeros = config.removeLeadingZeros !== false;
  const showSubOnlyWhenPresent = config.showSubOnlyWhenPresent || false;

  let formattedParts = [];

  // Format map
  let map = parts.map;
  if (removeLeadingZeros) {
    map = parseInt(map, 10).toString();
  }
  formattedParts.push(map);

  // Format lot
  let lot = parts.lot;
  if (removeLeadingZeros) {
    lot = parseInt(lot, 10).toString();
  }
  formattedParts.push(lot);

  // Format sub (conditional)
  let sub = parts.sub;
  if (removeLeadingZeros) {
    sub = parseInt(sub, 10).toString();
  }

  // Only show sub if it's not zero or if showSubOnlyWhenPresent is false
  if (!showSubOnlyWhenPresent || parseInt(sub, 10) > 0) {
    formattedParts.push(sub);
  }

  return formattedParts.join(separator);
}

/**
 * Get PID configuration from municipality data
 * @param {object} municipality - Municipality object with PID configuration
 * @returns {object|null} - PID configuration or null if not available
 */
function getPidConfig(municipality) {
  if (!municipality) {
    return null;
  }

  // Get PID format configuration from municipality settings
  const pidFormat = municipality.pid_format;
  if (pidFormat) {
    return {
      mapDigits: pidFormat.map?.digits || 2,
      lotDigits: pidFormat.lot?.digits || 3,
      subDigits: pidFormat.sublot?.digits || 3,
      separator: pidFormat.separator || '-',
      removeLeadingZeros: pidFormat.removeLeadingZeros !== false,
      showSubOnlyWhenPresent: pidFormat.showSubOnlyWhenPresent || false,
    };
  }

  // Default configuration if none specified
  return {
    mapDigits: 2,
    lotDigits: 3,
    subDigits: 3,
    separator: '-',
    removeLeadingZeros: true,
    showSubOnlyWhenPresent: false,
  };
}

/**
 * Get map number from raw PID
 * @param {string} pidRaw - Raw 18-digit PID
 * @param {object} municipality - Municipality configuration
 * @returns {string} - Map number (formatted)
 */
function getMapFromPid(pidRaw, municipality) {
  if (!pidRaw || pidRaw.length !== 18) {
    return 'Unknown';
  }

  const config = getPidConfig(municipality);
  if (!config) {
    return pidRaw.substring(0, 2);
  }

  const mapRaw = pidRaw.substring(0, config.mapDigits);
  return config.removeLeadingZeros ? parseInt(mapRaw, 10).toString() : mapRaw;
}

/**
 * Get lot and sublot display from raw PID (for property tree display)
 * @param {string} pidRaw - Raw 18-digit PID
 * @param {object} municipality - Municipality configuration
 * @returns {string} - Lot-sublot display (e.g., "1-5", "20")
 */
function getLotSubFromPid(pidRaw, municipality) {
  if (!pidRaw || pidRaw.length !== 18) {
    return 'Unknown';
  }

  const config = getPidConfig(municipality);
  if (!config) {
    return 'Unknown';
  }

  const parts = parsePidParts(pidRaw, config);
  const lot = config.removeLeadingZeros
    ? parseInt(parts.lot, 10).toString()
    : parts.lot;
  const sub = config.removeLeadingZeros
    ? parseInt(parts.sub, 10).toString()
    : parts.sub;

  return parseInt(parts.sub, 10) > 0 ? `${lot}-${sub}` : lot;
}

module.exports = {
  formatPid,
  parsePidParts,
  formatParts,
  getPidConfig,
  getMapFromPid,
  getLotSubFromPid,
};
