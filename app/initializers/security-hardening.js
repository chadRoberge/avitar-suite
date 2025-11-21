export function initialize(application) {
  // Security hardening initializer
  console.log('🔒 Security Hardening Initializer');

  // Apply security headers via meta tags
  if (typeof document !== 'undefined') {
    addSecurityHeaders();
  }

  // Disable dangerous JavaScript features in production
  if (isProductionEnvironment()) {
    disableDangerousFeatures();
  }

  // Setup security monitoring
  setupSecurityMonitoring();
}

function addSecurityHeaders() {
  const headers = [
    {
      name: 'X-Content-Type-Options',
      content: 'nosniff',
    },
    {
      name: 'X-Frame-Options',
      content: 'SAMEORIGIN',
    },
    {
      name: 'X-XSS-Protection',
      content: '1; mode=block',
    },
    {
      name: 'Referrer-Policy',
      content: 'strict-origin-when-cross-origin',
    },
    {
      name: 'Content-Security-Policy',
      content:
        "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' https://js.stripe.com https://m.stripe.network; style-src 'self' 'unsafe-inline' https://cdn.quilljs.com; img-src 'self' data: https:; font-src 'self' data: https://cdn.quilljs.com; connect-src 'self' ws: wss: http://localhost:3000 https://avitar-suite.vercel.app https://api.stripe.com; worker-src 'self'; manifest-src 'self'; frame-src 'self' http://localhost:3000 https://avitar-suite.vercel.app https://js.stripe.com https://hooks.stripe.com",
    },
  ];

  headers.forEach((header) => {
    // Check if header already exists
    const existing = document.querySelector(
      `meta[http-equiv="${header.name}"]`,
    );
    if (!existing) {
      const meta = document.createElement('meta');
      meta.setAttribute('http-equiv', header.name);
      meta.setAttribute('content', header.content);
      document.head.appendChild(meta);
    }
  });

  console.log('🔒 Security headers applied');
}

function isProductionEnvironment() {
  // Check various indicators of production environment
  const hostname = window.location.hostname;
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
  const hasDevTools = window.__EMBER_DEVTOOLS_EXTENSIONS__ !== undefined;
  const isEmberDev = window.ENV?.environment === 'development';

  return !isLocalhost && !hasDevTools && !isEmberDev;
}

function disableDangerousFeatures() {
  try {
    // Disable eval in strict mode contexts
    if (typeof window !== 'undefined') {
      // Override console in production to prevent information leakage
      const originalConsole = window.console;
      const safeConsole = {
        error: originalConsole.error.bind(originalConsole),
        warn: originalConsole.warn.bind(originalConsole),
        log: () => {}, // Disable logging in production
        info: () => {},
        debug: () => {},
        trace: () => {},
        dir: () => {},
        table: () => {},
      };

      Object.defineProperty(window, 'console', {
        value: safeConsole,
        writable: false,
        configurable: false,
      });

      // Disable right-click context menu
      document.addEventListener('contextmenu', (e) => {
        if (isProductionEnvironment()) {
          e.preventDefault();
          return false;
        }
      });

      // Disable common developer keyboard shortcuts
      document.addEventListener('keydown', (e) => {
        if (isProductionEnvironment()) {
          // Disable F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C, Ctrl+U
          if (
            e.key === 'F12' ||
            (e.ctrlKey && e.shiftKey && ['I', 'J', 'C'].includes(e.key)) ||
            (e.ctrlKey && e.key === 'U')
          ) {
            e.preventDefault();
            return false;
          }
        }
      });

      console.log('🔒 Dangerous features disabled for production');
    }
  } catch (error) {
    console.warn('🔒 Could not fully disable dangerous features:', error);
  }
}

function setupSecurityMonitoring() {
  if (typeof window === 'undefined') return;

  // Monitor for potential security issues
  let securityViolations = 0;

  // Detect potential XSS attempts in URLs
  const urlParams = new URLSearchParams(window.location.search);
  urlParams.forEach((value, key) => {
    if (containsSuspiciousContent(value) || containsSuspiciousContent(key)) {
      securityViolations++;
      console.warn('🚨 Suspicious URL parameter detected:', {
        key,
        value: value.substring(0, 50),
      });
    }
  });

  // Monitor hash changes for suspicious content
  window.addEventListener('hashchange', () => {
    if (containsSuspiciousContent(window.location.hash)) {
      securityViolations++;
      console.warn(
        '🚨 Suspicious hash detected:',
        window.location.hash.substring(0, 50),
      );
    }
  });

  // Monitor for suspicious postMessage events
  window.addEventListener('message', (event) => {
    if (
      typeof event.data === 'string' &&
      containsSuspiciousContent(event.data)
    ) {
      securityViolations++;
      console.warn('🚨 Suspicious postMessage detected:', {
        origin: event.origin,
        data: event.data.substring(0, 50),
      });
    }
  });

  // Set up performance observer for security timing
  if ('PerformanceObserver' in window) {
    try {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach((entry) => {
          // Monitor for unusually long script execution times
          if (entry.entryType === 'measure' && entry.duration > 5000) {
            console.warn(
              '🔒 Long-running script detected:',
              entry.name,
              entry.duration,
            );
          }
        });
      });

      observer.observe({ entryTypes: ['measure'] });
    } catch (error) {
      // Performance observer not supported or failed
      console.debug('🔒 Performance observer setup failed:', error);
    }
  }

  console.log('🔒 Security monitoring initialized');
}

function containsSuspiciousContent(content) {
  if (typeof content !== 'string') return false;

  const suspiciousPatterns = [
    /<script[^>]*>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,
    /expression\s*\(/gi,
    /vbscript:/gi,
    /<iframe[^>]*>/gi,
    /eval\s*\(/gi,
    /document\.write/gi,
    /innerHTML\s*=/gi,
    /\.appendChild/gi,
  ];

  return suspiciousPatterns.some((pattern) => pattern.test(content));
}

export default {
  initialize,
};
