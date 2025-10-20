'use strict';

module.exports = function (environment) {
  const ENV = {
    modulePrefix: 'avitar-suite',
    environment,
    rootURL: '/',
    locationType: 'history',
    EmberENV: {
      EXTEND_PROTOTYPES: false,
      FEATURES: {
        // Here you can enable experimental features on an ember canary build
        // e.g. EMBER_NATIVE_DECORATOR_SUPPORT: true
      },
    },

    APP: {
      // Here you can pass flags/options to your application instance
      // when it is created
      API_HOST: process.env.API_HOST || 'http://localhost:3000',
    },
  };

  if (environment === 'development') {
    // ENV.APP.LOG_RESOLVER = true;
    // ENV.APP.LOG_ACTIVE_GENERATION = true;
    // ENV.APP.LOG_TRANSITIONS = true;
    // ENV.APP.LOG_TRANSITIONS_INTERNAL = true;
    // ENV.APP.LOG_VIEW_LOOKUPS = true;
    // Development API configuration
    // Use relative URLs for Vercel, localhost for local development
    ENV.APP.API_HOST = process.env.VERCEL ? '' : 'http://localhost:3000';
  }

  if (environment === 'test') {
    // Testem prefers this...
    ENV.locationType = 'none';

    // keep test console output quieter
    ENV.APP.LOG_ACTIVE_GENERATION = false;
    ENV.APP.LOG_VIEW_LOOKUPS = false;

    ENV.APP.rootElement = '#ember-testing';
    ENV.APP.autoboot = false;
  }

  if (environment === 'production') {
    // Production API configuration
    ENV.APP.API_HOST =
      process.env.API_HOST || 'https://avitar-suite.vercel.app';

    // Production Performance Optimizations
    ENV.APP.PRODUCTION_CONFIG = {
      // Performance budgets (in milliseconds)
      performanceBudgets: {
        lcp: 2500, // Largest Contentful Paint
        fid: 100, // First Input Delay
        cls: 0.1, // Cumulative Layout Shift
        ttfb: 600, // Time to First Byte
      },

      // Compression settings
      compression: {
        enabled: true,
        level: 5, // Balanced compression
        threshold: 1024, // 1KB minimum
        algorithms: ['lz-string', 'gzip'],
      },

      // Cache configuration
      cache: {
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        maxEntries: 1000,
        enablePrefetch: true,
        enableServiceWorker: true,
      },

      // Memory management
      memory: {
        maxUsage: 150 * 1024 * 1024, // 150MB
        cleanupInterval: 15 * 60 * 1000, // 15 minutes
        aggressiveCleanup: true,
      },

      // Data preloading
      preloading: {
        enabled: true,
        maxConcurrent: 3,
        prefetchProbability: 0.7,
        predictivePreloading: true,
      },

      // Monitoring and analytics
      monitoring: {
        enabled: true,
        sampleRate: 0.1, // 10% sampling
        enableWebVitals: true,
        enableCustomMetrics: true,
        enableErrorTracking: true,
      },

      // Security settings
      security: {
        enableCSP: true,
        enableSRI: true,
        enableHSTS: true,
        enableSecureHeaders: true,
      },

      // Build optimizations
      build: {
        enableMinification: true,
        enableTreeShaking: true,
        enableCodeSplitting: true,
        enableAssetOptimization: true,
      },
    };

    // Disable debug features in production
    ENV.APP.LOG_ACTIVE_GENERATION = false;
    ENV.APP.LOG_VIEW_LOOKUPS = false;
    ENV.APP.LOG_RESOLVER = false;
    ENV.APP.LOG_TRANSITIONS = false;
    ENV.APP.LOG_TRANSITIONS_INTERNAL = false;
  }

  return ENV;
};
