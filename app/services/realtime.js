import Service from '@ember/service';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class RealtimeService extends Service {
  @service api;
  @service session;
  @service localStorage;
  @service syncManager;
  @service notifications;

  @tracked isConnected = false;
  @tracked reconnectAttempts = 0;

  websocket = null;
  maxReconnectAttempts = 10;
  reconnectInterval = 1000; // Start with 1 second
  maxReconnectInterval = 30000; // Max 30 seconds
  heartbeatInterval = 30000; // 30 seconds
  heartbeatTimer = null;
  reconnectTimer = null;

  // Event listeners for real-time updates
  eventListeners = new Map();

  constructor() {
    super(...arguments);

    // Connect when authenticated
    if (this.session.isAuthenticated) {
      this.connect();
    }

    // Monitor session state changes with polling since session service doesn't emit events
    this._lastAuthState = this.session.isAuthenticated;
    this._sessionWatcher = setInterval(() => {
      const currentAuthState = this.session.isAuthenticated;
      if (currentAuthState !== this._lastAuthState) {
        this._lastAuthState = currentAuthState;
        if (currentAuthState) {
          this.connect();
        } else {
          this.disconnect();
        }
      }
    }, 1000); // Check every second
  }

  // === CONNECTION MANAGEMENT ===

  @action
  connect() {
    if (this.websocket) {
      console.log('WebSocket already connected');
      return;
    }

    if (!this.session.isAuthenticated) {
      console.log('Cannot connect WebSocket - not authenticated');
      return;
    }

    try {
      // Get WebSocket URL from environment or construct from API host
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsHost = window.location.host;
      const token = this.session.data.authenticated.user?.token;

      if (!token) {
        console.error(
          'No authentication token available for WebSocket connection',
        );
        return;
      }

      const wsUrl = `${wsProtocol}//${wsHost}/ws?token=${encodeURIComponent(token)}`;

      console.log(
        'Connecting to WebSocket:',
        wsUrl.replace(/token=[^&]+/, 'token=***'),
      );

      this.websocket = new WebSocket(wsUrl);

      this.websocket.onopen = this.handleOpen.bind(this);
      this.websocket.onmessage = this.handleMessage.bind(this);
      this.websocket.onclose = this.handleClose.bind(this);
      this.websocket.onerror = this.handleError.bind(this);
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      this.scheduleReconnect();
    }
  }

  @action
  disconnect() {
    console.log('Disconnecting WebSocket');

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.websocket) {
      this.websocket.onopen = null;
      this.websocket.onmessage = null;
      this.websocket.onclose = null;
      this.websocket.onerror = null;

      if (this.websocket.readyState === WebSocket.OPEN) {
        this.websocket.close(1000, 'Client disconnect');
      }

      this.websocket = null;
    }

    this.isConnected = false;
  }

  // === EVENT HANDLERS ===

  handleOpen(event) {
    console.log('WebSocket connected');
    this.isConnected = true;
    this.reconnectAttempts = 0;
    this.reconnectInterval = 1000; // Reset reconnect interval

    // Start heartbeat
    this.startHeartbeat();

    // Subscribe to user's data channels
    this.subscribeToChannels();
  }

  handleMessage(event) {
    try {
      const message = JSON.parse(event.data);
      console.log('WebSocket message received:', message);

      switch (message.type) {
        case 'update':
          this.handleDataUpdate(message);
          break;
        case 'delete':
          this.handleDataDelete(message);
          break;
        case 'ping':
          this.sendPong();
          break;
        case 'pong':
          // Heartbeat response - connection is alive
          break;
        case 'error':
          console.error('WebSocket server error:', message.error);
          break;
        case 'subscribed':
          console.log('Subscribed to channel:', message.channel);
          break;
        default:
          console.log('Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error, event.data);
    }
  }

  handleClose(event) {
    console.log('WebSocket closed:', event.code, event.reason);
    this.isConnected = false;

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    // Reconnect unless it was a clean close
    if (event.code !== 1000) {
      this.scheduleReconnect();
    }
  }

  handleError(event) {
    console.error('WebSocket error:', event);
  }

  // === REAL-TIME DATA UPDATES ===

  handleDataUpdate(message) {
    const { collection, data, municipalityId, userId } = message;

    // Update local storage with server data
    if (collection && data) {
      console.log(`Real-time update for ${collection}:`, data.id);

      this.localStorage.addToCollection(
        collection,
        {
          ...data,
          updated_at: new Date().toISOString(),
        },
        {
          source: 'realtime',
          dirty: false,
        },
      );

      // Emit event for components to react
      this.emit(`${collection}:updated`, data);
      this.emit('data:updated', { collection, data });
    }
  }

  handleDataDelete(message) {
    const { collection, id, municipalityId, userId } = message;

    if (collection && id) {
      console.log(`Real-time delete for ${collection}:`, id);

      this.localStorage.removeFromCollection(collection, id, {
        source: 'realtime',
      });

      // Emit event for components to react
      this.emit(`${collection}:deleted`, { id });
      this.emit('data:deleted', { collection, id });
    }
  }

  // === SUBSCRIPTIONS ===

  subscribeToChannels() {
    const user = this.session.data.authenticated.user;

    // Subscribe to user's municipality data
    if (user.municipalityId) {
      this.subscribe(`municipality:${user.municipalityId}`);
    }

    // Subscribe to user-specific updates
    this.subscribe(`user:${user.id}`);
  }

  subscribe(channel) {
    if (this.isConnected && this.websocket) {
      const message = {
        type: 'subscribe',
        channel: channel,
      };

      this.websocket.send(JSON.stringify(message));
      console.log('Subscribing to channel:', channel);
    }
  }

  unsubscribe(channel) {
    if (this.isConnected && this.websocket) {
      const message = {
        type: 'unsubscribe',
        channel: channel,
      };

      this.websocket.send(JSON.stringify(message));
      console.log('Unsubscribing from channel:', channel);
    }
  }

  // === HEARTBEAT ===

  startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      this.sendPing();
    }, this.heartbeatInterval);
  }

  sendPing() {
    if (this.isConnected && this.websocket) {
      this.websocket.send(JSON.stringify({ type: 'ping' }));
    }
  }

  sendPong() {
    if (this.isConnected && this.websocket) {
      this.websocket.send(JSON.stringify({ type: 'pong' }));
    }
  }

  // === RECONNECTION ===

  scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached. Giving up.');
      return;
    }

    this.reconnectAttempts++;

    console.log(
      `Scheduling reconnect attempt ${this.reconnectAttempts} in ${this.reconnectInterval}ms`,
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;

      if (!this.isConnected) {
        console.log(`Reconnection attempt ${this.reconnectAttempts}`);
        this.connect();

        // Exponential backoff
        this.reconnectInterval = Math.min(
          this.reconnectInterval * 2,
          this.maxReconnectInterval,
        );
      }
    }, this.reconnectInterval);
  }

  // === EVENT SYSTEM ===

  /**
   * Listen for real-time events
   * @param {string} event - Event name (e.g., 'properties:updated', 'sketches:deleted')
   * @param {Function} callback - Callback function
   * @returns {Function} - Unsubscribe function
   */
  on(event, callback) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }

    this.eventListeners.get(event).add(callback);

    // Return unsubscribe function
    return () => {
      const listeners = this.eventListeners.get(event);
      if (listeners) {
        listeners.delete(callback);
        if (listeners.size === 0) {
          this.eventListeners.delete(event);
        }
      }
    };
  }

  /**
   * Remove event listener
   */
  off(event, callback) {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.delete(callback);
      if (listeners.size === 0) {
        this.eventListeners.delete(event);
      }
    }
  }

  /**
   * Emit an event to all listeners
   * @private
   */
  emit(event, data) {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach((callback) => {
        try {
          callback(data);
        } catch (error) {
          console.error('Error in event listener:', error);
        }
      });
    }
  }

  // === BROADCASTING CHANGES ===

  /**
   * Broadcast a local change to other connected users
   */
  broadcastChange(collection, operation, data) {
    if (this.isConnected && this.websocket) {
      const message = {
        type: 'broadcast',
        collection,
        operation, // 'create', 'update', 'delete'
        data,
      };

      this.websocket.send(JSON.stringify(message));
    }
  }

  // === STATUS ===

  getStatus() {
    return {
      isConnected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      websocketState: this.websocket ? this.websocket.readyState : null,
      activeListeners: Array.from(this.eventListeners.keys()),
    };
  }

  // === CLEANUP ===

  willDestroy() {
    super.willDestroy();
    this.disconnect();

    // Clean up session watcher
    if (this._sessionWatcher) {
      clearInterval(this._sessionWatcher);
      this._sessionWatcher = null;
    }
  }
}
