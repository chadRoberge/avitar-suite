import Service from '@ember/service';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class BackgroundSyncService extends Service {
  @service indexedDb;
  @service serviceWorkerManager;

  @tracked isOnline = navigator.onLine;
  @tracked syncInProgress = false;
  @tracked syncStatus = {
    pending: 0,
    failed: 0,
    total: 0,
  };

  // Sync tags for different types of operations
  SYNC_TAGS = {
    PROPERTY_SYNC: 'property-sync',
    ASSESSMENT_SYNC: 'assessment-sync',
    VIEW_SYNC: 'view-sync',
    SKETCH_SYNC: 'sketch-sync',
    GENERAL_SYNC: 'general-sync',
  };

  constructor() {
    super(...arguments);

    // Listen for online/offline events
    window.addEventListener('online', this.handleOnline.bind(this));
    window.addEventListener('offline', this.handleOffline.bind(this));

    // Listen for service worker messages
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.addEventListener(
        'message',
        this.handleServiceWorkerMessage.bind(this),
      );
    }

    // Check initial sync status
    this.updateSyncStatus();
  }

  @action
  handleOnline() {
    console.log('🌐 Device came online - triggering background sync');
    this.isOnline = true;
    this.scheduleGeneralSync();
  }

  @action
  handleOffline() {
    console.log('📴 Device went offline');
    this.isOnline = false;
  }

  handleServiceWorkerMessage(event) {
    const { type, results, error } = event.data;

    switch (type) {
      case 'sync-completed':
        console.log('✅ Background sync completed:', results);
        this.syncInProgress = false;
        this.updateSyncStatus();
        break;

      case 'sync-failed':
        console.error('❌ Background sync failed:', error);
        this.syncInProgress = false;
        this.updateSyncStatus();
        break;

      default:
        console.log('Unknown service worker message:', event.data);
    }
  }

  // === SYNC SCHEDULING ===

  @action
  async scheduleSync(tag, data = null) {
    if (
      !('serviceWorker' in navigator) ||
      !navigator.serviceWorker.controller
    ) {
      console.warn(
        'Service Worker not available, falling back to immediate sync',
      );
      return this.immediateSync();
    }

    try {
      // Send message to service worker to schedule sync
      navigator.serviceWorker.controller.postMessage({
        type: 'SCHEDULE_SYNC',
        data: { tag, data },
      });

      console.log(`📅 Scheduled background sync: ${tag}`);
      return true;
    } catch (error) {
      console.error('Failed to schedule background sync:', error);
      return this.immediateSync();
    }
  }

  @action
  async scheduleGeneralSync() {
    return this.scheduleSync(this.SYNC_TAGS.GENERAL_SYNC);
  }

  @action
  async schedulePropertySync() {
    return this.scheduleSync(this.SYNC_TAGS.PROPERTY_SYNC);
  }

  @action
  async scheduleAssessmentSync() {
    return this.scheduleSync(this.SYNC_TAGS.ASSESSMENT_SYNC);
  }

  @action
  async scheduleViewSync() {
    return this.scheduleSync(this.SYNC_TAGS.VIEW_SYNC);
  }

  @action
  async scheduleSketchSync() {
    return this.scheduleSync(this.SYNC_TAGS.SKETCH_SYNC);
  }

  // === IMMEDIATE SYNC (FALLBACK) ===

  @action
  async immediateSync() {
    if (this.syncInProgress) {
      console.log('Sync already in progress, skipping');
      return false;
    }

    if (!this.isOnline) {
      console.log('Device offline, sync will happen when online');
      return false;
    }

    this.syncInProgress = true;

    try {
      console.log('🔄 Starting immediate sync...');

      const syncQueue = await this.indexedDb.getSyncQueue();
      console.log(`Found ${syncQueue.length} items to sync`);

      let successCount = 0;
      let failCount = 0;

      for (const queueItem of syncQueue) {
        try {
          await this.processSyncItem(queueItem);
          await this.indexedDb.markSyncComplete(queueItem.id);
          successCount++;
        } catch (error) {
          console.error(`Sync failed for queue item ${queueItem.id}:`, error);
          await this.indexedDb.markSyncFailed(queueItem.id, error);
          failCount++;
        }
      }

      console.log(
        `✅ Immediate sync completed: ${successCount} success, ${failCount} failed`,
      );
      return true;
    } catch (error) {
      console.error('Immediate sync failed:', error);
      return false;
    } finally {
      this.syncInProgress = false;
      this.updateSyncStatus();
    }
  }

  async processSyncItem(queueItem) {
    const { action, collection, recordId, data } = queueItem;

    let url;
    let options = {
      method: action.toUpperCase(),
      headers: {
        'Content-Type': 'application/json',
      },
    };

    switch (action) {
      case 'post':
        url = `/api/${collection}`;
        options.body = JSON.stringify(data);
        break;

      case 'put':
        url = `/api/${collection}/${recordId}`;
        options.body = JSON.stringify(data);
        break;

      case 'delete':
        url = `/api/${collection}/${recordId}`;
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

  // === SYNC STATUS MANAGEMENT ===

  @action
  async updateSyncStatus() {
    try {
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        // Get status from service worker
        const messageChannel = new MessageChannel();

        navigator.serviceWorker.controller.postMessage(
          { type: 'GET_SYNC_STATUS' },
          [messageChannel.port2],
        );

        return new Promise((resolve) => {
          messageChannel.port1.onmessage = (event) => {
            this.syncStatus = event.data;
            resolve(this.syncStatus);
          };
        });
      } else {
        // Fallback: get status from IndexedDB directly
        const syncQueue = await this.indexedDb.getSyncQueue();
        const allItems = await this.indexedDb.db.syncQueue.toArray();

        const pending = allItems.filter((item) => !item._failed);
        const failed = allItems.filter((item) => item._failed);

        this.syncStatus = {
          pending: pending.length,
          failed: failed.length,
          total: allItems.length,
        };

        return this.syncStatus;
      }
    } catch (error) {
      console.error('Failed to update sync status:', error);
      return this.syncStatus;
    }
  }

  // === QUEUE ITEM MANAGEMENT ===

  @action
  async addToSyncQueue(action, collection, recordId, data) {
    try {
      await this.indexedDb.queueForSync(collection, recordId, action, data);

      // Update status
      this.updateSyncStatus();

      // Schedule appropriate sync
      switch (collection) {
        case 'properties':
          this.schedulePropertySync();
          break;
        case 'assessments':
          this.scheduleAssessmentSync();
          break;
        case 'views':
          this.scheduleViewSync();
          break;
        case 'sketches':
          this.scheduleSketchSync();
          break;
        default:
          this.scheduleGeneralSync();
      }

      console.log(
        `📝 Added ${action} operation for ${collection}:${recordId} to sync queue`,
      );
    } catch (error) {
      console.error('Failed to add item to sync queue:', error);
      throw error;
    }
  }

  @action
  async retryFailedItems() {
    try {
      // Reset all failed items to retry
      const allItems = await this.indexedDb.db.syncQueue.toArray();
      const failedItems = allItems.filter((item) => item._failed);

      for (const item of failedItems) {
        await this.indexedDb.db.syncQueue.update(item.id, {
          _failed: false,
          retryCount: (item.retryCount || 0) + 1,
          lastRetry: new Date().toISOString(),
        });
      }

      console.log(`🔄 Marked ${failedItems.length} failed items for retry`);

      // Trigger sync
      this.scheduleGeneralSync();

      // Update status
      this.updateSyncStatus();
    } catch (error) {
      console.error('Failed to retry failed items:', error);
      throw error;
    }
  }

  @action
  async clearFailedItems() {
    try {
      const allItems = await this.indexedDb.db.syncQueue.toArray();
      const failedItems = allItems.filter((item) => item._failed);

      for (const item of failedItems) {
        await this.indexedDb.db.syncQueue.delete(item.id);
      }

      console.log(
        `🗑️ Cleared ${failedItems.length} failed items from sync queue`,
      );

      // Update status
      this.updateSyncStatus();
    } catch (error) {
      console.error('Failed to clear failed items:', error);
      throw error;
    }
  }

  @action
  async clearAllSyncItems() {
    try {
      await this.indexedDb.db.syncQueue.clear();
      console.log('🗑️ Cleared all items from sync queue');

      // Update status
      this.updateSyncStatus();
    } catch (error) {
      console.error('Failed to clear sync queue:', error);
      throw error;
    }
  }

  // === PUBLIC API ===

  get hasPendingItems() {
    return this.syncStatus.pending > 0;
  }

  get hasFailedItems() {
    return this.syncStatus.failed > 0;
  }

  get isSyncAvailable() {
    return (
      'serviceWorker' in navigator &&
      'sync' in window.ServiceWorkerRegistration.prototype
    );
  }

  @action
  async getSyncQueueDetails() {
    try {
      const allItems = await this.indexedDb.db.syncQueue.toArray();

      const grouped = allItems.reduce((acc, item) => {
        const collection = item.collection;
        if (!acc[collection]) {
          acc[collection] = { pending: 0, failed: 0, items: [] };
        }

        if (item._failed) {
          acc[collection].failed++;
        } else {
          acc[collection].pending++;
        }

        acc[collection].items.push(item);
        return acc;
      }, {});

      return grouped;
    } catch (error) {
      console.error('Failed to get sync queue details:', error);
      return {};
    }
  }

  // === PERIODIC SYNC ===

  @action
  async requestPeriodicSync() {
    if (
      !('serviceWorker' in navigator) ||
      !('periodicSync' in window.ServiceWorkerRegistration.prototype)
    ) {
      console.warn('Periodic Background Sync not supported');
      return false;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.periodicSync.register('periodic-sync', {
        minInterval: 24 * 60 * 60 * 1000, // 24 hours
      });

      console.log('📅 Periodic background sync registered');
      return true;
    } catch (error) {
      console.error('Failed to register periodic sync:', error);
      return false;
    }
  }

  @action
  async unregisterPeriodicSync() {
    if (
      !('serviceWorker' in navigator) ||
      !('periodicSync' in window.ServiceWorkerRegistration.prototype)
    ) {
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.periodicSync.unregister('periodic-sync');

      console.log('📅 Periodic background sync unregistered');
    } catch (error) {
      console.error('Failed to unregister periodic sync:', error);
    }
  }

  // === DEBUGGING ===

  @action
  async debugSyncQueue() {
    const details = await this.getSyncQueueDetails();
    console.group('🐛 Sync Queue Debug Info');
    console.log('Status:', this.syncStatus);
    console.log('Details:', details);
    console.log('Online:', this.isOnline);
    console.log('Sync Available:', this.isSyncAvailable);
    console.groupEnd();
    return details;
  }
}
