import Service from '@ember/service';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class OfflineManagerService extends Service {
  @service backgroundSync;
  @service indexedDb;
  @service storageMigration;

  @tracked isOnline = navigator.onLine;
  @tracked offlineCapabilities = {
    read: false,
    create: false,
    update: false,
    delete: false,
  };
  @tracked lastOnlineTime = new Date();
  @tracked offlineDuration = 0;
  @tracked connectionQuality = 'unknown';

  // Connection quality thresholds (ms)
  QUALITY_THRESHOLDS = {
    EXCELLENT: 100,
    GOOD: 300,
    FAIR: 1000,
    POOR: 2000,
  };

  constructor() {
    super(...arguments);

    this.initializeOfflineDetection();
    this.checkOfflineCapabilities();
    this.startConnectionQualityMonitoring();
  }

  initializeOfflineDetection() {
    // Basic online/offline detection
    window.addEventListener('online', this.handleOnline.bind(this));
    window.addEventListener('offline', this.handleOffline.bind(this));

    // Enhanced connection detection
    if ('connection' in navigator) {
      navigator.connection.addEventListener(
        'change',
        this.handleConnectionChange.bind(this),
      );
    }

    // Periodic connectivity check
    this.startPeriodicConnectivityCheck();
  }

  @action
  handleOnline() {
    console.log('🌐 Device online');

    const wasOffline = !this.isOnline;
    this.isOnline = true;

    if (wasOffline) {
      this.calculateOfflineDuration();
      this.onReconnect();
    }
  }

  @action
  handleOffline() {
    console.log('📴 Device offline');

    this.isOnline = false;
    this.lastOnlineTime = new Date();
    this.connectionQuality = 'offline';

    this.onDisconnect();
  }

  @action
  handleConnectionChange() {
    if ('connection' in navigator) {
      const connection = navigator.connection;
      console.log('📶 Connection changed:', {
        effectiveType: connection.effectiveType,
        downlink: connection.downlink,
        rtt: connection.rtt,
        saveData: connection.saveData,
      });

      this.updateConnectionQuality();
    }
  }

  calculateOfflineDuration() {
    if (this.lastOnlineTime) {
      this.offlineDuration = Date.now() - this.lastOnlineTime.getTime();
      console.log(
        `📴 Was offline for ${Math.round(this.offlineDuration / 1000)}s`,
      );
    }
  }

  async onReconnect() {
    console.log('🔄 Reconnected - triggering sync operations');

    // Trigger background sync
    this.backgroundSync.scheduleGeneralSync();

    // Update connection quality
    this.updateConnectionQuality();

    // Notify other services
    this.notifyReconnection();
  }

  onDisconnect() {
    console.log('📴 Disconnected - enabling offline mode');

    // Notify other services
    this.notifyDisconnection();
  }

  // === CONNECTION QUALITY MONITORING ===

  startConnectionQualityMonitoring() {
    // Test connection quality every 30 seconds when online
    setInterval(() => {
      if (this.isOnline) {
        this.measureConnectionQuality();
      }
    }, 30000);
  }

  async measureConnectionQuality() {
    try {
      const startTime = performance.now();

      // Make a small request to test latency
      const response = await fetch('/api/municipalities', {
        method: 'HEAD',
        cache: 'no-cache',
      });

      const endTime = performance.now();
      const latency = endTime - startTime;

      this.updateConnectionQualityFromLatency(latency);

      console.log(
        `📶 Connection latency: ${Math.round(latency)}ms (${this.connectionQuality})`,
      );
    } catch (error) {
      console.log('📶 Connection quality test failed:', error);
      this.connectionQuality = 'poor';
    }
  }

  updateConnectionQualityFromLatency(latency) {
    if (latency < this.QUALITY_THRESHOLDS.EXCELLENT) {
      this.connectionQuality = 'excellent';
    } else if (latency < this.QUALITY_THRESHOLDS.GOOD) {
      this.connectionQuality = 'good';
    } else if (latency < this.QUALITY_THRESHOLDS.FAIR) {
      this.connectionQuality = 'fair';
    } else {
      this.connectionQuality = 'poor';
    }
  }

  updateConnectionQuality() {
    if (!this.isOnline) {
      this.connectionQuality = 'offline';
      return;
    }

    if ('connection' in navigator) {
      const connection = navigator.connection;
      const effectiveType = connection.effectiveType;

      switch (effectiveType) {
        case '4g':
          this.connectionQuality = 'excellent';
          break;
        case '3g':
          this.connectionQuality = 'good';
          break;
        case '2g':
          this.connectionQuality = 'fair';
          break;
        case 'slow-2g':
          this.connectionQuality = 'poor';
          break;
        default:
          this.connectionQuality = 'unknown';
      }
    } else {
      // Fallback to latency measurement
      this.measureConnectionQuality();
    }
  }

  // === OFFLINE CAPABILITIES ASSESSMENT ===

  async checkOfflineCapabilities() {
    try {
      // Check if IndexedDB is working
      const isIndexedDbReady = await this.indexedDb.isReady;

      if (isIndexedDbReady) {
        // Check data availability for different operations
        const stats = await this.indexedDb.getStorageStats();

        this.offlineCapabilities = {
          read: stats.properties > 0 || stats.assessments > 0,
          create: true, // Always possible with optimistic updates
          update: stats.properties > 0 || stats.assessments > 0,
          delete: stats.properties > 0 || stats.assessments > 0,
        };
      } else {
        this.offlineCapabilities = {
          read: false,
          create: false,
          update: false,
          delete: false,
        };
      }

      console.log('📱 Offline capabilities:', this.offlineCapabilities);
    } catch (error) {
      console.error('Failed to check offline capabilities:', error);
      this.offlineCapabilities = {
        read: false,
        create: false,
        update: false,
        delete: false,
      };
    }
  }

  // === PERIODIC CONNECTIVITY CHECK ===

  startPeriodicConnectivityCheck() {
    // Check connectivity every 10 seconds
    setInterval(() => {
      this.checkConnectivity();
    }, 10000);
  }

  async checkConnectivity() {
    // More reliable connectivity check
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch('/api/municipalities', {
        method: 'HEAD',
        cache: 'no-cache',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const wasOffline = !this.isOnline;
      this.isOnline = response.ok;

      if (wasOffline && this.isOnline) {
        this.handleOnline();
      } else if (!wasOffline && !this.isOnline) {
        this.handleOffline();
      }
    } catch (error) {
      // Network request failed
      if (this.isOnline) {
        this.handleOffline();
      }
    }
  }

  // === OFFLINE STRATEGIES ===

  getRecommendedStrategy() {
    // For IndexedDB-first operation, always prefer local-first even when offline
    // This allows fallback to network when data is missing from IndexedDB
    if (!this.isOnline) {
      return 'local-first'; // Changed from 'local-only' to 'local-first'
    }

    switch (this.connectionQuality) {
      case 'excellent':
      case 'good':
        return 'local-first'; // Changed to local-first for IndexedDB-only operation
      case 'fair':
        return 'local-first'; // Changed to local-first for IndexedDB-only operation
      case 'poor':
        return 'local-first';
      default:
        return 'local-first'; // Changed to local-first for IndexedDB-only operation
    }
  }

  shouldUseOptimisticUpdates() {
    return !this.isOnline || this.connectionQuality === 'poor';
  }

  shouldPreloadData() {
    return (
      this.isOnline &&
      (this.connectionQuality === 'excellent' ||
        this.connectionQuality === 'good')
    );
  }

  // === NOTIFICATION SYSTEM ===

  notifyReconnection() {
    // Dispatch custom event
    window.dispatchEvent(
      new CustomEvent('offline-manager:reconnected', {
        detail: {
          offlineDuration: this.offlineDuration,
          connectionQuality: this.connectionQuality,
        },
      }),
    );
  }

  notifyDisconnection() {
    // Dispatch custom event
    window.dispatchEvent(
      new CustomEvent('offline-manager:disconnected', {
        detail: {
          capabilities: this.offlineCapabilities,
        },
      }),
    );
  }

  // === USER FEEDBACK ===

  getOfflineMessage() {
    if (this.isOnline) {
      return null;
    }

    if (this.offlineCapabilities.read) {
      return "You're offline, but you can still view and edit data. Changes will sync when you're back online.";
    } else {
      return "You're offline and no cached data is available. Please connect to the internet.";
    }
  }

  getConnectionQualityMessage() {
    switch (this.connectionQuality) {
      case 'excellent':
        return 'Excellent connection';
      case 'good':
        return 'Good connection';
      case 'fair':
        return 'Fair connection - some features may be slower';
      case 'poor':
        return 'Poor connection - using offline mode when possible';
      case 'offline':
        return 'Offline';
      default:
        return 'Connection status unknown';
    }
  }

  // === PUBLIC API ===

  get canWorkOffline() {
    return this.offlineCapabilities.read || this.offlineCapabilities.create;
  }

  get isSlowConnection() {
    return (
      this.connectionQuality === 'poor' || this.connectionQuality === 'fair'
    );
  }

  @action
  async forceConnectivityCheck() {
    await this.checkConnectivity();
    await this.measureConnectionQuality();
    await this.checkOfflineCapabilities();
  }

  @action
  async getDetailedStatus() {
    await this.forceConnectivityCheck();

    return {
      isOnline: this.isOnline,
      connectionQuality: this.connectionQuality,
      capabilities: this.offlineCapabilities,
      recommendedStrategy: this.getRecommendedStrategy(),
      canWorkOffline: this.canWorkOffline,
      offlineMessage: this.getOfflineMessage(),
      qualityMessage: this.getConnectionQualityMessage(),
      lastOnlineTime: this.lastOnlineTime,
      offlineDuration: this.offlineDuration,
    };
  }

  // === DEBUGGING ===

  @action
  debugOfflineState() {
    console.group('🐛 Offline Manager Debug Info');
    console.log('Online:', this.isOnline);
    console.log('Connection Quality:', this.connectionQuality);
    console.log('Capabilities:', this.offlineCapabilities);
    console.log('Recommended Strategy:', this.getRecommendedStrategy());
    console.log('Can Work Offline:', this.canWorkOffline);
    console.log('Last Online:', this.lastOnlineTime);
    console.log('Offline Duration:', this.offlineDuration);

    if ('connection' in navigator) {
      console.log('Navigator Connection:', navigator.connection);
    }

    console.groupEnd();
  }
}
