import Service from '@ember/service';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { applyPidFormattingBulk } from 'avitar-suite/utils/pid-formatter';

export default class LocalApiService extends Service {
  @service api; // Original API service
  @service localStorage;
  @service syncManager;
  @service realtime;
  @service hybridApi; // New IndexedDB-based service
  @service storageMigration;
  @service municipality;

  @tracked isOnline = navigator.onLine;
  @tracked migrationComplete = false;

  constructor() {
    super(...arguments);

    // Listen for online/offline events
    window.addEventListener('online', () => (this.isOnline = true));
    window.addEventListener('offline', () => (this.isOnline = false));

    // Initialize migration on startup
    this.initializeMigration();
  }

  async initializeMigration() {
    try {
      const migrationComplete =
        await this.storageMigration.checkMigrationStatus();

      if (!migrationComplete) {
        console.log('🔄 Starting localStorage to IndexedDB migration');
        await this.storageMigration.performMigration();
      }

      this.migrationComplete = true;
      console.log('✅ Migration initialization complete');
    } catch (error) {
      console.error('Migration initialization failed:', error);
      // Continue with localStorage as fallback
      this.migrationComplete = false;
    }
  }

  // === LOCAL-FIRST API METHODS ===

  /**
   * Get data with local-first approach
   * 1. Try local storage first (if available and fresh)
   * 2. Fall back to network if needed
   * 3. Cache result locally
   */
  async get(endpoint, options = {}) {
    // Use hybrid API if migration is complete, otherwise fall back to localStorage
    if (this.migrationComplete) {
      return this.hybridApi.get(endpoint, options);
    }

    const {
      useCache = true,
      maxAge = 5 * 60 * 1000, // 5 minutes default
      forceRefresh = false,
      collection = this.getCollectionFromEndpoint(endpoint),
    } = options;

    console.log(
      `🔍 LocalAPI GET: ${endpoint} | Collection: ${collection} | UseCache: ${useCache}`,
    );

    // Special handling for individual property endpoints - don't treat as collection requests
    const isIndividualProperty = endpoint.match(/^\/properties\/[^/]+$/);
    const isAssessmentEndpoint = endpoint.includes('/assessment/');
    const isSketchesEndpoint = endpoint.includes('/sketches');
    const isFeaturesEndpoint = endpoint.includes('/features');

    if (
      isIndividualProperty ||
      isAssessmentEndpoint ||
      isSketchesEndpoint ||
      isFeaturesEndpoint
    ) {
      // For individual items, create a cache key based on the full endpoint
      const cacheKey = endpoint.replace(/[^a-zA-Z0-9]/g, '_');
      if (useCache && !forceRefresh) {
        const cachedItem = this.localStorage.get(`item_${cacheKey}`, {
          maxAge,
        });
        if (cachedItem) {
          console.log(`Cache HIT: ${cacheKey}`);
          return cachedItem.data;
        } else {
          console.log(`Cache MISS: ${cacheKey}`);
        }
      }
    } else {
      // For collection requests, check local storage first
      if (useCache && !forceRefresh && collection) {
        const cached = this.localStorage.getCollection(collection, { maxAge });
        if (cached && cached.length > 0) {
          // Check for corrupted cache where API response object was cached as single item
          // This happens when {success: true, properties: [...]} was cached instead of individual items
          if (cached.length === 1 && cached[0].properties && Array.isArray(cached[0].properties)) {
            console.warn(`🧹 Detected corrupted localStorage cache in ${collection} - clearing and refetching`);
            // Clear the corrupted collection
            this.localStorage.clearCollection(collection);
            // Force network fetch
            if (!this.isOnline) {
              throw new Error(`Corrupted cache detected for ${endpoint} and device is offline`);
            }
            // Don't return here - fall through to network request below
          } else {
            // Check for incomplete property cache (missing required fields like mapNumber, lotSubDisplay)
            // Instead of refetching, apply PID formatting on-the-fly
            if (collection === 'properties' && endpoint.includes('/municipalities/')) {
              const sampleProperty = cached[0];
              if (!sampleProperty.mapNumber || !sampleProperty.lotSubDisplay) {
                console.log(`🔧 Applying PID formatting to ${cached.length} cached properties (localStorage)`);
                // Apply PID formatting to all cached properties
                const municipality = this.municipality.currentMunicipality;
                if (municipality && municipality.pid_format) {
                  cached = applyPidFormattingBulk(cached, municipality);
                  console.log(`✅ PID formatting applied successfully`);
                } else {
                  console.warn('⚠️ Municipality PID format not available - properties may not group correctly');
                }
              }
            }

            console.log(`Cache HIT: ${collection} (${cached.length} items)`);
            return this.formatCollectionResponse(cached, collection);
          }
        } else {
          console.log(`Cache MISS: ${collection}`);
        }
      }

      // For individual item requests in collections, check cache
      if (useCache && !forceRefresh && this.isItemRequest(endpoint)) {
        const { collection: itemCollection, id } =
          this.parseItemEndpoint(endpoint);
        const cached = this.localStorage.queryCollection(itemCollection, {
          id,
        });
        if (cached.length > 0) {
          console.log(`Cache HIT: ${itemCollection}/${id}`);
          return this.formatItemResponse(cached[0], itemCollection);
        } else {
          console.log(`Cache MISS: ${itemCollection}/${id}`);
        }
      }
    }

    // Try network request
    if (this.isOnline) {
      try {
        console.log(`Fetching from server: ${endpoint}`);
        const response = await this.api.get(endpoint, options.params);
        console.log(`Server response for ${endpoint}:`, response);

        // Handle API response format: {success: true, properties: [...], total: ...}
        // Extract the actual data array if present
        let dataToCache = response;
        let dataToReturn = response;

        if (response && typeof response === 'object' && !Array.isArray(response)) {
          // Check if this is a wrapped response with a data property
          if (response.properties && Array.isArray(response.properties)) {
            // Extract the properties array for caching
            dataToCache = response.properties;
            console.log(`🔍 Extracted ${dataToCache.length} items from response.properties for caching`);
          } else if (response.features && Array.isArray(response.features)) {
            // Extract features array
            dataToCache = response.features;
            console.log(`🔍 Extracted ${dataToCache.length} items from response.features for caching`);
          } else if (response.sketches && Array.isArray(response.sketches)) {
            // Extract sketches array
            dataToCache = response.sketches;
            console.log(`🔍 Extracted ${dataToCache.length} items from response.sketches for caching`);
          }
        }

        // Cache the response
        if (
          isIndividualProperty ||
          isAssessmentEndpoint ||
          isSketchesEndpoint ||
          isFeaturesEndpoint
        ) {
          // Cache individual items with endpoint-based key
          const cacheKey = endpoint.replace(/[^a-zA-Z0-9]/g, '_');
          console.log(`Caching individual item: ${cacheKey}`);
          this.localStorage.set(`item_${cacheKey}`, dataToReturn, {
            source: 'server',
            dirty: false,
          });
        } else if (collection && Array.isArray(dataToCache)) {
          console.log(`Caching array response for collection: ${collection} (${dataToCache.length} items)`);
          this.localStorage.setCollection(collection, dataToCache, {
            source: 'server',
            dirty: false,
          });
        } else if (this.isItemRequest(endpoint)) {
          const { collection: itemCollection } =
            this.parseItemEndpoint(endpoint);
          console.log(
            `Caching item response for collection: ${itemCollection}`,
          );
          this.localStorage.addToCollection(itemCollection, dataToReturn, {
            source: 'server',
            dirty: false,
          });
        }

        return dataToReturn;
      } catch (error) {
        console.error(`Network request failed for ${endpoint}:`, error);

        // If network fails, try to serve stale data from cache
        if (useCache) {
          if (
            isIndividualProperty ||
            isAssessmentEndpoint ||
            isSketchesEndpoint ||
            isFeaturesEndpoint
          ) {
            const cacheKey = endpoint.replace(/[^a-zA-Z0-9]/g, '_');
            const staleItem = this.localStorage.get(`item_${cacheKey}`);
            if (staleItem) {
              console.log(`⚠️ Serving stale data for ${cacheKey}`);
              return staleItem.data;
            }
          } else if (collection) {
            const staleData = this.localStorage.getCollection(collection);
            if (staleData) {
              console.log(`⚠️ Serving stale ${collection} data from cache`);
              return this.formatCollectionResponse(staleData, collection);
            }
          }
        }

        throw error;
      }
    } else {
      // Offline - serve from cache or throw error
      if (useCache) {
        if (
          isIndividualProperty ||
          isAssessmentEndpoint ||
          isSketchesEndpoint ||
          isFeaturesEndpoint
        ) {
          const cacheKey = endpoint.replace(/[^a-zA-Z0-9]/g, '_');
          const cachedItem = this.localStorage.get(`item_${cacheKey}`);
          if (cachedItem) {
            console.log(`📴 Serving ${cacheKey} from cache (offline)`);
            return cachedItem.data;
          }
        } else if (collection) {
          const cachedData = this.localStorage.getCollection(collection);
          if (cachedData) {
            console.log(`📴 Serving ${collection} from cache (offline)`);
            return this.formatCollectionResponse(cachedData, collection);
          }
        }
      }

      throw new Error(
        `No cached data available for ${endpoint} and device is offline`,
      );
    }
  }

  /**
   * Create data with optimistic updates
   */
  async post(endpoint, data, options = {}) {
    // Use hybrid API if migration is complete, otherwise fall back to localStorage
    if (this.migrationComplete) {
      return this.hybridApi.post(endpoint, data, options);
    }

    const {
      optimistic = true,
      collection = this.getCollectionFromEndpoint(endpoint),
    } = options;

    // Generate temporary ID for optimistic update
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const optimisticData = {
      ...data,
      id: tempId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      _isOptimistic: true,
    };

    // Add optimistically to local storage
    if (optimistic && collection) {
      console.log(`Optimistically adding to ${collection}:`, tempId);
      this.localStorage.addToCollection(collection, optimisticData, {
        source: 'local',
        dirty: true,
      });

      // Broadcast real-time update to other users
      this.realtime.broadcastChange(collection, 'create', optimisticData);
    }

    // Try network request
    if (this.isOnline) {
      try {
        const response = await this.api.post(endpoint, data);

        // Replace optimistic data with server response
        if (collection && response) {
          console.log(
            `Replacing optimistic ${collection} data:`,
            tempId,
            '->',
            response.id,
          );

          // Remove optimistic entry
          this.localStorage.removeFromCollection(collection, tempId);

          // Add server response
          this.localStorage.addToCollection(collection, response, {
            source: 'server',
            dirty: false,
          });
        }

        return response;
      } catch (error) {
        console.error(`Failed to create ${endpoint}:`, error);

        // Mark optimistic data as failed but keep it for retry
        if (collection) {
          const failedData = {
            ...optimisticData,
            _failed: true,
            _error: error.message,
          };
          this.localStorage.addToCollection(collection, failedData, {
            source: 'local',
            dirty: true,
          });
        }

        throw error;
      }
    } else {
      // Offline - data is already added optimistically
      console.log(`Created ${collection} offline (will sync when online)`);
      return optimisticData;
    }
  }

  /**
   * Update data with optimistic updates (PATCH)
   */
  async patch(endpoint, data, options = {}) {
    // Delegate to put method - functionally equivalent for our purposes
    return this.put(endpoint, data, options);
  }

  /**
   * Update data with optimistic updates (PUT)
   */
  async put(endpoint, data, options = {}) {
    // Use hybrid API if migration is complete, otherwise fall back to localStorage
    if (this.migrationComplete) {
      return this.hybridApi.put(endpoint, data, options);
    }

    const {
      optimistic = true,
      collection = this.getCollectionFromEndpoint(endpoint),
    } = options;

    const { id } = this.parseItemEndpoint(endpoint);

    // Apply optimistic update
    if (optimistic && collection && id) {
      const optimisticData = {
        ...data,
        id,
        updated_at: new Date().toISOString(),
        _isOptimistic: true,
      };

      console.log(`Optimistically updating ${collection}:`, id);
      this.localStorage.addToCollection(collection, optimisticData, {
        source: 'local',
        dirty: true,
      });

      // Broadcast real-time update
      this.realtime.broadcastChange(collection, 'update', optimisticData);
    }

    // Try network request
    if (this.isOnline) {
      try {
        const response = await this.api.put(endpoint, data);

        // Replace optimistic data with server response
        if (collection && response) {
          console.log(`Server confirmed update for ${collection}:`, id);
          this.localStorage.addToCollection(collection, response, {
            source: 'server',
            dirty: false,
          });
        }

        return response;
      } catch (error) {
        console.error(`Failed to update ${endpoint}:`, error);

        // Mark update as failed
        if (collection && id) {
          const existingData = this.localStorage.queryCollection(collection, {
            id,
          })[0];
          if (existingData) {
            const failedData = {
              ...existingData,
              _failed: true,
              _error: error.message,
            };
            this.localStorage.addToCollection(collection, failedData, {
              source: 'local',
              dirty: true,
            });
          }
        }

        throw error;
      }
    } else {
      // Offline - optimistic update is already applied
      console.log(
        `Updated ${collection}/${id} offline (will sync when online)`,
      );
      return data;
    }
  }

  /**
   * Delete data with optimistic updates
   */
  async delete(endpoint, options = {}) {
    // Use hybrid API if migration is complete, otherwise fall back to localStorage
    if (this.migrationComplete) {
      return this.hybridApi.delete(endpoint, options);
    }

    const {
      optimistic = true,
      collection = this.getCollectionFromEndpoint(endpoint),
    } = options;

    const { id } = this.parseItemEndpoint(endpoint);

    console.log(`🗑️  LocalAPI DELETE: ${endpoint}`);
    console.log(`Collection: ${collection}, ID: ${id}`);

    // Apply optimistic delete
    if (optimistic && collection && id) {
      console.log(`Optimistically deleting ${collection}:`, id);

      // Mark as pending delete rather than removing immediately
      // Try both id formats since sketches might use _id
      let existingData = this.localStorage.queryCollection(collection, {
        id,
      })[0];
      if (!existingData) {
        existingData = this.localStorage.queryCollection(collection, {
          _id: id,
        })[0];
      }
      console.log('Found existing data for deletion:', existingData);

      if (existingData) {
        const pendingDeleteData = {
          ...existingData,
          _pendingDelete: true,
          _isOptimistic: true,
        };

        this.localStorage.addToCollection(collection, pendingDeleteData, {
          source: 'local',
          dirty: true,
        });

        // Broadcast real-time update
        this.realtime.broadcastChange(collection, 'delete', { id });
      } else {
        console.log(
          `No existing data found for ${collection}:${id} - skipping optimistic delete`,
        );
      }
    }

    // Try network request
    if (this.isOnline) {
      try {
        const response = await this.api.delete(endpoint);

        // Actually remove from local storage after server confirms
        if (collection && id) {
          console.log(`Server confirmed delete for ${collection}:`, id);
          this.localStorage.removeFromCollection(collection, id);
          console.log(
            `Successfully removed ${collection}:${id} from local storage`,
          );
        }

        return response;
      } catch (error) {
        console.error(`Failed to delete ${endpoint}:`, error);

        // Restore item and mark as failed
        if (collection && id) {
          const existingData = this.localStorage.queryCollection(collection, {
            id,
          })[0];
          if (existingData) {
            const failedData = {
              ...existingData,
              _pendingDelete: false,
              _failed: true,
              _error: error.message,
            };

            this.localStorage.addToCollection(collection, failedData, {
              source: 'local',
              dirty: true,
            });
          }
        }

        throw error;
      }
    } else {
      // Offline - delete is already marked
      console.log(
        `Deleted ${collection}/${id} offline (will sync when online)`,
      );
      return { success: true };
    }
  }

  // === UTILITY METHODS ===

  /**
   * Determine collection name from endpoint
   * @private
   */
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
        return municipalityResourceMap[resourceName];
      }
    }

    // Handle property-scoped endpoints like /properties/{id}/sketches
    if (parts.length >= 3 && parts[0] === 'properties' && parts[2]) {
      const resourceName = parts[2];
      if (['sketches', 'features'].includes(resourceName)) {
        return resourceName;
      }
      // Handle assessment endpoints like /properties/{id}/assessment/current
      if (resourceName === 'assessment') {
        return 'assessments';
      }
      if (resourceName === 'exemptions') {
        return 'exemptions';
      }
    }

    // Handle direct endpoints like /properties, /sketches
    const collection = parts[0];

    // Map common endpoints to collection names
    const collectionMap = {
      properties: 'properties',
      sketches: 'sketches',
      assessments: 'assessments',
      features: 'features',
      municipalities: 'municipalities',
      appeals: 'appeals',
      exemptions: 'exemptions',
      'exemption-types': 'exemptionTypes',
      views: 'views',
      'view-attributes': 'viewAttributes',
    };

    return collectionMap[collection] || collection;
  }

  /**
   * Check if endpoint is for a specific item (has ID)
   * @private
   */
  isItemRequest(endpoint) {
    const parts = endpoint.replace(/^\//, '').split('/');

    // Handle nested endpoints like /municipalities/{id}/properties/{propertyId}
    if (parts.length >= 4 && parts[0] === 'municipalities') {
      // Check if the last part is an ID (either numeric or ObjectId-like)
      const lastPart = parts[3];
      return (
        lastPart &&
        (!isNaN(lastPart) || // Numeric ID
          /^[0-9a-fA-F]{24}$/.test(lastPart)) // MongoDB ObjectId
      );
    }

    // Handle property-scoped endpoints like /properties/{id}/sketches/{sketchId}
    if (parts.length >= 4 && parts[0] === 'properties' && parts[2]) {
      // Check if the last part is an ID
      const lastPart = parts[3];
      return (
        lastPart &&
        (!isNaN(lastPart) || // Numeric ID
          /^[0-9a-fA-F]{24}$/.test(lastPart)) // MongoDB ObjectId
      );
    }

    // Handle direct endpoints like /properties/{id}
    return (
      parts.length >= 2 &&
      parts[1] &&
      (!isNaN(parts[1]) || // Numeric ID
        /^[0-9a-fA-F]{24}$/.test(parts[1])) // MongoDB ObjectId
    );
  }

  /**
   * Parse item endpoint to get collection and ID
   * @private
   */
  parseItemEndpoint(endpoint) {
    const parts = endpoint.replace(/^\//, '').split('/');

    // Handle nested endpoints like /municipalities/{id}/properties/{propertyId}
    if (parts.length >= 4 && parts[0] === 'municipalities') {
      return {
        collection: this.getCollectionFromEndpoint(endpoint),
        id: parts[3], // The property/resource ID
      };
    }

    // Handle property-scoped endpoints like /properties/{id}/sketches/{sketchId}
    if (parts.length >= 4 && parts[0] === 'properties' && parts[2]) {
      return {
        collection: this.getCollectionFromEndpoint(endpoint),
        id: parts[3], // The sketch/assessment/feature ID
      };
    }

    // Handle direct endpoints like /properties/{id}
    return {
      collection: this.getCollectionFromEndpoint(endpoint),
      id: parts[1],
    };
  }

  /**
   * Format collection response to match server format
   * @private
   */
  formatCollectionResponse(data, collection) {
    // Filter out optimistic/failed items for display
    const cleanData = data.filter((item) => !item._pendingDelete);

    // Some endpoints expect data wrapped in an object
    if (collection === 'properties') {
      return cleanData; // Properties endpoint returns array directly
    }

    return cleanData;
  }

  /**
   * Format item response to match server format
   * @private
   */
  formatItemResponse(data, collection) {
    // Remove internal flags
    const cleanData = { ...data };
    delete cleanData._isOptimistic;
    delete cleanData._failed;
    delete cleanData._error;
    delete cleanData._pendingDelete;

    return cleanData;
  }

  // === SYNC METHODS ===

  /**
   * Force sync a specific collection
   */
  @action
  async syncCollection(collection) {
    return this.syncManager.syncCollection(collection);
  }

  /**
   * Get sync status for debugging
   */
  getSyncStatus() {
    return {
      ...this.syncManager.getSyncStatus(),
      realtime: this.realtime.getStatus(),
    };
  }

  /**
   * Clear all cached data (for debugging)
   */
  clearCache() {
    this.localStorage.clearAll();
    console.log('Local cache cleared');
  }

  // === DIRECT API PASSTHROUGH ===

  /**
   * Direct API call without caching (for special cases)
   */
  async directGet(endpoint, options = {}) {
    return this.api.get(endpoint, options);
  }

  async directPost(endpoint, data, options = {}) {
    return this.api.post(endpoint, data);
  }

  async directPatch(endpoint, data, options = {}) {
    return this.api.patch(endpoint, data);
  }

  async directPut(endpoint, data, options = {}) {
    return this.api.put(endpoint, data);
  }

  async directDelete(endpoint, options = {}) {
    return this.api.delete(endpoint);
  }
}
