import Service from '@ember/service';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

/**
 * Production Configuration Service
 *
 * Centralizes production optimization settings and automatically configures
 * all services for optimal production performance.
 */

export default class ProductionConfigService extends Service {
  @service('memory-manager') memoryManager;
  @service('performance-monitor') performanceMonitor;
  @service('data-preloader') dataPreloader;
  @service('security-hardening') securityHardening;

  @tracked isProductionMode = false;
  @tracked configurationApplied = false;
  @tracked optimizationLevel = 'balanced'; // conservative, balanced, aggressive

  // Production configuration profiles
  productionProfiles = {
    conservative: {
      description: 'Minimal optimizations for maximum stability',
      settings: {
        compression: {
          enabled: true,
          level: 3,
          threshold: 2048, // 2KB
        },
        caching: {
          maxAge: 24 * 60 * 60 * 1000, // 24 hours
          maxEntries: 500,
          enablePrefetch: false,
        },
        performance: {
          budgets: {
            lcp: 3000, // 3s
            fid: 200, // 200ms
            cls: 0.2,
          },
          monitoring: {
            enabled: true,
            sampleRate: 0.05, // 5%
          },
        },
        memory: {
          cleanupInterval: 30 * 60 * 1000, // 30 minutes
          maxMemoryUsage: 100 * 1024 * 1024, // 100MB
          aggressiveCleanup: false,
        },
        preloading: {
          enabled: false,
          maxConcurrent: 2,
          prefetchProbability: 0.5,
        },
        security: {
          level: 'medium',
          enableCSPMonitoring: true,
          enableXSSProtection: true,
          enableInputSanitization: true,
          enableSecureHeaders: true,
          enableThreatDetection: false,
        },
      },
    },

    balanced: {
      description: 'Optimized balance between performance and stability',
      settings: {
        compression: {
          enabled: true,
          level: 5,
          threshold: 1024, // 1KB
        },
        caching: {
          maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
          maxEntries: 1000,
          enablePrefetch: true,
        },
        performance: {
          budgets: {
            lcp: 2500, // 2.5s
            fid: 100, // 100ms
            cls: 0.1,
          },
          monitoring: {
            enabled: true,
            sampleRate: 0.1, // 10%
          },
        },
        memory: {
          cleanupInterval: 15 * 60 * 1000, // 15 minutes
          maxMemoryUsage: 150 * 1024 * 1024, // 150MB
          aggressiveCleanup: true,
        },
        preloading: {
          enabled: true,
          maxConcurrent: 3,
          prefetchProbability: 0.7,
        },
        security: {
          level: 'high',
          enableCSPMonitoring: true,
          enableXSSProtection: true,
          enableInputSanitization: true,
          enableSecureHeaders: true,
          enableThreatDetection: true,
        },
      },
    },

    aggressive: {
      description: 'Maximum optimizations for high-performance environments',
      settings: {
        compression: {
          enabled: true,
          level: 9,
          threshold: 512, // 512B
        },
        caching: {
          maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
          maxEntries: 2000,
          enablePrefetch: true,
        },
        performance: {
          budgets: {
            lcp: 2000, // 2s
            fid: 50, // 50ms
            cls: 0.05,
          },
          monitoring: {
            enabled: true,
            sampleRate: 0.2, // 20%
          },
        },
        memory: {
          cleanupInterval: 5 * 60 * 1000, // 5 minutes
          maxMemoryUsage: 200 * 1024 * 1024, // 200MB
          aggressiveCleanup: true,
        },
        preloading: {
          enabled: true,
          maxConcurrent: 5,
          prefetchProbability: 0.9,
        },
        security: {
          level: 'maximum',
          enableCSPMonitoring: true,
          enableXSSProtection: true,
          enableInputSanitization: true,
          enableSecureHeaders: true,
          enableThreatDetection: true,
          enableAdvancedThreatDetection: true,
          enableSecurityAuditing: true,
        },
      },
    },
  };

  // Environment detection
  get environment() {
    if (typeof window !== 'undefined') {
      // Check for production indicators
      const hostname = window.location.hostname;
      const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
      const hasDevTools = window.__EMBER_DEVTOOLS_EXTENSIONS__ !== undefined;
      const isEmberDev = window.ENV?.environment === 'development';

      if (!isLocalhost && !hasDevTools && !isEmberDev) {
        return 'production';
      }

      if (hostname.includes('staging') || hostname.includes('test')) {
        return 'staging';
      }
    }

    return 'development';
  }

  get currentProfile() {
    return this.productionProfiles[this.optimizationLevel];
  }

  init() {
    super.init();

    // Auto-detect and configure environment when service is initialized
    this.detectAndConfigureEnvironment();
  }

  detectAndConfigureEnvironment() {
    const env = this.environment;
    this.isProductionMode = env === 'production' || env === 'staging';

    if (this.isProductionMode && !this.configurationApplied) {
      // Auto-apply balanced profile for production
      this.optimizationLevel = 'balanced';
      this.applyProductionConfiguration();
    }

    console.log('Production Config initialized:', {
      environment: env,
      isProduction: this.isProductionMode,
      profile: this.optimizationLevel,
    });
  }

  setOptimizationLevel(level) {
    if (!this.productionProfiles[level]) {
      throw new Error(`Invalid optimization level: ${level}`);
    }

    this.optimizationLevel = level;
    this.applyProductionConfiguration();
  }

  async applyProductionConfiguration() {
    const profile = this.currentProfile;
    console.log(
      `Applying ${this.optimizationLevel} production configuration...`,
    );

    try {
      // Configure Performance Monitor
      if (this.performanceMonitor) {
        await this.configurePerformanceMonitor(profile.settings.performance);
      }

      // Configure Memory Manager
      if (this.memoryManager) {
        await this.configureMemoryManager(profile.settings.memory);
      }

      // Configure Data Preloader
      if (this.dataPreloader) {
        await this.configureDataPreloader(profile.settings.preloading);
      }

      // Configure Security Hardening
      if (this.securityHardening) {
        await this.configureSecurityHardening(profile.settings.security);
      }

      // Configure Service Worker cache settings
      await this.configureServiceWorkerCache(profile.settings.caching);

      // Set compression configuration globally
      await this.configureCompression(profile.settings.compression);

      this.configurationApplied = true;

      console.log('Production configuration applied successfully:', {
        profile: this.optimizationLevel,
        settings: profile.settings,
      });

      // Report configuration status
      this.reportConfigurationStatus();
    } catch (error) {
      console.error('Failed to apply production configuration:', error);
      throw error;
    }
  }

  async configurePerformanceMonitor(settings) {
    if (!this.performanceMonitor) return;

    // Update performance budgets
    this.performanceMonitor.budgets = settings.budgets;

    // Configure monitoring
    this.performanceMonitor.config.enabled = settings.monitoring.enabled;
    this.performanceMonitor.config.sampleRate = settings.monitoring.sampleRate;

    // Start monitoring if enabled
    if (settings.monitoring.enabled) {
      this.performanceMonitor.startMonitoring();
    }

    console.log('Performance monitor configured:', settings);
  }

  async configureMemoryManager(settings) {
    if (!this.memoryManager) return;

    // Update memory management settings
    this.memoryManager.config.cleanupInterval = settings.cleanupInterval;
    this.memoryManager.config.maxMemoryUsage = settings.maxMemoryUsage;
    this.memoryManager.config.enableAggressiveCleanup =
      settings.aggressiveCleanup;

    // Start memory monitoring
    this.memoryManager.startMemoryMonitoring();

    console.log('Memory manager configured:', settings);
  }

  async configureDataPreloader(settings) {
    if (!this.dataPreloader) return;

    // Update preloading settings
    this.dataPreloader.config.enabled = settings.enabled;
    this.dataPreloader.config.maxConcurrentPreloads = settings.maxConcurrent;
    this.dataPreloader.config.prefetchProbability =
      settings.prefetchProbability;

    if (settings.enabled) {
      // Start predictive preloading
      this.dataPreloader.startPredictivePreloading();
    }

    console.log('Data preloader configured:', settings);
  }

  async configureSecurityHardening(settings) {
    if (!this.securityHardening) return;

    // Set security level
    this.securityHardening.setSecurityLevel(settings.level);

    console.log('Security hardening configured:', settings);
  }

  async configureServiceWorkerCache(settings) {
    if (!('serviceWorker' in navigator)) return;

    try {
      const registration = await navigator.serviceWorker.ready;
      const sw = registration.active;

      if (sw) {
        // Send cache configuration to service worker
        const messageChannel = new MessageChannel();

        return new Promise((resolve) => {
          messageChannel.port1.onmessage = (event) => {
            console.log('Service worker cache configured:', event.data);
            resolve(event.data);
          };

          sw.postMessage(
            {
              type: 'CONFIGURE_CACHE',
              data: settings,
            },
            [messageChannel.port2],
          );
        });
      }
    } catch (error) {
      console.warn('Failed to configure service worker cache:', error);
    }
  }

  async configureCompression(settings) {
    // Store compression settings globally for other services to use
    if (typeof window !== 'undefined') {
      window.AVITAR_COMPRESSION_CONFIG = settings;
    }

    console.log('Compression configured:', settings);
  }

  getConfigurationStatus() {
    return {
      environment: this.environment,
      isProductionMode: this.isProductionMode,
      optimizationLevel: this.optimizationLevel,
      configurationApplied: this.configurationApplied,
      profile: this.currentProfile,
    };
  }

  reportConfigurationStatus() {
    const status = this.getConfigurationStatus();

    // Log comprehensive status
    console.group('🚀 Production Configuration Status');
    console.log('Environment:', status.environment);
    console.log('Production Mode:', status.isProductionMode);
    console.log('Optimization Level:', status.optimizationLevel);
    console.log('Configuration Applied:', status.configurationApplied);
    console.table(status.profile.settings);
    console.groupEnd();

    // Send to performance monitor if available
    if (this.performanceMonitor) {
      this.performanceMonitor.recordCustomMetric(
        'production_config_applied',
        1,
        {
          level: status.optimizationLevel,
          environment: status.environment,
        },
      );
    }
  }

  async validateConfiguration() {
    const issues = [];

    // Check service availability
    if (!this.memoryManager) {
      issues.push('Memory Manager service not available');
    }

    if (!this.performanceMonitor) {
      issues.push('Performance Monitor service not available');
    }

    if (!this.dataPreloader) {
      issues.push('Data Preloader service not available');
    }

    // Check service worker
    if (!('serviceWorker' in navigator)) {
      issues.push('Service Worker not supported');
    }

    // Check for required browser APIs
    if (!('performance' in window)) {
      issues.push('Performance API not available');
    }

    if (!('storage' in navigator)) {
      issues.push('Storage API not available');
    }

    if (issues.length > 0) {
      console.warn('Configuration validation issues:', issues);
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  async optimizeForCurrentDevice() {
    try {
      // Detect device capabilities
      const deviceInfo = await this.getDeviceCapabilities();

      // Adjust optimization level based on device
      let recommendedLevel = 'balanced';

      if (deviceInfo.isLowEnd) {
        recommendedLevel = 'conservative';
      } else if (deviceInfo.isHighEnd) {
        recommendedLevel = 'aggressive';
      }

      console.log('Device-optimized configuration:', {
        device: deviceInfo,
        recommended: recommendedLevel,
      });

      // Apply if in production
      if (this.isProductionMode) {
        this.setOptimizationLevel(recommendedLevel);
      }

      return recommendedLevel;
    } catch (error) {
      console.warn('Device optimization failed:', error);
      return this.optimizationLevel;
    }
  }

  async getDeviceCapabilities() {
    const info = {
      memory: navigator.deviceMemory || 4, // GB
      cores: navigator.hardwareConcurrency || 4,
      connection: null,
      isLowEnd: false,
      isHighEnd: false,
    };

    // Check network connection
    if ('connection' in navigator) {
      info.connection = {
        effectiveType: navigator.connection.effectiveType,
        saveData: navigator.connection.saveData,
      };
    }

    // Classify device
    info.isLowEnd = info.memory <= 2 || info.cores <= 2;
    info.isHighEnd = info.memory >= 8 && info.cores >= 8;

    return info;
  }

  getMetrics() {
    return {
      configuration: this.getConfigurationStatus(),
      applied: this.configurationApplied,
      profile: this.currentProfile?.description,
      environment: this.environment,
    };
  }
}
