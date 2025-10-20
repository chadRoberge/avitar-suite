import Service from '@ember/service';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

/**
 * Error Recovery Service
 *
 * Provides comprehensive error handling, recovery mechanisms, and graceful degradation
 * for various types of application failures including network errors, data corruption,
 * memory issues, and service worker failures.
 */

export default class ErrorRecoveryService extends Service {
  @service memoryManager;
  @service performanceMonitor;
  @service dataPreloader;

  @tracked isRecoveryMode = false;
  @tracked lastError = null;
  @tracked recoveryAttempts = 0;
  @tracked errorHistory = [];

  // Recovery configuration
  config = {
    maxRetryAttempts: 3,
    retryDelayBase: 1000, // 1 second
    retryDelayMultiplier: 2, // Exponential backoff
    maxRetryDelay: 30000, // 30 seconds
    enableCircuitBreaker: true,
    circuitBreakerThreshold: 5, // Failures before circuit opens
    circuitBreakerTimeout: 60000, // 1 minute
    enableGracefulDegradation: true,
    errorReportingEnabled: true,
    offlineGracePeriod: 30000, // 30 seconds
  };

  // Circuit breaker states for different services
  circuitBreakers = {
    api: { state: 'closed', failures: 0, lastFailure: null },
    cache: { state: 'closed', failures: 0, lastFailure: null },
    indexedDB: { state: 'closed', failures: 0, lastFailure: null },
    serviceWorker: { state: 'closed', failures: 0, lastFailure: null },
  };

  // Error types and their recovery strategies
  errorStrategies = {
    NETWORK_ERROR: {
      retry: true,
      gracefulDegradation: true,
      fallbackToCache: true,
      notifyUser: true,
    },
    API_ERROR: {
      retry: true,
      gracefulDegradation: true,
      fallbackToCache: true,
      notifyUser: false,
    },
    CACHE_ERROR: {
      retry: true,
      gracefulDegradation: true,
      clearCache: true,
      notifyUser: false,
    },
    MEMORY_ERROR: {
      retry: false,
      gracefulDegradation: true,
      clearCache: true,
      forceCleanup: true,
      notifyUser: true,
    },
    INDEXEDDB_ERROR: {
      retry: true,
      gracefulDegradation: true,
      clearDatabase: false, // Too destructive
      notifyUser: true,
    },
    SERVICE_WORKER_ERROR: {
      retry: true,
      gracefulDegradation: true,
      reregisterServiceWorker: true,
      notifyUser: false,
    },
    RENDER_ERROR: {
      retry: false,
      gracefulDegradation: true,
      fallbackComponent: true,
      notifyUser: true,
    },
    UNKNOWN_ERROR: {
      retry: true,
      gracefulDegradation: true,
      notifyUser: true,
    },
  };

  init() {
    super.init();
    this.setupGlobalErrorHandling();
    this.setupUnhandledRejectionHandling();
    this.setupServiceWorkerErrorHandling();
  }

  setupGlobalErrorHandling() {
    if (typeof window !== 'undefined') {
      // Global error handler
      window.addEventListener('error', (event) => {
        this.handleError({
          type: 'UNKNOWN_ERROR',
          message: event.message,
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          error: event.error,
          timestamp: Date.now(),
        });
      });

      // Global unhandled promise rejection handler
      window.addEventListener('unhandledrejection', (event) => {
        this.handleError({
          type: 'UNKNOWN_ERROR',
          message: 'Unhandled Promise Rejection',
          reason: event.reason,
          timestamp: Date.now(),
        });
      });
    }
  }

  setupUnhandledRejectionHandling() {
    // Add specific promise rejection handling for common cases
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      try {
        const response = await originalFetch(...args);
        if (!response.ok) {
          this.handleNetworkError(response, args[0]);
        }
        return response;
      } catch (error) {
        this.handleNetworkError(error, args[0]);
        throw error;
      }
    };
  }

  setupServiceWorkerErrorHandling() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('error', (event) => {
        this.handleError({
          type: 'SERVICE_WORKER_ERROR',
          message: 'Service Worker Error',
          error: event.error,
          timestamp: Date.now(),
        });
      });
    }
  }

  async handleError(errorInfo) {
    console.error('Error Recovery: Handling error', errorInfo);

    const errorType = this.classifyError(errorInfo);
    const strategy = this.errorStrategies[errorType];

    // Record error in history
    this.recordError(errorInfo, errorType);

    // Update circuit breaker if applicable
    this.updateCircuitBreaker(errorType, errorInfo);

    // Check if circuit breaker should prevent retry
    if (this.isCircuitOpen(errorType)) {
      console.warn(`Circuit breaker open for ${errorType}, skipping retry`);
      return this.handleGracefulDegradation(errorInfo, strategy);
    }

    try {
      // Attempt recovery based on strategy
      if (strategy.retry && this.shouldRetry(errorInfo)) {
        return await this.attemptRecovery(errorInfo, strategy);
      } else {
        return await this.handleGracefulDegradation(errorInfo, strategy);
      }
    } catch (recoveryError) {
      console.error('Error Recovery: Recovery attempt failed', recoveryError);
      return this.handleFinalFallback(errorInfo);
    }
  }

  classifyError(errorInfo) {
    if (errorInfo.type) {
      return errorInfo.type;
    }

    // Auto-classify based on error characteristics
    const message = errorInfo.message?.toLowerCase() || '';
    const error = errorInfo.error;

    if (message.includes('network') || message.includes('fetch')) {
      return 'NETWORK_ERROR';
    }

    if (message.includes('api') || errorInfo.status >= 400) {
      return 'API_ERROR';
    }

    if (message.includes('cache') || message.includes('storage')) {
      return 'CACHE_ERROR';
    }

    if (message.includes('memory') || error instanceof RangeError) {
      return 'MEMORY_ERROR';
    }

    if (message.includes('indexeddb') || message.includes('database')) {
      return 'INDEXEDDB_ERROR';
    }

    if (message.includes('service worker') || message.includes('sw.js')) {
      return 'SERVICE_WORKER_ERROR';
    }

    if (error instanceof TypeError && message.includes('render')) {
      return 'RENDER_ERROR';
    }

    return 'UNKNOWN_ERROR';
  }

  recordError(errorInfo, errorType) {
    const errorRecord = {
      ...errorInfo,
      type: errorType,
      id: Date.now() + Math.random(),
      userAgent: navigator.userAgent,
      url: window.location.href,
      timestamp: Date.now(),
    };

    this.errorHistory.push(errorRecord);

    // Keep only last 50 errors
    if (this.errorHistory.length > 50) {
      this.errorHistory = this.errorHistory.slice(-50);
    }

    this.lastError = errorRecord;

    // Report to performance monitor if available
    if (this.performanceMonitor) {
      this.performanceMonitor.recordCustomMetric('error_occurred', 1, {
        type: errorType,
        recoverable: this.errorStrategies[errorType]?.retry || false,
      });
    }
  }

  updateCircuitBreaker(errorType, errorInfo) {
    const service = this.getServiceFromErrorType(errorType);
    if (!service || !this.config.enableCircuitBreaker) return;

    const breaker = this.circuitBreakers[service];
    breaker.failures++;
    breaker.lastFailure = Date.now();

    if (breaker.failures >= this.config.circuitBreakerThreshold) {
      breaker.state = 'open';
      console.warn(
        `Circuit breaker opened for ${service} after ${breaker.failures} failures`,
      );

      // Auto-reset circuit breaker after timeout
      setTimeout(() => {
        breaker.state = 'half-open';
        console.log(`Circuit breaker half-opened for ${service}`);
      }, this.config.circuitBreakerTimeout);
    }
  }

  getServiceFromErrorType(errorType) {
    const serviceMap = {
      API_ERROR: 'api',
      NETWORK_ERROR: 'api',
      CACHE_ERROR: 'cache',
      INDEXEDDB_ERROR: 'indexedDB',
      SERVICE_WORKER_ERROR: 'serviceWorker',
    };
    return serviceMap[errorType];
  }

  isCircuitOpen(errorType) {
    const service = this.getServiceFromErrorType(errorType);
    if (!service) return false;

    const breaker = this.circuitBreakers[service];
    return breaker.state === 'open';
  }

  shouldRetry(errorInfo) {
    if (this.recoveryAttempts >= this.config.maxRetryAttempts) {
      return false;
    }

    // Don't retry certain critical errors
    if (errorInfo.error instanceof RangeError) {
      return false; // Memory errors
    }

    return true;
  }

  async attemptRecovery(errorInfo, strategy) {
    this.isRecoveryMode = true;
    this.recoveryAttempts++;

    console.log(
      `Error Recovery: Attempt ${this.recoveryAttempts}/${this.config.maxRetryAttempts}`,
    );

    // Calculate retry delay with exponential backoff
    const delay = Math.min(
      this.config.retryDelayBase *
        Math.pow(this.config.retryDelayMultiplier, this.recoveryAttempts - 1),
      this.config.maxRetryDelay,
    );

    await this.sleep(delay);

    try {
      // Specific recovery actions based on error type
      if (strategy.clearCache) {
        await this.clearCorruptedCache();
      }

      if (strategy.forceCleanup) {
        await this.forceMemoryCleanup();
      }

      if (strategy.reregisterServiceWorker) {
        await this.reregisterServiceWorker();
      }

      if (strategy.clearDatabase) {
        await this.clearCorruptedDatabase();
      }

      // Reset recovery state on success
      this.isRecoveryMode = false;
      this.recoveryAttempts = 0;

      console.log('Error Recovery: Recovery successful');
      return { success: true, method: 'recovery' };
    } catch (error) {
      console.error('Error Recovery: Recovery failed', error);

      if (this.recoveryAttempts < this.config.maxRetryAttempts) {
        // Try again
        return this.attemptRecovery(errorInfo, strategy);
      } else {
        // Max attempts reached, fall back to graceful degradation
        return this.handleGracefulDegradation(errorInfo, strategy);
      }
    }
  }

  async handleGracefulDegradation(errorInfo, strategy) {
    console.log('Error Recovery: Applying graceful degradation');

    const degradationResult = {
      success: true,
      method: 'degradation',
      limitations: [],
    };

    try {
      if (strategy.fallbackToCache) {
        await this.enableCacheFallback();
        degradationResult.limitations.push('offline_mode');
      }

      if (strategy.fallbackComponent) {
        this.enableFallbackComponents();
        degradationResult.limitations.push('limited_ui');
      }

      if (strategy.notifyUser) {
        this.notifyUserOfDegradation(errorInfo, degradationResult.limitations);
      }

      // Reset recovery state
      this.isRecoveryMode = false;
      this.recoveryAttempts = 0;

      return degradationResult;
    } catch (error) {
      console.error('Error Recovery: Graceful degradation failed', error);
      return this.handleFinalFallback(errorInfo);
    }
  }

  async handleFinalFallback(errorInfo) {
    console.error(
      'Error Recovery: All recovery methods failed, using final fallback',
    );

    // Last resort: minimal functionality
    try {
      // Clear all caches to start fresh
      await this.clearAllCaches();

      // Force memory cleanup
      await this.forceMemoryCleanup();

      // Notify user of critical error
      this.notifyUserOfCriticalError(errorInfo);

      return {
        success: false,
        method: 'final_fallback',
        limitations: ['critical_error', 'minimal_functionality'],
      };
    } catch (error) {
      console.error('Error Recovery: Final fallback failed', error);
      // At this point, we can only hope the page reload works
      if (
        confirm('A critical error occurred. Would you like to reload the page?')
      ) {
        window.location.reload();
      }
      return { success: false, method: 'user_reload_required' };
    }
  }

  async clearCorruptedCache() {
    console.log('Error Recovery: Clearing corrupted cache');

    try {
      // Clear browser caches
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map((name) => caches.delete(name)));
      }

      // Clear localStorage
      if (typeof Storage !== 'undefined') {
        localStorage.clear();
        sessionStorage.clear();
      }
    } catch (error) {
      console.warn('Error Recovery: Cache clearing failed', error);
    }
  }

  async forceMemoryCleanup() {
    console.log('Error Recovery: Forcing memory cleanup');

    if (this.memoryManager) {
      try {
        await this.memoryManager.performAggressiveCleanup();
      } catch (error) {
        console.warn('Error Recovery: Memory cleanup failed', error);
      }
    }

    // Force garbage collection if available
    if (window.gc) {
      window.gc();
    }
  }

  async reregisterServiceWorker() {
    console.log('Error Recovery: Re-registering service worker');

    if ('serviceWorker' in navigator) {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((reg) => reg.unregister()));

        // Re-register service worker
        await navigator.serviceWorker.register('/sw.js');
      } catch (error) {
        console.warn(
          'Error Recovery: Service worker re-registration failed',
          error,
        );
      }
    }
  }

  async clearCorruptedDatabase() {
    console.log('Error Recovery: Clearing corrupted database');

    // This is destructive and should be used carefully
    try {
      if (window.indexedDB) {
        // Only clear if explicitly needed and safe
        console.warn('Database clearing requested but skipped for safety');
      }
    } catch (error) {
      console.warn('Error Recovery: Database clearing failed', error);
    }
  }

  async enableCacheFallback() {
    console.log('Error Recovery: Enabling cache fallback mode');

    // Set application to offline mode
    if (typeof window !== 'undefined') {
      window.AVITAR_OFFLINE_MODE = true;
    }
  }

  enableFallbackComponents() {
    console.log('Error Recovery: Enabling fallback components');

    // Set global flag for fallback UI
    if (typeof window !== 'undefined') {
      window.AVITAR_FALLBACK_UI = true;
    }
  }

  notifyUserOfDegradation(errorInfo, limitations) {
    const limitationMessages = {
      offline_mode: 'Working offline with cached data',
      limited_ui: 'Some features temporarily unavailable',
      reduced_performance: 'Performance optimizations disabled',
    };

    const messages = limitations
      .map((l) => limitationMessages[l])
      .filter(Boolean);

    if (messages.length > 0) {
      console.log('Error Recovery: User notification:', messages.join(', '));
      // In a real app, this would show a toast or banner
    }
  }

  notifyUserOfCriticalError(errorInfo) {
    console.error('Error Recovery: Critical error notification');
    // In a real app, this would show a critical error dialog
  }

  async clearAllCaches() {
    await this.clearCorruptedCache();
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  handleNetworkError(responseOrError, url) {
    if (responseOrError instanceof Response) {
      this.handleError({
        type: 'API_ERROR',
        message: `API Error: ${responseOrError.status} ${responseOrError.statusText}`,
        status: responseOrError.status,
        url: url,
        timestamp: Date.now(),
      });
    } else {
      this.handleError({
        type: 'NETWORK_ERROR',
        message: 'Network request failed',
        error: responseOrError,
        url: url,
        timestamp: Date.now(),
      });
    }
  }

  getErrorSummary() {
    const now = Date.now();
    const recentErrors = this.errorHistory.filter(
      (e) => now - e.timestamp < 60000,
    ); // Last minute

    const errorsByType = recentErrors.reduce((acc, error) => {
      acc[error.type] = (acc[error.type] || 0) + 1;
      return acc;
    }, {});

    return {
      totalErrors: this.errorHistory.length,
      recentErrors: recentErrors.length,
      errorsByType,
      isRecoveryMode: this.isRecoveryMode,
      recoveryAttempts: this.recoveryAttempts,
      circuitBreakers: this.circuitBreakers,
      lastError: this.lastError,
    };
  }

  resetErrorHistory() {
    this.errorHistory = [];
    this.lastError = null;
    this.recoveryAttempts = 0;
    this.isRecoveryMode = false;

    // Reset circuit breakers
    Object.keys(this.circuitBreakers).forEach((service) => {
      this.circuitBreakers[service] = {
        state: 'closed',
        failures: 0,
        lastFailure: null,
      };
    });
  }
}
