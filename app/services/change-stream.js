import Service from '@ember/service';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import {
  createDelta,
  applyDelta,
  resolveConflict,
  CONFLICT_RESOLUTION_STRATEGIES,
} from '../utils/delta-sync';

export default class ChangeStreamService extends Service {
  @service indexedDb;
  @service offlineManager;
  @service backgroundSync;

  @tracked isConnected = false;
  @tracked connectionError = null;
  @tracked changeStreamUrl = null;
  @tracked resumeToken = null;
  @tracked lastHeartbeat = null;

  // Real-time change tracking
  @tracked pendingChanges = new Map();
  @tracked conflictQueue = [];
  @tracked syncInProgress = false;

  // Change stream statistics
  @tracked stats = {
    changesReceived: 0,
    conflictsResolved: 0,
    deltasApplied: 0,
    bytesTransferred: 0,
    connectTime: null,
    lastSyncTime: null,
  };

  // Configuration
  RECONNECT_DELAY = 1000;
  MAX_RECONNECT_ATTEMPTS = 10;
  HEARTBEAT_INTERVAL = 30000;
  BATCH_PROCESS_DELAY = 100;

  constructor() {
    super(...arguments);

    this.reconnectAttempts = 0;
    this.eventSource = null;
    this.heartbeatTimer = null;
    this.batchProcessor = null;

    // Initialize when online
    if (this.offlineManager.isOnline) {
      this.initializeChangeStream();
    }

    // Listen for online/offline events
    window.addEventListener(
      'offline-manager:reconnected',
      this.handleReconnected.bind(this),
    );
    window.addEventListener(
      'offline-manager:disconnected',
      this.handleDisconnected.bind(this),
    );
  }

  @action
  async initializeChangeStream() {
    try {
      console.log('🔄 Initializing Change Stream connection...');

      // Get or create resume token
      await this.loadResumeToken();

      // Establish connection
      await this.connect();

      // Start batch processor
      this.startBatchProcessor();
    } catch (error) {
      console.error('Failed to initialize change stream:', error);
      this.connectionError = error.message;
      this.scheduleReconnect();
    }
  }

  @action
  async connect() {
    if (this.eventSource) {
      this.disconnect();
    }

    const baseUrl = '/api/change-stream';
    const params = new URLSearchParams();

    if (this.resumeToken) {
      params.append('resumeToken', this.resumeToken);
    }

    // Add collection filters
    params.append('collections', 'properties,assessments,views,sketches');

    this.changeStreamUrl = `${baseUrl}?${params.toString()}`;

    console.log('🔗 Connecting to change stream:', this.changeStreamUrl);

    this.eventSource = new EventSource(this.changeStreamUrl);

    this.eventSource.onopen = this.handleOpen.bind(this);
    this.eventSource.onmessage = this.handleMessage.bind(this);
    this.eventSource.onerror = this.handleError.bind(this);

    // Start heartbeat monitoring
    this.startHeartbeat();
  }

  @action
  disconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    this.stopHeartbeat();
    this.isConnected = false;
    console.log('📴 Change stream disconnected');
  }

  handleOpen(event) {
    console.log('✅ Change stream connected');
    this.isConnected = true;
    this.connectionError = null;
    this.reconnectAttempts = 0;
    this.stats.connectTime = new Date();
    this.lastHeartbeat = new Date();
  }

  async handleMessage(event) {
    try {
      const data = JSON.parse(event.data);

      this.stats.changesReceived++;
      this.stats.bytesTransferred += event.data.length;
      this.lastHeartbeat = new Date();

      await this.processChangeEvent(data);
    } catch (error) {
      console.error('Error processing change stream message:', error);
    }
  }

  handleError(event) {
    console.error('Change stream error:', event);
    this.isConnected = false;
    this.connectionError = 'Connection error';
    this.scheduleReconnect();
  }

  @action
  async processChangeEvent(changeEvent) {
    const {
      operationType,
      documentKey,
      fullDocument,
      updateDescription,
      resumeToken,
    } = changeEvent;

    // Update resume token for fault tolerance
    this.resumeToken = resumeToken;
    await this.saveResumeToken();

    // Handle heartbeat
    if (changeEvent.type === 'heartbeat') {
      this.lastHeartbeat = new Date();
      return;
    }

    console.log('📝 Processing change event:', {
      type: operationType,
      collection: changeEvent.ns?.coll,
      documentId: documentKey?._id,
    });

    // Create delta from change event
    const delta = await this.createDeltaFromChangeEvent(changeEvent);

    if (delta) {
      // Check for conflicts with local changes
      await this.checkForConflicts(delta, changeEvent);
    }
  }

  @action
  async createDeltaFromChangeEvent(changeEvent) {
    const { operationType, documentKey, fullDocument, updateDescription } =
      changeEvent;
    const collection = changeEvent.ns?.coll;
    const documentId = documentKey?._id;

    if (!collection || !documentId) {
      console.warn('Invalid change event - missing collection or document ID');
      return null;
    }

    let delta;

    switch (operationType) {
      case 'insert':
        delta = createDelta(null, fullDocument, {
          includeMetadata: true,
          compressValues: true,
        });
        break;

      case 'update':
        // Get current local version for comparison
        const localDocument = await this.indexedDb.getRecord(
          collection,
          documentId,
        );

        // Apply server update description to local document to get server version
        const serverDocument = this.applyUpdateDescription(
          localDocument,
          updateDescription,
        );

        delta = createDelta(localDocument, serverDocument, {
          includeMetadata: true,
          compressValues: true,
        });
        break;

      case 'delete':
        delta = createDelta(fullDocument || { _id: documentId }, null, {
          includeMetadata: true,
        });
        break;

      case 'replace':
        const currentDocument = await this.indexedDb.getRecord(
          collection,
          documentId,
        );
        delta = createDelta(currentDocument, fullDocument, {
          includeMetadata: true,
          compressValues: true,
        });
        break;

      default:
        console.warn(`Unsupported operation type: ${operationType}`);
        return null;
    }

    if (delta) {
      delta.source = 'server';
      delta.collection = collection;
      delta.documentId = documentId;
      delta.operationType = operationType;
      delta.changeStreamId = changeEvent._id;
    }

    return delta;
  }

  @action
  async checkForConflicts(serverDelta, changeEvent) {
    const { collection, documentId } = serverDelta;

    // Check if we have pending local changes for this document
    const localChanges = await this.indexedDb.getPendingChanges(
      collection,
      documentId,
    );

    if (localChanges.length === 0) {
      // No conflicts, apply server delta directly
      await this.applyServerDelta(serverDelta);
      return;
    }

    console.log('⚠️ Conflict detected for', collection, documentId);

    // Create client delta from local changes
    const localDocument = await this.indexedDb.getRecord(
      collection,
      documentId,
    );
    const clientDelta = this.createClientDelta(localDocument, localChanges);

    // Resolve conflict
    const resolution = await this.resolveConflict(clientDelta, serverDelta, {
      strategy: this.getConflictStrategy(collection),
      collection,
      documentId,
    });

    // Queue for processing
    this.conflictQueue.push({
      clientDelta,
      serverDelta,
      resolution,
      collection,
      documentId,
      timestamp: new Date(),
    });
  }

  @action
  async applyServerDelta(serverDelta) {
    const { collection, documentId } = serverDelta;

    try {
      // Get current local document
      const localDocument = await this.indexedDb.getRecord(
        collection,
        documentId,
      );

      // Apply server delta
      const updatedDocument = applyDelta(localDocument, serverDelta);

      // Save to local storage
      if (updatedDocument === null) {
        await this.indexedDb.deleteRecord(collection, documentId);
      } else {
        await this.indexedDb.saveRecord(collection, updatedDocument);
      }

      this.stats.deltasApplied++;
      console.log('✅ Applied server delta for', collection, documentId);

      // Notify UI of changes
      this.notifyDataChanged(collection, documentId, updatedDocument);
    } catch (error) {
      console.error('Failed to apply server delta:', error);
      throw error;
    }
  }

  @action
  async resolveConflict(clientDelta, serverDelta, options = {}) {
    const { strategy = CONFLICT_RESOLUTION_STRATEGIES.TIMESTAMP_WINS } =
      options;

    try {
      const resolution = resolveConflict(clientDelta, serverDelta, strategy, {
        fieldPriorities: this.getFieldPriorities(options.collection),
        customResolver: this.getCustomResolver(options.collection),
      });

      this.stats.conflictsResolved++;

      console.log('🔀 Conflict resolved:', {
        strategy,
        collection: options.collection,
        documentId: options.documentId,
        conflicts: resolution.conflicts?.length || 0,
      });

      return resolution;
    } catch (error) {
      console.error('Failed to resolve conflict:', error);
      throw error;
    }
  }

  // === BATCH PROCESSING ===

  startBatchProcessor() {
    if (this.batchProcessor) {
      clearInterval(this.batchProcessor);
    }

    this.batchProcessor = setInterval(() => {
      this.processBatchedChanges();
    }, this.BATCH_PROCESS_DELAY);
  }

  @action
  async processBatchedChanges() {
    if (this.syncInProgress || this.conflictQueue.length === 0) {
      return;
    }

    this.syncInProgress = true;

    try {
      const batch = this.conflictQueue.splice(0, 10); // Process up to 10 conflicts at once

      for (const conflict of batch) {
        await this.processConflictResolution(conflict);
      }

      this.stats.lastSyncTime = new Date();
    } catch (error) {
      console.error('Batch processing failed:', error);
    } finally {
      this.syncInProgress = false;
    }
  }

  @action
  async processConflictResolution(conflict) {
    const { resolution, collection, documentId } = conflict;

    if (resolution.requiresManualReview) {
      // Store for manual review
      await this.indexedDb.storeConflictForReview(conflict);
      console.log(
        '📋 Conflict queued for manual review:',
        collection,
        documentId,
      );
      return;
    }

    if (resolution.resolved) {
      // Apply resolved delta
      const resolvedDocument = applyDelta(
        await this.indexedDb.getRecord(collection, documentId),
        resolution.resolved,
      );

      if (resolvedDocument === null) {
        await this.indexedDb.deleteRecord(collection, documentId);
      } else {
        await this.indexedDb.saveRecord(collection, resolvedDocument);
      }

      // Clear local pending changes if client version was chosen
      if (resolution.resolved.source === 'client') {
        await this.indexedDb.clearPendingChanges(collection, documentId);
      }

      console.log('✅ Conflict resolved and applied:', collection, documentId);

      // Notify UI
      this.notifyDataChanged(collection, documentId, resolvedDocument);
    }
  }

  // === HELPER METHODS ===

  applyUpdateDescription(document, updateDescription) {
    if (!document || !updateDescription) return document;

    const result = { ...document };

    // Apply set operations
    if (updateDescription.updatedFields) {
      Object.assign(result, updateDescription.updatedFields);
    }

    // Apply unset operations
    if (updateDescription.removedFields) {
      for (const field of updateDescription.removedFields) {
        delete result[field];
      }
    }

    return result;
  }

  createClientDelta(localDocument, localChanges) {
    // Reconstruct what the document looked like before local changes
    const originalDocument = this.reconstructOriginalDocument(
      localDocument,
      localChanges,
    );

    return createDelta(originalDocument, localDocument, {
      includeMetadata: true,
      compressValues: true,
    });
  }

  reconstructOriginalDocument(currentDocument, changes) {
    // This is a simplified reconstruction - in practice you'd want more sophisticated logic
    let original = { ...currentDocument };

    // Reverse the changes to get the original state
    for (const change of changes.reverse()) {
      if (change.operation === 'update' || change.operation === 'add') {
        if (change.oldValue !== undefined) {
          original[change.field] = change.oldValue;
        } else {
          delete original[change.field];
        }
      } else if (change.operation === 'remove') {
        original[change.field] = change.oldValue;
      }
    }

    return original;
  }

  getConflictStrategy(collection) {
    // Define collection-specific conflict resolution strategies
    const strategies = {
      properties: CONFLICT_RESOLUTION_STRATEGIES.MERGE_FIELDS,
      assessments: CONFLICT_RESOLUTION_STRATEGIES.TIMESTAMP_WINS,
      views: CONFLICT_RESOLUTION_STRATEGIES.CLIENT_WINS,
      sketches: CONFLICT_RESOLUTION_STRATEGIES.TIMESTAMP_WINS,
    };

    return (
      strategies[collection] || CONFLICT_RESOLUTION_STRATEGIES.TIMESTAMP_WINS
    );
  }

  getFieldPriorities(collection) {
    // Define field-level priorities for merge strategies
    const priorities = {
      properties: {
        owner: 'server',
        taxValue: 'server',
        notes: 'client',
        lastViewed: 'client',
      },
      assessments: {
        status: 'server',
        scheduledDate: 'server',
        notes: 'client',
        photos: 'client',
      },
    };

    return priorities[collection] || {};
  }

  getCustomResolver(collection) {
    // Return custom resolver function if needed
    return null;
  }

  // === CONNECTION MANAGEMENT ===

  @action
  scheduleReconnect() {
    if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
      console.error('Max reconnection attempts reached');
      return;
    }

    const delay = this.RECONNECT_DELAY * Math.pow(2, this.reconnectAttempts);
    this.reconnectAttempts++;

    console.log(
      `🔄 Scheduling reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`,
    );

    setTimeout(() => {
      if (this.offlineManager.isOnline) {
        this.connect();
      }
    }, delay);
  }

  startHeartbeat() {
    this.stopHeartbeat();

    this.heartbeatTimer = setInterval(() => {
      const now = new Date();
      const timeSinceLastHeartbeat = now - this.lastHeartbeat;

      if (timeSinceLastHeartbeat > this.HEARTBEAT_INTERVAL * 2) {
        console.warn('Heartbeat timeout detected');
        this.handleError({ type: 'heartbeat-timeout' });
      }
    }, this.HEARTBEAT_INTERVAL);
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // === RESUME TOKEN MANAGEMENT ===

  async loadResumeToken() {
    try {
      const stored = await this.indexedDb.getValue(
        'change-stream-resume-token',
      );
      if (stored) {
        this.resumeToken = stored;
        console.log(
          '📥 Loaded resume token:',
          this.resumeToken.substring(0, 20) + '...',
        );
      }
    } catch (error) {
      console.error('Failed to load resume token:', error);
    }
  }

  async saveResumeToken() {
    if (this.resumeToken) {
      try {
        await this.indexedDb.setValue(
          'change-stream-resume-token',
          this.resumeToken,
        );
      } catch (error) {
        console.error('Failed to save resume token:', error);
      }
    }
  }

  // === EVENT HANDLERS ===

  @action
  handleReconnected(event) {
    console.log('🌐 Network reconnected - reinitializing change stream');
    this.initializeChangeStream();
  }

  @action
  handleDisconnected(event) {
    console.log('📴 Network disconnected - pausing change stream');
    this.disconnect();
  }

  // === NOTIFICATIONS ===

  notifyDataChanged(collection, documentId, document) {
    // Dispatch custom event for UI components to listen to
    window.dispatchEvent(
      new CustomEvent('change-stream:data-changed', {
        detail: {
          collection,
          documentId,
          document,
          timestamp: new Date(),
        },
      }),
    );
  }

  // === PUBLIC API ===

  @action
  async getConflictsForReview() {
    return await this.indexedDb.getConflictsForReview();
  }

  @action
  async resolveManualConflict(conflictId, resolution) {
    try {
      const conflict = await this.indexedDb.getConflictById(conflictId);
      if (!conflict) {
        throw new Error('Conflict not found');
      }

      // Apply the manual resolution
      await this.processConflictResolution({
        ...conflict,
        resolution: { resolved: resolution },
      });

      // Remove from review queue
      await this.indexedDb.removeConflictFromReview(conflictId);

      console.log('✅ Manual conflict resolved:', conflictId);
    } catch (error) {
      console.error('Failed to resolve manual conflict:', error);
      throw error;
    }
  }

  @action
  async pauseChangeStream() {
    this.disconnect();
    console.log('⏸️ Change stream paused');
  }

  @action
  async resumeChangeStream() {
    if (this.offlineManager.isOnline) {
      await this.initializeChangeStream();
      console.log('▶️ Change stream resumed');
    }
  }

  get status() {
    return {
      connected: this.isConnected,
      error: this.connectionError,
      pendingConflicts: this.conflictQueue.length,
      stats: this.stats,
      lastHeartbeat: this.lastHeartbeat,
      reconnectAttempts: this.reconnectAttempts,
    };
  }

  // === CLEANUP ===

  willDestroy() {
    super.willDestroy();

    this.disconnect();

    if (this.batchProcessor) {
      clearInterval(this.batchProcessor);
    }

    // Remove event listeners
    window.removeEventListener(
      'offline-manager:reconnected',
      this.handleReconnected,
    );
    window.removeEventListener(
      'offline-manager:disconnected',
      this.handleDisconnected,
    );
  }
}
