import Service from '@ember/service';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { getCompressionStats } from '../utils/advanced-compression';

export default class PerformanceMonitorService extends Service {
  @service memoryManager;
  @service indexedDb;
  @service changeStream;
  @service incrementalSync;
  @service offlineManager;

  @tracked isMonitoring = false;
  @tracked startTime = null;

  // Performance metrics
  @tracked metrics = {
    // Core Web Vitals
    fcp: null, // First Contentful Paint
    lcp: null, // Largest Contentful Paint
    fid: null, // First Input Delay
    cls: null, // Cumulative Layout Shift
    ttfb: null, // Time to First Byte

    // Custom metrics
    appLoad: null,
    routeTransitions: [],
    apiRequests: [],
    dbOperations: [],
    syncOperations: [],
    compressionMetrics: null,

    // Resource metrics
    memoryUsage: null,
    storageUsage: null,
    networkQuality: null,

    // Error tracking
    errors: [],
    warnings: [],
  };

  // Performance budgets
  @tracked budgets = {
    fcp: 1800, // 1.8s
    lcp: 2500, // 2.5s
    fid: 100, // 100ms
    cls: 0.1, // 0.1
    ttfb: 600, // 600ms
    apiResponse: 1000, // 1s
    dbQuery: 50, // 50ms
    routeTransition: 500, // 500ms
    syncLatency: 2000, // 2s
  };

  // Performance observers
  observers = new Map();
  intervalTimers = [];

  constructor() {
    super(...arguments);

    this.initializeMonitoring();
  }

  // === INITIALIZATION ===

  async initializeMonitoring() {
    try {
      this.isMonitoring = true;
      this.startTime = performance.now();

      // Setup Web Vitals monitoring
      this.setupWebVitalsMonitoring();

      // Setup custom performance monitoring
      this.setupCustomMonitoring();

      // Setup periodic metric collection
      this.setupPeriodicCollection();

      // Setup error monitoring
      this.setupErrorMonitoring();

      console.log('📊 Performance monitoring initialized');
    } catch (error) {
      console.error('Failed to initialize performance monitoring:', error);
    }
  }

  // === WEB VITALS MONITORING ===

  setupWebVitalsMonitoring() {
    // First Contentful Paint
    if ('PerformanceObserver' in window) {
      try {
        const fcpObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.name === 'first-contentful-paint') {
              this.recordMetric('fcp', entry.startTime, {
                exceedsBudget: entry.startTime > this.budgets.fcp,
              });
            }
          }
        });
        fcpObserver.observe({ entryTypes: ['paint'] });
        this.observers.set('fcp', fcpObserver);
      } catch (error) {
        console.warn('FCP monitoring not available:', error);
      }

      // Largest Contentful Paint
      try {
        const lcpObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const lastEntry = entries[entries.length - 1];
          this.recordMetric('lcp', lastEntry.startTime, {
            exceedsBudget: lastEntry.startTime > this.budgets.lcp,
            element: lastEntry.element?.tagName,
          });
        });
        lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
        this.observers.set('lcp', lcpObserver);
      } catch (error) {
        console.warn('LCP monitoring not available:', error);
      }

      // First Input Delay
      try {
        const fidObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            this.recordMetric('fid', entry.processingStart - entry.startTime, {
              exceedsBudget:
                entry.processingStart - entry.startTime > this.budgets.fid,
              inputType: entry.name,
            });
          }
        });
        fidObserver.observe({ entryTypes: ['first-input'] });
        this.observers.set('fid', fidObserver);
      } catch (error) {
        console.warn('FID monitoring not available:', error);
      }

      // Cumulative Layout Shift
      try {
        let clsValue = 0;
        const clsObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (!entry.hadRecentInput) {
              clsValue += entry.value;
              this.recordMetric('cls', clsValue, {
                exceedsBudget: clsValue > this.budgets.cls,
              });
            }
          }
        });
        clsObserver.observe({ entryTypes: ['layout-shift'] });
        this.observers.set('cls', clsObserver);
      } catch (error) {
        console.warn('CLS monitoring not available:', error);
      }

      // Navigation timing
      try {
        const navObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            this.recordMetric(
              'ttfb',
              entry.responseStart - entry.requestStart,
              {
                exceedsBudget:
                  entry.responseStart - entry.requestStart > this.budgets.ttfb,
              },
            );

            this.recordMetric(
              'appLoad',
              entry.loadEventEnd - entry.navigationStart,
              {
                domContentLoaded:
                  entry.domContentLoadedEventEnd - entry.navigationStart,
                interactive: entry.domInteractive - entry.navigationStart,
              },
            );
          }
        });
        navObserver.observe({ entryTypes: ['navigation'] });
        this.observers.set('navigation', navObserver);
      } catch (error) {
        console.warn('Navigation timing monitoring not available:', error);
      }
    }
  }

  // === CUSTOM MONITORING ===

  setupCustomMonitoring() {
    // Monitor route transitions
    this.monitorRouteTransitions();

    // Monitor API requests
    this.monitorApiRequests();

    // Monitor database operations
    this.monitorDatabaseOperations();

    // Monitor sync operations
    this.monitorSyncOperations();
  }

  monitorRouteTransitions() {
    // Listen for Ember route transitions
    window.addEventListener('route-transition-start', (event) => {
      const transition = {
        id: this.generateId(),
        from: event.detail.from,
        to: event.detail.to,
        startTime: performance.now(),
        endTime: null,
        duration: null,
      };

      this.metrics.routeTransitions.push(transition);
    });

    window.addEventListener('route-transition-end', (event) => {
      const transition = this.metrics.routeTransitions.find(
        (t) => t.to === event.detail.to && !t.endTime,
      );

      if (transition) {
        transition.endTime = performance.now();
        transition.duration = transition.endTime - transition.startTime;
        transition.exceedsBudget =
          transition.duration > this.budgets.routeTransition;

        this.checkPerformanceBudget('routeTransition', transition.duration);
      }
    });
  }

  monitorApiRequests() {
    // Intercept fetch requests
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const startTime = performance.now();
      const url = typeof args[0] === 'string' ? args[0] : args[0].url;

      try {
        const response = await originalFetch(...args);
        const endTime = performance.now();
        const duration = endTime - startTime;

        this.recordApiRequest({
          url,
          method: args[1]?.method || 'GET',
          status: response.status,
          duration,
          success: response.ok,
          exceedsBudget: duration > this.budgets.apiResponse,
          timestamp: new Date(),
        });

        return response;
      } catch (error) {
        const endTime = performance.now();
        const duration = endTime - startTime;

        this.recordApiRequest({
          url,
          method: args[1]?.method || 'GET',
          status: 0,
          duration,
          success: false,
          error: error.message,
          timestamp: new Date(),
        });

        throw error;
      }
    };
  }

  monitorDatabaseOperations() {
    // Monitor IndexedDB operations
    if (this.indexedDb.db) {
      const originalTransaction = this.indexedDb.db.transaction;
      this.indexedDb.db.transaction = function (...args) {
        const startTime = performance.now();
        const transaction = originalTransaction.apply(this, args);

        transaction.addEventListener('complete', () => {
          const duration = performance.now() - startTime;
          this.recordDbOperation({
            type: 'transaction',
            stores: args[0],
            mode: args[1] || 'readonly',
            duration,
            success: true,
            exceedsBudget: duration > this.budgets.dbQuery,
            timestamp: new Date(),
          });
        });

        transaction.addEventListener('error', (event) => {
          const duration = performance.now() - startTime;
          this.recordDbOperation({
            type: 'transaction',
            stores: args[0],
            mode: args[1] || 'readonly',
            duration,
            success: false,
            error: event.target.error?.message,
            timestamp: new Date(),
          });
        });

        return transaction;
      }.bind(this);
    }
  }

  monitorSyncOperations() {
    // Monitor sync operations
    window.addEventListener('sync-operation-start', (event) => {
      const operation = {
        id: event.detail.id || this.generateId(),
        type: event.detail.type,
        collection: event.detail.collection,
        startTime: performance.now(),
        endTime: null,
        duration: null,
      };

      this.metrics.syncOperations.push(operation);
    });

    window.addEventListener('sync-operation-end', (event) => {
      const operation = this.metrics.syncOperations.find(
        (op) => op.id === event.detail.id && !op.endTime,
      );

      if (operation) {
        operation.endTime = performance.now();
        operation.duration = operation.endTime - operation.startTime;
        operation.success = event.detail.success;
        operation.error = event.detail.error;
        operation.exceedsBudget = operation.duration > this.budgets.syncLatency;

        this.checkPerformanceBudget('syncLatency', operation.duration);
      }
    });
  }

  // === PERIODIC COLLECTION ===

  setupPeriodicCollection() {
    // Collect comprehensive metrics every 30 seconds
    const metricsTimer = setInterval(() => {
      this.collectPeriodicMetrics();
    }, 30000);

    this.intervalTimers.push(metricsTimer);

    // Collect lightweight metrics every 5 seconds
    const lightweightTimer = setInterval(() => {
      this.collectLightweightMetrics();
    }, 5000);

    this.intervalTimers.push(lightweightTimer);
  }

  async collectPeriodicMetrics() {
    try {
      // Memory and storage metrics
      this.metrics.memoryUsage = await this.memoryManager.getMemoryStatus();

      // Compression metrics
      this.metrics.compressionMetrics = getCompressionStats();

      // Network quality
      this.metrics.networkQuality =
        this.offlineManager.getConnectionQualityMessage();

      // Sync status
      if (this.incrementalSync) {
        this.metrics.syncStatus =
          await this.incrementalSync.getPendingSyncStats();
      }

      // Change stream status
      if (this.changeStream) {
        this.metrics.changeStreamStatus = this.changeStream.status;
      }
    } catch (error) {
      console.error('Failed to collect periodic metrics:', error);
    }
  }

  collectLightweightMetrics() {
    // Quick performance checks
    if ('memory' in performance) {
      this.metrics.currentMemory = {
        used: performance.memory.usedJSHeapSize,
        total: performance.memory.totalJSHeapSize,
        limit: performance.memory.jsHeapSizeLimit,
        timestamp: new Date(),
      };
    }
  }

  // === ERROR MONITORING ===

  setupErrorMonitoring() {
    // Global error handler
    window.addEventListener('error', (event) => {
      this.recordError({
        type: 'javascript',
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        stack: event.error?.stack,
        timestamp: new Date(),
        url: window.location.href,
      });
    });

    // Unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.recordError({
        type: 'promise',
        message: event.reason?.message || 'Unhandled promise rejection',
        reason: event.reason,
        timestamp: new Date(),
        url: window.location.href,
      });
    });

    // Console warnings
    const originalWarn = console.warn;
    console.warn = (...args) => {
      this.recordWarning({
        message: args.join(' '),
        timestamp: new Date(),
        url: window.location.href,
      });
      originalWarn.apply(console, args);
    };
  }

  // === METRIC RECORDING ===

  recordMetric(name, value, metadata = {}) {
    this.metrics[name] = {
      value,
      timestamp: new Date(),
      ...metadata,
    };

    this.checkPerformanceBudget(name, value);
  }

  recordApiRequest(request) {
    this.metrics.apiRequests.push(request);

    // Keep only last 100 requests
    if (this.metrics.apiRequests.length > 100) {
      this.metrics.apiRequests.shift();
    }
  }

  recordDbOperation(operation) {
    this.metrics.dbOperations.push(operation);

    // Keep only last 50 operations
    if (this.metrics.dbOperations.length > 50) {
      this.metrics.dbOperations.shift();
    }
  }

  recordError(error) {
    this.metrics.errors.push(error);

    // Keep only last 20 errors
    if (this.metrics.errors.length > 20) {
      this.metrics.errors.shift();
    }

    console.error('Performance Monitor - Error recorded:', error);
  }

  recordWarning(warning) {
    this.metrics.warnings.push(warning);

    // Keep only last 50 warnings
    if (this.metrics.warnings.length > 50) {
      this.metrics.warnings.shift();
    }
  }

  // === PERFORMANCE BUDGETS ===

  checkPerformanceBudget(metric, value) {
    const budget = this.budgets[metric];
    if (budget && value > budget) {
      console.warn(
        `⚠️ Performance budget exceeded for ${metric}: ${value}ms > ${budget}ms`,
      );

      // Dispatch budget violation event
      window.dispatchEvent(
        new CustomEvent('performance-budget-exceeded', {
          detail: {
            metric,
            value,
            budget,
            timestamp: new Date(),
          },
        }),
      );
    }
  }

  updateBudgets(newBudgets) {
    this.budgets = { ...this.budgets, ...newBudgets };
    console.log('📊 Performance budgets updated');
  }

  // === ANALYTICS ===

  getPerformanceReport() {
    const now = new Date();
    const uptime = performance.now() - (this.startTime || 0);

    return {
      timestamp: now,
      uptime,
      coreWebVitals: {
        fcp: this.metrics.fcp,
        lcp: this.metrics.lcp,
        fid: this.metrics.fid,
        cls: this.metrics.cls,
        ttfb: this.metrics.ttfb,
      },
      customMetrics: {
        appLoad: this.metrics.appLoad,
        averageRouteTransition: this.getAverageMetric(
          'routeTransitions',
          'duration',
        ),
        averageApiResponse: this.getAverageMetric('apiRequests', 'duration'),
        averageDbOperation: this.getAverageMetric('dbOperations', 'duration'),
        averageSyncOperation: this.getAverageMetric(
          'syncOperations',
          'duration',
        ),
      },
      resourceMetrics: {
        memory: this.metrics.memoryUsage,
        storage: this.metrics.memoryUsage?.storage,
        compression: this.metrics.compressionMetrics,
      },
      errorMetrics: {
        totalErrors: this.metrics.errors.length,
        totalWarnings: this.metrics.warnings.length,
        recentErrors: this.metrics.errors.slice(-5),
        errorRate: this.calculateErrorRate(),
      },
      budgetViolations: this.getBudgetViolations(),
    };
  }

  getAverageMetric(collection, property) {
    const items = this.metrics[collection] || [];
    if (items.length === 0) return null;

    const sum = items.reduce((acc, item) => acc + (item[property] || 0), 0);
    return sum / items.length;
  }

  calculateErrorRate() {
    const totalRequests = this.metrics.apiRequests.length;
    const failedRequests = this.metrics.apiRequests.filter(
      (r) => !r.success,
    ).length;

    return totalRequests > 0 ? (failedRequests / totalRequests) * 100 : 0;
  }

  getBudgetViolations() {
    const violations = [];

    Object.entries(this.budgets).forEach(([metric, budget]) => {
      const current = this.metrics[metric];
      if (current && current.value > budget) {
        violations.push({
          metric,
          current: current.value,
          budget,
          exceedsBy: current.value - budget,
          timestamp: current.timestamp,
        });
      }
    });

    return violations;
  }

  // === PERFORMANCE INSIGHTS ===

  getPerformanceInsights() {
    const insights = [];

    // Memory insights
    if (this.metrics.memoryUsage?.memory?.percentage > 80) {
      insights.push({
        type: 'memory',
        severity: 'high',
        message: 'High memory usage detected',
        recommendation: 'Consider triggering aggressive cleanup',
        value: this.metrics.memoryUsage.memory.percentage,
      });
    }

    // API performance insights
    const slowApiRequests = this.metrics.apiRequests.filter(
      (r) => r.duration > this.budgets.apiResponse,
    );
    if (slowApiRequests.length > 0) {
      insights.push({
        type: 'api',
        severity: 'medium',
        message: `${slowApiRequests.length} slow API requests detected`,
        recommendation: 'Consider implementing request optimization or caching',
        value: slowApiRequests.length,
      });
    }

    // Database insights
    const slowDbOps = this.metrics.dbOperations.filter(
      (op) => op.duration > this.budgets.dbQuery,
    );
    if (slowDbOps.length > 0) {
      insights.push({
        type: 'database',
        severity: 'medium',
        message: `${slowDbOps.length} slow database operations detected`,
        recommendation:
          'Consider adding database indexes or optimizing queries',
        value: slowDbOps.length,
      });
    }

    // Error insights
    if (this.metrics.errors.length > 5) {
      insights.push({
        type: 'errors',
        severity: 'high',
        message: 'High error rate detected',
        recommendation: 'Review recent errors and implement fixes',
        value: this.metrics.errors.length,
      });
    }

    return insights;
  }

  // === UTILITY METHODS ===

  generateId() {
    return 'perf-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  }

  exportMetrics() {
    const report = this.getPerformanceReport();
    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `performance-report-${new Date().toISOString()}.json`;
    a.click();

    URL.revokeObjectURL(url);
  }

  clearMetrics() {
    this.metrics.routeTransitions = [];
    this.metrics.apiRequests = [];
    this.metrics.dbOperations = [];
    this.metrics.syncOperations = [];
    this.metrics.errors = [];
    this.metrics.warnings = [];

    console.log('📊 Performance metrics cleared');
  }

  // === PUBLIC API ===

  startMonitoring() {
    if (!this.isMonitoring) {
      this.initializeMonitoring();
    }
  }

  stopMonitoring() {
    this.isMonitoring = false;

    // Clear observers
    this.observers.forEach((observer) => observer.disconnect());
    this.observers.clear();

    // Clear intervals
    this.intervalTimers.forEach((timer) => clearInterval(timer));
    this.intervalTimers = [];

    console.log('📊 Performance monitoring stopped');
  }

  getMetrics() {
    return this.metrics;
  }

  getBudgets() {
    return this.budgets;
  }

  // === CLEANUP ===

  willDestroy() {
    super.willDestroy();
    this.stopMonitoring();
    console.log('📊 Performance monitor destroyed');
  }
}
