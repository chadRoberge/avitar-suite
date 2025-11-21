import Component from '@glimmer/component';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class SyncStatusIndicatorComponent extends Component {
  @service syncManager;
  @service realtime;
  @service notifications;
  @service('hybrid-api') hybridApi;

  @tracked isExpanded = false;
  @tracked _syncStatus = null;
  @tracked _realtimeStatus = null;

  constructor() {
    super(...arguments);

    // Initial status fetch
    this.updateStatus();

    // Update status every 5 seconds
    setInterval(() => {
      this.updateStatus();
    }, 5000);
  }

  updateStatus() {
    try {
      this._syncStatus = this.syncManager.getSyncStatus();
      this._realtimeStatus = this.realtime.getStatus();
    } catch (error) {
      console.warn('Error updating sync status:', error);
      // Provide fallback status
      this._syncStatus = {
        isOnline: navigator.onLine,
        isSyncing: false,
        pendingItems: 0,
        conflictCount: 0,
        storageInfo: { totalSizeMB: '0' },
      };
      this._realtimeStatus = {
        isConnected: false,
        activeListeners: [],
      };
    }
  }

  get syncStatus() {
    return (
      this._syncStatus || {
        isOnline: navigator.onLine,
        isSyncing: false,
        pendingItems: 0,
        conflictCount: 0,
        storageInfo: { totalSizeMB: '0' },
      }
    );
  }

  get realtimeStatus() {
    return (
      this._realtimeStatus || {
        isConnected: false,
        activeListeners: [],
      }
    );
  }

  get isOnline() {
    return this.syncStatus.isOnline;
  }

  get isSyncing() {
    return this.syncStatus.isSyncing;
  }

  get hasConflicts() {
    return this.syncStatus.conflictCount > 0;
  }

  get hasPendingChanges() {
    return this.syncStatus.pendingItems > 0;
  }

  get statusColor() {
    if (!this.isOnline) return 'text-danger';
    if (this.hasConflicts) return 'text-warning';
    if (this.isSyncing || this.hasPendingChanges) return 'text-primary';
    return 'text-success';
  }

  get statusIcon() {
    if (!this.isOnline) return 'fas fa-wifi-slash';
    if (this.hasConflicts) return 'fas fa-exclamation-triangle';
    if (this.isSyncing) return 'fas fa-sync-alt fa-spin';
    if (this.hasPendingChanges) return 'fas fa-upload';
    return 'fas fa-check-circle';
  }

  get statusText() {
    if (!this.isOnline) return 'Offline';
    if (this.hasConflicts) return `${this.syncStatus.conflictCount} Conflicts`;
    if (this.isSyncing) return 'Syncing...';
    if (this.hasPendingChanges)
      return `${this.syncStatus.pendingItems} Pending`;
    return 'Synced';
  }

  get lastSyncText() {
    if (!this.syncStatus.lastSyncTime) return 'Never synced';

    const timeDiff = Date.now() - this.syncStatus.lastSyncTime;
    const minutes = Math.floor(timeDiff / (1000 * 60));
    const hours = Math.floor(minutes / 60);

    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  }

  @action
  toggleExpanded() {
    this.isExpanded = !this.isExpanded;
  }

  @action
  async forceSync() {
    try {
      // Trigger smart property sync (only fetches changed properties)
      const propertySync = await this.hybridApi.forceSync();

      // Also trigger the old full sync mechanism
      await this.syncManager.forceFullSync();

      const message = propertySync?.hasUpdates
        ? `Synced ${propertySync.totalUpdated} updated properties`
        : 'No property updates found';

      this.notifications.success(message);
    } catch (error) {
      console.error('Error starting sync:', error);
      this.notifications.error('Sync failed: ' + error.message);
    }
  }

  @action
  reconnectRealtime() {
    try {
      this.realtime.disconnect();
      setTimeout(() => {
        this.realtime.connect();
      }, 1000);
      this.notifications.info('Reconnecting to real-time updates...');
    } catch (error) {
      console.error('Error reconnecting realtime:', error);
      this.notifications.error('Failed to reconnect');
    }
  }

  @action
  stopPropagation(event) {
    event.stopPropagation();
  }
}
