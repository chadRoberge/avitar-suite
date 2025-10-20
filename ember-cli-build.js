'use strict';

const EmberApp = require('ember-cli/lib/broccoli/ember-app');

module.exports = function (defaults) {
  const isProduction = defaults.project.env === 'production';

  const app = new EmberApp(defaults, {
    emberData: {
      deprecations: {
        DEPRECATE_STORE_EXTENDS_EMBER_OBJECT: false,
      },
    },

    // Production build optimizations
    ...(isProduction && {
      // Minification and compression
      minifyCSS: {
        enabled: true,
        options: {
          level: 2, // Aggressive optimization
          compatibility: 'ie9',
        },
      },

      minifyJS: {
        enabled: true,
        options: {
          compress: {
            sequences: true,
            dead_code: true,
            conditionals: true,
            booleans: true,
            unused: true,
            if_return: true,
            join_vars: true,
            drop_console: true, // Remove console.* in production
          },
          mangle: {
            except: ['$', 'jQuery', 'Ember'], // Preserve important globals
          },
        },
      },

      // Asset optimization
      fingerprint: {
        enabled: true,
        generateAssetMap: true,
        extensions: ['js', 'css', 'png', 'jpg', 'gif', 'map', 'svg'],
        prepend: '', // Configure CDN URL if needed
      },

      // Source maps (disabled in production for smaller builds)
      sourcemaps: {
        enabled: false,
        extensions: ['js'],
      },

      // Bundle optimization
      SRI: {
        enabled: true, // Subresource Integrity
        runsIn: 'buildDev',
        crossOrigin: 'anonymous',
      },

      // Tree shaking and dead code elimination
      'ember-cli-terser': {
        enabled: true,
        hideBanner: true,
      },
    }),

    // Service Worker configuration
    'ember-service-worker': {
      enabled: true,
      registrationStrategy: 'default',
      versionStrategy: 'project-revision',
    },

    // Code splitting (if using ember-auto-import)
    autoImport: {
      webpack: {
        optimization: {
          splitChunks: isProduction
            ? {
                chunks: 'all',
                cacheGroups: {
                  vendor: {
                    test: /[\\/]node_modules[\\/]/,
                    name: 'vendors',
                    chunks: 'all',
                    priority: 10,
                  },
                  common: {
                    name: 'common',
                    minChunks: 2,
                    chunks: 'all',
                    priority: 5,
                  },
                },
              }
            : false,
        },
        ...(isProduction && {
          // Production webpack optimizations
          resolve: {
            alias: {
              // Use production builds of libraries
              handlebars: 'handlebars/dist/handlebars.min.js',
            },
          },
        }),
      },
    },

    // CSS optimization
    cssOptimization: {
      enabled: isProduction,
    },
  });

  // Production-only optimizations
  if (isProduction) {
    console.log('🚀 Building with production optimizations enabled');

    // Additional production plugins could be added here
    // Example: app.import() for production-specific assets
  }

  return app.toTree();
};
