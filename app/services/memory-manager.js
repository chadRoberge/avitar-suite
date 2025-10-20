import Service from '@ember/service';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class MemoryManagerService extends Service {
  @service indexedDb;

  @tracked memoryUsage = {
    used: 0,
    limit: 0,
    percentage: 0,
    available: 0,
  };

  @tracked storageQuota = {
    used: 0,
    quota: 0,
    percentage: 0,
    available: 0,
  };

  @tracked cleanupStats = {
    lastCleanup: null,
    itemsRemoved: 0,
    spaceFreed: 0,
    cleanupCount: 0,
  };

  // Memory management configuration
  @tracked config = {
    memoryThreshold: 0.8, // 80% memory usage threshold
    storageThreshold: 0.9, // 90% storage threshold
    cleanupInterval: 5 * 60 * 1000, // 5 minutes
    maxCacheAge: 24 * 60 * 60 * 1000, // 24 hours
    maxCacheSize: 50 * 1024 * 1024, // 50MB
    aggressiveCleanupThreshold: 0.95, // 95% for aggressive cleanup
    lowMemoryThreshold: 100 * 1024 * 1024, // 100MB low memory warning
  };

  // Tracking references and cleanup callbacks
  cleanupCallbacks = new Map();
  objectReferences = new WeakMap();
  memoryWatchers = [];
  intervalTimers = [];

  constructor() {
    super(...arguments);

    this.initializeMemoryMonitoring();
    this.schedulePeriodicCleanup();
    this.setupMemoryPressureHandling();
  }

  // === MEMORY MONITORING ===

  async initializeMemoryMonitoring() {
    try {
      // Initial memory check
      await this.updateMemoryUsage();
      await this.updateStorageQuota();

      // Setup periodic monitoring
      const monitoringInterval = setInterval(() => {
        this.updateMemoryUsage();
        this.checkMemoryPressure();
      }, 10000); // Every 10 seconds

      this.intervalTimers.push(monitoringInterval);

      // Setup storage monitoring
      const storageInterval = setInterval(() => {
        this.updateStorageQuota();
      }, 30000); // Every 30 seconds

      this.intervalTimers.push(storageInterval);

      console.log('📊 Memory monitoring initialized');
    } catch (error) {
      console.error('Failed to initialize memory monitoring:', error);
    }
  }

  async updateMemoryUsage() {
    try {
      if ('memory' in performance) {
        const memInfo = performance.memory;
        this.memoryUsage = {
          used: memInfo.usedJSHeapSize,
          limit: memInfo.jsHeapSizeLimit,
          percentage: (memInfo.usedJSHeapSize / memInfo.jsHeapSizeLimit) * 100,
          available: memInfo.jsHeapSizeLimit - memInfo.usedJSHeapSize,
        };
      }
    } catch (error) {
      console.warn('Memory usage unavailable:', error);
    }
  }

  async updateStorageQuota() {
    try {
      if ('storage' in navigator && 'estimate' in navigator.storage) {
        const estimate = await navigator.storage.estimate();
        this.storageQuota = {
          used: estimate.usage || 0,
          quota: estimate.quota || 0,
          percentage:
            estimate.quota > 0 ? (estimate.usage / estimate.quota) * 100 : 0,
          available: (estimate.quota || 0) - (estimate.usage || 0),
        };
      }
    } catch (error) {
      console.warn('Storage quota unavailable:', error);
    }
  }

  // === CLEANUP MANAGEMENT ===

  schedulePeriodicCleanup() {
    const cleanupTimer = setInterval(() => {
      this.performRoutineCleanup();
    }, this.config.cleanupInterval);

    this.intervalTimers.push(cleanupTimer);
    console.log('🧹 Periodic cleanup scheduled');
  }

  async performRoutineCleanup() {
    console.log('🧹 Starting routine cleanup...');

    const startTime = performance.now();
    let itemsRemoved = 0;
    let spaceFreed = 0;

    try {
      // Clean expired cached data
      const expiredCacheResult = await this.cleanExpiredCache();
      itemsRemoved += expiredCacheResult.itemsRemoved;
      spaceFreed += expiredCacheResult.spaceFreed;

      // Clean old deltas and conflicts
      const deltaCleanupResult = await this.cleanOldDeltas();
      itemsRemoved += deltaCleanupResult.itemsRemoved;
      spaceFreed += deltaCleanupResult.spaceFreed;

      // Clean orphaned data
      const orphanCleanupResult = await this.cleanOrphanedData();
      itemsRemoved += orphanCleanupResult.itemsRemoved;
      spaceFreed += orphanCleanupResult.spaceFreed;

      // Execute registered cleanup callbacks
      await this.executeCleanupCallbacks();

      // Force garbage collection if available
      this.forceGarbageCollection();

      // Update stats
      this.cleanupStats = {
        lastCleanup: new Date(),
        itemsRemoved,
        spaceFreed,
        cleanupCount: this.cleanupStats.cleanupCount + 1,
      };

      const duration = performance.now() - startTime;
      console.log(
        `✅ Routine cleanup completed in ${Math.round(duration)}ms:`,
        {
          itemsRemoved,
          spaceFreed: this.formatBytes(spaceFreed),
          duration: `${Math.round(duration)}ms`,
        },
      );
    } catch (error) {
      console.error('Routine cleanup failed:', error);
    }
  }

  async performAggressiveCleanup() {
    console.log('🚨 Performing aggressive cleanup due to memory pressure...');

    const startTime = performance.now();
    let itemsRemoved = 0;
    let spaceFreed = 0;

    try {
      // More aggressive cache cleanup
      const cacheResult = await this.cleanExpiredCache(true);
      itemsRemoved += cacheResult.itemsRemoved;
      spaceFreed += cacheResult.spaceFreed;

      // Remove all non-essential cached data
      const nonEssentialResult = await this.cleanNonEssentialData();
      itemsRemoved += nonEssentialResult.itemsRemoved;
      spaceFreed += nonEssentialResult.spaceFreed;

      // Clear completed sync operations
      const syncResult = await this.cleanCompletedSyncOps();
      itemsRemoved += syncResult.itemsRemoved;
      spaceFreed += syncResult.spaceFreed;

      // Force IndexedDB compaction
      await this.compactIndexedDB();

      // Execute all cleanup callbacks aggressively
      await this.executeCleanupCallbacks(true);

      // Multiple garbage collection attempts
      for (let i = 0; i < 3; i++) {
        this.forceGarbageCollection();
        await this.sleep(100);
      }

      this.cleanupStats = {
        lastCleanup: new Date(),
        itemsRemoved,
        spaceFreed,
        cleanupCount: this.cleanupStats.cleanupCount + 1,
      };

      const duration = performance.now() - startTime;
      console.log(
        `✅ Aggressive cleanup completed in ${Math.round(duration)}ms:`,
        {
          itemsRemoved,
          spaceFreed: this.formatBytes(spaceFreed),
          duration: `${Math.round(duration)}ms`,
        },
      );
    } catch (error) {
      console.error('Aggressive cleanup failed:', error);
    }
  }

  // === SPECIFIC CLEANUP METHODS ===

  async cleanExpiredCache(aggressive = false) {
    let itemsRemoved = 0;
    let spaceFreed = 0;

    try {
      const maxAge = aggressive
        ? this.config.maxCacheAge / 2
        : this.config.maxCacheAge;
      const cutoffTime = Date.now() - maxAge;

      // Clean cached HTTP responses
      const collections = ['properties', 'assessments', 'views', 'sketches'];

      for (const collection of collections) {
        const records = await this.indexedDb.getAll(collection);

        for (const record of records) {
          const recordAge = record._lastSynced
            ? Date.now() - new Date(record._lastSynced).getTime()
            : Infinity;

          if (recordAge > maxAge && !record._essential) {
            await this.indexedDb.delete(collection, record.id);
            itemsRemoved++;
            spaceFreed += this.estimateObjectSize(record);
          }
        }
      }

      console.log(`🧹 Cleaned ${itemsRemoved} expired cache items`);
    } catch (error) {
      console.error('Failed to clean expired cache:', error);
    }

    return { itemsRemoved, spaceFreed };
  }

  async cleanOldDeltas() {
    let itemsRemoved = 0;
    let spaceFreed = 0;

    try {
      const cutoffTime = Date.now() - 7 * 24 * 60 * 60 * 1000; // 7 days

      // Clean old synced deltas
      const deltas = await this.indexedDb.db.deltas
        .where('synced')
        .equals(true)
        .and((delta) => new Date(delta.syncedAt).getTime() < cutoffTime)
        .toArray();

      for (const delta of deltas) {
        await this.indexedDb.deleteDelta(delta.id);
        itemsRemoved++;
        spaceFreed += this.estimateObjectSize(delta);
      }

      // Clean old resolved conflicts
      const conflicts = await this.indexedDb.db.conflicts
        .where('resolved')
        .equals(true)
        .and((conflict) => new Date(conflict.timestamp).getTime() < cutoffTime)
        .toArray();

      for (const conflict of conflicts) {
        await this.indexedDb.removeConflictFromReview(conflict.id);
        itemsRemoved++;
        spaceFreed += this.estimateObjectSize(conflict);
      }

      console.log(`🧹 Cleaned ${itemsRemoved} old deltas and conflicts`);
    } catch (error) {
      console.error('Failed to clean old deltas:', error);
    }

    return { itemsRemoved, spaceFreed };
  }

  async cleanOrphanedData() {
    let itemsRemoved = 0;
    let spaceFreed = 0;

    try {
      // Find and remove orphaned view records (views without properties)
      const views = await this.indexedDb.getAll('views');
      const propertyIds = new Set(
        (await this.indexedDb.getAll('properties')).map((p) => p.id),
      );

      for (const view of views) {
        if (!propertyIds.has(view.propertyId)) {
          await this.indexedDb.delete('views', view.id);
          itemsRemoved++;
          spaceFreed += this.estimateObjectSize(view);
        }
      }

      // Find and remove orphaned sketches
      const sketches = await this.indexedDb.getAll('sketches');

      for (const sketch of sketches) {
        if (!propertyIds.has(sketch.propertyId)) {
          await this.indexedDb.delete('sketches', sketch.id);
          itemsRemoved++;
          spaceFreed += this.estimateObjectSize(sketch);
        }
      }

      console.log(`🧹 Cleaned ${itemsRemoved} orphaned data items`);
    } catch (error) {
      console.error('Failed to clean orphaned data:', error);
    }

    return { itemsRemoved, spaceFreed };
  }

  async cleanNonEssentialData() {
    let itemsRemoved = 0;
    let spaceFreed = 0;

    try {
      // Remove change log entries older than 24 hours
      const cutoffTime = Date.now() - 24 * 60 * 60 * 1000;

      const oldChangeLogs = await this.indexedDb.db.changeLog
        .where('timestamp')
        .below(new Date(cutoffTime).toISOString())
        .toArray();

      for (const log of oldChangeLogs) {
        await this.indexedDb.db.changeLog.delete(log.id);
        itemsRemoved++;
        spaceFreed += this.estimateObjectSize(log);
      }

      // Remove duplicate sync queue items
      const syncQueue = await this.indexedDb.db.syncQueue.toArray();
      const seen = new Map();

      for (const item of syncQueue) {
        const key = `${item.collection}:${item.recordId}:${item.action}`;

        if (seen.has(key)) {
          await this.indexedDb.db.syncQueue.delete(item.id);
          itemsRemoved++;
          spaceFreed += this.estimateObjectSize(item);
        } else {
          seen.set(key, item);
        }
      }

      console.log(`🧹 Cleaned ${itemsRemoved} non-essential data items`);
    } catch (error) {
      console.error('Failed to clean non-essential data:', error);
    }

    return { itemsRemoved, spaceFreed };
  }

  async cleanCompletedSyncOps() {
    let itemsRemoved = 0;
    let spaceFreed = 0;

    try {
      // Remove completed sync queue items older than 1 hour
      const cutoffTime = Date.now() - 60 * 60 * 1000;

      const completedItems = await this.indexedDb.db.syncQueue
        .where('timestamp')
        .below(new Date(cutoffTime).toISOString())
        .and((item) => !item._failed)
        .toArray();

      for (const item of completedItems) {
        await this.indexedDb.db.syncQueue.delete(item.id);
        itemsRemoved++;
        spaceFreed += this.estimateObjectSize(item);
      }

      console.log(`🧹 Cleaned ${itemsRemoved} completed sync operations`);
    } catch (error) {
      console.error('Failed to clean completed sync operations:', error);
    }

    return { itemsRemoved, spaceFreed };
  }

  // === MEMORY PRESSURE HANDLING ===

  setupMemoryPressureHandling() {
    // Listen for memory pressure events if available
    if ('memory' in performance) {
      // Setup memory threshold monitoring
      this.memoryWatchers.push(() => {
        if (this.memoryUsage.percentage > this.config.memoryThreshold * 100) {
          this.handleMemoryPressure();
        }
      });
    }

    // Setup storage pressure monitoring
    this.memoryWatchers.push(() => {
      if (this.storageQuota.percentage > this.config.storageThreshold * 100) {
        this.handleStoragePressure();
      }
    });

    console.log('⚠️ Memory pressure handling setup complete');
  }

  checkMemoryPressure() {
    this.memoryWatchers.forEach((watcher) => {
      try {
        watcher();
      } catch (error) {
        console.error('Memory watcher error:', error);
      }
    });
  }

  async handleMemoryPressure() {
    console.warn('⚠️ Memory pressure detected, initiating cleanup...');

    // Immediate cleanup
    await this.performAggressiveCleanup();

    // Notify other services to reduce memory usage
    window.dispatchEvent(
      new CustomEvent('memory-pressure', {
        detail: {
          memoryUsage: this.memoryUsage,
          severity:
            this.memoryUsage.percentage >
            this.config.aggressiveCleanupThreshold * 100
              ? 'high'
              : 'medium',
        },
      }),
    );
  }

  async handleStoragePressure() {
    console.warn('⚠️ Storage pressure detected, freeing space...');

    // Aggressive storage cleanup
    await this.performAggressiveCleanup();

    // Compact IndexedDB
    await this.compactIndexedDB();

    window.dispatchEvent(
      new CustomEvent('storage-pressure', {
        detail: {
          storageQuota: this.storageQuota,
          severity:
            this.storageQuota.percentage >
            this.config.aggressiveCleanupThreshold * 100
              ? 'high'
              : 'medium',
        },
      }),
    );
  }

  // === CLEANUP CALLBACKS ===

  registerCleanupCallback(name, callback, priority = 'normal') {
    this.cleanupCallbacks.set(name, {
      callback,
      priority,
      registered: new Date(),
    });

    console.log(`📝 Registered cleanup callback: ${name}`);
  }

  unregisterCleanupCallback(name) {
    const removed = this.cleanupCallbacks.delete(name);
    if (removed) {
      console.log(`🗑️ Unregistered cleanup callback: ${name}`);
    }
    return removed;
  }

  async executeCleanupCallbacks(aggressive = false) {
    const callbacks = Array.from(this.cleanupCallbacks.entries());

    // Sort by priority (high, normal, low)
    callbacks.sort(([, a], [, b]) => {
      const priorityOrder = { high: 0, normal: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    for (const [name, { callback }] of callbacks) {
      try {
        await callback(aggressive);
        console.log(`✅ Executed cleanup callback: ${name}`);
      } catch (error) {
        console.error(`❌ Cleanup callback failed: ${name}`, error);
      }
    }
  }

  // === UTILITY METHODS ===

  async compactIndexedDB() {
    try {
      if (this.indexedDb.db && typeof this.indexedDb.db.open === 'function') {
        // Trigger IndexedDB compaction by reopening
        const currentVersion = this.indexedDb.db.verno;
        await this.indexedDb.db.close();
        await this.indexedDb.db.open();

        console.log('💾 IndexedDB compaction triggered');
      }
    } catch (error) {
      console.error('IndexedDB compaction failed:', error);
    }
  }

  forceGarbageCollection() {
    try {
      // Force garbage collection if available (Chrome DevTools or Node.js)
      if (window.gc) {
        window.gc();
        console.log('🗑️ Forced garbage collection');
      } else if (global && global.gc) {
        global.gc();
        console.log('🗑️ Forced garbage collection');
      }
    } catch (error) {
      // Garbage collection not available
    }
  }

  estimateObjectSize(obj) {
    if (!obj) return 0;

    try {
      return new Blob([JSON.stringify(obj)]).size;
    } catch (error) {
      // Fallback estimation
      return JSON.stringify(obj || {}).length * 2; // Rough estimate (UTF-16)
    }
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // === PUBLIC API ===

  async getMemoryStatus() {
    await this.updateMemoryUsage();
    await this.updateStorageQuota();

    return {
      memory: this.memoryUsage,
      storage: this.storageQuota,
      cleanup: this.cleanupStats,
      config: this.config,
      registeredCallbacks: this.cleanupCallbacks.size,
    };
  }

  async triggerCleanup(aggressive = false) {
    if (aggressive) {
      return await this.performAggressiveCleanup();
    } else {
      return await this.performRoutineCleanup();
    }
  }

  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    console.log('⚙️ Memory manager configuration updated');
  }

  trackObject(obj, cleanupFn) {
    if (cleanupFn) {
      this.objectReferences.set(obj, cleanupFn);
    }
  }

  getOptimizationSuggestions() {
    const suggestions = [];

    if (this.memoryUsage.percentage > 80) {
      suggestions.push({
        type: 'memory',
        severity: 'high',
        message: 'Memory usage is high. Consider aggressive cleanup.',
        action: 'triggerCleanup',
        params: { aggressive: true },
      });
    }

    if (this.storageQuota.percentage > 85) {
      suggestions.push({
        type: 'storage',
        severity: 'high',
        message: 'Storage usage is high. Clean old data.',
        action: 'cleanExpiredCache',
        params: { aggressive: true },
      });
    }

    if (this.cleanupStats.cleanupCount === 0) {
      suggestions.push({
        type: 'maintenance',
        severity: 'medium',
        message: 'No cleanup has been performed yet.',
        action: 'triggerCleanup',
        params: { aggressive: false },
      });
    }

    return suggestions;
  }

  // === CLEANUP ===

  willDestroy() {
    super.willDestroy();

    // Clear all intervals
    this.intervalTimers.forEach((timer) => clearInterval(timer));
    this.intervalTimers = [];

    // Clear memory watchers
    this.memoryWatchers = [];

    // Clear cleanup callbacks
    this.cleanupCallbacks.clear();

    console.log('🧹 Memory manager destroyed');
  }
}
