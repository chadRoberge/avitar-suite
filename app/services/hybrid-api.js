import Service from '@ember/service';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { applyPidFormattingBulk } from 'avitar-suite/utils/pid-formatter';

export default class HybridApiService extends Service {
  @service indexedDb;
  @service api; // Original network API service
  @service currentUser;
  @service backgroundSync;
  @service offlineManager;
  @service incrementalSync;
  @service changeStream;
  @service municipality;

  @tracked isOnline = navigator.onLine;
  @tracked syncInProgress = false;

  constructor() {
    super(...arguments);

    // Listen for online/offline events
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.onConnectivityChange();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      this.onConnectivityChange();
    });
  }

  async onConnectivityChange() {
    if (this.isOnline && !this.syncInProgress) {
      console.log(
        'Connection restored - starting background sync and incremental sync',
      );

      // Start both background sync and incremental delta sync
      this.backgroundSync.scheduleGeneralSync();

      // Trigger incremental sync after a brief delay
      setTimeout(() => {
        this.incrementalSync.performIncrementalSync();
      }, 1000);
    }
  }

  // === INTELLIGENT ROUTING METHODS ===

  async get(endpoint, options = {}) {
    const {
      useCache = true,
      maxAge = 5 * 60 * 1000, // 5 minutes default
      forceRefresh = false,
      collection = this.getCollectionFromEndpoint(endpoint),
    } = options;

    // If collection is null, this endpoint should not be cached - always fetch from network
    if (collection === null) {
      console.log(`🌐 Non-cacheable endpoint detected: ${endpoint} - forcing network fetch`);
      if (!this.isOnline) {
        throw new Error(`Cannot fetch ${endpoint} - endpoint requires network and device is offline`);
      }
      return this.api.get(endpoint, options.params);
    }

    // Override strategy if forceRefresh is requested
    let strategy = options.strategy || this.offlineManager.getRecommendedStrategy();
    if (forceRefresh) {
      strategy = 'network-first';
      console.log(`🔄 Force refresh requested - overriding strategy to network-first`);
    }

    console.log(
      `🔄 HybridAPI GET: ${endpoint} | Strategy: ${strategy} | Collection: ${collection}`,
    );

    const isItemRequest = this.isItemRequest(endpoint);

    if (strategy === 'local-first' || !this.isOnline) {
      return this.getFromLocal(endpoint, collection, isItemRequest, {
        ...options,
        strategy,
      });
    }

    if (strategy === 'network-first') {
      return this.getFromNetwork(endpoint, collection, isItemRequest, options);
    }

    // Hybrid strategy (default)
    return this.getHybrid(endpoint, collection, isItemRequest, options);
  }

  async getFromLocal(endpoint, collection, isItemRequest, options) {
    try {
      let localData;

      if (isItemRequest) {
        const { id } = this.parseItemEndpoint(endpoint);
        localData = await this.indexedDb.get(collection, id);

        if (localData) {
          console.log(`📱 Local HIT: ${collection}/${id}`);
          return this.normalizeResponse(localData);
        }
      } else {
        // Collection request - but check for property-scoped assessment endpoints
        let filter = options.filter;

        // Special handling for assessment endpoints that need property filtering
        if (this.isPropertyAssessmentEndpoint(endpoint)) {
          const propertyId = this.extractPropertyIdFromEndpoint(endpoint);
          if (propertyId) {
            filter = { ...filter, property_id: propertyId };
            console.log(
              `🔍 Filtering ${collection} by property_id: ${propertyId}`,
            );
          }
        }

        // Special handling for features endpoints that need property filtering
        if (this.isPropertyFeaturesEndpoint(endpoint)) {
          const propertyId = this.extractPropertyIdFromEndpoint(endpoint);
          if (propertyId) {
            filter = { ...filter, property_id: propertyId };
            console.log(
              `🔍 Filtering ${collection} by property_id: ${propertyId}`,
            );
          }
        }

        // Special handling for exemptions endpoints that need property filtering
        if (this.isPropertyExemptionsEndpoint(endpoint)) {
          const propertyId = this.extractPropertyIdFromEndpoint(endpoint);
          if (propertyId) {
            filter = { ...filter, property_id: propertyId };
            console.log(
              `🔍 Filtering ${collection} by property_id: ${propertyId}`,
            );
          }
        }

        // Special handling for sketch endpoints that need property filtering
        if (this.isPropertySketchEndpoint(endpoint)) {
          const propertyId = this.extractPropertyIdFromEndpoint(endpoint);
          if (propertyId) {
            filter = { ...filter, propertyId: propertyId };
            console.log(
              `🔍 Filtering ${collection} by propertyId: ${propertyId}`,
            );
          }
        }

        // Special handling for property views endpoints that need property filtering
        if (this.isPropertyViewsEndpoint(endpoint)) {
          const propertyId = this.extractPropertyIdFromEndpoint(endpoint);
          if (propertyId) {
            filter = { ...filter, propertyId: propertyId };
            console.log(
              `🔍 Filtering ${collection} by propertyId: ${propertyId}`,
            );
          }
        }

        localData = await this.indexedDb.getAll(collection, filter);

        if (localData && localData.length > 0) {
          // Check for corrupted cache where API response object was cached as single item
          // This happens when {success: true, properties: [...]} was cached instead of individual items
          if (localData.length === 1 && localData[0].properties && Array.isArray(localData[0].properties)) {
            console.warn(`🧹 Detected corrupted cache in ${collection} - clearing and refetching`);
            // Clear the corrupted entry
            await this.indexedDb.delete(collection, localData[0].id || localData[0]._id);
            // Force network fetch
            if (this.isOnline) {
              return this.getFromNetwork(endpoint, collection, isItemRequest, options);
            }
            throw new Error(`Corrupted cache detected for ${endpoint} and device is offline`);
          }

          // Post-filter features by card number (IndexedDB doesn't support MongoDB $or queries)
          if (this.isPropertyFeaturesEndpoint(endpoint)) {
            const cardParam = this.extractQueryParam(endpoint, 'card');
            if (cardParam) {
              const cardNumber = parseInt(cardParam, 10);
              console.log(`🔍 Post-filtering features by card_number: ${cardNumber}`);

              const beforeFilterCount = localData.length;

              // Card 1 includes features without card_number (legacy)
              if (cardNumber === 1) {
                localData = localData.filter(feature =>
                  feature.card_number === 1 ||
                  feature.card_number === undefined ||
                  feature.card_number === null
                );
              } else {
                localData = localData.filter(feature => feature.card_number === cardNumber);
              }

              console.log(`🔍 Filtered to ${localData.length} features for card ${cardNumber} (from ${beforeFilterCount} total)`);

              // If we have cached features for this property but NONE match the card filter,
              // the cache likely has stale data missing card_number field - fetch from network
              if (beforeFilterCount > 0 && localData.length === 0 && this.isOnline) {
                console.log(`⚠️ Cache has ${beforeFilterCount} features but 0 match card ${cardNumber} - falling back to network`);
                return this.getFromNetwork(endpoint, collection, isItemRequest, options);
              }
            }
          }

          // Check for incomplete property cache (missing required fields like mapNumber, lotSubDisplay)
          // Instead of refetching, apply PID formatting on-the-fly
          if (collection === 'properties' && endpoint.includes('/municipalities/')) {
            const sampleProperty = localData[0];
            if (!sampleProperty.mapNumber || !sampleProperty.lotSubDisplay) {
              console.log(`🔧 Applying PID formatting to ${localData.length} cached properties`);
              // Apply PID formatting to all cached properties
              const municipality = this.municipality.currentMunicipality;
              if (municipality && municipality.pid_format) {
                localData = applyPidFormattingBulk(localData, municipality);
                console.log(`✅ PID formatting applied successfully`);
              } else {
                console.warn('⚠️ Municipality PID format not available - properties may not group correctly');
              }
            }
          }

          console.log(
            `📱 Local HIT: ${collection} (${localData.length} items)`,
          );
          return this.normalizeCollectionResponse(localData, collection);
        }
      }

      console.log(`📱 Local MISS: ${endpoint}`);

      // If offline and no local data, throw error
      if (!this.isOnline) {
        throw new Error(
          `No cached data available for ${endpoint} and device is offline`,
        );
      }

      // If using local-only strategy (forced offline mode), don't fall back to network
      if (options.strategy === 'local-only') {
        throw new Error(
          `No cached data available for ${endpoint} and local-only strategy is enforced`,
        );
      }

      // If online and using local-first strategy, fall back to network
      return this.getFromNetwork(endpoint, collection, isItemRequest, options);
    } catch (error) {
      console.error(`Local fetch failed for ${endpoint}:`, error);
      throw error;
    }
  }

  async getFromNetwork(endpoint, collection, isItemRequest, options) {
    try {
      console.log(`🌐 Network fetch: ${endpoint}`);
      const response = await this.api.get(endpoint, options.params);

      // Handle API response format: {success: true, properties: [...], total: ...}
      // Extract the actual data array if present
      let dataToCache = response;
      let dataToReturn = response;

      if (response && typeof response === 'object' && !Array.isArray(response)) {
        // Check if this is a wrapped response with a data property
        if (response.properties && Array.isArray(response.properties)) {
          // Extract the properties array for caching
          dataToCache = response.properties;
          console.log(`🔍 Extracted ${dataToCache.length} items from response.properties`);
        } else if (response.features && Array.isArray(response.features)) {
          // Extract features array
          dataToCache = response.features;
          console.log(`🔍 Extracted ${dataToCache.length} items from response.features`);
        } else if (response.sketches && Array.isArray(response.sketches)) {
          // Extract sketches array
          dataToCache = response.sketches;
          console.log(`🔍 Extracted ${dataToCache.length} items from response.sketches`);
        }
      }

      // Cache the response in IndexedDB
      if (Array.isArray(dataToCache)) {
        // Collection response
        console.log(`🗄️ Caching ${dataToCache.length} items to ${collection} collection`);
        for (const item of dataToCache) {
          await this.cacheItem(collection, item);
        }
      } else {
        // Single item response
        console.log(`🗄️ Caching single item to ${collection} collection`);
        await this.cacheItem(collection, dataToCache);
      }

      console.log(`🌐 Network HIT: ${endpoint}`);
      return dataToReturn;
    } catch (error) {
      console.error(`Network fetch failed for ${endpoint}:`, error);

      // Try to serve stale data from cache
      if (options.allowStale !== false) {
        console.log(`🔄 Falling back to stale local data for ${endpoint}`);
        return this.getFromLocal(endpoint, collection, isItemRequest, {
          ...options,
          allowStale: false,
        });
      }

      throw error;
    }
  }

  async getHybrid(endpoint, collection, isItemRequest, options) {
    const { maxAge = 5 * 60 * 1000 } = options;

    try {
      let localData;

      if (isItemRequest) {
        const { id } = this.parseItemEndpoint(endpoint);
        localData = await this.indexedDb.get(collection, id);
      } else {
        localData = await this.indexedDb.getAll(collection, options.filter);
      }

      // Check if local data is fresh
      const isFresh = localData && this.isDataFresh(localData, maxAge);

      if (isFresh && !options.forceRefresh) {
        console.log(`⚡ Hybrid HIT (fresh): ${endpoint}`);

        // Background refresh for next time
        if (this.isOnline) {
          this.backgroundRefresh(endpoint, collection, isItemRequest, options);
        }

        return isItemRequest
          ? this.normalizeResponse(localData)
          : this.normalizeCollectionResponse(localData, collection);
      }

      // Data is stale or missing, try network
      if (this.isOnline) {
        return this.getFromNetwork(
          endpoint,
          collection,
          isItemRequest,
          options,
        );
      }

      // Offline with stale data
      if (localData) {
        console.log(`📱 Hybrid HIT (stale): ${endpoint}`);
        return isItemRequest
          ? this.normalizeResponse(localData)
          : this.normalizeCollectionResponse(localData, collection);
      }

      throw new Error(
        `No data available for ${endpoint} and device is offline`,
      );
    } catch (error) {
      console.error(`Hybrid fetch failed for ${endpoint}:`, error);
      throw error;
    }
  }

  async post(endpoint, data, options = {}) {
    const {
      optimistic = true,
      collection = this.getCollectionFromEndpoint(endpoint),
      enableDeltaSync = true,
    } = options;

    console.log(`📤 HybridAPI POST: ${endpoint}`, data);

    try {
      // Generate optimistic data
      const optimisticData = {
        ...data,
        id: `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        _isOptimistic: true,
      };

      // Add optimistically to IndexedDB
      if (optimistic) {
        await this.indexedDb.add(collection, optimisticData);
        console.log(`📱 Optimistic CREATE: ${collection}:${optimisticData.id}`);

        // Track delta for incremental sync (creation)
        if (enableDeltaSync) {
          await this.incrementalSync.trackLocalChange(
            collection,
            optimisticData.id,
            null, // No previous document for creation
            optimisticData,
            { operation: 'create' },
          );
        }
      }

      // Try network request
      if (this.isOnline) {
        try {
          const response = await this.api.post(endpoint, data);

          // Replace optimistic data with server response
          if (optimistic) {
            await this.indexedDb.delete(collection, optimisticData.id);
            await this.cacheItem(collection, response);
          }

          console.log(`🌐 Network CREATE success: ${endpoint}`);
          return response;
        } catch (error) {
          console.error(`Network create failed for ${endpoint}:`, error);

          // Mark optimistic data as failed but keep it
          if (optimistic) {
            await this.indexedDb.update(collection, optimisticData.id, {
              _failed: true,
              _error: error.message,
            });
          }

          throw error;
        }
      } else {
        // Offline - return optimistic data
        console.log(`📱 Offline CREATE: ${endpoint}`);
        return optimisticData;
      }
    } catch (error) {
      console.error(`Failed to create ${endpoint}:`, error);
      throw error;
    }
  }

  async put(endpoint, data, options = {}) {
    const {
      optimistic = true,
      collection = this.getCollectionFromEndpoint(endpoint),
      enableDeltaSync = true,
    } = options;

    const { id } = this.parseItemEndpoint(endpoint);

    console.log(`📝 HybridAPI PUT: ${endpoint}`, data);

    try {
      // Get current document for delta tracking
      const oldDocument = enableDeltaSync
        ? await this.indexedDb.get(collection, id)
        : null;

      // Apply optimistic update
      if (optimistic) {
        const optimisticData = {
          ...data,
          id,
          updated_at: new Date().toISOString(),
          _isOptimistic: true,
        };

        await this.indexedDb.update(collection, id, optimisticData);
        console.log(`📱 Optimistic UPDATE: ${collection}:${id}`);

        // Track delta for incremental sync
        if (enableDeltaSync && oldDocument) {
          await this.incrementalSync.trackLocalChange(
            collection,
            id,
            oldDocument,
            optimisticData,
            { operation: 'update' },
          );
        }
      }

      // Try network request
      if (this.isOnline) {
        try {
          const response = await this.api.put(endpoint, data);

          // Update with server response
          await this.cacheItem(collection, response);

          console.log(`🌐 Network UPDATE success: ${endpoint}`);
          return response;
        } catch (error) {
          console.error(`Network update failed for ${endpoint}:`, error);

          // Mark update as failed
          if (optimistic) {
            await this.indexedDb.update(collection, id, {
              _failed: true,
              _error: error.message,
            });
          }

          throw error;
        }
      } else {
        // Offline - return optimistic data
        console.log(`📱 Offline UPDATE: ${endpoint}`);
        const localRecord = await this.indexedDb.get(collection, id);
        return localRecord;
      }
    } catch (error) {
      console.error(`Failed to update ${endpoint}:`, error);
      throw error;
    }
  }

  async delete(endpoint, options = {}) {
    const {
      optimistic = true,
      collection = this.getCollectionFromEndpoint(endpoint),
      enableDeltaSync = true,
    } = options;

    const { id } = this.parseItemEndpoint(endpoint);

    console.log(`🗑️ HybridAPI DELETE: ${endpoint}`);

    try {
      // Get current document for delta tracking
      const oldDocument = enableDeltaSync
        ? await this.indexedDb.get(collection, id)
        : null;

      // Apply optimistic delete (mark as deleted)
      if (optimistic) {
        await this.indexedDb.update(collection, id, {
          _pendingDelete: true,
          _deletedAt: new Date().toISOString(),
        });
        console.log(`📱 Optimistic DELETE: ${collection}:${id}`);

        // Track delta for incremental sync (deletion)
        if (enableDeltaSync && oldDocument) {
          await this.incrementalSync.trackLocalChange(
            collection,
            id,
            oldDocument,
            null, // Document will be null after deletion
            { operation: 'delete' },
          );
        }
      }

      // Try network request
      if (this.isOnline) {
        try {
          const response = await this.api.delete(endpoint);

          // Actually delete from local storage after server confirms
          await this.indexedDb.delete(collection, id);

          console.log(`🌐 Network DELETE success: ${endpoint}`);
          return response;
        } catch (error) {
          console.error(`Network delete failed for ${endpoint}:`, error);

          // Restore item and mark as failed
          if (optimistic) {
            await this.indexedDb.update(collection, id, {
              _pendingDelete: false,
              _failed: true,
              _error: error.message,
            });
          }

          throw error;
        }
      } else {
        // Offline - keep marked as deleted
        console.log(`📱 Offline DELETE: ${endpoint}`);
        return { success: true };
      }
    } catch (error) {
      console.error(`Failed to delete ${endpoint}:`, error);
      throw error;
    }
  }

  // === BACKGROUND OPERATIONS ===

  async backgroundRefresh(endpoint, collection, isItemRequest, options) {
    try {
      console.log(`🔄 Background refresh: ${endpoint}`);
      const response = await this.api.get(endpoint, options.params);

      // Cache the fresh data
      if (Array.isArray(response)) {
        for (const item of response) {
          await this.cacheItem(collection, item);
        }
      } else {
        await this.cacheItem(collection, response);
      }

      console.log(`✅ Background refresh complete: ${endpoint}`);
    } catch (error) {
      console.warn(`Background refresh failed for ${endpoint}:`, error);
    }
  }

  async backgroundSync() {
    if (this.syncInProgress) {
      console.log('Sync already in progress, skipping');
      return;
    }

    this.syncInProgress = true;

    try {
      console.log('🔄 Starting background sync');

      // Get all pending sync operations
      const syncQueue = await this.indexedDb.getSyncQueue();

      console.log(`Found ${syncQueue.length} items in sync queue`);

      for (const queueItem of syncQueue) {
        try {
          await this.processSyncItem(queueItem);
          await this.indexedDb.markSyncComplete(queueItem.id);
        } catch (error) {
          console.error(`Sync failed for queue item ${queueItem.id}:`, error);
          await this.indexedDb.markSyncFailed(queueItem.id, error);
        }
      }

      console.log('✅ Background sync complete');
    } catch (error) {
      console.error('Background sync failed:', error);
    } finally {
      this.syncInProgress = false;
    }
  }

  async processSyncItem(queueItem) {
    const { action, collection, recordId, data } = queueItem;

    switch (action) {
      case 'post':
        return await this.api.post(`/api/${collection}`, data);
      case 'put':
        return await this.api.put(`/api/${collection}/${recordId}`, data);
      case 'delete':
        return await this.api.delete(`/api/${collection}/${recordId}`);
      default:
        throw new Error(`Unknown sync action: ${action}`);
    }
  }

  // === UTILITY METHODS ===

  async cacheItem(collection, item) {
    await this.indexedDb.put(collection, {
      ...item,
      _syncState: 'synced',
      _lastSynced: new Date().toISOString(),
    });
  }

  isDataFresh(data, maxAge) {
    if (Array.isArray(data)) {
      // For collections, check if any item is stale
      return data.every((item) => this.isItemFresh(item, maxAge));
    }
    return this.isItemFresh(data, maxAge);
  }

  isItemFresh(item, maxAge) {
    if (!item._lastSynced) return false;

    const lastSynced = new Date(item._lastSynced);
    const now = new Date();

    return now - lastSynced < maxAge;
  }

  normalizeResponse(data) {
    // Remove internal IndexedDB fields
    const normalized = { ...data };
    delete normalized._syncState;
    delete normalized._lastSynced;
    delete normalized._conflictVersion;
    delete normalized._isOptimistic;
    delete normalized._failed;
    delete normalized._error;
    delete normalized._pendingDelete;
    delete normalized._deletedAt;

    return normalized;
  }

  normalizeCollectionResponse(data, collection) {
    // Filter out deleted items and normalize
    return data
      .filter((item) => !item._pendingDelete)
      .map((item) => this.normalizeResponse(item));
  }

  getCollectionFromEndpoint(endpoint) {
    // Remove query parameters and leading slash, then split into parts
    const cleanEndpoint = endpoint.split('?')[0];
    const parts = cleanEndpoint.replace(/^\//, '').split('/');

    // Handle nested endpoints like /municipalities/{id}/properties
    if (parts.length >= 3 && parts[0] === 'municipalities') {
      const resourceName = parts[2];

      // Map municipality-scoped attribute endpoints to their own collections
      // Each endpoint gets its own collection to prevent cache collisions
      const municipalityResourceMap = {
        'properties': 'properties',
        'topology-attributes': 'topology_attributes',
        'site-attributes': 'site_attributes',
        'driveway-attributes': 'driveway_attributes',
        'road-attributes': 'road_attributes',
        'land-use-details': 'land_use_details',
        'land-taxation-categories': 'land_taxation_categories',
        'land-ladders': 'land_ladders',
        'current-use': 'current_use_settings',
        'acreage-discount-settings': 'acreage_discount_settings',
        'sketch-sub-area-factors': 'sketch_sub_area_factors',
      };

      if (municipalityResourceMap[resourceName]) {
        console.log(`🎯 Mapping ${endpoint} -> ${municipalityResourceMap[resourceName]} collection`);
        return municipalityResourceMap[resourceName];
      }
    }

    // Handle property-scoped endpoints like /properties/{id}/sketches
    if (parts.length >= 3 && parts[0] === 'properties' && parts[2]) {
      const resourceName = parts[2];
      if (['sketches', 'features'].includes(resourceName)) {
        console.log(`🎯 Mapping ${endpoint} -> ${resourceName} collection`);
        return resourceName;
      }
      if (resourceName === 'assessment') {
        console.log(`🎯 Mapping ${endpoint} -> assessments collection`);
        return 'assessments';
      }
      if (resourceName === 'exemptions') {
        console.log(`🎯 Mapping ${endpoint} -> exemptions collection`);
        return 'exemptions';
      }
      // Special handling for assessment-history - should NOT be cached locally
      // Always fetch from network as it requires ParcelAssessment collection data
      if (resourceName === 'assessment-history') {
        console.log(`🎯 Assessment history endpoint detected - will fetch from network`);
        return null; // Returning null will force network fetch
      }
    }

    // Handle direct endpoints like /properties, /sketches
    const collection = parts[0];

    const collectionMap = {
      properties: 'properties',
      sketches: 'sketches',
      assessments: 'assessments',
      features: 'features',
      municipalities: 'municipalities',
      views: 'views',
      'view-attributes': 'viewAttributes',
      exemptions: 'exemptions',
      'exemption-types': 'exemptionTypes',
    };

    return collectionMap[collection] || collection;
  }

  isItemRequest(endpoint) {
    // Strip query parameters before parsing
    const cleanEndpoint = endpoint.split('?')[0];
    const parts = cleanEndpoint.replace(/^\//, '').split('/');

    // Handle nested endpoints like /municipalities/{id}/properties/{propertyId}
    if (parts.length >= 4 && parts[0] === 'municipalities') {
      const lastPart = parts[3];
      return (
        lastPart && (!isNaN(lastPart) || /^[0-9a-fA-F]{24}$/.test(lastPart))
      );
    }

    // Handle property-scoped endpoints like /properties/{id}/sketches/{sketchId}
    if (parts.length >= 4 && parts[0] === 'properties' && parts[2]) {
      const lastPart = parts[3];
      return (
        lastPart && (!isNaN(lastPart) || /^[0-9a-fA-F]{24}$/.test(lastPart))
      );
    }

    // Handle direct endpoints like /properties/{id}
    // But exclude property-scoped collection endpoints like /properties/{id}/features
    if (parts.length === 2) {
      return (
        parts[1] && (!isNaN(parts[1]) || /^[0-9a-fA-F]{24}$/.test(parts[1]))
      );
    }

    // For 3-part endpoints like /properties/{id}/features, treat as collection requests
    if (parts.length === 3 && parts[0] === 'properties' && parts[2]) {
      return false; // This is a collection request for the nested resource
    }

    return false;
  }

  parseItemEndpoint(endpoint) {
    // Strip query parameters before parsing
    const cleanEndpoint = endpoint.split('?')[0];
    const parts = cleanEndpoint.replace(/^\//, '').split('/');

    // Handle nested endpoints like /municipalities/{id}/properties/{propertyId}
    if (parts.length >= 4 && parts[0] === 'municipalities') {
      return {
        collection: this.getCollectionFromEndpoint(endpoint),
        id: parts[3],
      };
    }

    // Handle property-scoped endpoints like /properties/{id}/sketches/{sketchId}
    if (parts.length >= 4 && parts[0] === 'properties' && parts[2]) {
      return {
        collection: this.getCollectionFromEndpoint(endpoint),
        id: parts[3],
      };
    }

    // Handle direct endpoints like /properties/{id}
    return {
      collection: this.getCollectionFromEndpoint(endpoint),
      id: parts[1],
    };
  }

  // === ASSESSMENT ENDPOINT HELPERS ===

  /**
   * Check if endpoint is a property-scoped assessment endpoint
   * e.g., /properties/{id}/assessment/building, /properties/{id}/assessment/current
   */
  isPropertyAssessmentEndpoint(endpoint) {
    const cleanEndpoint = endpoint.split('?')[0];
    return (
      cleanEndpoint.includes('/properties/') &&
      cleanEndpoint.includes('/assessment/')
    );
  }

  /**
   * Check if endpoint is a property-scoped features endpoint
   * e.g., /properties/{id}/features
   */
  isPropertyFeaturesEndpoint(endpoint) {
    const cleanEndpoint = endpoint.split('?')[0];
    return (
      cleanEndpoint.includes('/properties/') &&
      cleanEndpoint.includes('/features')
    );
  }

  /**
   * Check if endpoint is a property-scoped exemptions endpoint
   * e.g., /properties/{id}/exemptions
   */
  isPropertyExemptionsEndpoint(endpoint) {
    const cleanEndpoint = endpoint.split('?')[0];
    return (
      cleanEndpoint.includes('/properties/') &&
      cleanEndpoint.includes('/exemptions')
    );
  }

  /**
   * Check if endpoint is for property-scoped sketches
   */
  isPropertySketchEndpoint(endpoint) {
    const cleanEndpoint = endpoint.split('?')[0];
    return (
      cleanEndpoint.includes('/properties/') &&
      cleanEndpoint.includes('/sketches')
    );
  }

  /**
   * Check if endpoint is for property-scoped views
   * e.g., /properties/{id}/views
   */
  isPropertyViewsEndpoint(endpoint) {
    const cleanEndpoint = endpoint.split('?')[0];
    return (
      cleanEndpoint.includes('/properties/') && cleanEndpoint.includes('/views')
    );
  }

  /**
   * Extract property ID from assessment endpoints
   * e.g., /properties/68b2e9660cea3302ed1d0611/assessment/building -> 68b2e9660cea3302ed1d0611
   */
  extractPropertyIdFromEndpoint(endpoint) {
    const cleanEndpoint = endpoint.split('?')[0];
    const match = cleanEndpoint.match(/\/properties\/([^\/]+)/);
    return match ? match[1] : null;
  }

  /**
   * Extract a query parameter from an endpoint URL
   * e.g., extractQueryParam('/properties/123/features?card=2', 'card') -> '2'
   */
  extractQueryParam(endpoint, paramName) {
    const queryString = endpoint.split('?')[1];
    if (!queryString) return null;

    const params = new URLSearchParams(queryString);
    return params.get(paramName);
  }

  // === PUBLIC API METHODS ===

  async forceSyncCollection(collection) {
    return this.backgroundSync();
  }

  async clearCache() {
    await this.indexedDb.clearAll();
    console.log('Cache cleared');
  }

  async getStorageStats() {
    return await this.indexedDb.getStorageStats();
  }

  getSyncStatus() {
    return {
      isOnline: this.isOnline,
      syncInProgress: this.syncInProgress,
    };
  }
}
