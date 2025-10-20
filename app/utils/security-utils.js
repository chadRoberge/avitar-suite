/**
 * Security Utilities
 *
 * Collection of security-focused utility functions for input sanitization,
 * validation, and protection against common web vulnerabilities.
 */

// HTML entities for escaping
const HTML_ENTITIES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
  '`': '&#x60;',
  '=': '&#x3D;',
};

// Common XSS attack patterns
const XSS_PATTERNS = [
  /<script[^>]*>.*?<\/script>/gi,
  /<iframe[^>]*>.*?<\/iframe>/gi,
  /<object[^>]*>.*?<\/object>/gi,
  /<embed[^>]*>/gi,
  /<applet[^>]*>.*?<\/applet>/gi,
  /<meta[^>]*>/gi,
  /<link[^>]*>/gi,
  /javascript:/gi,
  /vbscript:/gi,
  /on\w+\s*=/gi,
  /expression\s*\(/gi,
  /url\s*\(/gi,
  /data:text\/html/gi,
  /@import/gi,
  /binding:/gi,
];

// SQL injection patterns
const SQL_INJECTION_PATTERNS = [
  /(\s*(union|select|insert|update|delete|drop|create|alter|exec|execute)\s+)/gi,
  /(\s*(or|and)\s+[\w\s]*\s*(=|<|>|<=|>=|<>|!=)\s*[\w\s]*(\s*(or|and))?)/gi,
  /(\s*;\s*(drop|delete|insert|update|create|alter|exec|execute)\s+)/gi,
  /(\s*--\s*)/gi,
  /(\s*\/\*.*?\*\/\s*)/gi,
  /(\s*'\s*(or|and)\s+')/gi,
  /(\s*1\s*=\s*1\s*)/gi,
  /(\s*1\s*=\s*0\s*)/gi,
];

// Path traversal patterns
const PATH_TRAVERSAL_PATTERNS = [
  /\.\.[\/\\]/g,
  /[\/\\]\.\.[\/\\]/g,
  /%2e%2e[\/\\]/gi,
  /%2e%2e%2f/gi,
  /%2e%2e%5c/gi,
  /\.\.%2f/gi,
  /\.\.%5c/gi,
];

/**
 * Escapes HTML entities to prevent XSS attacks
 * @param {string} str - The string to escape
 * @returns {string} - The escaped string
 */
export function escapeHTML(str) {
  if (typeof str !== 'string') {
    return str;
  }

  return str.replace(/[&<>"'`=\/]/g, (char) => HTML_ENTITIES[char] || char);
}

/**
 * Unescapes HTML entities
 * @param {string} str - The string to unescape
 * @returns {string} - The unescaped string
 */
export function unescapeHTML(str) {
  if (typeof str !== 'string') {
    return str;
  }

  const entityMap = Object.fromEntries(
    Object.entries(HTML_ENTITIES).map(([char, entity]) => [entity, char]),
  );

  return str.replace(/&(?:amp|lt|gt|quot|#x27|#x2F|#x60|#x3D);/g, (entity) => {
    return entityMap[entity] || entity;
  });
}

/**
 * Sanitizes input to remove potentially dangerous content
 * @param {string} input - The input to sanitize
 * @param {Object} options - Sanitization options
 * @returns {string} - The sanitized input
 */
export function sanitizeInput(input, options = {}) {
  if (typeof input !== 'string') {
    return input;
  }

  const {
    allowHTML = false,
    allowScripts = false,
    allowDataURLs = false,
    maxLength = 10000,
    removePatterns = [],
  } = options;

  let sanitized = input;

  // Truncate if too long
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }

  // Remove null bytes
  sanitized = sanitized.replace(/\0/g, '');

  // Remove control characters except newlines and tabs
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // Remove or escape HTML
  if (!allowHTML) {
    sanitized = escapeHTML(sanitized);
  }

  // Remove dangerous protocols and scripts
  if (!allowScripts) {
    sanitized = sanitized
      .replace(/javascript:/gi, '')
      .replace(/vbscript:/gi, '')
      .replace(/data:text\/html/gi, '')
      .replace(/on\w+\s*=/gi, '');
  }

  // Remove data URLs if not allowed
  if (!allowDataURLs) {
    sanitized = sanitized.replace(/data:[^;]*;base64,/gi, '');
  }

  // Remove custom patterns
  removePatterns.forEach((pattern) => {
    sanitized = sanitized.replace(pattern, '');
  });

  return sanitized;
}

/**
 * Validates if input contains XSS patterns
 * @param {string} input - The input to validate
 * @returns {Object} - Validation result with isValid and threats array
 */
export function validateXSS(input) {
  if (typeof input !== 'string') {
    return { isValid: true, threats: [] };
  }

  const threats = [];

  XSS_PATTERNS.forEach((pattern, index) => {
    if (pattern.test(input)) {
      threats.push({
        type: 'xss',
        pattern: pattern.source,
        index,
      });
    }
  });

  return {
    isValid: threats.length === 0,
    threats,
  };
}

/**
 * Validates if input contains SQL injection patterns
 * @param {string} input - The input to validate
 * @returns {Object} - Validation result with isValid and threats array
 */
export function validateSQLInjection(input) {
  if (typeof input !== 'string') {
    return { isValid: true, threats: [] };
  }

  const threats = [];
  const normalizedInput = input.toLowerCase();

  SQL_INJECTION_PATTERNS.forEach((pattern, index) => {
    if (pattern.test(normalizedInput)) {
      threats.push({
        type: 'sql_injection',
        pattern: pattern.source,
        index,
      });
    }
  });

  return {
    isValid: threats.length === 0,
    threats,
  };
}

/**
 * Validates if input contains path traversal patterns
 * @param {string} input - The input to validate
 * @returns {Object} - Validation result with isValid and threats array
 */
export function validatePathTraversal(input) {
  if (typeof input !== 'string') {
    return { isValid: true, threats: [] };
  }

  const threats = [];

  PATH_TRAVERSAL_PATTERNS.forEach((pattern, index) => {
    if (pattern.test(input)) {
      threats.push({
        type: 'path_traversal',
        pattern: pattern.source,
        index,
      });
    }
  });

  return {
    isValid: threats.length === 0,
    threats,
  };
}

/**
 * Comprehensive security validation
 * @param {string} input - The input to validate
 * @param {Object} options - Validation options
 * @returns {Object} - Complete validation result
 */
export function validateSecurity(input, options = {}) {
  const {
    checkXSS = true,
    checkSQL = true,
    checkPathTraversal = true,
    customPatterns = [],
  } = options;

  const results = {
    isValid: true,
    threats: [],
    input: input,
    checkedAt: new Date().toISOString(),
  };

  // XSS validation
  if (checkXSS) {
    const xssResult = validateXSS(input);
    if (!xssResult.isValid) {
      results.isValid = false;
      results.threats.push(...xssResult.threats);
    }
  }

  // SQL injection validation
  if (checkSQL) {
    const sqlResult = validateSQLInjection(input);
    if (!sqlResult.isValid) {
      results.isValid = false;
      results.threats.push(...sqlResult.threats);
    }
  }

  // Path traversal validation
  if (checkPathTraversal) {
    const pathResult = validatePathTraversal(input);
    if (!pathResult.isValid) {
      results.isValid = false;
      results.threats.push(...pathResult.threats);
    }
  }

  // Custom pattern validation
  customPatterns.forEach((pattern, index) => {
    if (pattern.test(input)) {
      results.isValid = false;
      results.threats.push({
        type: 'custom',
        pattern: pattern.source,
        index,
      });
    }
  });

  return results;
}

/**
 * Generates a secure random string
 * @param {number} length - The length of the string to generate
 * @param {string} charset - The character set to use
 * @returns {string} - The generated secure random string
 */
export function generateSecureRandom(
  length = 32,
  charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
) {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    return Array.from(array, (byte) => charset[byte % charset.length]).join('');
  } else {
    // Fallback for environments without crypto.getRandomValues
    let result = '';
    for (let i = 0; i < length; i++) {
      result += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    return result;
  }
}

/**
 * Creates a Content Security Policy header value
 * @param {Object} options - CSP configuration options
 * @returns {string} - The CSP header value
 */
export function createCSP(options = {}) {
  const {
    defaultSrc = ["'self'"],
    scriptSrc = ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
    styleSrc = ["'self'", "'unsafe-inline'"],
    imgSrc = ["'self'", 'data:', 'https:'],
    connectSrc = ["'self'", 'ws:', 'wss:'],
    fontSrc = ["'self'", 'data:'],
    objectSrc = ["'none'"],
    mediaSrc = ["'self'"],
    childSrc = ["'self'"],
    workerSrc = ["'self'"],
    manifestSrc = ["'self'"],
    formAction = ["'self'"],
    frameAncestors = ["'none'"],
    upgradeInsecureRequests = true,
    blockAllMixedContent = true,
  } = options;

  const directives = [];

  // Helper function to format directive
  const formatDirective = (name, values) => {
    if (Array.isArray(values) && values.length > 0) {
      return `${name} ${values.join(' ')}`;
    }
    return null;
  };

  // Add directives
  directives.push(formatDirective('default-src', defaultSrc));
  directives.push(formatDirective('script-src', scriptSrc));
  directives.push(formatDirective('style-src', styleSrc));
  directives.push(formatDirective('img-src', imgSrc));
  directives.push(formatDirective('connect-src', connectSrc));
  directives.push(formatDirective('font-src', fontSrc));
  directives.push(formatDirective('object-src', objectSrc));
  directives.push(formatDirective('media-src', mediaSrc));
  directives.push(formatDirective('child-src', childSrc));
  directives.push(formatDirective('worker-src', workerSrc));
  directives.push(formatDirective('manifest-src', manifestSrc));
  directives.push(formatDirective('form-action', formAction));
  directives.push(formatDirective('frame-ancestors', frameAncestors));

  // Add special directives
  if (upgradeInsecureRequests) {
    directives.push('upgrade-insecure-requests');
  }

  if (blockAllMixedContent) {
    directives.push('block-all-mixed-content');
  }

  return directives.filter(Boolean).join('; ');
}

/**
 * Validates a URL for security
 * @param {string} url - The URL to validate
 * @param {Object} options - Validation options
 * @returns {Object} - Validation result
 */
export function validateURL(url, options = {}) {
  const {
    allowedProtocols = ['http:', 'https:'],
    allowedDomains = [],
    blockPrivateIPs = true,
    blockDataURLs = true,
  } = options;

  const result = {
    isValid: true,
    reasons: [],
    url,
  };

  try {
    const urlObj = new URL(url);

    // Check protocol
    if (!allowedProtocols.includes(urlObj.protocol)) {
      result.isValid = false;
      result.reasons.push(`Protocol ${urlObj.protocol} not allowed`);
    }

    // Check for data URLs
    if (blockDataURLs && urlObj.protocol === 'data:') {
      result.isValid = false;
      result.reasons.push('Data URLs are not allowed');
    }

    // Check domain whitelist
    if (
      allowedDomains.length > 0 &&
      !allowedDomains.includes(urlObj.hostname)
    ) {
      result.isValid = false;
      result.reasons.push(`Domain ${urlObj.hostname} not in whitelist`);
    }

    // Check for private IP addresses
    if (blockPrivateIPs && isPrivateIP(urlObj.hostname)) {
      result.isValid = false;
      result.reasons.push('Private IP addresses are not allowed');
    }

    // Check for suspicious patterns in URL
    const suspiciousPatterns = [
      /javascript:/gi,
      /vbscript:/gi,
      /data:text\/html/gi,
      /<script/gi,
      /%3cscript/gi,
    ];

    suspiciousPatterns.forEach((pattern) => {
      if (pattern.test(url)) {
        result.isValid = false;
        result.reasons.push('URL contains suspicious content');
      }
    });
  } catch (error) {
    result.isValid = false;
    result.reasons.push('Invalid URL format');
  }

  return result;
}

/**
 * Checks if an IP address is private
 * @param {string} ip - The IP address to check
 * @returns {boolean} - True if the IP is private
 */
function isPrivateIP(ip) {
  const privateRanges = [
    /^10\./,
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
    /^192\.168\./,
    /^127\./,
    /^169\.254\./,
    /^::1$/,
    /^fc00:/,
    /^fe80:/,
  ];

  return privateRanges.some((range) => range.test(ip));
}

/**
 * Rate limiting utility
 * @param {string} key - The key to rate limit on
 * @param {number} maxRequests - Maximum requests allowed
 * @param {number} windowMs - Time window in milliseconds
 * @returns {Object} - Rate limit result
 */
export function rateLimit(key, maxRequests = 100, windowMs = 60000) {
  if (typeof window === 'undefined') {
    return { allowed: true, remaining: maxRequests };
  }

  const storageKey = `rateLimit_${key}`;
  const now = Date.now();

  try {
    const stored = localStorage.getItem(storageKey);
    const data = stored ? JSON.parse(stored) : { requests: [], window: now };

    // Clean old requests outside the window
    data.requests = data.requests.filter(
      (timestamp) => now - timestamp < windowMs,
    );

    // Check if limit exceeded
    if (data.requests.length >= maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: Math.min(...data.requests) + windowMs,
      };
    }

    // Add current request
    data.requests.push(now);
    localStorage.setItem(storageKey, JSON.stringify(data));

    return {
      allowed: true,
      remaining: maxRequests - data.requests.length,
    };
  } catch (error) {
    // If localStorage fails, allow the request
    return { allowed: true, remaining: maxRequests };
  }
}
