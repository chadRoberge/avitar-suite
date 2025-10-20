import Adapter from '@ember-data/adapter';
import { inject as service } from '@ember/service';

export default class IndexedDbAdapter extends Adapter {
  @service indexedDb;
  @service api; // Network API service
  @service currentUser;

  // Determine the collection name from the model name
  getCollectionName(modelName) {
    // Convert model names to collection names
    const collectionMap = {
      municipality: 'municipalities',
      property: 'properties',
      assessment: 'assessments',
      'property-view': 'views',
      sketch: 'sketches',
      feature: 'features',
      'view-attribute': 'viewAttributes',
      'zone-base-value': 'zoneBaseValues',
    };

    return collectionMap[modelName] || `${modelName}s`;
  }

  // === EMBER DATA ADAPTER METHODS ===

  async findRecord(store, type, id) {
    const modelName = type.modelName;
    const collection = this.getCollectionName(modelName);

    console.log(`IndexedDB Adapter: findRecord ${modelName}:${id}`);

    try {
      // Try IndexedDB first
      const localRecord = await this.indexedDb.get(collection, id);

      if (localRecord && this.isRecordFresh(localRecord)) {
        console.log(`Found fresh record in IndexedDB: ${modelName}:${id}`);
        return this.normalizeRecord(localRecord);
      }

      // Fall back to network if online and record is stale or missing
      if (navigator.onLine) {
        try {
          const networkRecord = await this.fetchFromNetwork(modelName, id);

          // Cache the network result
          await this.indexedDb.put(collection, {
            ...networkRecord,
            _syncState: 'synced',
            _lastSynced: new Date().toISOString(),
          });

          return this.normalizeRecord(networkRecord);
        } catch (networkError) {
          console.warn(
            `Network fetch failed for ${modelName}:${id}, falling back to stale local data`,
            networkError,
          );

          // Return stale local data if available
          if (localRecord) {
            return this.normalizeRecord(localRecord);
          }

          throw networkError;
        }
      }

      // Offline and no local record
      if (!localRecord) {
        throw new Error(`Record ${modelName}:${id} not available offline`);
      }

      return this.normalizeRecord(localRecord);
    } catch (error) {
      console.error(`Failed to find record ${modelName}:${id}:`, error);
      throw error;
    }
  }

  async findAll(store, type) {
    const modelName = type.modelName;
    const collection = this.getCollectionName(modelName);

    console.log(`IndexedDB Adapter: findAll ${modelName}`);

    try {
      // Get local records
      const localRecords = await this.indexedDb.getAll(collection);

      // If offline, return local records
      if (!navigator.onLine) {
        console.log(
          `Returning ${localRecords.length} local ${modelName} records (offline)`,
        );
        return localRecords.map((record) => this.normalizeRecord(record));
      }

      // If online, try to sync with network
      try {
        const networkRecords = await this.fetchAllFromNetwork(modelName);

        // Update local cache
        for (const record of networkRecords) {
          await this.indexedDb.put(collection, {
            ...record,
            _syncState: 'synced',
            _lastSynced: new Date().toISOString(),
          });
        }

        console.log(
          `Synced ${networkRecords.length} ${modelName} records from network`,
        );
        return networkRecords.map((record) => this.normalizeRecord(record));
      } catch (networkError) {
        console.warn(
          `Network sync failed for ${modelName}, returning local data`,
          networkError,
        );
        return localRecords.map((record) => this.normalizeRecord(record));
      }
    } catch (error) {
      console.error(`Failed to find all ${modelName}:`, error);
      throw error;
    }
  }

  async queryRecord(store, type, query) {
    const modelName = type.modelName;
    const collection = this.getCollectionName(modelName);

    console.log(`IndexedDB Adapter: queryRecord ${modelName}`, query);

    try {
      // Try local query first
      const localRecords = await this.queryLocal(collection, query);
      const localRecord = localRecords[0];

      if (localRecord && this.isRecordFresh(localRecord)) {
        return this.normalizeRecord(localRecord);
      }

      // Try network if online
      if (navigator.onLine) {
        try {
          const networkRecord = await this.queryFromNetwork(modelName, query);

          if (networkRecord) {
            // Cache the result
            await this.indexedDb.put(collection, {
              ...networkRecord,
              _syncState: 'synced',
              _lastSynced: new Date().toISOString(),
            });

            return this.normalizeRecord(networkRecord);
          }
        } catch (networkError) {
          console.warn(
            `Network query failed for ${modelName}, falling back to local data`,
            networkError,
          );
        }
      }

      // Return local record if available
      if (localRecord) {
        return this.normalizeRecord(localRecord);
      }

      return null;
    } catch (error) {
      console.error(`Failed to query record ${modelName}:`, error);
      throw error;
    }
  }

  async query(store, type, query) {
    const modelName = type.modelName;
    const collection = this.getCollectionName(modelName);

    console.log(`IndexedDB Adapter: query ${modelName}`, query);

    try {
      // Query local records
      const localRecords = await this.queryLocal(collection, query);

      // If offline, return local records
      if (!navigator.onLine) {
        console.log(
          `Returning ${localRecords.length} local ${modelName} records from query (offline)`,
        );
        return localRecords.map((record) => this.normalizeRecord(record));
      }

      // If online, try network sync for fresh data
      try {
        const networkRecords = await this.queryFromNetwork(modelName, query);

        // Update local cache
        for (const record of networkRecords) {
          await this.indexedDb.put(collection, {
            ...record,
            _syncState: 'synced',
            _lastSynced: new Date().toISOString(),
          });
        }

        console.log(
          `Synced ${networkRecords.length} ${modelName} records from network query`,
        );
        return networkRecords.map((record) => this.normalizeRecord(record));
      } catch (networkError) {
        console.warn(
          `Network query failed for ${modelName}, returning local data`,
          networkError,
        );
        return localRecords.map((record) => this.normalizeRecord(record));
      }
    } catch (error) {
      console.error(`Failed to query ${modelName}:`, error);
      throw error;
    }
  }

  async createRecord(store, type, snapshot) {
    const modelName = type.modelName;
    const collection = this.getCollectionName(modelName);
    const data = this.serialize(snapshot, { includeId: false });

    console.log(`IndexedDB Adapter: createRecord ${modelName}`, data);

    try {
      // Add to IndexedDB immediately (optimistic)
      const localId = await this.indexedDb.add(collection, {
        ...data,
        _syncState: 'local',
        _tempId: `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      });

      // Try network sync if online
      if (navigator.onLine) {
        try {
          const networkRecord = await this.createOnNetwork(modelName, data);

          // Replace local record with server result
          await this.indexedDb.update(collection, localId, {
            ...networkRecord,
            _syncState: 'synced',
            _lastSynced: new Date().toISOString(),
          });

          return this.normalizeRecord(networkRecord);
        } catch (networkError) {
          console.warn(
            `Network create failed for ${modelName}, keeping local record`,
            networkError,
          );

          // Mark as needing sync
          await this.indexedDb.update(collection, localId, {
            _syncState: 'dirty',
            _networkError: networkError.message,
          });
        }
      }

      // Return the local record
      const localRecord = await this.indexedDb.get(collection, localId);
      return this.normalizeRecord(localRecord);
    } catch (error) {
      console.error(`Failed to create ${modelName}:`, error);
      throw error;
    }
  }

  async updateRecord(store, type, snapshot) {
    const modelName = type.modelName;
    const collection = this.getCollectionName(modelName);
    const id = snapshot.id;
    const data = this.serialize(snapshot, { includeId: true });

    console.log(`IndexedDB Adapter: updateRecord ${modelName}:${id}`, data);

    try {
      // Update in IndexedDB immediately (optimistic)
      await this.indexedDb.update(collection, id, {
        ...data,
        _syncState: 'dirty',
      });

      // Try network sync if online
      if (navigator.onLine) {
        try {
          const networkRecord = await this.updateOnNetwork(modelName, id, data);

          // Update with server result
          await this.indexedDb.update(collection, id, {
            ...networkRecord,
            _syncState: 'synced',
            _lastSynced: new Date().toISOString(),
          });

          return this.normalizeRecord(networkRecord);
        } catch (networkError) {
          console.warn(
            `Network update failed for ${modelName}:${id}, keeping local changes`,
            networkError,
          );

          // Mark as needing sync
          await this.indexedDb.update(collection, id, {
            _networkError: networkError.message,
          });
        }
      }

      // Return the local record
      const localRecord = await this.indexedDb.get(collection, id);
      return this.normalizeRecord(localRecord);
    } catch (error) {
      console.error(`Failed to update ${modelName}:${id}:`, error);
      throw error;
    }
  }

  async deleteRecord(store, type, snapshot) {
    const modelName = type.modelName;
    const collection = this.getCollectionName(modelName);
    const id = snapshot.id;

    console.log(`IndexedDB Adapter: deleteRecord ${modelName}:${id}`);

    try {
      // Mark as deleted in IndexedDB (don't actually delete yet)
      await this.indexedDb.update(collection, id, {
        _syncState: 'deleted',
        _deletedAt: new Date().toISOString(),
      });

      // Try network sync if online
      if (navigator.onLine) {
        try {
          await this.deleteOnNetwork(modelName, id);

          // Actually delete from IndexedDB after server confirms
          await this.indexedDb.delete(collection, id);

          return; // Success - no return value needed for delete
        } catch (networkError) {
          console.warn(
            `Network delete failed for ${modelName}:${id}, marking for later sync`,
            networkError,
          );

          // Mark as needing sync
          await this.indexedDb.update(collection, id, {
            _networkError: networkError.message,
          });
        }
      }

      // If offline or network failed, leave marked as deleted
      console.log(`Record ${modelName}:${id} marked for deletion`);
    } catch (error) {
      console.error(`Failed to delete ${modelName}:${id}:`, error);
      throw error;
    }
  }

  // === HELPER METHODS ===

  isRecordFresh(record, maxAge = 5 * 60 * 1000) {
    // 5 minutes default
    if (!record._lastSynced) return false;

    const lastSynced = new Date(record._lastSynced);
    const now = new Date();

    return now - lastSynced < maxAge;
  }

  normalizeRecord(record) {
    // Remove internal IndexedDB fields
    const normalized = { ...record };
    delete normalized._syncState;
    delete normalized._lastSynced;
    delete normalized._conflictVersion;
    delete normalized._tempId;
    delete normalized._deletedAt;
    delete normalized._networkError;

    return normalized;
  }

  async queryLocal(collection, query) {
    // Convert Ember query to IndexedDB query
    const queryOptions = {};

    if (query.filter) {
      queryOptions.where = query.filter;
    }

    if (query.sort) {
      queryOptions.orderBy = query.sort;
    }

    if (query.limit) {
      queryOptions.limit = query.limit;
    }

    if (query.offset) {
      queryOptions.offset = query.offset;
    }

    return await this.indexedDb.query(collection, queryOptions);
  }

  // === NETWORK METHODS ===

  async fetchFromNetwork(modelName, id) {
    const endpoint = this.buildURL(modelName, id);
    return await this.api.get(endpoint);
  }

  async fetchAllFromNetwork(modelName) {
    const endpoint = this.buildURL(modelName);
    return await this.api.get(endpoint);
  }

  async queryFromNetwork(modelName, query) {
    const endpoint = this.buildURL(modelName);
    return await this.api.get(endpoint, query);
  }

  async createOnNetwork(modelName, data) {
    const endpoint = this.buildURL(modelName);
    return await this.api.post(endpoint, data);
  }

  async updateOnNetwork(modelName, id, data) {
    const endpoint = this.buildURL(modelName, id);
    return await this.api.put(endpoint, data);
  }

  async deleteOnNetwork(modelName, id) {
    const endpoint = this.buildURL(modelName, id);
    return await this.api.delete(endpoint);
  }

  buildURL(modelName, id = null) {
    const baseURL = `/api/${modelName}s`;
    return id ? `${baseURL}/${id}` : baseURL;
  }

  serialize(snapshot, options) {
    const data = {};

    snapshot.eachAttribute((key, meta) => {
      data[key] = snapshot.attr(key);
    });

    snapshot.eachRelationship((key, relationshipMeta) => {
      if (relationshipMeta.kind === 'belongsTo') {
        const relationship = snapshot.belongsTo(key);
        if (relationship) {
          data[`${key}Id`] = relationship.id;
        }
      } else if (relationshipMeta.kind === 'hasMany') {
        const relationships = snapshot.hasMany(key);
        if (relationships) {
          data[`${key}Ids`] = relationships.map((rel) => rel.id);
        }
      }
    });

    if (options.includeId && snapshot.id) {
      data.id = snapshot.id;
    }

    return data;
  }
}
