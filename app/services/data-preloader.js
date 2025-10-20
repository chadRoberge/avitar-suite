import Service from '@ember/service';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class DataPreloaderService extends Service {
  @service hybridApi;
  @service indexedDb;
  @service offlineManager;
  @service memoryManager;
  @service performanceMonitor;

  @tracked isPreloading = false;
  @tracked preloadingProgress = {
    total: 0,
    completed: 0,
    failed: 0,
    percentage: 0,
  };

  @tracked preloadConfig = {
    enabled: true,
    batchSize: 10,
    concurrency: 3,
    delayBetweenBatches: 100, // ms
    maxRetries: 3,
    priorityCollections: ['municipalities', 'properties'],
    lowPriorityCollections: ['views', 'sketches'],
    preloadOnIdle: true,
    preloadOnGoodConnection: true,
    respectMemoryLimits: true,
    maxPreloadSize: 100 * 1024 * 1024, // 100MB
  };

  // Preloading strategies
  strategies = {
    IMMEDIATE: 'immediate',
    IDLE: 'idle',
    ON_DEMAND: 'on-demand',
    PREDICTIVE: 'predictive',
    USAGE_BASED: 'usage-based',
  };

  // Active preloading operations
  activeOperations = new Map();
  preloadQueue = [];
  usagePatterns = new Map();
  preloadHistory = [];

  constructor() {
    super(...arguments);

    this.initializePreloader();
    this.setupUsageTracking();
  }

  // === INITIALIZATION ===

  async initializePreloader() {
    try {
      // Load preload configuration from storage
      await this.loadConfiguration();

      // Setup idle preloading
      if (this.preloadConfig.preloadOnIdle) {
        this.setupIdlePreloading();
      }

      // Setup connection-based preloading
      if (this.preloadConfig.preloadOnGoodConnection) {
        this.setupConnectionBasedPreloading();
      }

      // Initialize predictive preloading
      this.initializePredictivePreloading();

      console.log('🚀 Data preloader initialized');
    } catch (error) {
      console.error('Failed to initialize data preloader:', error);
    }
  }

  async loadConfiguration() {
    try {
      const savedConfig = await this.indexedDb.getValue('preloader-config');
      if (savedConfig) {
        this.preloadConfig = { ...this.preloadConfig, ...savedConfig };
      }
    } catch (error) {
      console.warn('Failed to load preloader configuration:', error);
    }
  }

  // === PRELOADING STRATEGIES ===

  async preloadData(strategy = this.strategies.IMMEDIATE, options = {}) {
    if (!this.preloadConfig.enabled || this.isPreloading) {
      console.log('Preloading disabled or already in progress');
      return;
    }

    console.log(`🚀 Starting data preload with strategy: ${strategy}`);

    this.isPreloading = true;

    try {
      switch (strategy) {
        case this.strategies.IMMEDIATE:
          await this.immediatePreload(options);
          break;
        case this.strategies.IDLE:
          await this.idlePreload(options);
          break;
        case this.strategies.ON_DEMAND:
          await this.onDemandPreload(options);
          break;
        case this.strategies.PREDICTIVE:
          await this.predictivePreload(options);
          break;
        case this.strategies.USAGE_BASED:
          await this.usageBasedPreload(options);
          break;
        default:
          throw new Error(`Unknown preload strategy: ${strategy}`);
      }

      console.log('✅ Data preload completed successfully');
    } catch (error) {
      console.error('Data preload failed:', error);
    } finally {
      this.isPreloading = false;
    }
  }

  async immediatePreload(options = {}) {
    const { collections = this.preloadConfig.priorityCollections } = options;

    await this.preloadCollections(collections, {
      priority: 'high',
      respectLimits: false,
    });
  }

  async idlePreload(options = {}) {
    // Wait for browser idle time
    if ('requestIdleCallback' in window) {
      return new Promise((resolve) => {
        window.requestIdleCallback(async (deadline) => {
          const {
            collections = [
              ...this.preloadConfig.priorityCollections,
              ...this.preloadConfig.lowPriorityCollections,
            ],
          } = options;

          await this.preloadCollections(collections, {
            priority: 'low',
            respectLimits: true,
            deadline: deadline.timeRemaining(),
          });

          resolve();
        });
      });
    } else {
      // Fallback for browsers without requestIdleCallback
      await this.sleep(100);
      return this.immediatePreload(options);
    }
  }

  async onDemandPreload(options = {}) {
    const { collection, filters = {} } = options;

    if (!collection) {
      throw new Error('Collection is required for on-demand preload');
    }

    // Check if data is already cached
    const existingData = await this.indexedDb.getAll(collection, filters);

    if (existingData.length > 0) {
      console.log(`📦 Data already cached for ${collection}`);
      return existingData;
    }

    // Preload specific collection
    return await this.preloadCollections([collection], {
      priority: 'medium',
      filters,
    });
  }

  async predictivePreload(options = {}) {
    // Analyze usage patterns to predict what data to preload
    const predictions = this.analyzeUsagePatterns();

    for (const prediction of predictions) {
      if (prediction.confidence > 0.7) {
        // 70% confidence threshold
        await this.preloadCollections([prediction.collection], {
          priority: 'medium',
          filters: prediction.filters,
          reason: 'predictive',
        });
      }
    }
  }

  async usageBasedPreload(options = {}) {
    // Get most frequently accessed data
    const frequentlyUsed = this.getFrequentlyUsedData();

    for (const item of frequentlyUsed) {
      await this.preloadCollections([item.collection], {
        priority: 'medium',
        filters: item.filters,
        reason: 'usage-based',
      });
    }
  }

  // === COLLECTION PRELOADING ===

  async preloadCollections(collections, options = {}) {
    const {
      priority = 'medium',
      respectLimits = true,
      filters = {},
      deadline = null,
      reason = 'manual',
    } = options;

    const startTime = performance.now();
    let totalLoaded = 0;
    let totalFailed = 0;

    for (const collection of collections) {
      // Check memory limits
      if (respectLimits && (await this.shouldSkipDueToLimits())) {
        console.log(`⚠️ Skipping ${collection} preload due to resource limits`);
        continue;
      }

      // Check deadline for idle preloading
      if (deadline && performance.now() - startTime > deadline) {
        console.log(`⏰ Deadline reached, stopping preload at ${collection}`);
        break;
      }

      try {
        const result = await this.preloadCollection(
          collection,
          filters,
          priority,
        );
        totalLoaded += result.loaded;
        totalFailed += result.failed;

        // Update progress
        this.updateProgress(
          collections.indexOf(collection) + 1,
          collections.length,
        );

        // Respect batch delay
        if (this.preloadConfig.delayBetweenBatches > 0) {
          await this.sleep(this.preloadConfig.delayBetweenBatches);
        }
      } catch (error) {
        console.error(`Failed to preload ${collection}:`, error);
        totalFailed++;
      }
    }

    // Record preload operation
    this.recordPreloadOperation({
      collections,
      totalLoaded,
      totalFailed,
      duration: performance.now() - startTime,
      reason,
      priority,
    });

    return { totalLoaded, totalFailed };
  }

  async preloadCollection(collection, filters = {}, priority = 'medium') {
    const operationId = this.generateOperationId();

    try {
      console.log(`📦 Preloading ${collection}...`);

      // Track operation
      this.activeOperations.set(operationId, {
        collection,
        startTime: performance.now(),
        priority,
      });

      // Get data from API
      const endpoint = this.getCollectionEndpoint(collection);
      const data = await this.hybridApi.get(endpoint, {
        useCache: false, // Force fresh data for preloading
        strategy: 'network-first',
        collection,
      });

      // Process and cache data
      const processed = await this.processPreloadedData(collection, data);

      // Store in IndexedDB
      let loaded = 0;
      let failed = 0;

      if (Array.isArray(processed)) {
        // Batch insert for better performance
        const batches = this.createBatches(
          processed,
          this.preloadConfig.batchSize,
        );

        for (const batch of batches) {
          try {
            await this.indexedDb.db.transaction('rw', collection, async () => {
              for (const item of batch) {
                await this.indexedDb.db[collection].put(item);
                loaded++;
              }
            });
          } catch (error) {
            console.error(`Batch insert failed for ${collection}:`, error);
            failed += batch.length;
          }
        }
      } else {
        // Single item
        try {
          await this.indexedDb.add(collection, processed);
          loaded = 1;
        } catch (error) {
          failed = 1;
        }
      }

      console.log(
        `✅ Preloaded ${collection}: ${loaded} items loaded, ${failed} failed`,
      );

      return { loaded, failed };
    } catch (error) {
      console.error(`Failed to preload ${collection}:`, error);
      return { loaded: 0, failed: 1 };
    } finally {
      this.activeOperations.delete(operationId);
    }
  }

  // === USAGE TRACKING ===

  setupUsageTracking() {
    // Track route visits
    window.addEventListener('route-transition-end', (event) => {
      this.recordUsage('route', event.detail.to);
    });

    // Track data access
    this.interceptDataAccess();
  }

  interceptDataAccess() {
    // Track IndexedDB access
    const originalGet = this.indexedDb.get.bind(this.indexedDb);
    this.indexedDb.get = async (collection, id) => {
      this.recordUsage('data-access', `${collection}:${id}`);
      return await originalGet(collection, id);
    };

    const originalGetAll = this.indexedDb.getAll.bind(this.indexedDb);
    this.indexedDb.getAll = async (collection, filters) => {
      this.recordUsage('collection-access', collection);
      return await originalGetAll(collection, filters);
    };
  }

  recordUsage(type, identifier) {
    const key = `${type}:${identifier}`;
    const existing = this.usagePatterns.get(key) || {
      count: 0,
      lastAccessed: null,
      firstAccessed: null,
    };

    existing.count++;
    existing.lastAccessed = new Date();

    if (!existing.firstAccessed) {
      existing.firstAccessed = new Date();
    }

    this.usagePatterns.set(key, existing);

    // Cleanup old usage data (keep last 1000 entries)
    if (this.usagePatterns.size > 1000) {
      const entries = Array.from(this.usagePatterns.entries());
      entries.sort((a, b) => b[1].lastAccessed - a[1].lastAccessed);

      // Keep top 800, remove oldest 200
      for (let i = 800; i < entries.length; i++) {
        this.usagePatterns.delete(entries[i][0]);
      }
    }
  }

  // === PREDICTIVE ANALYSIS ===

  analyzeUsagePatterns() {
    const predictions = [];
    const now = new Date();

    for (const [key, usage] of this.usagePatterns.entries()) {
      const [type, identifier] = key.split(':');

      if (type === 'collection-access') {
        const daysSinceAccess =
          (now - new Date(usage.lastAccessed)) / (1000 * 60 * 60 * 24);
        const accessFrequency = usage.count / Math.max(daysSinceAccess, 1);

        // High frequency and recent access = high confidence
        const confidence = Math.min(accessFrequency * 0.1, 1.0);

        if (confidence > 0.5) {
          predictions.push({
            collection: identifier,
            confidence,
            reason: 'frequent-access',
            filters: {},
            priority: confidence > 0.8 ? 'high' : 'medium',
          });
        }
      }
    }

    return predictions.sort((a, b) => b.confidence - a.confidence);
  }

  getFrequentlyUsedData() {
    const frequentItems = [];

    for (const [key, usage] of this.usagePatterns.entries()) {
      const [type, identifier] = key.split(':');

      if (type === 'data-access' && usage.count > 5) {
        const [collection, id] = identifier.split(':');
        frequentItems.push({
          collection,
          id,
          accessCount: usage.count,
          lastAccessed: usage.lastAccessed,
          filters: { id },
        });
      }
    }

    return frequentItems
      .sort((a, b) => b.accessCount - a.accessCount)
      .slice(0, 20); // Top 20 most accessed items
  }

  // === SMART PRELOADING ===

  setupIdlePreloading() {
    // Setup intersection observer for preloading when elements are about to come into view
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (
              entry.isIntersecting &&
              entry.target.dataset.preloadCollection
            ) {
              this.preloadData(this.strategies.ON_DEMAND, {
                collection: entry.target.dataset.preloadCollection,
              });
            }
          });
        },
        {
          rootMargin: '200px', // Preload when 200px away from viewport
        },
      );

      // Observe elements with preload hints
      document.querySelectorAll('[data-preload-collection]').forEach((el) => {
        observer.observe(el);
      });
    }
  }

  setupConnectionBasedPreloading() {
    window.addEventListener('offline-manager:reconnected', async (event) => {
      const { connectionQuality } = event.detail;

      // Only preload on good connections
      if (connectionQuality === 'excellent' || connectionQuality === 'good') {
        console.log('🌐 Good connection detected, starting background preload');

        setTimeout(() => {
          this.preloadData(this.strategies.USAGE_BASED);
        }, 2000); // Wait 2 seconds after reconnection
      }
    });
  }

  initializePredictivePreloading() {
    // Setup periodic predictive preloading
    setInterval(
      () => {
        if (this.offlineManager.isOnline && !this.isPreloading) {
          this.preloadData(this.strategies.PREDICTIVE);
        }
      },
      5 * 60 * 1000,
    ); // Every 5 minutes
  }

  // === RESOURCE MANAGEMENT ===

  async shouldSkipDueToLimits() {
    // Check memory limits
    const memoryStatus = await this.memoryManager.getMemoryStatus();

    if (memoryStatus.memory?.percentage > 80) {
      console.log('⚠️ High memory usage, skipping preload');
      return true;
    }

    // Check storage limits
    if (memoryStatus.storage?.percentage > 85) {
      console.log('⚠️ High storage usage, skipping preload');
      return true;
    }

    // Check if we're over preload size limit
    const currentCacheSize = await this.estimateCacheSize();
    if (currentCacheSize > this.preloadConfig.maxPreloadSize) {
      console.log('⚠️ Cache size limit exceeded, skipping preload');
      return true;
    }

    return false;
  }

  async estimateCacheSize() {
    try {
      let totalSize = 0;
      const collections = ['properties', 'assessments', 'views', 'sketches'];

      for (const collection of collections) {
        const data = await this.indexedDb.getAll(collection);
        totalSize += new Blob([JSON.stringify(data)]).size;
      }

      return totalSize;
    } catch (error) {
      console.error('Failed to estimate cache size:', error);
      return 0;
    }
  }

  // === UTILITY METHODS ===

  processPreloadedData(collection, data) {
    // Add preload metadata
    const processed = Array.isArray(data) ? data : [data];

    return processed.map((item) => ({
      ...item,
      _preloaded: true,
      _preloadedAt: new Date().toISOString(),
      _lastSynced: new Date().toISOString(),
    }));
  }

  createBatches(array, batchSize) {
    const batches = [];
    for (let i = 0; i < array.length; i += batchSize) {
      batches.push(array.slice(i, i + batchSize));
    }
    return batches;
  }

  updateProgress(completed, total) {
    this.preloadingProgress = {
      total,
      completed,
      failed: this.preloadingProgress.failed,
      percentage: (completed / total) * 100,
    };
  }

  recordPreloadOperation(operation) {
    this.preloadHistory.push({
      ...operation,
      timestamp: new Date(),
    });

    // Keep only last 50 operations
    if (this.preloadHistory.length > 50) {
      this.preloadHistory.shift();
    }
  }

  getCollectionEndpoint(collection) {
    const endpoints = {
      municipalities: '/api/municipalities',
      properties: '/api/properties',
      assessments: '/api/assessments',
      views: '/api/views',
      sketches: '/api/sketches',
    };

    return endpoints[collection] || `/api/${collection}`;
  }

  generateOperationId() {
    return (
      'preload-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9)
    );
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // === PUBLIC API ===

  async preloadNow(collections = null, strategy = this.strategies.IMMEDIATE) {
    const targetCollections =
      collections || this.preloadConfig.priorityCollections;
    return await this.preloadData(strategy, { collections: targetCollections });
  }

  async preloadForRoute(routeName) {
    // Define route-specific preloading rules
    const routePreloadMap = {
      municipalities: ['municipalities'],
      properties: ['properties', 'municipalities'],
      assessments: ['assessments', 'properties'],
      views: ['views', 'properties'],
      sketches: ['sketches', 'properties'],
    };

    const collections = routePreloadMap[routeName] || [];
    if (collections.length > 0) {
      return await this.preloadData(this.strategies.ON_DEMAND, { collections });
    }
  }

  updateConfiguration(newConfig) {
    this.preloadConfig = { ...this.preloadConfig, ...newConfig };

    // Save to storage
    this.indexedDb.setValue('preloader-config', this.preloadConfig);

    console.log('⚙️ Preloader configuration updated');
  }

  getPreloadStatus() {
    return {
      isPreloading: this.isPreloading,
      progress: this.preloadingProgress,
      activeOperations: this.activeOperations.size,
      usagePatterns: this.usagePatterns.size,
      recentOperations: this.preloadHistory.slice(-10),
      configuration: this.preloadConfig,
    };
  }

  clearUsageData() {
    this.usagePatterns.clear();
    this.preloadHistory = [];
    console.log('🧹 Preloader usage data cleared');
  }

  async clearPreloadedData() {
    const collections = ['properties', 'assessments', 'views', 'sketches'];
    let cleared = 0;

    for (const collection of collections) {
      try {
        const preloadedItems = await this.indexedDb.db[collection]
          .where('_preloaded')
          .equals(true)
          .toArray();

        for (const item of preloadedItems) {
          await this.indexedDb.delete(collection, item.id);
          cleared++;
        }
      } catch (error) {
        console.error(
          `Failed to clear preloaded data for ${collection}:`,
          error,
        );
      }
    }

    console.log(`🧹 Cleared ${cleared} preloaded items`);
    return cleared;
  }

  // === CLEANUP ===

  willDestroy() {
    super.willDestroy();

    // Cancel active operations
    this.activeOperations.clear();

    console.log('🚀 Data preloader destroyed');
  }
}
