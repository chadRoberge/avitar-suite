import Service from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class ServiceWorkerManagerService extends Service {
  @tracked isSupported = 'serviceWorker' in navigator;
  @tracked isRegistered = false;
  @tracked registration = null;
  @tracked updateAvailable = false;
  @tracked isInstalling = false;

  constructor() {
    super(...arguments);

    // Listen for install prompt
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeinstallprompt', (event) => {
        event.preventDefault();
        this.installPrompt = event;
        console.log('📱 Install prompt available');
      });

      // Listen for app installed
      window.addEventListener('appinstalled', () => {
        this.installPrompt = null;
        console.log('📱 App installed successfully');
      });
    }

    if (this.isSupported) {
      this.registerServiceWorker();
    } else {
      console.warn('Service Worker not supported in this browser');
    }
  }

  async registerServiceWorker() {
    try {
      console.log('🔧 Registering Service Worker...');

      this.registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
      });

      this.isRegistered = true;

      console.log('✅ Service Worker registered successfully');

      // Listen for updates
      this.registration.addEventListener('updatefound', () => {
        console.log('🔄 Service Worker update found');
        this.handleUpdate();
      });

      // Check if there's already an update waiting
      if (this.registration.waiting) {
        this.updateAvailable = true;
        console.log('🔄 Service Worker update available');
      }

      // Listen for controller changes
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        console.log('🔄 Service Worker controller changed');
        window.location.reload();
      });

      // Check for updates periodically (every 30 minutes)
      setInterval(
        () => {
          this.checkForUpdates();
        },
        30 * 60 * 1000,
      );
    } catch (error) {
      console.error('❌ Service Worker registration failed:', error);
    }
  }

  handleUpdate() {
    this.isInstalling = true;
    const newWorker = this.registration.installing;

    newWorker.addEventListener('statechange', () => {
      if (newWorker.state === 'installed') {
        this.isInstalling = false;

        if (navigator.serviceWorker.controller) {
          // New worker is available
          this.updateAvailable = true;
          console.log('🔄 New Service Worker installed and waiting');
        } else {
          // First time installation
          console.log('✅ Service Worker installed for the first time');
        }
      }
    });
  }

  @action
  async checkForUpdates() {
    if (!this.registration) return;

    try {
      await this.registration.update();
      console.log('🔍 Checked for Service Worker updates');
    } catch (error) {
      console.error('Failed to check for Service Worker updates:', error);
    }
  }

  @action
  async activateUpdate() {
    if (!this.registration || !this.registration.waiting) {
      console.warn('No Service Worker update available to activate');
      return;
    }

    try {
      // Send message to waiting service worker to skip waiting
      this.registration.waiting.postMessage({ type: 'SKIP_WAITING' });

      this.updateAvailable = false;
      console.log('🔄 Activating Service Worker update...');
    } catch (error) {
      console.error('Failed to activate Service Worker update:', error);
    }
  }

  @action
  async unregister() {
    if (!this.registration) {
      console.warn('No Service Worker registration to unregister');
      return false;
    }

    try {
      const result = await this.registration.unregister();

      if (result) {
        this.isRegistered = false;
        this.registration = null;
        this.updateAvailable = false;
        console.log('✅ Service Worker unregistered successfully');
      }

      return result;
    } catch (error) {
      console.error('Failed to unregister Service Worker:', error);
      return false;
    }
  }

  // === MESSAGING ===

  @action
  async sendMessage(message) {
    if (!navigator.serviceWorker.controller) {
      console.warn('No Service Worker controller available');
      return null;
    }

    return new Promise((resolve, reject) => {
      const messageChannel = new MessageChannel();

      messageChannel.port1.onmessage = (event) => {
        if (event.data.error) {
          reject(new Error(event.data.error));
        } else {
          resolve(event.data);
        }
      };

      navigator.serviceWorker.controller.postMessage(message, [
        messageChannel.port2,
      ]);
    });
  }

  @action
  async scheduleSync(tag, data = null) {
    return this.sendMessage({
      type: 'SCHEDULE_SYNC',
      data: { tag, data },
    });
  }

  @action
  async getSyncStatus() {
    try {
      return await this.sendMessage({ type: 'GET_SYNC_STATUS' });
    } catch (error) {
      console.error('Failed to get sync status:', error);
      return { error: error.message };
    }
  }

  @action
  async clearCaches() {
    try {
      return await this.sendMessage({ type: 'CLEAR_CACHES' });
    } catch (error) {
      console.error('Failed to clear caches:', error);
      return { error: error.message };
    }
  }

  // === PUSH NOTIFICATIONS ===

  @action
  async requestNotificationPermission() {
    if (!('Notification' in window)) {
      console.warn('This browser does not support notifications');
      return 'unsupported';
    }

    if (Notification.permission === 'granted') {
      return 'granted';
    }

    if (Notification.permission === 'denied') {
      return 'denied';
    }

    try {
      const permission = await Notification.requestPermission();
      console.log('📢 Notification permission:', permission);
      return permission;
    } catch (error) {
      console.error('Failed to request notification permission:', error);
      return 'error';
    }
  }

  @action
  async subscribeToPush() {
    if (!this.registration) {
      throw new Error('Service Worker not registered');
    }

    if (!('PushManager' in window)) {
      throw new Error('Push messaging not supported');
    }

    try {
      const subscription = await this.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.getVapidPublicKey(),
      });

      console.log('📢 Push subscription created:', subscription);
      return subscription;
    } catch (error) {
      console.error('Failed to subscribe to push notifications:', error);
      throw error;
    }
  }

  @action
  async unsubscribeFromPush() {
    if (!this.registration) {
      return false;
    }

    try {
      const subscription =
        await this.registration.pushManager.getSubscription();

      if (subscription) {
        await subscription.unsubscribe();
        console.log('📢 Unsubscribed from push notifications');
        return true;
      }

      return false;
    } catch (error) {
      console.error('Failed to unsubscribe from push notifications:', error);
      return false;
    }
  }

  getVapidPublicKey() {
    // Replace with your actual VAPID public key
    return 'YOUR_VAPID_PUBLIC_KEY_HERE';
  }

  // === CACHE MANAGEMENT ===

  @action
  async getCacheInfo() {
    if (!('caches' in window)) {
      return { error: 'Cache API not supported' };
    }

    try {
      const cacheNames = await caches.keys();
      const cacheInfo = {};

      for (const cacheName of cacheNames) {
        const cache = await caches.open(cacheName);
        const keys = await cache.keys();
        cacheInfo[cacheName] = {
          itemCount: keys.length,
          items: keys.map((request) => ({
            url: request.url,
            method: request.method,
          })),
        };
      }

      return cacheInfo;
    } catch (error) {
      console.error('Failed to get cache info:', error);
      return { error: error.message };
    }
  }

  @action
  async clearSpecificCache(cacheName) {
    if (!('caches' in window)) {
      return false;
    }

    try {
      const result = await caches.delete(cacheName);
      console.log(`🗑️ Cache ${cacheName} cleared:`, result);
      return result;
    } catch (error) {
      console.error(`Failed to clear cache ${cacheName}:`, error);
      return false;
    }
  }

  // === INSTALLATION PROMPT ===

  @tracked installPrompt = null;

  get canInstall() {
    return this.installPrompt !== null;
  }

  @action
  async showInstallPrompt() {
    if (!this.installPrompt) {
      console.warn('No install prompt available');
      return false;
    }

    try {
      this.installPrompt.prompt();
      const { outcome } = await this.installPrompt.userChoice;

      console.log('📱 Install prompt outcome:', outcome);

      this.installPrompt = null;
      return outcome === 'accepted';
    } catch (error) {
      console.error('Failed to show install prompt:', error);
      return false;
    }
  }

  // === STATUS AND DEBUGGING ===

  get status() {
    return {
      supported: this.isSupported,
      registered: this.isRegistered,
      updateAvailable: this.updateAvailable,
      installing: this.isInstalling,
      canInstall: this.canInstall,
      hasController: !!navigator.serviceWorker?.controller,
      state: this.registration?.active?.state || 'unknown',
    };
  }

  @action
  debugServiceWorker() {
    console.group('🐛 Service Worker Debug Info');
    console.log('Status:', this.status);
    console.log('Registration:', this.registration);

    if (navigator.serviceWorker) {
      console.log('Controller:', navigator.serviceWorker.controller);
      console.log('Ready:', navigator.serviceWorker.ready);
    }

    console.groupEnd();
  }

  // === LIFECYCLE HOOKS ===

  willDestroy() {
    super.willDestroy();

    // Clean up event listeners if needed
    if (this.registration) {
      this.registration.removeEventListener('updatefound', this.handleUpdate);
    }
  }
}
