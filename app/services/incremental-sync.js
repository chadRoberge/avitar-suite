import Service from '@ember/service';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import {
  createDelta,
  applyDelta,
  compressDelta,
  decompressDelta,
  validateDelta,
  CONFLICT_RESOLUTION_STRATEGIES,
} from '../utils/delta-sync';

export default class IncrementalSyncService extends Service {
  @service indexedDb;
  @service changeStream;
  @service backgroundSync;
  @service offlineManager;
  @service hybridApi;

  @tracked syncState = 'idle'; // idle, syncing, conflict, error
  @tracked lastSyncTime = null;
  @tracked deltaStats = {
    generated: 0,
    applied: 0,
    compressed: 0,
    conflicts: 0,
    errors: 0,
  };

  // Sync configuration
  @tracked syncConfig = {
    enableCompression: true,
    compressionThreshold: 1024, // Compress deltas larger than 1KB
    batchSize: 50,
    maxRetries: 3,
    conflictStrategy: CONFLICT_RESOLUTION_STRATEGIES.TIMESTAMP_WINS,
    fieldPriorities: {},
    excludeFields: ['_rev', '_sync', 'lastModified'],
  };

  // Active sync operations
  syncQueue = new Map();
  activeSyncs = new Set();
  deltaBuffer = [];

  constructor() {
    super(...arguments);

    // Listen for data changes
    window.addEventListener(
      'change-stream:data-changed',
      this.handleRemoteChange.bind(this),
    );
    window.addEventListener(
      'offline-manager:reconnected',
      this.handleReconnection.bind(this),
    );

    // Initialize sync state tracking
    this.loadSyncState();
  }

  // === DELTA GENERATION ===

  @action
  async trackLocalChange(
    collection,
    documentId,
    oldDocument,
    newDocument,
    options = {},
  ) {
    try {
      console.log('📝 Tracking local change:', collection, documentId);

      // Generate delta
      const delta = createDelta(oldDocument, newDocument, {
        includeMetadata: true,
        compressValues: this.syncConfig.enableCompression,
        excludeFields: this.syncConfig.excludeFields,
        ...options,
      });

      if (!delta) {
        console.log('No changes detected, skipping delta');
        return null;
      }

      // Add sync metadata
      delta.source = 'client';
      delta.collection = collection;
      delta.documentId = documentId;
      delta.clientId = this.getClientId();
      delta.syncVersion = this.getSyncVersion();

      // Compress if enabled and delta is large enough
      let finalDelta = delta;
      if (
        this.syncConfig.enableCompression &&
        JSON.stringify(delta).length > this.syncConfig.compressionThreshold
      ) {
        finalDelta = compressDelta(delta);
        this.deltaStats.compressed++;
      }

      // Store delta for sync
      await this.storeDeltaForSync(collection, documentId, finalDelta);

      this.deltaStats.generated++;

      // Schedule sync if online
      if (this.offlineManager.isOnline) {
        this.scheduleIncrementalSync(collection);
      }

      console.log('✅ Delta generated and queued for sync');
      return finalDelta;
    } catch (error) {
      console.error('Failed to track local change:', error);
      this.deltaStats.errors++;
      throw error;
    }
  }

  @action
  async handleRemoteChange(event) {
    const { collection, documentId, document } = event.detail;

    try {
      console.log('📡 Handling remote change:', collection, documentId);

      // Get current local document
      const localDocument = await this.indexedDb.getRecord(
        collection,
        documentId,
      );

      // Check if we have pending local changes
      const pendingDeltas = await this.getPendingDeltas(collection, documentId);

      if (pendingDeltas.length === 0) {
        // No conflicts, apply remote change directly
        await this.applyRemoteChange(collection, documentId, document);
        return;
      }

      // Handle conflict
      await this.handleConflict(
        collection,
        documentId,
        localDocument,
        document,
        pendingDeltas,
      );
    } catch (error) {
      console.error('Failed to handle remote change:', error);
      this.deltaStats.errors++;
    }
  }

  // === SYNC OPERATIONS ===

  @action
  async performIncrementalSync(collections = null) {
    if (this.syncState === 'syncing') {
      console.log('Sync already in progress, skipping');
      return false;
    }

    this.syncState = 'syncing';

    try {
      console.log('🔄 Starting incremental sync...');

      const targetCollections = collections || [
        'properties',
        'assessments',
        'views',
        'sketches',
      ];
      const results = {};

      for (const collection of targetCollections) {
        results[collection] = await this.syncCollection(collection);
      }

      this.lastSyncTime = new Date();
      this.syncState = 'idle';

      console.log('✅ Incremental sync completed:', results);
      await this.saveSyncState();

      return results;
    } catch (error) {
      console.error('Incremental sync failed:', error);
      this.syncState = 'error';
      this.deltaStats.errors++;
      throw error;
    }
  }

  @action
  async syncCollection(collection) {
    console.log(`🔄 Syncing collection: ${collection}`);

    const pendingDeltas = await this.getPendingDeltas(collection);

    if (pendingDeltas.length === 0) {
      console.log(`No pending deltas for ${collection}`);
      return { sent: 0, applied: 0, conflicts: 0 };
    }

    // Group deltas by document for batch processing
    const deltasByDocument = this.groupDeltasByDocument(pendingDeltas);
    const results = { sent: 0, applied: 0, conflicts: 0 };

    for (const [documentId, deltas] of deltasByDocument.entries()) {
      try {
        const result = await this.syncDocument(collection, documentId, deltas);
        results.sent += result.sent;
        results.applied += result.applied;
        results.conflicts += result.conflicts;
      } catch (error) {
        console.error(`Failed to sync document ${documentId}:`, error);
        results.conflicts++;
      }
    }

    return results;
  }

  @action
  async syncDocument(collection, documentId, deltas) {
    console.log(
      `📄 Syncing document ${collection}:${documentId} with ${deltas.length} deltas`,
    );

    // Merge deltas if multiple changes to same document
    const mergedDelta = this.mergeDeltas(deltas);

    try {
      // Send delta to server
      const response = await this.sendDeltaToServer(
        collection,
        documentId,
        mergedDelta,
      );

      if (response.conflict) {
        // Handle server-reported conflict
        const resolution = await this.resolveServerConflict(
          collection,
          documentId,
          mergedDelta,
          response.serverDelta,
        );

        await this.applyConflictResolution(collection, documentId, resolution);
        return { sent: 1, applied: 1, conflicts: 1 };
      }

      // Success - mark deltas as synced
      await this.markDeltasSynced(deltas);
      return { sent: 1, applied: 1, conflicts: 0 };
    } catch (error) {
      console.error(
        `Failed to sync document ${collection}:${documentId}:`,
        error,
      );

      if (error.status === 409) {
        // Conflict detected by server
        await this.handleServerConflict(
          collection,
          documentId,
          mergedDelta,
          error.response,
        );
        return { sent: 1, applied: 1, conflicts: 1 };
      }

      throw error;
    }
  }

  @action
  async sendDeltaToServer(collection, documentId, delta) {
    const endpoint = `/api/${collection}/${documentId}/delta`;

    // Prepare payload
    const payload = {
      delta: delta.compressed ? delta : delta,
      clientId: this.getClientId(),
      syncVersion: this.getSyncVersion(),
      timestamp: new Date().toISOString(),
    };

    console.log(`📤 Sending delta to server:`, endpoint);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-ID': this.getClientId(),
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(
        `Server error: ${response.status} ${response.statusText}`,
      );
    }

    return await response.json();
  }

  // === CONFLICT RESOLUTION ===

  @action
  async handleConflict(
    collection,
    documentId,
    localDocument,
    remoteDocument,
    pendingDeltas,
  ) {
    console.log('⚠️ Handling conflict for', collection, documentId);

    this.syncState = 'conflict';
    this.deltaStats.conflicts++;

    try {
      // Create deltas for comparison
      const localDelta = this.mergeDeltas(pendingDeltas);
      const remoteDelta = createDelta(localDocument, remoteDocument, {
        includeMetadata: true,
        compressValues: false,
      });

      // Resolve conflict using configured strategy
      const resolution = await this.resolveConflict(localDelta, remoteDelta, {
        collection,
        documentId,
        strategy: this.getConflictStrategy(collection),
        fieldPriorities: this.getFieldPriorities(collection),
      });

      // Apply resolution
      await this.applyConflictResolution(collection, documentId, resolution);

      console.log('✅ Conflict resolved for', collection, documentId);
    } catch (error) {
      console.error('Failed to resolve conflict:', error);
      throw error;
    } finally {
      this.syncState = 'idle';
    }
  }

  @action
  async resolveConflict(localDelta, remoteDelta, options = {}) {
    const { collection, strategy = this.syncConfig.conflictStrategy } = options;

    // Use change stream service's conflict resolution
    return await this.changeStream.resolveConflict(
      localDelta,
      remoteDelta,
      strategy,
      options,
    );
  }

  @action
  async applyConflictResolution(collection, documentId, resolution) {
    if (resolution.requiresManualReview) {
      // Store for manual review
      await this.indexedDb.storeConflictForReview({
        collection,
        documentId,
        resolution,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (resolution.resolved) {
      // Apply resolved delta
      const currentDocument = await this.indexedDb.getRecord(
        collection,
        documentId,
      );
      const resolvedDocument = applyDelta(currentDocument, resolution.resolved);

      // Save resolved document
      if (resolvedDocument === null) {
        await this.indexedDb.deleteRecord(collection, documentId);
      } else {
        await this.indexedDb.saveRecord(collection, resolvedDocument);
      }

      // Clear pending deltas if resolution came from local changes
      if (resolution.resolved.source === 'client') {
        await this.clearPendingDeltas(collection, documentId);
      }

      this.deltaStats.applied++;
    }
  }

  // === DELTA MANAGEMENT ===

  @action
  async storeDeltaForSync(collection, documentId, delta) {
    const deltaRecord = {
      id: this.generateDeltaId(),
      collection,
      documentId,
      delta,
      timestamp: new Date().toISOString(),
      attempts: 0,
      synced: false,
    };

    await this.indexedDb.storeDelta(deltaRecord);
  }

  @action
  async getPendingDeltas(collection, documentId = null) {
    const filter = { collection, synced: false };
    if (documentId) {
      filter.documentId = documentId;
    }

    return await this.indexedDb.getDeltas(filter);
  }

  @action
  async markDeltasSynced(deltas) {
    for (const delta of deltas) {
      await this.indexedDb.updateDelta(delta.id, {
        synced: true,
        syncedAt: new Date().toISOString(),
      });
    }
  }

  @action
  async clearPendingDeltas(collection, documentId) {
    const deltas = await this.getPendingDeltas(collection, documentId);
    for (const delta of deltas) {
      await this.indexedDb.deleteDelta(delta.id);
    }
  }

  mergeDeltas(deltas) {
    if (deltas.length === 1) {
      return deltas[0].delta;
    }

    // Simple merge - in practice you'd want more sophisticated merging
    const baseDelta = deltas[0].delta;
    const mergedChanges = [];

    for (const deltaRecord of deltas) {
      const delta = deltaRecord.delta.compressed
        ? decompressDelta(deltaRecord.delta)
        : deltaRecord.delta;

      if (delta.changes) {
        mergedChanges.push(...delta.changes);
      }
    }

    return {
      ...baseDelta,
      changes: mergedChanges,
      merged: true,
      mergedFrom: deltas.map((d) => d.id),
    };
  }

  groupDeltasByDocument(deltas) {
    const grouped = new Map();

    for (const delta of deltas) {
      const key = delta.documentId;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key).push(delta);
    }

    return grouped;
  }

  // === UTILITY METHODS ===

  @action
  scheduleIncrementalSync(collection) {
    // Debounce sync requests
    const key = collection || 'all';

    if (this.syncQueue.has(key)) {
      clearTimeout(this.syncQueue.get(key));
    }

    const timeout = setTimeout(() => {
      this.performIncrementalSync(collection ? [collection] : null);
      this.syncQueue.delete(key);
    }, 1000); // 1 second debounce

    this.syncQueue.set(key, timeout);
  }

  @action
  async applyRemoteChange(collection, documentId, document) {
    try {
      if (document === null) {
        await this.indexedDb.deleteRecord(collection, documentId);
      } else {
        await this.indexedDb.saveRecord(collection, document);
      }

      this.deltaStats.applied++;
      console.log('✅ Applied remote change for', collection, documentId);
    } catch (error) {
      console.error('Failed to apply remote change:', error);
      throw error;
    }
  }

  getClientId() {
    let clientId = localStorage.getItem('avitar-client-id');
    if (!clientId) {
      clientId = 'client-' + Math.random().toString(36).substring(2, 15);
      localStorage.setItem('avitar-client-id', clientId);
    }
    return clientId;
  }

  getSyncVersion() {
    return '1.0.0';
  }

  generateDeltaId() {
    return (
      'delta-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9)
    );
  }

  getConflictStrategy(collection) {
    const strategies = {
      properties: CONFLICT_RESOLUTION_STRATEGIES.MERGE_FIELDS,
      assessments: CONFLICT_RESOLUTION_STRATEGIES.TIMESTAMP_WINS,
      views: CONFLICT_RESOLUTION_STRATEGIES.CLIENT_WINS,
      sketches: CONFLICT_RESOLUTION_STRATEGIES.TIMESTAMP_WINS,
    };

    return strategies[collection] || this.syncConfig.conflictStrategy;
  }

  getFieldPriorities(collection) {
    const priorities = {
      properties: {
        owner: 'server',
        taxValue: 'server',
        notes: 'client',
        lastViewed: 'client',
      },
      assessments: {
        status: 'server',
        assignedTo: 'server',
        notes: 'client',
        photos: 'client',
      },
    };

    return priorities[collection] || {};
  }

  // === STATE PERSISTENCE ===

  async loadSyncState() {
    try {
      const state = await this.indexedDb.getValue('incremental-sync-state');
      if (state) {
        this.lastSyncTime = state.lastSyncTime
          ? new Date(state.lastSyncTime)
          : null;
        this.deltaStats = { ...this.deltaStats, ...state.deltaStats };
        this.syncConfig = { ...this.syncConfig, ...state.syncConfig };
      }
    } catch (error) {
      console.error('Failed to load sync state:', error);
    }
  }

  async saveSyncState() {
    try {
      const state = {
        lastSyncTime: this.lastSyncTime?.toISOString(),
        deltaStats: this.deltaStats,
        syncConfig: this.syncConfig,
      };

      await this.indexedDb.setValue('incremental-sync-state', state);
    } catch (error) {
      console.error('Failed to save sync state:', error);
    }
  }

  // === EVENT HANDLERS ===

  @action
  async handleReconnection(event) {
    console.log('🌐 Network reconnected - starting incremental sync');

    // Resume syncing after reconnection
    setTimeout(() => {
      this.performIncrementalSync();
    }, 2000); // Wait 2 seconds for connection to stabilize
  }

  // === PUBLIC API ===

  @action
  async forceDeltaSync(collection = null) {
    return await this.performIncrementalSync(collection ? [collection] : null);
  }

  @action
  async getPendingSyncStats() {
    const allPending = await this.getPendingDeltas();
    const byCollection = {};

    for (const delta of allPending) {
      if (!byCollection[delta.collection]) {
        byCollection[delta.collection] = 0;
      }
      byCollection[delta.collection]++;
    }

    return {
      total: allPending.length,
      byCollection,
      lastSyncTime: this.lastSyncTime,
      syncState: this.syncState,
    };
  }

  @action
  async clearAllPendingDeltas() {
    const allPending = await this.getPendingDeltas();
    for (const delta of allPending) {
      await this.indexedDb.deleteDelta(delta.id);
    }

    console.log(`🗑️ Cleared ${allPending.length} pending deltas`);
  }

  @action
  updateSyncConfig(newConfig) {
    this.syncConfig = { ...this.syncConfig, ...newConfig };
    this.saveSyncState();
  }

  get status() {
    return {
      state: this.syncState,
      lastSyncTime: this.lastSyncTime,
      stats: this.deltaStats,
      config: this.syncConfig,
      pendingOperations: this.syncQueue.size,
    };
  }

  // === CLEANUP ===

  willDestroy() {
    super.willDestroy();

    // Clear pending timeouts
    for (const timeout of this.syncQueue.values()) {
      clearTimeout(timeout);
    }

    // Remove event listeners
    window.removeEventListener(
      'change-stream:data-changed',
      this.handleRemoteChange,
    );
    window.removeEventListener(
      'offline-manager:reconnected',
      this.handleReconnection,
    );
  }
}
