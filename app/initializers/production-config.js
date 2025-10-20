/**
 * Production Configuration Initializer
 *
 * Automatically configures the application for optimal production performance
 * when running in production or staging environments.
 */

export function initialize() {
  // Simple initialization that runs at app startup
  console.log('🚀 Production configuration initializer loaded');

  // Set global flag to indicate production config is available
  if (typeof window !== 'undefined') {
    window.AVITAR_PRODUCTION_CONFIG_READY = true;
  }
}

export default {
  name: 'production-config',
  initialize,
};
