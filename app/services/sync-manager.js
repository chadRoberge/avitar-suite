import Service from '@ember/service';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class SyncManagerService extends Service {
  @service api;
  @service localStorage;
  @service notifications;
  @service municipality;

  @tracked isOnline = navigator.onLine;
  @tracked isSyncing = false;
  @tracked lastSyncTime = null;
  @tracked syncQueue = [];
  @tracked conflictItems = [];

  // Sync intervals
  BACKGROUND_SYNC_INTERVAL = 30000; // 30 seconds
  RETRY_INTERVAL = 5000; // 5 seconds for retries

  syncTimer = null;
  retryTimer = null;

  constructor() {
    super(...arguments);

    // Listen for online/offline events
    window.addEventListener('online', this.handleOnline.bind(this));
    window.addEventListener('offline', this.handleOffline.bind(this));

    // Start background sync if online
    if (this.isOnline) {
      this.startBackgroundSync();
    }

    // Load last sync time from localStorage
    const lastSync = this.localStorage.get('system:lastSyncTime');
    if (lastSync) {
      this.lastSyncTime = lastSync.data;
    }
  }

  // === ONLINE/OFFLINE HANDLING ===

  @action
  handleOnline() {
    console.log('Device back online - starting sync');
    this.isOnline = true;
    this.startBackgroundSync();
    this.syncPendingChanges();
  }

  @action
  handleOffline() {
    console.log('Device offline - stopping background sync');
    this.isOnline = false;
    this.stopBackgroundSync();
  }

  // === BACKGROUND SYNC ===

  startBackgroundSync() {
    if (this.syncTimer) return; // Already running

    this.syncTimer = setInterval(() => {
      if (this.isOnline && !this.isSyncing) {
        this.syncPendingChanges();
      }
    }, this.BACKGROUND_SYNC_INTERVAL);

    console.log('Background sync started');
  }

  stopBackgroundSync() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    console.log('Background sync stopped');
  }

  // === SYNC OPERATIONS ===

  /**
   * Sync all pending changes with the server
   */
  @action
  async syncPendingChanges() {
    if (!this.isOnline || this.isSyncing) {
      return;
    }

    this.isSyncing = true;

    try {
      // Get all dirty (local changes) data
      const dirtyItems = this.localStorage.getDirtyItems();

      if (Object.keys(dirtyItems).length === 0) {
        console.log('No local changes to sync');
        await this.pullServerUpdates();
        return;
      }

      console.log('Syncing local changes:', Object.keys(dirtyItems));

      // Push local changes to server
      for (const [collectionName, items] of Object.entries(dirtyItems)) {
        await this.pushCollectionToServer(collectionName, items);
      }

      // Pull latest updates from server
      await this.pullServerUpdates();

      this.lastSyncTime = Date.now();
      this.localStorage.set('system:lastSyncTime', this.lastSyncTime);

      console.log('Sync completed successfully');
    } catch (error) {
      console.error('Sync failed:', error);
      this.scheduleRetry();
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Push a collection to the server
   * @private
   */
  async pushCollectionToServer(collectionName, items) {
    try {
      // Determine the API endpoint based on collection name
      const endpoint = this.getEndpointForCollection(collectionName);

      // Skip if we can't determine the endpoint
      if (!endpoint) {
        console.log(
          `Skipping push for ${collectionName} - no endpoint available (collection not supported for sync)`,
        );
        return;
      }

      for (const item of items) {
        if (item._pendingDelete) {
          // Delete item on server
          if (item.id) {
            await this.api.delete(`${endpoint}/${item.id}`, {
              background: true,
            });
            console.log(`Deleted ${collectionName} item:`, item.id);
          }
        } else if (item.id && !item.id.startsWith('temp_')) {
          // Update existing item
          await this.api.put(`${endpoint}/${item.id}`, item, {
            background: true,
          });
          console.log(`Updated ${collectionName} item:`, item.id);
        } else {
          // Create new item
          const response = await this.api.post(endpoint, item, {
            background: true,
          });

          // Update local storage with server-assigned ID
          if (response && response.id) {
            item.id = response.id;
            console.log(`Created ${collectionName} item:`, response.id);
          }
        }
      }

      // Mark collection as synced
      this.localStorage.markAsSynced(collectionName);
    } catch (error) {
      console.error(`Failed to push ${collectionName}:`, error);
      throw error;
    }
  }

  /**
   * Pull latest updates from server
   * @private
   */
  async pullServerUpdates() {
    try {
      // Only sync collections that have municipality-level endpoints
      const collectionsToSync = [
        'properties', // Only properties has a municipality-level endpoint
        // sketches, assessments, features are property-specific, not municipality-wide
      ];

      for (const collectionName of collectionsToSync) {
        await this.pullCollectionFromServer(collectionName);
      }
    } catch (error) {
      console.error('Failed to pull server updates:', error);
      throw error;
    }
  }

  /**
   * Pull a specific collection from server
   * @private
   */
  async pullCollectionFromServer(collectionName) {
    try {
      const endpoint = this.getEndpointForCollection(collectionName);

      // Skip if we can't determine the endpoint (e.g., no municipality selected or unsupported collection)
      if (!endpoint) {
        console.log(
          `Skipping sync for ${collectionName} - no endpoint available (collection not supported for sync)`,
        );
        return;
      }

      const params = {};

      // Only fetch items modified since last sync
      if (this.lastSyncTime) {
        params.modifiedSince = new Date(this.lastSyncTime).toISOString();
      }

      console.log(`Syncing ${collectionName} from ${endpoint}`);
      const response = await this.api.get(
        endpoint,
        { params },
        { background: true },
      );

      // Handle different response formats
      let dataArray;
      if (response?.success && response[collectionName]) {
        // Server response format: { success: true, properties: [...] }
        dataArray = response[collectionName];
      } else if (response?.success && response.data) {
        // Alternative format: { success: true, data: [...] }
        dataArray = response.data;
      } else if (Array.isArray(response)) {
        // Direct array response
        dataArray = response;
      } else {
        dataArray = [];
      }

      if (dataArray && dataArray.length > 0) {
        console.log(
          `Pulled ${dataArray.length} ${collectionName} updates from server`,
        );

        // Merge with local data
        await this.mergeServerData(collectionName, dataArray);
      } else {
        console.log(`No updates for ${collectionName}`);
      }
    } catch (error) {
      console.error(`Failed to pull ${collectionName}:`, error);
      // Don't throw - continue with other collections
    }
  }

  /**
   * Merge server data with local data, handling conflicts
   * @private
   */
  async mergeServerData(collectionName, serverItems) {
    const localItems = this.localStorage.getCollection(collectionName) || [];
    const mergedItems = [...localItems];

    for (const serverItem of serverItems) {
      const localIndex = mergedItems.findIndex(
        (local) => local.id === serverItem.id,
      );

      if (localIndex >= 0) {
        const localItem = mergedItems[localIndex];

        // Check for conflicts (both modified)
        if (this.hasConflict(localItem, serverItem)) {
          console.warn('Data conflict detected:', {
            collection: collectionName,
            id: serverItem.id,
            local: localItem,
            server: serverItem,
          });

          // Add to conflict queue for user resolution
          const conflictId = `${collectionName}_${serverItem.id}_${Date.now()}`;
          this.conflictItems.push({
            conflictId,
            collection: collectionName,
            id: serverItem.id,
            local: localItem,
            server: serverItem,
            timestamp: Date.now(),
          });

          // For now, server wins (could be configurable)
          mergedItems[localIndex] = {
            ...serverItem,
            _hasConflict: true,
          };
        } else {
          // No conflict, merge normally (server data is newer)
          mergedItems[localIndex] = serverItem;
        }
      } else {
        // New item from server
        mergedItems.push(serverItem);
      }
    }

    // Store merged data
    this.localStorage.setCollection(collectionName, mergedItems, {
      source: 'server',
      dirty: false,
    });
  }

  /**
   * Check if there's a conflict between local and server data
   * @private
   */
  hasConflict(localItem, serverItem) {
    // Simple conflict detection based on modification times
    const localModified = new Date(
      localItem.updated_at || localItem.lastModified || 0,
    );
    const serverModified = new Date(
      serverItem.updated_at || serverItem.lastModified || 0,
    );

    // If local item was modified after our last sync time, it's a potential conflict
    return (
      localModified > new Date(this.lastSyncTime || 0) &&
      serverModified > localModified
    );
  }

  // === IMMEDIATE SYNC METHODS ===

  /**
   * Immediately sync a specific collection
   */
  @action
  async syncCollection(collectionName) {
    if (!this.isOnline) {
      console.log(`Cannot sync ${collectionName} - offline`);
      return false;
    }

    try {
      console.log(`Syncing collection: ${collectionName}`);

      const localData = this.localStorage.getCollection(collectionName);
      if (localData) {
        await this.pushCollectionToServer(collectionName, localData);
      }

      await this.pullCollectionFromServer(collectionName);

      return true;
    } catch (error) {
      console.error(`Failed to sync collection ${collectionName}:`, error);
      return false;
    }
  }

  /**
   * Immediately sync a specific item
   */
  @action
  async syncItem(collectionName, itemId) {
    if (!this.isOnline) {
      console.log(`Cannot sync ${collectionName}/${itemId} - offline`);
      return false;
    }

    try {
      const endpoint = this.getEndpointForCollection(collectionName);
      const serverItem = await this.api.get(
        `${endpoint}/${itemId}`,
        {},
        { background: true },
      );

      if (serverItem) {
        // Update local storage
        this.localStorage.addToCollection(collectionName, serverItem, {
          source: 'server',
          dirty: false,
        });
      }

      return true;
    } catch (error) {
      console.error(`Failed to sync item ${collectionName}/${itemId}:`, error);
      return false;
    }
  }

  // === CONFLICT RESOLUTION ===

  /**
   * Resolve a data conflict by choosing local or server version
   */
  @action
  resolveConflict(conflictId, resolution = 'server') {
    const conflictIndex = this.conflictItems.findIndex(
      (c) => c.conflictId === conflictId,
    );
    if (conflictIndex < 0) return;

    const conflict = this.conflictItems[conflictIndex];
    const { collection, id, local, server } = conflict;

    const chosenData = resolution === 'server' ? server : local;
    delete chosenData._hasConflict;

    // Update local storage with chosen resolution
    this.localStorage.addToCollection(collection, chosenData, {
      source: resolution,
      dirty: resolution === 'local', // If choosing local, mark for next sync
    });

    // Remove from conflict queue
    this.conflictItems.splice(conflictIndex, 1);

    console.log(`Conflict resolved for ${collection}/${id}:`, resolution);
  }

  // === UTILITY METHODS ===

  /**
   * Get API endpoint for a collection name
   * @private
   */
  getEndpointForCollection(collectionName) {
    const municipalityId = this.municipality.currentMunicipality?.id;

    // Municipality-scoped endpoints (only ones that actually exist)
    if (municipalityId && collectionName === 'properties') {
      return `/municipalities/${municipalityId}/properties`;
    }

    // Direct endpoints that exist
    const endpoints = {
      municipalities: '/municipalities',
      users: '/users',
      // Note: sketches, assessments, features are property-specific, not global collections
    };

    return endpoints[collectionName] || null; // Return null for unsupported collections
  }

  /**
   * Schedule a retry after failure
   * @private
   */
  scheduleRetry() {
    if (this.retryTimer) return;

    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (this.isOnline) {
        console.log('Retrying sync after failure...');
        this.syncPendingChanges();
      }
    }, this.RETRY_INTERVAL);
  }

  /**
   * Force a full sync (ignores last sync time)
   */
  @action
  async forceFullSync() {
    console.log('Starting forced full sync...');
    this.lastSyncTime = null;
    await this.syncPendingChanges();
  }

  /**
   * Get sync status information
   */
  getSyncStatus() {
    const dirtyItems = this.localStorage.getDirtyItems();
    const storageInfo = this.localStorage.getStorageInfo();

    return {
      isOnline: this.isOnline,
      isSyncing: this.isSyncing,
      lastSyncTime: this.lastSyncTime,
      pendingItems: Object.keys(dirtyItems).length,
      conflictCount: this.conflictItems.length,
      storageInfo,
    };
  }

  /**
   * Clean up timers on service destruction
   */
  willDestroy() {
    super.willDestroy();
    this.stopBackgroundSync();
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
    }
  }
}
