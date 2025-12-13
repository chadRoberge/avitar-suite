import Service from '@ember/service';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import Evented from '@ember/object/evented';
import { applyPidFormattingBulk } from 'avitar-suite/utils/pid-formatter';

export default class HybridApiService extends Service.extend(Evented) {
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

  // Cache version - increment when cache structure changes
  CACHE_VERSION = 3; // v3: Added building permits collections

  constructor() {
    super(...arguments);

    // Track if we've already migrated old property cache format
    this.propertyCacheMigrated = false;

    // Listen for online/offline events
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.onConnectivityChange();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      this.onConnectivityChange();
    });

    // Check cache version and clear if needed
    setTimeout(async () => {
      await this.checkCacheVersion();

      // Start smart polling after cache version check
      if (this.municipality?.currentMunicipality) {
        this.startSmartPolling();
      }
    }, 2000);
  }

  willDestroy() {
    super.willDestroy();
    this.stopSmartPolling();
  }

  /**
   * Check cache version and clear if stale
   * This handles the case where users have old cached data with incorrect structure
   */
  async checkCacheVersion() {
    try {
      const stored = await this.indexedDb.getMetadata('cache_version');

      if (!stored || stored.value !== this.CACHE_VERSION) {
        console.warn(
          `🔄 Cache version mismatch (stored: ${stored?.value || 'none'}, expected: ${this.CACHE_VERSION})`,
        );
        console.warn(
          'Clearing all cached data to prevent stale data issues...',
        );

        // Clear all configuration collections
        const collections = [
          'properties',
          'land_ladders',
          'zones',
          'neighborhoods',
          'building_codes',
          'building_feature_codes',
          'land_assessments',
          'building_assessments',
          'land_use_details',
          'land_taxation_categories',
          'current_use_settings',
          'acreage_discount_settings',
          'topology_attributes',
          'site_attributes',
          'driveway_attributes',
          'road_attributes',
          'water_bodies',
          'waterfront_attributes',
          'water_body_ladders',
          'permits',
          'permit_inspections',
          'permit_documents',
          'permit_comments',
        ];

        for (const collection of collections) {
          try {
            await this.indexedDb.clearCollection(collection);
          } catch (error) {
            console.warn(`Failed to clear ${collection}:`, error);
          }
        }

        // Set new version
        await this.indexedDb.setMetadata('cache_version', this.CACHE_VERSION);

        console.log(
          '✅ Cache cleared and version updated to',
          this.CACHE_VERSION,
        );
      } else {
        console.log('✅ Cache version up to date:', this.CACHE_VERSION);
      }
    } catch (error) {
      console.error('Cache version check failed:', error);
    }
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
      console.log(
        `🌐 Non-cacheable endpoint detected: ${endpoint} - forcing network fetch`,
      );
      if (!this.isOnline) {
        throw new Error(
          `Cannot fetch ${endpoint} - endpoint requires network and device is offline`,
        );
      }
      return this.api.get(endpoint, options.params);
    }

    // Override strategy if forceRefresh is requested
    let strategy =
      options.strategy || this.offlineManager.getRecommendedStrategy();
    if (forceRefresh) {
      strategy = 'network-first';
      console.log(
        `🔄 Force refresh requested - overriding strategy to network-first`,
      );
    }

    // Configuration/settings endpoints should always use network-first strategy
    // to ensure we get the latest data when online
    if (this.isConfigurationEndpoint(endpoint) && this.isOnline) {
      strategy = 'network-first';
      console.log(
        `⚙️ Configuration endpoint detected - using network-first strategy`,
      );
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

        console.log(
          `🔍 [HybridAPI] IndexedDB getAll result for ${collection}:`,
          {
            endpoint,
            collection,
            filter,
            resultCount: localData?.length || 0,
            firstItem: localData?.[0]
              ? {
                  id: localData[0].id || localData[0]._id,
                  keys: Object.keys(localData[0]),
                }
              : null,
          },
        );

        if (localData && localData.length > 0) {
          // Check for corrupted cache where API response object was cached as single item
          // This happens when {success: true, [data]: [...]} was cached instead of individual items
          if (localData.length === 1) {
            const firstItem = localData[0];
            const itemKeys = Object.keys(firstItem);

            // Check if this looks like a wrapped API response (has metadata + one array/object property)
            // Common patterns: {success: true, properties: [...]}, {waterBodies: [...]}, etc.
            const metadataFields = [
              'success',
              'message',
              'total',
              'page',
              'limit',
              'offset',
              'count',
              'timestamp',
              '_id',
              'id',
              '_syncState',
              '_lastSynced',
            ];
            const dataKeys = itemKeys.filter(
              (key) => !metadataFields.includes(key),
            );

            // If there's only one non-metadata key and it contains an array, it's likely a wrapped response
            if (dataKeys.length === 1) {
              const potentialDataKey = dataKeys[0];
              const potentialData = firstItem[potentialDataKey];

              if (Array.isArray(potentialData)) {
                console.warn(
                  `🧹 Detected wrapped cache in ${collection} (key: ${potentialDataKey}) - unwrapping`,
                  {
                    wrappedKey: potentialDataKey,
                    itemCount: potentialData.length,
                    sampleKeys: itemKeys,
                  },
                );

                // Unwrap the data
                localData = potentialData;

                // Clear the corrupted entry and cache the unwrapped data
                await this.indexedDb.delete(
                  collection,
                  firstItem.id || firstItem._id,
                );

                // Re-cache the unwrapped items properly
                for (const item of localData) {
                  await this.cacheItem(collection, item);
                }

                console.log(
                  `✅ Unwrapped and re-cached ${localData.length} items in ${collection}`,
                );
              }
            }
          }

          // Check for incomplete property cache FIRST (before using the data)
          // The server always returns mapNumber/lotSubDisplay, so if cache is missing them,
          // it's from old data - clear cache and force network fetch
          // Only perform this migration ONCE per session to avoid repeated re-fetches
          if (
            collection === 'properties' &&
            endpoint.includes('/municipalities/') &&
            !this.propertyCacheMigrated
          ) {
            const sampleProperty = localData[0];

            // Check if this is old/malformed data:
            // 1. Missing mapNumber or lotSubDisplay fields
            // 2. ID is a number instead of string (old format)
            const hasOldIdFormat =
              sampleProperty && typeof sampleProperty.id === 'number';
            const missingPIDFields =
              sampleProperty &&
              (!sampleProperty.mapNumber || !sampleProperty.lotSubDisplay);

            if (hasOldIdFormat || missingPIDFields) {
              console.warn(
                '⚠️ Old/malformed property cache detected - performing one-time migration',
                {
                  reason: hasOldIdFormat
                    ? 'ID is number (old format)'
                    : 'Missing PID fields',
                  sampleId: sampleProperty?.id,
                  idType: typeof sampleProperty?.id,
                  mapNumber: sampleProperty?.mapNumber,
                  lotSubDisplay: sampleProperty?.lotSubDisplay,
                },
              );

              // Mark migration as complete to prevent repeated clears
              this.propertyCacheMigrated = true;

              // Clear the old cache
              await this.indexedDb.clearCollection(collection);

              // Force network fetch to get properly formatted data
              if (this.isOnline) {
                return this.getFromNetwork(
                  endpoint,
                  collection,
                  isItemRequest,
                  options,
                );
              }

              // If offline, return the stale data (better than nothing)
              console.log(
                '📱 Offline - returning stale properties despite old format',
              );
              // Fall through to return localData below
            } else {
              // Cache has good data format, mark migration as complete
              this.propertyCacheMigrated = true;
            }
          }

          // Post-filter features by card number (IndexedDB doesn't support MongoDB $or queries)
          if (this.isPropertyFeaturesEndpoint(endpoint)) {
            const cardParam = this.extractQueryParam(endpoint, 'card');
            if (cardParam) {
              const cardNumber = parseInt(cardParam, 10);
              console.log(
                `🔍 Post-filtering features by card_number: ${cardNumber}`,
              );

              const beforeFilterCount = localData.length;

              // Card 1 includes features without card_number (legacy)
              if (cardNumber === 1) {
                localData = localData.filter(
                  (feature) =>
                    feature.card_number === 1 ||
                    feature.card_number === undefined ||
                    feature.card_number === null,
                );
              } else {
                localData = localData.filter(
                  (feature) => feature.card_number === cardNumber,
                );
              }

              console.log(
                `🔍 Filtered to ${localData.length} features for card ${cardNumber} (from ${beforeFilterCount} total)`,
              );

              // If we have cached features for this property but NONE match the card filter,
              // the cache likely has stale data missing card_number field - fetch from network
              if (
                beforeFilterCount > 0 &&
                localData.length === 0 &&
                this.isOnline
              ) {
                console.log(
                  `⚠️ Cache has ${beforeFilterCount} features but 0 match card ${cardNumber} - falling back to network`,
                );
                return this.getFromNetwork(
                  endpoint,
                  collection,
                  isItemRequest,
                  options,
                );
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
    // Deduplication: if a request is already in flight for this endpoint, wait for it
    const requestKey = `${endpoint}?${JSON.stringify(options.params || {})}`;

    if (this.activeNetworkRequests?.has(requestKey)) {
      console.log(
        `⏳ Network request already in progress for: ${endpoint}, waiting for it...`,
      );
      return this.activeNetworkRequests.get(requestKey);
    }

    // Initialize activeNetworkRequests Map if needed
    if (!this.activeNetworkRequests) {
      this.activeNetworkRequests = new Map();
    }

    try {
      console.log(`🌐 Network fetch: ${endpoint}`);

      // Create the request promise and store it for deduplication
      const requestPromise = this.api.get(endpoint, options.params);
      this.activeNetworkRequests.set(requestKey, requestPromise);

      const response = await requestPromise;

      // Debug log the response structure for properties endpoint
      if (
        endpoint.includes('/municipalities/') &&
        endpoint.includes('/properties') &&
        !endpoint.includes('/zones')
      ) {
        console.log('🔍 Properties endpoint response structure:', {
          hasPropertiesArray: !!response?.properties,
          isArray: Array.isArray(response),
          responseKeys: response ? Object.keys(response) : [],
          firstItemSample: response?.properties?.[0] || response?.[0],
        });
      }

      // Debug log assessment endpoint responses
      if (endpoint.includes('/assessment/')) {
        console.log('🏗️ [HybridAPI] Assessment endpoint response:', {
          endpoint,
          collection,
          responseKeys: response ? Object.keys(response) : [],
          hasAssessment: !!response?.assessment,
          assessmentType: response?.assessment
            ? typeof response.assessment
            : null,
          assessmentKeys: response?.assessment
            ? Object.keys(response.assessment)
            : null,
          assessmentLandUseDetails: response?.assessment?.land_use_details,
          assessmentLandUseDetailsIsArray: Array.isArray(
            response?.assessment?.land_use_details,
          ),
        });
      }

      // Handle API response format: {success: true, properties: [...], total: ...}
      // Use general unwrapping function to extract actual data
      let dataToCache = this.unwrapApiResponse(response);
      let dataToReturn = response;

      // Cache the response in IndexedDB
      if (Array.isArray(dataToCache)) {
        // Collection response
        console.log(
          `🗄️ Caching ${dataToCache.length} items to ${collection} collection`,
        );

        // Log first item to verify data format
        if (dataToCache.length > 0 && collection === 'properties') {
          console.log('🔍 First property being cached:', {
            id: dataToCache[0].id,
            idType: typeof dataToCache[0].id,
            mapNumber: dataToCache[0].mapNumber,
            lotSubDisplay: dataToCache[0].lotSubDisplay,
            pid_formatted: dataToCache[0].pid_formatted,
          });
        }

        for (const item of dataToCache) {
          await this.cacheItem(collection, item);
        }
      } else {
        // Single item response
        console.log(`🗄️ Caching single item to ${collection} collection`);

        // Debug log assessment data being cached
        if (collection === 'assessments' || collection === 'land_assessments') {
          console.log(`🔍 [DEBUG] Caching ${collection} item:`, {
            id: dataToCache.id || dataToCache._id,
            property_id: dataToCache.property_id,
            property_id_type: typeof dataToCache.property_id,
            card_number: dataToCache.card_number,
            gross_area: dataToCache.gross_area,
            building_value: dataToCache.building_value,
            allKeys: Object.keys(dataToCache).slice(0, 15),
          });
        }

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
    } finally {
      // Clean up the active request from the map
      this.activeNetworkRequests?.delete(requestKey);
    }
  }

  async getHybrid(endpoint, collection, isItemRequest, options) {
    try {
      let localData;

      if (isItemRequest) {
        const { id } = this.parseItemEndpoint(endpoint);
        localData = await this.indexedDb.get(collection, id);
      } else {
        localData = await this.indexedDb.getAll(collection, options.filter);
      }

      // If we have data in IndexedDB, always return it immediately (stale-while-revalidate)
      if (
        localData &&
        (Array.isArray(localData) ? localData.length > 0 : true) &&
        !options.forceRefresh
      ) {
        console.log(`⚡ Hybrid HIT (IndexedDB): ${endpoint}`);

        // Always trigger background refresh to check for updates
        // This ensures data stays current without blocking the UI
        if (this.isOnline) {
          this.backgroundRefresh(endpoint, collection, isItemRequest, options);
        }

        // Check for incomplete property cache - but still return cached data
        // Background refresh will update it with proper formatting
        if (
          !isItemRequest &&
          collection === 'properties' &&
          Array.isArray(localData)
        ) {
          const sampleProperty = localData[0];
          if (
            sampleProperty &&
            (!sampleProperty.mapNumber || !sampleProperty.lotSubDisplay)
          ) {
            console.warn(
              '⚠️ Cached properties missing PID formatting - returning cached data, background refresh will update',
            );
            // Background refresh was already triggered above
            // Just return the cached data immediately for fast loading
          }
        }

        return isItemRequest
          ? this.normalizeResponse(localData)
          : this.normalizeCollectionResponse(localData, collection);
      }

      // No data in IndexedDB, fetch from network
      if (this.isOnline) {
        console.log(`📡 IndexedDB MISS, fetching from network: ${endpoint}`);
        return this.getFromNetwork(
          endpoint,
          collection,
          isItemRequest,
          options,
        );
      }

      // Offline with no data
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
    // Deduplication: if a background refresh is already in progress for this endpoint, skip it
    const refreshKey = `${endpoint}?${JSON.stringify(options.params || {})}`;
    if (this.activeBackgroundRefreshes?.has(refreshKey)) {
      console.log(
        `⏭️ Background refresh already in progress for: ${endpoint}, skipping duplicate`,
      );
      return;
    }

    // Initialize activeBackgroundRefreshes Set if needed
    if (!this.activeBackgroundRefreshes) {
      this.activeBackgroundRefreshes = new Set();
    }

    // Mark this refresh as in progress
    this.activeBackgroundRefreshes.add(refreshKey);

    try {
      console.log(`🔄 Background refresh: ${endpoint}`);
      // Pass background: true to prevent loading overlay
      const response = await this.api.get(endpoint, options.params, {
        background: true,
      });

      // Extract the actual data from wrapped responses (same logic as getFromNetwork)
      let dataToCache = response;

      if (
        response &&
        typeof response === 'object' &&
        !Array.isArray(response)
      ) {
        // Check if this is a wrapped response with a data property
        if (response.properties && Array.isArray(response.properties)) {
          dataToCache = response.properties;
        } else if (response.property && typeof response.property === 'object') {
          // Single property response: {success: true, property: {...}}
          dataToCache = response.property;
        } else if (response.features && Array.isArray(response.features)) {
          dataToCache = response.features;
        } else if (response.sketches && Array.isArray(response.sketches)) {
          dataToCache = response.sketches;
        } else if (
          response.assessment &&
          typeof response.assessment === 'object'
        ) {
          // Single assessment response
          dataToCache = response.assessment;
        }
      }

      // Cache the fresh data
      if (Array.isArray(dataToCache)) {
        for (const item of dataToCache) {
          await this.cacheItem(collection, item);
        }
      } else {
        await this.cacheItem(collection, dataToCache);
      }

      console.log(`✅ Background refresh complete: ${endpoint}`);

      // Trigger event for properties collection so components can react
      if (collection === 'properties' && !isItemRequest) {
        console.log('📢 Triggering propertiesRefreshed event');
        this.trigger('propertiesRefreshed', response);
      }
    } catch (error) {
      console.warn(`Background refresh failed for ${endpoint}:`, error);
    } finally {
      // Remove from active refreshes when done
      this.activeBackgroundRefreshes.delete(refreshKey);
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

  /**
   * Intelligently unwraps API response to extract the actual data
   * Handles various API response formats:
   * - Direct arrays: [...]
   * - Direct objects: {...}
   * - Wrapped responses: {success: true, data: [...]}
   * - Named wrappers: {properties: [...], features: [...], etc.}
   *
   * @param {*} response - The API response to unwrap
   * @returns {*} The unwrapped data (array or object)
   */
  unwrapApiResponse(response) {
    // If response is null/undefined, return empty array
    if (!response) {
      return [];
    }

    // If response is already an array, return it directly
    if (Array.isArray(response)) {
      return response;
    }

    // If response is not an object, return it as-is
    if (typeof response !== 'object') {
      return response;
    }

    // Response is an object - check for common wrapper patterns
    const keys = Object.keys(response);

    // Skip metadata fields when looking for data
    const metadataFields = [
      'success',
      'message',
      'total',
      'page',
      'limit',
      'offset',
      'count',
      'timestamp',
    ];
    const dataKeys = keys.filter((key) => !metadataFields.includes(key));

    // If there's only one non-metadata key and it's an array or object, it's likely the data
    if (dataKeys.length === 1) {
      const dataKey = dataKeys[0];
      const value = response[dataKey];

      // If it's an array or a non-null object, extract it
      if (Array.isArray(value) || (value && typeof value === 'object')) {
        console.log(
          `🔓 Unwrapped response.${dataKey} (${Array.isArray(value) ? value.length + ' items' : 'single object'})`,
        );
        return value;
      }
    }

    // Check for common data property names (ordered by specificity)
    const commonDataKeys = [
      'data', // Generic data wrapper
      'items', // Generic items wrapper
      'results', // Generic results wrapper
      'records', // Generic records wrapper
    ];

    for (const key of commonDataKeys) {
      if (response[key] !== undefined) {
        console.log(
          `🔓 Unwrapped response.${key} (${Array.isArray(response[key]) ? response[key].length + ' items' : 'single object'})`,
        );
        return response[key];
      }
    }

    // If we have multiple data keys, check if any are arrays (likely the main data)
    const arrayKeys = dataKeys.filter((key) => Array.isArray(response[key]));
    if (arrayKeys.length === 1) {
      const dataKey = arrayKeys[0];
      console.log(
        `🔓 Unwrapped response.${dataKey} (${response[dataKey].length} items - only array found)`,
      );
      return response[dataKey];
    }

    // If we still haven't found data, return the original response
    // It's likely already the data we want (single object)
    return response;
  }

  async cacheItem(collection, item) {
    // Debug logging for properties collection to track what's being cached
    if (collection === 'properties') {
      console.log('🗄️ Caching item to properties collection:', {
        id: item.id,
        idType: typeof item.id,
        mapNumber: item.mapNumber,
        lotSubDisplay: item.lotSubDisplay,
        pid_formatted: item.pid_formatted,
        hasPropertyField: !!item.property,
        allKeys: Object.keys(item).slice(0, 10), // First 10 keys
      });

      // Warn if this looks like a wrapped response object
      if (item.success !== undefined || item.property !== undefined) {
        console.error(
          '⚠️ WARNING: Attempting to cache a wrapped response object to properties!',
          item,
        );
      }
    }

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

    // Handle nested endpoints like /municipalities/{id}/properties/zones
    // These are sub-resources under properties and should NOT be cached in properties collection
    if (
      parts.length >= 4 &&
      parts[0] === 'municipalities' &&
      parts[2] === 'properties'
    ) {
      const subResource = parts[3];

      // Special handling for property sub-resources
      if (subResource === 'zones' || subResource === 'updates') {
        console.log(
          `🎯 Property sub-resource ${endpoint} -> excluded from caching (will fetch from network)`,
        );
        return null; // Don't cache zones config or update checks
      }
    }

    // Handle nested endpoints like /municipalities/{id}/properties
    if (parts.length >= 3 && parts[0] === 'municipalities') {
      const resourceName = parts[2];

      // Map municipality-scoped attribute endpoints to their own collections
      // Each endpoint gets its own collection to prevent cache collisions
      const municipalityResourceMap = {
        properties: 'properties',
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
        'water-bodies': 'water_bodies',
        'waterfront-attributes': 'waterfront_attributes',
        'water-body-ladders': 'water_body_ladders',
        permits: 'permits', // Building permits module
      };

      if (municipalityResourceMap[resourceName]) {
        console.log(
          `🎯 Mapping ${endpoint} -> ${municipalityResourceMap[resourceName]} collection`,
        );
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
        // Map different assessment endpoints to their own collections
        // This keeps ParcelAssessment, BuildingAssessment, LandAssessment separate
        if (endpoint.includes('/assessment/building')) {
          console.log(
            `🎯 Mapping ${endpoint} -> building_assessments collection`,
          );
          return 'building_assessments';
        }
        if (endpoint.includes('/assessment/land')) {
          console.log(`🎯 Mapping ${endpoint} -> land_assessments collection`);
          return 'land_assessments';
        }
        // Default to assessments collection for current/general parcel assessments
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
        console.log(
          `🎯 Assessment history endpoint detected - will fetch from network`,
        );
        return null; // Returning null will force network fetch
      }
    }

    // Handle permit-scoped endpoints like /permits/{id}/inspections
    if (parts.length >= 3 && parts[0] === 'permits' && parts[2]) {
      const resourceName = parts[2];
      const resourceMap = {
        inspections: 'permit_inspections',
        files: 'permit_documents',
        comments: 'permit_comments',
      };

      if (resourceMap[resourceName]) {
        console.log(`🎯 Mapping ${endpoint} -> ${resourceMap[resourceName]} collection`);
        return resourceMap[resourceName];
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
      permits: 'permits', // Building permits
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

  /**
   * Check if endpoint is for configuration/settings data that should use network-first
   * These endpoints represent system configuration that changes infrequently but
   * must be current when modified
   */
  isConfigurationEndpoint(endpoint) {
    const cleanEndpoint = endpoint.split('?')[0];
    const configurationPatterns = [
      '/sketch-sub-area-factors',
      '/building-codes',
      '/building-feature-codes',
      '/building-miscellaneous-points',
      '/zones',
      '/neighborhood-codes',
      '/land-use-details',
      '/land-ladders',
      '/current-use',
      '/acreage-discount-settings',
      '/exemption-types',
      '/feature-codes',
      '/pid-format',
      '/water-bodies',
      '/waterfront-attributes',
    ];

    return configurationPatterns.some((pattern) =>
      cleanEndpoint.includes(pattern),
    );
  }

  // === SMART POLLING FOR PROPERTY UPDATES ===

  /**
   * Start smart polling for property updates AND municipality configuration changes
   * Checks every 5 minutes for properties that have been updated
   * Only fetches changed properties instead of entire list
   */
  startSmartPolling() {
    // Clear any existing interval
    this.stopSmartPolling();

    console.log(
      '📡 Starting smart polling for property updates and configuration changes (5-min interval)',
    );

    // Poll immediately, then every 5 minutes
    this.checkForPropertyUpdates();
    this.checkMunicipalityVersion();
    this.pollingInterval = setInterval(
      () => {
        this.checkForPropertyUpdates();
        this.checkMunicipalityVersion();
      },
      5 * 60 * 1000,
    ); // 5 minutes
  }

  /**
   * Stop smart polling
   */
  stopSmartPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
      console.log('🛑 Stopped smart polling');
    }
  }

  /**
   * Force an immediate check for property updates (manual sync)
   */
  async forceSync() {
    console.log('🔄 Manual sync triggered');
    return await this.checkForPropertyUpdates();
  }

  /**
   * Check if municipality configuration has changed
   * Compares server lastModified timestamp with cached version
   * Invalidates affected collections when changes detected
   */
  async checkMunicipalityVersion() {
    try {
      const municipalityId = this.municipality?.currentMunicipality?.id;
      if (!municipalityId || !this.isOnline) {
        return;
      }

      // Get cached municipality version
      const cached = await this.indexedDb.getMetadata(
        `municipality_lastModified_${municipalityId}`,
      );

      // Fetch changes from server
      const sinceParam = cached?.value ? `?since=${cached.value}` : '';
      const response = await this.api.get(
        `/municipalities/${municipalityId}/configuration/changes${sinceParam}`,
        {},
        { background: true }, // Don't show loading overlay
      );

      // Check if municipality version changed
      if (cached?.value && cached.value !== response.lastModified) {
        console.log(
          '🔄 Municipality configuration changed, refreshing cache...',
          response.changes,
        );

        // Clear affected collections
        await this.handleConfigurationChanges(response.changes);

        // Update cached version
        await this.indexedDb.setMetadata(
          `municipality_lastModified_${municipalityId}`,
          response.lastModified,
        );

        // Emit event for components to refresh
        this.trigger('configurationUpdated', response.changes);
      } else if (!cached?.value) {
        // First time checking - store current version
        await this.indexedDb.setMetadata(
          `municipality_lastModified_${municipalityId}`,
          response.lastModified,
        );
        console.log('✅ Municipality configuration version stored');
      } else {
        console.log('✅ Municipality configuration up to date');
      }
    } catch (error) {
      console.error('Municipality version check failed:', error);
    }
  }

  /**
   * Handle configuration changes by clearing affected collections
   * @param {Object} changes - Object with keys like 'zones', 'landLadders', etc.
   */
  async handleConfigurationChanges(changes) {
    const collectionMap = {
      zones: 'zones',
      landLadders: 'land_ladders',
      neighborhoods: 'neighborhoods',
      buildingCodes: 'building_codes',
      featureCodes: 'building_feature_codes',
      propertyAttributes: [
        'topology_attributes',
        'site_attributes',
        'driveway_attributes',
        'road_attributes',
      ],
    };

    for (const [changeKey, hasChanged] of Object.entries(changes)) {
      if (hasChanged) {
        const collections = collectionMap[changeKey];
        if (collections) {
          if (Array.isArray(collections)) {
            // Clear multiple collections
            for (const collection of collections) {
              console.log(`🗑️ Clearing stale cache for ${collection}`);
              await this.indexedDb.clearCollection(collection);
            }
          } else {
            // Clear single collection
            console.log(`🗑️ Clearing stale cache for ${collections}`);
            await this.indexedDb.clearCollection(collections);
          }
        }
      }
    }
  }

  /**
   * Check for property updates since last sync
   * Only fetches properties that have actually changed
   */
  async checkForPropertyUpdates() {
    try {
      const municipalityId = this.municipality?.currentMunicipality?.id;
      if (!municipalityId) {
        console.log(
          '⏭️ No municipality selected, skipping property update check',
        );
        return;
      }

      // Get last sync timestamp from IndexedDB metadata
      const lastSync = await this.indexedDb.getMetadata('properties_last_sync');
      const sinceParam = lastSync?.timestamp
        ? `?since=${lastSync.timestamp}`
        : '';

      console.log(
        `🔍 Checking for property updates since: ${lastSync?.timestamp || 'initial sync'}`,
      );

      // Call the lightweight updates endpoint
      const response = await this.api.get(
        `/municipalities/${municipalityId}/properties/updates${sinceParam}`,
        {},
        { background: true }, // Don't show loading overlay
      );

      if (!response.hasUpdates) {
        console.log('✅ No property updates found');
        // Update last sync timestamp even if no updates
        await this.indexedDb.setMetadata('properties_last_sync', {
          timestamp: response.checkedAt || new Date().toISOString(),
        });
        return { hasUpdates: false };
      }

      // If this is an initial sync (no previous timestamp), don't fetch individual properties
      // The main properties list endpoint will handle the initial load more efficiently
      if (!lastSync?.timestamp) {
        console.log(
          '⏭️ Initial sync detected - skipping individual property fetches. Main properties endpoint will handle initial load.',
        );
        await this.indexedDb.setMetadata('properties_last_sync', {
          timestamp: response.checkedAt || new Date().toISOString(),
        });
        return { hasUpdates: false, isInitialSync: true };
      }

      console.log(
        `📥 Found ${response.totalUpdated} updated properties, fetching full data...`,
      );

      // Limit concurrent requests to avoid overwhelming the server
      const BATCH_SIZE = 10;
      const validProperties = [];

      for (let i = 0; i < response.updatedPropertyIds.length; i += BATCH_SIZE) {
        const batch = response.updatedPropertyIds.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(
          batch.map(async (propertyId) => {
            try {
              const propertyResponse = await this.api.get(
                `/properties/${propertyId}`,
                {},
                { background: true },
              );
              return propertyResponse.property || propertyResponse;
            } catch (error) {
              console.warn(`Failed to fetch property ${propertyId}:`, error);
              return null;
            }
          }),
        );

        // Filter out nulls and cache
        const validBatch = batchResults.filter((p) => p !== null);
        for (const property of validBatch) {
          await this.cacheItem('properties', property);
        }
        validProperties.push(...validBatch);

        console.log(
          `✅ Cached batch ${Math.floor(i / BATCH_SIZE) + 1}: ${validBatch.length} properties`,
        );
      }

      console.log(
        `✅ Cached total: ${validProperties.length} updated properties`,
      );

      // Update last sync timestamp
      await this.indexedDb.setMetadata('properties_last_sync', {
        timestamp: response.checkedAt || new Date().toISOString(),
      });

      // Trigger event for components to react
      this.trigger('propertiesRefreshed', validProperties);

      return {
        hasUpdates: true,
        totalUpdated: validProperties.length,
      };
    } catch (error) {
      console.error('Smart polling error:', error);
      return { hasUpdates: false, error: error.message };
    }
  }
}
