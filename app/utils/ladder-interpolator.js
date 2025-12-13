/**
 * Generic Ladder Interpolator Utility
 * Uses monotone cubic interpolation (matching D3's curveMonotoneX) for smooth economy-of-scale curves
 * Works with any ladder data structure (land acreage, waterfront frontage, etc.)
 */

export default class LadderInterpolator {
  /**
   * Interpolate a value from ladder data using monotone cubic interpolation
   * @param {Array} ladderData - Array of ladder points
   * @param {Number} targetValue - The x-axis value to interpolate (e.g., acreage, frontage)
   * @param {String} xKey - Property name for x-axis (e.g., 'acreage', 'frontage')
   * @param {String} yKey - Property name for y-axis (e.g., 'value', 'factor')
   * @returns {Number} Interpolated y-axis value
   */
  static interpolate(
    ladderData,
    targetValue,
    xKey = 'acreage',
    yKey = 'value',
  ) {
    if (!ladderData || !Array.isArray(ladderData) || ladderData.length === 0) {
      console.warn('No ladder data provided for interpolation');
      return 0;
    }

    // Sort ladder data by x-axis value
    const sortedLadder = [...ladderData].sort((a, b) => a[xKey] - b[xKey]);

    // Convert to generic point format for interpolation
    const points = sortedLadder.map((item) => ({
      x: parseFloat(item[xKey]) || 0,
      y: parseFloat(item[yKey]) || 0,
    }));

    // Handle edge cases
    if (targetValue <= points[0].x) {
      return points[0].y;
    }
    if (targetValue >= points[points.length - 1].x) {
      return points[points.length - 1].y;
    }

    return this.monotoneCubicInterpolation(points, targetValue);
  }

  /**
   * Monotone cubic interpolation - maintains shape and prevents overshooting
   * This matches D3's curveMonotoneX mathematical approach
   * @param {Array} points - Array of {x, y} points
   * @param {Number} targetX - Target x value to interpolate
   * @returns {Number} Interpolated y value
   */
  static monotoneCubicInterpolation(points, targetX) {
    // Find the interval containing the target value
    let i = 0;
    for (let j = 1; j < points.length; j++) {
      if (targetX <= points[j].x) {
        i = j - 1;
        break;
      }
    }

    // If somehow we didn't find an interval, use linear interpolation as fallback
    if (i >= points.length - 1) {
      const last = points[points.length - 1];
      const secondLast = points[points.length - 2];
      const ratio = (targetX - secondLast.x) / (last.x - secondLast.x);
      return secondLast.y + (last.y - secondLast.y) * ratio;
    }

    const x0 = points[i].x;
    const x1 = points[i + 1].x;
    const y0 = points[i].y;
    const y1 = points[i + 1].y;

    // Calculate tangent slopes using finite differences (monotone preserving)
    let m0 = 0,
      m1 = 0;

    if (i > 0) {
      const dx0 = points[i].x - points[i - 1].x;
      const dy0 = points[i].y - points[i - 1].y;
      const dx1 = x1 - x0;
      const dy1 = y1 - y0;

      // Monotone slope calculation
      const s0 = dx0 > 0 ? dy0 / dx0 : 0;
      const s1 = dx1 > 0 ? dy1 / dx1 : 0;

      if (s0 * s1 > 0) {
        m0 = (s0 + s1) / 2;
        // Apply monotonicity constraint
        const alpha = m0 / s1;
        if (alpha > 3) m0 = 3 * s1;
        else if (alpha < 0) m0 = 0;
      }
    } else {
      // For first point, use the slope of the first segment
      m0 = (y1 - y0) / (x1 - x0);
    }

    if (i < points.length - 2) {
      const dx1 = x1 - x0;
      const dy1 = y1 - y0;
      const dx2 = points[i + 2].x - x1;
      const dy2 = points[i + 2].y - y1;

      // Monotone slope calculation
      const s1 = dx1 > 0 ? dy1 / dx1 : 0;
      const s2 = dx2 > 0 ? dy2 / dx2 : 0;

      if (s1 * s2 > 0) {
        m1 = (s1 + s2) / 2;
        // Apply monotonicity constraint
        const beta = m1 / s1;
        if (beta > 3) m1 = 3 * s1;
        else if (beta < 0) m1 = 0;
      }
    } else {
      // For last point, use the slope of the last segment
      m1 = (y1 - y0) / (x1 - x0);
    }

    // Hermite interpolation
    const t = (targetX - x0) / (x1 - x0);
    const t2 = t * t;
    const t3 = t2 * t;

    const h00 = 2 * t3 - 3 * t2 + 1; // basis function for y0
    const h10 = t3 - 2 * t2 + t; // basis function for m0
    const h01 = -2 * t3 + 3 * t2; // basis function for y1
    const h11 = t3 - t2; // basis function for m1

    const dx = x1 - x0;
    return h00 * y0 + h10 * dx * m0 + h01 * y1 + h11 * dx * m1;
  }

  /**
   * Interpolate land acreage value using land ladder data
   * @param {Array} landLadder - Land ladder data with 'acreage' and 'value' properties
   * @param {Number} acreage - Target acreage amount
   * @returns {Number} Interpolated total land value
   */
  static interpolateLandValue(landLadder, acreage) {
    return this.interpolate(landLadder, acreage, 'acreage', 'value');
  }

  /**
   * Interpolate waterfront frontage factor using waterfront ladder data
   * @param {Array} waterfrontLadder - Waterfront ladder data with 'frontage' and 'factor' properties
   * @param {Number} frontage - Target frontage amount (in feet)
   * @returns {Number} Interpolated frontage factor
   */
  static interpolateWaterfrontFactor(waterfrontLadder, frontage) {
    return this.interpolate(waterfrontLadder, frontage, 'frontage', 'factor');
  }

  /**
   * Check if ladder data is valid
   * @param {Array} ladderData - Ladder data array
   * @param {String} xKey - X-axis property name
   * @param {String} yKey - Y-axis property name
   * @returns {Boolean} True if valid
   */
  static isValidLadder(ladderData, xKey = 'acreage', yKey = 'value') {
    if (!Array.isArray(ladderData) || ladderData.length === 0) {
      return false;
    }

    // Check that all items have required properties
    return ladderData.every(
      (item) =>
        item &&
        typeof item === 'object' &&
        xKey in item &&
        yKey in item &&
        !isNaN(parseFloat(item[xKey])) &&
        !isNaN(parseFloat(item[yKey])),
    );
  }
}
