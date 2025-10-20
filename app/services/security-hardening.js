import Service from '@ember/service';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';

/**
 * Security Hardening Service
 *
 * Provides comprehensive security measures including CSP monitoring, XSS protection,
 * input sanitization, secure headers validation, and security event tracking.
 */

export default class SecurityHardeningService extends Service {
  @service performanceMonitor;

  @tracked securityLevel = 'high'; // low, medium, high, maximum
  @tracked threatsDetected = [];
  @tracked lastSecurityScan = null;
  @tracked securityMetrics = {
    xssAttempts: 0,
    cspViolations: 0,
    suspiciousRequests: 0,
    inputSanitizations: 0,
    securityScans: 0,
  };

  // Security configuration profiles
  securityProfiles = {
    low: {
      description: 'Basic security measures for development',
      settings: {
        enableCSPMonitoring: false,
        enableXSSProtection: true,
        enableInputSanitization: true,
        enableSecureHeaders: false,
        enableThreatDetection: false,
        logLevel: 'warn',
        scanInterval: 0, // No automatic scanning
      },
    },

    medium: {
      description: 'Standard security for staging environments',
      settings: {
        enableCSPMonitoring: true,
        enableXSSProtection: true,
        enableInputSanitization: true,
        enableSecureHeaders: true,
        enableThreatDetection: true,
        logLevel: 'info',
        scanInterval: 60 * 60 * 1000, // 1 hour
      },
    },

    high: {
      description: 'Enhanced security for production',
      settings: {
        enableCSPMonitoring: true,
        enableXSSProtection: true,
        enableInputSanitization: true,
        enableSecureHeaders: true,
        enableThreatDetection: true,
        enableRealTimeMonitoring: true,
        logLevel: 'info',
        scanInterval: 30 * 60 * 1000, // 30 minutes
      },
    },

    maximum: {
      description: 'Maximum security for high-risk environments',
      settings: {
        enableCSPMonitoring: true,
        enableXSSProtection: true,
        enableInputSanitization: true,
        enableSecureHeaders: true,
        enableThreatDetection: true,
        enableRealTimeMonitoring: true,
        enableAdvancedThreatDetection: true,
        enableSecurityAuditing: true,
        logLevel: 'debug',
        scanInterval: 10 * 60 * 1000, // 10 minutes
      },
    },
  };

  // XSS patterns to detect
  xssPatterns = [
    /<script[^>]*>.*?<\/script>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,
    /<iframe[^>]*>.*?<\/iframe>/gi,
    /<object[^>]*>.*?<\/object>/gi,
    /<embed[^>]*>/gi,
    /<link[^>]*>/gi,
    /<meta[^>]*>/gi,
    /expression\s*\(/gi,
    /vbscript:/gi,
    /data:text\/html/gi,
  ];

  // Suspicious patterns for threat detection
  threatPatterns = [
    /(\.\\.){2,}/g, // Directory traversal
    /union\s+select/gi, // SQL injection
    /drop\s+table/gi, // SQL injection
    /exec\s*\(/gi, // Code execution
    /eval\s*\(/gi, // Code execution
    /<\?php/gi, // PHP injection
    /<%.*%>/gi, // Template injection
    /\$\\{.*\\}/g, // Template injection
    /file:\/\//gi, // File protocol
    /ftp:\/\//gi, // FTP protocol
    /data:application\/x-msdownload/gi, // Executable download
  ];

  init() {
    super.init();
    this.initializeSecurity();
  }

  initializeSecurity() {
    console.log('🔒 Security Hardening Service initializing...');

    // Apply security configuration
    this.applySecurityConfiguration();

    // Setup CSP monitoring
    if (this.currentProfile.settings.enableCSPMonitoring) {
      this.setupCSPMonitoring();
    }

    // Setup secure headers validation
    if (this.currentProfile.settings.enableSecureHeaders) {
      this.validateSecureHeaders();
    }

    // Setup automatic security scanning
    if (this.currentProfile.settings.scanInterval > 0) {
      this.startSecurityScanning();
    }

    // Setup real-time monitoring
    if (this.currentProfile.settings.enableRealTimeMonitoring) {
      this.setupRealTimeMonitoring();
    }

    console.log(`🔒 Security initialized with ${this.securityLevel} profile`);
  }

  get currentProfile() {
    return this.securityProfiles[this.securityLevel];
  }

  applySecurityConfiguration() {
    const profile = this.currentProfile;

    // Set global security flags
    if (typeof window !== 'undefined') {
      window.AVITAR_SECURITY_LEVEL = this.securityLevel;
      window.AVITAR_SECURITY_CONFIG = profile.settings;
    }

    console.log(`🔒 Applied ${this.securityLevel} security configuration`);
  }

  setupCSPMonitoring() {
    if (typeof document !== 'undefined') {
      document.addEventListener('securitypolicyviolation', (event) => {
        this.handleCSPViolation(event);
      });
    }

    console.log('🔒 CSP monitoring enabled');
  }

  handleCSPViolation(event) {
    const violation = {
      type: 'csp_violation',
      blockedURI: event.blockedURI,
      documentURI: event.documentURI,
      effectiveDirective: event.effectiveDirective,
      originalPolicy: event.originalPolicy,
      referrer: event.referrer,
      statusCode: event.statusCode,
      violatedDirective: event.violatedDirective,
      timestamp: Date.now(),
    };

    this.recordSecurityEvent(violation);
    this.securityMetrics.cspViolations++;

    console.warn('🚨 CSP Violation detected:', violation);

    // Report to performance monitor if available
    if (this.performanceMonitor) {
      this.performanceMonitor.recordCustomMetric('csp_violation', 1, {
        directive: event.effectiveDirective,
        blocked_uri: event.blockedURI,
      });
    }
  }

  validateSecureHeaders() {
    if (typeof window === 'undefined') return;

    const requiredHeaders = [
      'X-Content-Type-Options',
      'X-Frame-Options',
      'X-XSS-Protection',
      'Strict-Transport-Security',
      'Content-Security-Policy',
      'Referrer-Policy',
    ];

    // Check if headers are present in meta tags or server responses
    const missingHeaders = requiredHeaders.filter((header) => {
      const metaTag = document.querySelector(`meta[http-equiv="${header}"]`);
      return !metaTag;
    });

    if (missingHeaders.length > 0) {
      const event = {
        type: 'missing_security_headers',
        missingHeaders,
        timestamp: Date.now(),
      };

      this.recordSecurityEvent(event);
      console.warn('🔒 Missing security headers:', missingHeaders);
    }
  }

  setupRealTimeMonitoring() {
    // Monitor DOM mutations for suspicious content
    if (typeof window !== 'undefined' && window.MutationObserver) {
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'childList') {
            mutation.addedNodes.forEach((node) => {
              if (node.nodeType === Node.ELEMENT_NODE) {
                this.scanElementForThreats(node);
              }
            });
          }
        });
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });

      console.log('🔒 Real-time DOM monitoring enabled');
    }

    // Monitor network requests
    this.interceptNetworkRequests();
  }

  interceptNetworkRequests() {
    if (typeof window === 'undefined') return;

    const originalFetch = window.fetch;
    const self = this;

    window.fetch = function (...args) {
      const url = args[0];

      // Check for suspicious URLs
      if (typeof url === 'string') {
        self.validateRequestURL(url);
      }

      return originalFetch.apply(this, args);
    };

    console.log('🔒 Network request monitoring enabled');
  }

  validateRequestURL(url) {
    const suspiciousPatterns = [
      /[<>\"\']/g, // XSS characters in URL
      /javascript:/gi,
      /data:text\/html/gi,
      /vbscript:/gi,
    ];

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(url)) {
        const event = {
          type: 'suspicious_request',
          url,
          pattern: pattern.source,
          timestamp: Date.now(),
        };

        this.recordSecurityEvent(event);
        this.securityMetrics.suspiciousRequests++;

        console.warn('🚨 Suspicious request detected:', url);
        break;
      }
    }
  }

  scanElementForThreats(element) {
    if (!element.outerHTML) return;

    const content = element.outerHTML;

    // Check for XSS patterns
    for (const pattern of this.xssPatterns) {
      if (pattern.test(content)) {
        const threat = {
          type: 'xss_attempt',
          element: element.tagName,
          content: content.substring(0, 200), // Limit logged content
          pattern: pattern.source,
          timestamp: Date.now(),
        };

        this.recordSecurityEvent(threat);
        this.securityMetrics.xssAttempts++;

        console.warn('🚨 XSS attempt detected:', threat);

        // Optionally remove the element
        if (this.currentProfile.settings.enableAdvancedThreatDetection) {
          element.remove();
          console.log('🔒 Malicious element removed');
        }

        break;
      }
    }
  }

  sanitizeInput(input, options = {}) {
    if (typeof input !== 'string') {
      return input;
    }

    const {
      allowHTML = false,
      allowScripts = false,
      maxLength = 10000,
    } = options;

    let sanitized = input;

    // Truncate if too long
    if (sanitized.length > maxLength) {
      sanitized = sanitized.substring(0, maxLength);
    }

    if (!allowHTML) {
      // Escape HTML characters
      sanitized = sanitized
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;');
    }

    if (!allowScripts) {
      // Remove javascript: and data: URLs
      sanitized = sanitized
        .replace(/javascript:/gi, '')
        .replace(/data:text\/html/gi, '')
        .replace(/vbscript:/gi, '');
    }

    // Check for threat patterns
    for (const pattern of this.threatPatterns) {
      if (pattern.test(sanitized)) {
        const event = {
          type: 'input_sanitization',
          originalInput: input.substring(0, 100),
          pattern: pattern.source,
          timestamp: Date.now(),
        };

        this.recordSecurityEvent(event);
        this.securityMetrics.inputSanitizations++;

        console.warn('🔒 Suspicious input sanitized:', event);

        // Remove the matched pattern
        sanitized = sanitized.replace(pattern, '');
      }
    }

    return sanitized;
  }

  startSecurityScanning() {
    const interval = this.currentProfile.settings.scanInterval;

    if (interval > 0) {
      setInterval(() => {
        this.performSecurityScan();
      }, interval);

      console.log(
        `🔒 Automatic security scanning enabled (every ${interval / 1000 / 60} minutes)`,
      );
    }
  }

  async performSecurityScan() {
    console.log('🔒 Performing security scan...');

    const scanResults = {
      timestamp: Date.now(),
      securityLevel: this.securityLevel,
      checks: [],
    };

    try {
      // Check for console access
      scanResults.checks.push(this.checkConsoleAccess());

      // Check for suspicious global variables
      scanResults.checks.push(this.checkGlobalVariables());

      // Check for modified prototypes
      scanResults.checks.push(this.checkPrototypeModifications());

      // Check localStorage/sessionStorage for suspicious content
      scanResults.checks.push(this.checkWebStorage());

      // Update metrics
      this.securityMetrics.securityScans++;
      this.lastSecurityScan = Date.now();

      console.log('🔒 Security scan completed:', scanResults);

      // Report to performance monitor
      if (this.performanceMonitor) {
        this.performanceMonitor.recordCustomMetric(
          'security_scan_completed',
          1,
          {
            level: this.securityLevel,
            issues_found: scanResults.checks.filter((c) => !c.passed).length,
          },
        );
      }

      return scanResults;
    } catch (error) {
      console.error('🚨 Security scan failed:', error);
      return { error: error.message, timestamp: Date.now() };
    }
  }

  checkConsoleAccess() {
    try {
      // Check if console methods have been overridden
      const originalMethods = ['log', 'warn', 'error', 'info'];
      const modifiedMethods = originalMethods.filter((method) => {
        return (
          typeof console[method] !== 'function' ||
          console[method].toString().includes('[native code]') === false
        );
      });

      return {
        check: 'console_access',
        passed: modifiedMethods.length === 0,
        details:
          modifiedMethods.length > 0
            ? `Modified console methods: ${modifiedMethods.join(', ')}`
            : 'Console methods appear normal',
      };
    } catch (error) {
      return {
        check: 'console_access',
        passed: false,
        details: `Error checking console: ${error.message}`,
      };
    }
  }

  checkGlobalVariables() {
    if (typeof window === 'undefined') {
      return {
        check: 'global_variables',
        passed: true,
        details: 'Not in browser environment',
      };
    }

    const suspiciousVariables = [
      'eval',
      'Function',
      '__proto__',
      'constructor',
    ];

    const findings = [];

    suspiciousVariables.forEach((variable) => {
      if (
        window.hasOwnProperty(variable) &&
        typeof window[variable] === 'function'
      ) {
        try {
          const funcString = window[variable].toString();
          if (!funcString.includes('[native code]')) {
            findings.push(`${variable} has been modified`);
          }
        } catch (e) {
          findings.push(`Cannot inspect ${variable}`);
        }
      }
    });

    return {
      check: 'global_variables',
      passed: findings.length === 0,
      details:
        findings.length > 0
          ? findings.join(', ')
          : 'Global variables appear normal',
    };
  }

  checkPrototypeModifications() {
    try {
      const prototypes = [Array.prototype, Object.prototype, String.prototype];
      const modifications = [];

      prototypes.forEach((proto) => {
        const descriptor = Object.getOwnPropertyDescriptor(
          proto,
          'constructor',
        );
        if (!descriptor || descriptor.value !== proto.constructor) {
          modifications.push(`${proto.constructor.name} prototype modified`);
        }
      });

      return {
        check: 'prototype_modifications',
        passed: modifications.length === 0,
        details:
          modifications.length > 0
            ? modifications.join(', ')
            : 'Prototypes appear normal',
      };
    } catch (error) {
      return {
        check: 'prototype_modifications',
        passed: false,
        details: `Error checking prototypes: ${error.message}`,
      };
    }
  }

  checkWebStorage() {
    if (typeof window === 'undefined' || !window.localStorage) {
      return {
        check: 'web_storage',
        passed: true,
        details: 'Web storage not available',
      };
    }

    try {
      const suspiciousKeys = [];
      const storageKeys = Object.keys(localStorage);

      storageKeys.forEach((key) => {
        const value = localStorage.getItem(key);

        // Check for suspicious patterns in stored data
        for (const pattern of this.threatPatterns) {
          if (pattern.test(value) || pattern.test(key)) {
            suspiciousKeys.push(key);
            break;
          }
        }
      });

      return {
        check: 'web_storage',
        passed: suspiciousKeys.length === 0,
        details:
          suspiciousKeys.length > 0
            ? `Suspicious storage keys: ${suspiciousKeys.join(', ')}`
            : 'Web storage appears clean',
      };
    } catch (error) {
      return {
        check: 'web_storage',
        passed: false,
        details: `Error checking web storage: ${error.message}`,
      };
    }
  }

  recordSecurityEvent(event) {
    const securityEvent = {
      ...event,
      id: Date.now() + Math.random(),
      userAgent: navigator.userAgent,
      url: window.location.href,
      securityLevel: this.securityLevel,
    };

    this.threatsDetected.push(securityEvent);

    // Keep only last 100 events
    if (this.threatsDetected.length > 100) {
      this.threatsDetected = this.threatsDetected.slice(-100);
    }

    // Log based on security level
    const logLevel = this.currentProfile.settings.logLevel;
    if (
      logLevel === 'debug' ||
      (logLevel === 'info' && event.type !== 'input_sanitization')
    ) {
      console.log('🔒 Security event recorded:', securityEvent);
    }
  }

  setSecurityLevel(level) {
    if (!this.securityProfiles[level]) {
      throw new Error(`Invalid security level: ${level}`);
    }

    this.securityLevel = level;
    this.applySecurityConfiguration();

    console.log(`🔒 Security level changed to: ${level}`);
  }

  getSecurityStatus() {
    return {
      level: this.securityLevel,
      profile: this.currentProfile,
      metrics: this.securityMetrics,
      threatsDetected: this.threatsDetected.length,
      lastScan: this.lastSecurityScan,
      recentThreats: this.threatsDetected.slice(-10), // Last 10 threats
    };
  }

  clearSecurityEvents() {
    this.threatsDetected = [];
    this.securityMetrics = {
      xssAttempts: 0,
      cspViolations: 0,
      suspiciousRequests: 0,
      inputSanitizations: 0,
      securityScans: 0,
    };

    console.log('🔒 Security events cleared');
  }

  // Public API for other services to use
  sanitizeUserInput(input, options) {
    if (!this.currentProfile.settings.enableInputSanitization) {
      return input;
    }

    return this.sanitizeInput(input, options);
  }

  reportSuspiciousActivity(activity) {
    const event = {
      type: 'suspicious_activity',
      activity,
      timestamp: Date.now(),
    };

    this.recordSecurityEvent(event);
  }

  isSecurityEnabled() {
    return this.securityLevel !== 'low';
  }
}
