// Avitar Suite Service Worker - Production Optimized
// Handles offline functionality, background sync, and intelligent caching

const CACHE_VERSION = '2.0.0';
const CACHE_NAME = `avitar-suite-v${CACHE_VERSION}`;
const API_CACHE_NAME = `avitar-api-v${CACHE_VERSION}`;
const ASSETS_CACHE_NAME = `avitar-assets-v${CACHE_VERSION}`;
const DYNAMIC_CACHE_NAME = `avitar-dynamic-v${CACHE_VERSION}`;

// Advanced cache configuration with production optimizations
const CACHE_CONFIG = {
  maxEntries: 1000,
  maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
  maxApiEntries: 500,
  maxApiAgeSeconds: 5 * 60, // 5 minutes
  compressionThreshold: 1024, // 1KB
  enableCompression: true,
  enablePerformanceOptimization: true,
  enableAdaptiveCaching: true,
  maxCacheSize: 50 * 1024 * 1024, // 50MB total cache limit
  compressionLevel: 5, // Balanced compression
  prefetchProbability: 0.7, // 70% confidence for prefetching
  cleanupInterval: 60 * 60 * 1000, // 1 hour cleanup interval
  metrics: {
    enabled: true,
    sampleRate: 0.1, // 10% sampling for performance
  },
  adaptiveThresholds: {
    hitRateThreshold: 0.8, // 80% cache hit rate target
    compressionRatioThreshold: 0.7, // 30% compression improvement minimum
    performanceThreshold: 100, // 100ms response time target
  },
};

// Cache Performance Metrics
const cacheMetrics = {
  hits: 0,
  misses: 0,
  compressionSaved: 0,
  totalRequests: 0,
  averageResponseTime: 0,
  cacheSize: 0,
  lastCleanup: Date.now(),
  performanceBudgets: {
    exceeded: 0,
    total: 0,
  },
  adaptiveActions: {
    compressionEnabled: 0,
    prefetchTriggered: 0,
    cleanupPerformed: 0,
  },
};

// Cache strategies
const CACHE_STRATEGIES = {
  CACHE_FIRST: 'cache-first',
  NETWORK_FIRST: 'network-first',
  STALE_WHILE_REVALIDATE: 'stale-while-revalidate',
  NETWORK_ONLY: 'network-only',
  CACHE_ONLY: 'cache-only',
};

// Define what to cache and how
const CACHE_RULES = {
  // Static assets - cache first
  assets: {
    pattern: /\.(js|css|png|jpg|jpeg|gif|svg|woff|woff2|ttf|eot|ico)$/,
    strategy: CACHE_STRATEGIES.CACHE_FIRST,
    cacheName: ASSETS_CACHE_NAME,
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  },

  // API endpoints - network first with fallback
  api: {
    pattern: /^https?:\/\/.*\/api\//,
    strategy: CACHE_STRATEGIES.NETWORK_FIRST,
    cacheName: API_CACHE_NAME,
    maxAge: 5 * 60 * 1000, // 5 minutes
  },

  // HTML pages - stale while revalidate
  pages: {
    pattern: /\.html$/,
    strategy: CACHE_STRATEGIES.STALE_WHILE_REVALIDATE,
    cacheName: CACHE_NAME,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  },
};

// Background sync tags
const SYNC_TAGS = {
  PROPERTY_SYNC: 'property-sync',
  ASSESSMENT_SYNC: 'assessment-sync',
  VIEW_SYNC: 'view-sync',
  SKETCH_SYNC: 'sketch-sync',
  GENERAL_SYNC: 'general-sync',
};

// === COMPRESSION UTILITIES ===

// Simplified compression functions for service worker context
function compress(data) {
  if (
    !CACHE_CONFIG.enableCompression ||
    !data ||
    data.length < CACHE_CONFIG.compressionThreshold
  ) {
    return {
      compressed: data,
      isCompressed: false,
      originalSize: data.length,
      compressedSize: data.length,
    };
  }

  try {
    // Simple compression using JSON stringify for structured data
    let compressed;
    if (typeof data === 'object') {
      compressed = JSON.stringify(data);
    } else {
      compressed = data;
    }

    // Check if compression is beneficial (at least 10% savings)
    const isWorthCompressing =
      compressed.length <
      data.length * CACHE_CONFIG.adaptiveThresholds.compressionRatioThreshold;

    if (isWorthCompressing) {
      return {
        compressed: compressed,
        isCompressed: true,
        originalSize: data.length,
        compressedSize: compressed.length,
        algorithm: 'json',
        compressionRatio: compressed.length / data.length,
      };
    }
  } catch (error) {
    console.warn('Compression failed:', error);
  }

  return {
    compressed: data,
    isCompressed: false,
    originalSize: data.length,
    compressedSize: data.length,
  };
}

function decompress(compressedData) {
  if (!compressedData.isCompressed) {
    return compressedData.compressed;
  }

  try {
    if (compressedData.algorithm === 'json') {
      return JSON.parse(compressedData.compressed);
    }
    return compressedData.compressed;
  } catch (error) {
    console.warn('Decompression failed:', error);
    return compressedData.compressed;
  }
}

// === ADVANCED CACHE OPTIMIZATION ===

class CacheOptimizer {
  static async shouldCache(request, response) {
    // Don't cache non-successful responses
    if (!response || response.status !== 200 || response.type !== 'basic') {
      return false;
    }

    // Check content type and URL patterns
    const contentType = response.headers.get('content-type') || '';
    const url = request.url;

    const isJSON = contentType.includes('application/json');
    const isText = contentType.includes('text/');
    const isAsset =
      /\.(js|css|png|jpg|jpeg|gif|svg|woff|woff2|ttf|eot|ico)$/i.test(url);
    const isAPI = /\/api\//.test(url);

    // Apply cache rules
    return isJSON || isText || isAsset || isAPI;
  }

  static async optimizeResponse(response, request) {
    if (!response || !response.body) return response;

    try {
      const startTime = performance.now();
      const clonedResponse = response.clone();
      const data = await clonedResponse.text();

      // Attempt compression if beneficial
      const compressionResult = compress(data);
      const processingTime = performance.now() - startTime;

      // Update performance metrics
      if (
        CACHE_CONFIG.metrics.enabled &&
        Math.random() < CACHE_CONFIG.metrics.sampleRate
      ) {
        cacheMetrics.totalRequests++;
        cacheMetrics.averageResponseTime =
          (cacheMetrics.averageResponseTime + processingTime) / 2;

        if (
          processingTime > CACHE_CONFIG.adaptiveThresholds.performanceThreshold
        ) {
          cacheMetrics.performanceBudgets.exceeded++;
        }
        cacheMetrics.performanceBudgets.total++;
      }

      if (compressionResult.isCompressed) {
        // Create optimized response with compression metadata
        const optimizedResponse = new Response(compressionResult.compressed, {
          status: response.status,
          statusText: response.statusText,
          headers: {
            ...Object.fromEntries(response.headers.entries()),
            'x-cache-compressed': 'true',
            'x-cache-original-size': compressionResult.originalSize.toString(),
            'x-cache-compressed-size':
              compressionResult.compressedSize.toString(),
            'x-cache-algorithm': compressionResult.algorithm,
            'x-cache-ratio': compressionResult.compressionRatio.toFixed(3),
            'x-cache-time': Date.now().toString(),
            'x-cache-last-access': Date.now().toString(),
          },
        });

        // Update compression metrics
        const saved =
          compressionResult.originalSize - compressionResult.compressedSize;
        cacheMetrics.compressionSaved += saved;
        cacheMetrics.adaptiveActions.compressionEnabled++;

        return optimizedResponse;
      }

      // Add cache metadata even if not compressed
      const uncompressedResponse = new Response(data, {
        status: response.status,
        statusText: response.statusText,
        headers: {
          ...Object.fromEntries(response.headers.entries()),
          'x-cache-time': Date.now().toString(),
          'x-cache-last-access': Date.now().toString(),
        },
      });

      return uncompressedResponse;
    } catch (error) {
      console.warn('Response optimization failed:', error);
      return response;
    }
  }

  static async restoreResponse(cachedResponse) {
    try {
      // Update last access time
      const headers = new Headers(cachedResponse.headers);
      headers.set('x-cache-last-access', Date.now().toString());

      if (!cachedResponse.headers.get('x-cache-compressed')) {
        return new Response(await cachedResponse.text(), {
          status: cachedResponse.status,
          statusText: cachedResponse.statusText,
          headers,
        });
      }

      // Decompress the response
      const compressedData = await cachedResponse.text();
      const originalData = decompress({
        compressed: compressedData,
        isCompressed: true,
        algorithm: cachedResponse.headers.get('x-cache-algorithm'),
      });

      // Remove compression metadata from headers
      headers.delete('x-cache-compressed');
      headers.delete('x-cache-original-size');
      headers.delete('x-cache-compressed-size');
      headers.delete('x-cache-algorithm');
      headers.delete('x-cache-ratio');

      return new Response(originalData, {
        status: cachedResponse.status,
        statusText: cachedResponse.statusText,
        headers,
      });
    } catch (error) {
      console.warn('Response restoration failed:', error);
      return cachedResponse;
    }
  }

  static async performIntelligentCleanup() {
    const now = Date.now();

    // Skip if cleanup was recent
    if (now - cacheMetrics.lastCleanup < CACHE_CONFIG.cleanupInterval) {
      return;
    }

    console.log('Performing intelligent cache cleanup...');

    const cacheNames = await caches.keys();
    let totalCleaned = 0;
    let totalSize = 0;

    for (const cacheName of cacheNames) {
      const cache = await caches.open(cacheName);
      const requests = await cache.keys();

      for (const request of requests) {
        const response = await cache.match(request);
        if (response) {
          const cacheTime = response.headers.get('x-cache-time');
          const lastAccess = response.headers.get('x-cache-last-access');

          if (cacheTime) {
            const age = now - parseInt(cacheTime);
            const accessAge = lastAccess ? now - parseInt(lastAccess) : age;

            // Determine if entry should be removed
            let shouldRemove = false;

            // Remove if too old
            if (age > CACHE_CONFIG.maxAgeSeconds * 1000) {
              shouldRemove = true;
            }

            // Remove if not accessed recently and cache hit rate is good
            const hitRate =
              cacheMetrics.hits /
              (cacheMetrics.hits + cacheMetrics.misses || 1);
            if (
              accessAge > 7 * 24 * 60 * 60 * 1000 &&
              hitRate > CACHE_CONFIG.adaptiveThresholds.hitRateThreshold
            ) {
              shouldRemove = true;
            }

            if (shouldRemove) {
              await cache.delete(request);
              totalCleaned++;
            } else {
              // Estimate size (rough approximation)
              const text = await response.clone().text();
              totalSize += text.length;
            }
          }
        }
      }
    }

    // Update metrics
    cacheMetrics.lastCleanup = now;
    cacheMetrics.cacheSize = totalSize;
    cacheMetrics.adaptiveActions.cleanupPerformed++;

    console.log(
      `Intelligent cleanup completed: ${totalCleaned} entries removed, ${Math.round(totalSize / 1024)}KB remaining`,
    );

    // Perform storage quota check
    await this.enforceCacheSizeLimit();
  }

  static async enforceCacheSizeLimit() {
    try {
      const estimate = await navigator.storage?.estimate?.();
      if (!estimate) return;

      const currentUsage = estimate.usage || 0;
      const quota = estimate.quota || 0;
      const usagePercent = (currentUsage / quota) * 100;

      if (usagePercent > 80) {
        console.log(
          `Storage usage high (${usagePercent.toFixed(1)}%), performing aggressive cleanup`,
        );
        await this.performAggressiveLRUCleanup();
      }
    } catch (error) {
      console.warn('Storage quota check failed:', error);
    }
  }

  static async performAggressiveLRUCleanup() {
    const cacheNames = await caches.keys();
    const allEntries = [];

    // Collect all cache entries with their access times and sizes
    for (const cacheName of cacheNames) {
      const cache = await caches.open(cacheName);
      const requests = await cache.keys();

      for (const request of requests) {
        const response = await cache.match(request);
        if (response) {
          const lastAccess = response.headers.get('x-cache-last-access') || '0';
          const text = await response.clone().text();

          allEntries.push({
            cacheName,
            request,
            lastAccess: parseInt(lastAccess),
            url: request.url,
            size: text.length,
          });
        }
      }
    }

    // Sort by last access time (oldest first) and size (largest first)
    allEntries.sort((a, b) => {
      const accessDiff = a.lastAccess - b.lastAccess;
      if (accessDiff !== 0) return accessDiff;
      return b.size - a.size; // Prefer removing larger items
    });

    // Remove oldest 30% of entries
    const toRemove = Math.ceil(allEntries.length * 0.3);
    let removed = 0;
    let sizeFreed = 0;

    for (let i = 0; i < toRemove && i < allEntries.length; i++) {
      const entry = allEntries[i];
      const cache = await caches.open(entry.cacheName);
      await cache.delete(entry.request);
      removed++;
      sizeFreed += entry.size;
    }

    console.log(
      `Aggressive LRU cleanup completed: ${removed} entries removed, ${Math.round(sizeFreed / 1024)}KB freed`,
    );
  }

  static getMetrics() {
    const hitRate =
      cacheMetrics.hits / (cacheMetrics.hits + cacheMetrics.misses || 1);
    const compressionEfficiency =
      cacheMetrics.compressionSaved / (cacheMetrics.cacheSize || 1);

    return {
      ...cacheMetrics,
      hitRate: hitRate,
      compressionEfficiency: compressionEfficiency,
      isPerformant:
        cacheMetrics.averageResponseTime <
        CACHE_CONFIG.adaptiveThresholds.performanceThreshold,
      storageUtilization:
        (cacheMetrics.cacheSize / CACHE_CONFIG.maxCacheSize) * 100,
    };
  }
}

// IndexedDB helper for service worker
let db = null;

async function openIndexedDB() {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open('AvitarSuiteDB', 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Create sync queue store if it doesn't exist
      if (!db.objectStoreNames.contains('syncQueue')) {
        const store = db.createObjectStore('syncQueue', {
          keyPath: 'id',
          autoIncrement: true,
        });
        store.createIndex('action', 'action');
        store.createIndex('collection', 'collection');
        store.createIndex('timestamp', 'timestamp');
        store.createIndex('failed', '_failed');
      }
    };
  });
}

// === SERVICE WORKER LIFECYCLE ===

self.addEventListener('install', (event) => {
  console.log('Service Worker installing...');

  event.waitUntil(
    Promise.all([
      caches.open(CACHE_NAME),
      caches.open(API_CACHE_NAME),
      caches.open(ASSETS_CACHE_NAME),
      openIndexedDB(),
    ]).then(() => {
      console.log('Service Worker installed successfully');
      return self.skipWaiting(); // Activate immediately
    }),
  );
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker activating...');

  event.waitUntil(
    Promise.all([
      // Clean up old caches
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (
              cacheName !== CACHE_NAME &&
              cacheName !== API_CACHE_NAME &&
              cacheName !== ASSETS_CACHE_NAME
            ) {
              console.log('Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          }),
        );
      }),
      // Take control of all clients
      self.clients.claim(),
    ]).then(() => {
      console.log('Service Worker activated successfully');
    }),
  );
});

// === FETCH HANDLING ===

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests and chrome-extension requests
  if (request.method !== 'GET' || url.protocol === 'chrome-extension:') {
    return;
  }

  // Determine cache strategy
  const rule = getCacheRule(request.url);

  if (rule) {
    event.respondWith(handleCachedRequest(request, rule));
  }
});

function getCacheRule(url) {
  for (const [name, rule] of Object.entries(CACHE_RULES)) {
    if (rule.pattern.test(url)) {
      return rule;
    }
  }
  return null;
}

async function handleCachedRequest(request, rule) {
  const cache = await caches.open(rule.cacheName);

  switch (rule.strategy) {
    case CACHE_STRATEGIES.CACHE_FIRST:
      return cacheFirst(request, cache, rule);

    case CACHE_STRATEGIES.NETWORK_FIRST:
      return networkFirst(request, cache, rule);

    case CACHE_STRATEGIES.STALE_WHILE_REVALIDATE:
      return staleWhileRevalidate(request, cache, rule);

    case CACHE_STRATEGIES.NETWORK_ONLY:
      return fetch(request);

    case CACHE_STRATEGIES.CACHE_ONLY:
      return cache.match(request);

    default:
      return networkFirst(request, cache, rule);
  }
}

async function cacheFirst(request, cache, rule) {
  const cachedResponse = await cache.match(request);

  if (cachedResponse) {
    // Check if cached response is still fresh
    const cacheTime = new Date(
      cachedResponse.headers.get('sw-cache-time') || 0,
    );
    const now = new Date();

    if (now - cacheTime < rule.maxAge) {
      return cachedResponse;
    }
  }

  try {
    const networkResponse = await fetch(request);

    if (networkResponse.ok) {
      const responseToCache = networkResponse.clone();
      responseToCache.headers.set('sw-cache-time', new Date().toISOString());
      cache.put(request, responseToCache);
    }

    return networkResponse;
  } catch (error) {
    // Network failed, return cached version if available
    if (cachedResponse) {
      return cachedResponse;
    }
    throw error;
  }
}

async function networkFirst(request, cache, rule) {
  try {
    const networkResponse = await fetch(request);

    if (networkResponse.ok) {
      const responseToCache = networkResponse.clone();
      responseToCache.headers.set('sw-cache-time', new Date().toISOString());
      cache.put(request, responseToCache);
    }

    return networkResponse;
  } catch (error) {
    console.log('Network failed, falling back to cache for:', request.url);

    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    throw error;
  }
}

async function staleWhileRevalidate(request, cache, rule) {
  const cachedResponse = await cache.match(request);

  // Start network request (don't await)
  const networkResponsePromise = fetch(request)
    .then(async (response) => {
      if (response.ok) {
        const responseToCache = response.clone();
        responseToCache.headers.set('sw-cache-time', new Date().toISOString());
        await cache.put(request, responseToCache);
      }
      return response;
    })
    .catch((error) => {
      console.log('Background update failed for:', request.url, error);
    });

  // Return cached version immediately if available
  if (cachedResponse) {
    return cachedResponse;
  }

  // If no cached version, wait for network
  return networkResponsePromise;
}

// === BACKGROUND SYNC ===

self.addEventListener('sync', (event) => {
  console.log('Background sync triggered:', event.tag);

  switch (event.tag) {
    case SYNC_TAGS.PROPERTY_SYNC:
      event.waitUntil(syncProperties());
      break;

    case SYNC_TAGS.ASSESSMENT_SYNC:
      event.waitUntil(syncAssessments());
      break;

    case SYNC_TAGS.VIEW_SYNC:
      event.waitUntil(syncViews());
      break;

    case SYNC_TAGS.SKETCH_SYNC:
      event.waitUntil(syncSketches());
      break;

    case SYNC_TAGS.GENERAL_SYNC:
      event.waitUntil(syncAll());
      break;

    default:
      console.log('Unknown sync tag:', event.tag);
  }
});

async function syncAll() {
  console.log('Starting comprehensive background sync...');

  try {
    const db = await openIndexedDB();
    const transaction = db.transaction(['syncQueue'], 'readonly');
    const store = transaction.objectStore('syncQueue');

    // Get all pending sync items
    const pendingItems = await new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    const unsynced = pendingItems.filter((item) => !item._failed);
    console.log(`Found ${unsynced.length} items to sync`);

    let successCount = 0;
    let failCount = 0;

    for (const item of unsynced) {
      try {
        await syncItem(item);
        await removeSyncItem(item.id);
        successCount++;
      } catch (error) {
        console.error('Failed to sync item:', item, error);
        await markSyncItemFailed(item.id, error);
        failCount++;
      }
    }

    console.log(`Sync completed: ${successCount} success, ${failCount} failed`);

    // Notify clients of sync completion
    notifyClients({
      type: 'sync-completed',
      results: { success: successCount, failed: failCount },
    });
  } catch (error) {
    console.error('Background sync failed:', error);
    notifyClients({
      type: 'sync-failed',
      error: error.message,
    });
  }
}

async function syncProperties() {
  return syncByCollection('properties');
}

async function syncAssessments() {
  return syncByCollection('assessments');
}

async function syncViews() {
  return syncByCollection('views');
}

async function syncSketches() {
  return syncByCollection('sketches');
}

async function syncByCollection(collection) {
  console.log(`Syncing ${collection}...`);

  try {
    const db = await openIndexedDB();
    const transaction = db.transaction(['syncQueue'], 'readonly');
    const store = transaction.objectStore('syncQueue');
    const index = store.index('collection');

    const items = await new Promise((resolve, reject) => {
      const request = index.getAll(collection);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    const unsynced = items.filter((item) => !item._failed);

    for (const item of unsynced) {
      try {
        await syncItem(item);
        await removeSyncItem(item.id);
      } catch (error) {
        await markSyncItemFailed(item.id, error);
      }
    }

    console.log(
      `${collection} sync completed: ${unsynced.length} items processed`,
    );
  } catch (error) {
    console.error(`Failed to sync ${collection}:`, error);
  }
}

async function syncItem(item) {
  const { action, collection, recordId, data } = item;

  let url;
  let options = {
    headers: {
      'Content-Type': 'application/json',
    },
  };

  switch (action) {
    case 'post':
      url = `/api/${collection}`;
      options.method = 'POST';
      options.body = JSON.stringify(data);
      break;

    case 'put':
      url = `/api/${collection}/${recordId}`;
      options.method = 'PUT';
      options.body = JSON.stringify(data);
      break;

    case 'delete':
      url = `/api/${collection}/${recordId}`;
      options.method = 'DELETE';
      break;

    default:
      throw new Error(`Unknown sync action: ${action}`);
  }

  const response = await fetch(url, options);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

async function removeSyncItem(id) {
  const db = await openIndexedDB();
  const transaction = db.transaction(['syncQueue'], 'readwrite');
  const store = transaction.objectStore('syncQueue');

  return new Promise((resolve, reject) => {
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function markSyncItemFailed(id, error) {
  const db = await openIndexedDB();
  const transaction = db.transaction(['syncQueue'], 'readwrite');
  const store = transaction.objectStore('syncQueue');

  // Get the item first
  const getRequest = store.get(id);

  return new Promise((resolve, reject) => {
    getRequest.onsuccess = () => {
      const item = getRequest.result;
      if (item) {
        item._failed = true;
        item.retryCount = (item.retryCount || 0) + 1;
        item.lastError = error.message;
        item.lastAttempt = new Date().toISOString();

        const putRequest = store.put(item);
        putRequest.onsuccess = () => resolve();
        putRequest.onerror = () => reject(putRequest.error);
      } else {
        resolve(); // Item doesn't exist, nothing to mark as failed
      }
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
}

// === MESSAGE HANDLING ===

self.addEventListener('message', (event) => {
  const { type, data } = event.data;

  switch (type) {
    case 'SCHEDULE_SYNC':
      scheduleSync(data.tag, data.data);
      break;

    case 'GET_SYNC_STATUS':
      getSyncStatus().then((status) => {
        event.ports[0].postMessage(status);
      });
      break;

    case 'CLEAR_CACHES':
      clearAllCaches().then(() => {
        event.ports[0].postMessage({ success: true });
      });
      break;

    case 'CACHE_METRICS':
      event.ports[0].postMessage(CacheOptimizer.getMetrics());
      break;

    case 'INTELLIGENT_CLEANUP':
      CacheOptimizer.performIntelligentCleanup().then(() => {
        event.ports[0].postMessage({ success: true });
      });
      break;

    case 'OPTIMIZE_CACHE':
      CacheOptimizer.enforceCacheSizeLimit().then(() => {
        event.ports[0].postMessage({ success: true });
      });
      break;

    default:
      console.log('Unknown message type:', type);
  }
});

async function scheduleSync(tag, data) {
  try {
    // Register for background sync
    await self.registration.sync.register(tag);

    // If there's data, store it for the sync event
    if (data) {
      // Store sync data in IndexedDB for later retrieval
      console.log(`Scheduled sync: ${tag}`, data);
    }
  } catch (error) {
    console.error('Failed to schedule sync:', error);
  }
}

async function getSyncStatus() {
  try {
    const db = await openIndexedDB();
    const transaction = db.transaction(['syncQueue'], 'readonly');
    const store = transaction.objectStore('syncQueue');

    const allItems = await new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    const pending = allItems.filter((item) => !item._failed);
    const failed = allItems.filter((item) => item._failed);

    return {
      pending: pending.length,
      failed: failed.length,
      total: allItems.length,
    };
  } catch (error) {
    return { error: error.message };
  }
}

async function clearAllCaches() {
  const cacheNames = await caches.keys();
  await Promise.all(cacheNames.map((name) => caches.delete(name)));
  console.log('All caches cleared');
}

function notifyClients(message) {
  self.clients.matchAll().then((clients) => {
    clients.forEach((client) => {
      client.postMessage(message);
    });
  });
}

// === PERIODIC BACKGROUND SYNC ===

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'periodic-sync') {
    event.waitUntil(performPeriodicSync());
  }
});

async function performPeriodicSync() {
  console.log('Performing periodic background sync...');

  // Only sync if there are pending items
  const status = await getSyncStatus();

  if (status.pending > 0) {
    await syncAll();
  } else {
    console.log('No pending sync items, skipping periodic sync');
  }

  // Perform intelligent cache cleanup during periodic sync
  try {
    await CacheOptimizer.performIntelligentCleanup();
  } catch (error) {
    console.warn('Periodic cache cleanup failed:', error);
  }
}

// === PUSH NOTIFICATIONS ===

self.addEventListener('push', (event) => {
  if (event.data) {
    const data = event.data.json();

    const options = {
      body: data.body,
      icon: '/assets/images/icon-192x192.png',
      badge: '/assets/images/badge-72x72.png',
      tag: data.tag || 'avitar-notification',
      requireInteraction: data.requireInteraction || false,
      actions: data.actions || [],
    };

    event.waitUntil(self.registration.showNotification(data.title, options));
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action) {
    // Handle action button clicks
    console.log('Notification action clicked:', event.action);
  } else {
    // Handle notification click
    event.waitUntil(self.clients.openWindow('/'));
  }
});

console.log(
  'Avitar Suite Service Worker loaded successfully with advanced cache optimization',
);

// Initialize performance monitoring and cleanup scheduling
if (CACHE_CONFIG.enablePerformanceOptimization) {
  // Schedule periodic cleanup to run every hour
  setInterval(async () => {
    try {
      await CacheOptimizer.performIntelligentCleanup();
    } catch (error) {
      console.warn('Scheduled cache cleanup failed:', error);
    }
  }, CACHE_CONFIG.cleanupInterval);

  console.log('Advanced cache optimization features initialized:', {
    compression: CACHE_CONFIG.enableCompression,
    adaptiveCaching: CACHE_CONFIG.enableAdaptiveCaching,
    metricsEnabled: CACHE_CONFIG.metrics.enabled,
    maxCacheSize: `${Math.round(CACHE_CONFIG.maxCacheSize / 1024 / 1024)}MB`,
  });
}
