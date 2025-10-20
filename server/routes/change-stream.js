const express = require('express');
const { MongoClient } = require('mongodb');
const router = express.Router();

/**
 * MongoDB Change Stream SSE Endpoint
 * Provides real-time change notifications via Server-Sent Events
 */

// Active connections tracking
const activeConnections = new Map();
let connectionCounter = 0;

// MongoDB connection (shared with main app)
let db = null;
let mongoClient = null;

// Configuration
const HEARTBEAT_INTERVAL = 30000; // 30 seconds
const CONNECTION_TIMEOUT = 300000; // 5 minutes
const MAX_CONNECTIONS_PER_USER = 3;

/**
 * Initialize MongoDB connection for change streams
 */
async function initializeChangeStreams(mongoUrl, dbName) {
  try {
    if (!mongoClient) {
      mongoClient = new MongoClient(mongoUrl, {
        maxPoolSize: 10,
      });
      await mongoClient.connect();
    }

    db = mongoClient.db(dbName);
    console.log('✅ Change stream MongoDB connection initialized');
  } catch (error) {
    console.error(
      '❌ Failed to initialize change stream MongoDB connection:',
      error,
    );
    throw error;
  }
}

/**
 * SSE Change Stream endpoint
 */
router.get('/change-stream', async (req, res) => {
  const connectionId = ++connectionCounter;
  const userId = req.headers['x-user-id'] || 'anonymous';
  const resumeToken = req.query.resumeToken;
  const collections = (req.query.collections || '').split(',').filter(Boolean);

  console.log(
    `📡 New change stream connection ${connectionId} for user ${userId}`,
  );

  // Check connection limits
  const userConnections = Array.from(activeConnections.values()).filter(
    (conn) => conn.userId === userId,
  );

  if (userConnections.length >= MAX_CONNECTIONS_PER_USER) {
    res.status(429).json({ error: 'Too many concurrent connections' });
    return;
  }

  // Set up SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control',
  });

  // Store connection info
  const connectionInfo = {
    id: connectionId,
    userId,
    response: res,
    startTime: new Date(),
    lastActivity: new Date(),
    collections:
      collections.length > 0
        ? collections
        : ['properties', 'assessments', 'views', 'sketches'],
  };

  activeConnections.set(connectionId, connectionInfo);

  try {
    // Create change stream
    const changeStream = await createChangeStream(connectionInfo, resumeToken);

    // Start heartbeat
    const heartbeatInterval = setInterval(() => {
      sendHeartbeat(connectionInfo);
    }, HEARTBEAT_INTERVAL);

    // Handle change stream events
    changeStream.on('change', (change) => {
      handleChangeEvent(connectionInfo, change);
    });

    changeStream.on('error', (error) => {
      console.error(
        `Change stream error for connection ${connectionId}:`,
        error,
      );
      sendError(connectionInfo, error);
      cleanup();
    });

    changeStream.on('close', () => {
      console.log(`Change stream closed for connection ${connectionId}`);
      cleanup();
    });

    // Connection timeout
    const timeoutTimer = setTimeout(() => {
      console.log(`Connection ${connectionId} timed out`);
      cleanup();
    }, CONNECTION_TIMEOUT);

    // Cleanup function
    function cleanup() {
      clearInterval(heartbeatInterval);
      clearTimeout(timeoutTimer);

      if (changeStream) {
        changeStream.close();
      }

      activeConnections.delete(connectionId);

      if (!res.headersSent) {
        res.end();
      }

      console.log(`🔌 Connection ${connectionId} closed`);
    }

    // Handle client disconnect
    req.on('close', cleanup);
    req.on('error', cleanup);

    // Send initial connection confirmation
    sendEvent(connectionInfo, 'connected', {
      connectionId,
      collections: connectionInfo.collections,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(
      `Failed to create change stream for connection ${connectionId}:`,
      error,
    );
    sendError(connectionInfo, error);
    activeConnections.delete(connectionId);
    res.end();
  }
});

/**
 * Create MongoDB change stream with appropriate filters
 */
async function createChangeStream(connectionInfo, resumeToken) {
  const { collections } = connectionInfo;

  // Create pipeline to filter for specific collections
  const pipeline = [
    {
      $match: {
        'ns.db': db.databaseName,
        'ns.coll': { $in: collections },
        operationType: { $in: ['insert', 'update', 'delete', 'replace'] },
      },
    },
  ];

  // Change stream options
  const options = {
    fullDocument: 'updateLookup', // Include full document for updates
    fullDocumentBeforeChange: 'whenAvailable', // Include before state when available
  };

  // Add resume token if provided
  if (resumeToken) {
    try {
      options.resumeAfter = JSON.parse(
        Buffer.from(resumeToken, 'base64').toString(),
      );
      console.log(
        `📥 Resuming change stream from token for connection ${connectionInfo.id}`,
      );
    } catch (error) {
      console.warn(
        `Invalid resume token for connection ${connectionInfo.id}:`,
        error,
      );
    }
  }

  // Watch all collections
  const changeStream = db.watch(pipeline, options);

  console.log(
    `👀 Change stream created for connection ${connectionInfo.id}, watching:`,
    collections,
  );

  return changeStream;
}

/**
 * Handle change stream events
 */
function handleChangeEvent(connectionInfo, change) {
  try {
    connectionInfo.lastActivity = new Date();

    // Create a clean change event for the client
    const clientChange = {
      _id: change._id,
      operationType: change.operationType,
      clusterTime: change.clusterTime,
      ns: change.ns,
      documentKey: change.documentKey,
      updateDescription: change.updateDescription,
      fullDocument: change.fullDocument,
      fullDocumentBeforeChange: change.fullDocumentBeforeChange,
      resumeToken: Buffer.from(JSON.stringify(change._id)).toString('base64'),
    };

    // Send to client
    sendEvent(connectionInfo, 'change', clientChange);

    console.log(`📨 Sent change event to connection ${connectionInfo.id}:`, {
      type: change.operationType,
      collection: change.ns?.coll,
      documentId: change.documentKey?._id,
    });
  } catch (error) {
    console.error(
      `Error handling change event for connection ${connectionInfo.id}:`,
      error,
    );
  }
}

/**
 * Send heartbeat to keep connection alive
 */
function sendHeartbeat(connectionInfo) {
  try {
    const timeSinceActivity =
      Date.now() - connectionInfo.lastActivity.getTime();

    sendEvent(connectionInfo, 'heartbeat', {
      timestamp: new Date().toISOString(),
      connectionTime: Date.now() - connectionInfo.startTime.getTime(),
      timeSinceActivity,
    });
  } catch (error) {
    console.error(
      `Error sending heartbeat to connection ${connectionInfo.id}:`,
      error,
    );
  }
}

/**
 * Send error event to client
 */
function sendError(connectionInfo, error) {
  try {
    sendEvent(connectionInfo, 'error', {
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  } catch (sendError) {
    console.error(
      `Error sending error event to connection ${connectionInfo.id}:`,
      sendError,
    );
  }
}

/**
 * Send SSE event to client
 */
function sendEvent(connectionInfo, eventType, data) {
  try {
    if (
      connectionInfo.response.headersSent ||
      connectionInfo.response.destroyed
    ) {
      return;
    }

    const eventData = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
    connectionInfo.response.write(eventData);
  } catch (error) {
    console.error(
      `Error sending event to connection ${connectionInfo.id}:`,
      error,
    );
  }
}

/**
 * Get connection statistics
 */
router.get('/change-stream/stats', (req, res) => {
  const stats = {
    activeConnections: activeConnections.size,
    connectionsByUser: {},
    totalConnectionTime: 0,
    oldestConnection: null,
  };

  for (const [id, conn] of activeConnections.entries()) {
    // Group by user
    if (!stats.connectionsByUser[conn.userId]) {
      stats.connectionsByUser[conn.userId] = 0;
    }
    stats.connectionsByUser[conn.userId]++;

    // Calculate connection time
    const connectionTime = Date.now() - conn.startTime.getTime();
    stats.totalConnectionTime += connectionTime;

    // Find oldest connection
    if (
      !stats.oldestConnection ||
      conn.startTime < stats.oldestConnection.startTime
    ) {
      stats.oldestConnection = {
        id: conn.id,
        userId: conn.userId,
        startTime: conn.startTime,
        connectionTime,
      };
    }
  }

  res.json(stats);
});

/**
 * Terminate specific connection
 */
router.delete('/change-stream/connections/:connectionId', (req, res) => {
  const connectionId = parseInt(req.params.connectionId);
  const connection = activeConnections.get(connectionId);

  if (!connection) {
    res.status(404).json({ error: 'Connection not found' });
    return;
  }

  // Send termination event
  sendEvent(connection, 'terminated', {
    reason: 'Admin termination',
    timestamp: new Date().toISOString(),
  });

  // Close connection
  connection.response.end();
  activeConnections.delete(connectionId);

  res.json({ message: 'Connection terminated', connectionId });
});

/**
 * Health check endpoint
 */
router.get('/change-stream/health', async (req, res) => {
  try {
    if (!db) {
      throw new Error('Database not connected');
    }

    // Test database connection
    await db.admin().ping();

    res.json({
      status: 'healthy',
      activeConnections: activeConnections.size,
      databaseConnected: true,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      activeConnections: activeConnections.size,
      databaseConnected: false,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Manual change injection (for testing)
 */
router.post('/change-stream/inject', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    res.status(403).json({ error: 'Not available in production' });
    return;
  }

  const { collection, operationType, documentKey, fullDocument } = req.body;

  const fakeChange = {
    _id: { _data: Buffer.from(Date.now().toString()).toString('base64') },
    operationType,
    clusterTime: new Date(),
    ns: { db: db.databaseName, coll: collection },
    documentKey,
    fullDocument,
    resumeToken: Buffer.from(
      JSON.stringify({ _data: Date.now().toString() }),
    ).toString('base64'),
  };

  // Send to all active connections watching this collection
  for (const [id, conn] of activeConnections.entries()) {
    if (conn.collections.includes(collection)) {
      handleChangeEvent(conn, fakeChange);
    }
  }

  res.json({
    message: 'Change injected',
    affectedConnections: activeConnections.size,
  });
});

/**
 * Graceful shutdown
 */
async function shutdown() {
  console.log('🔄 Shutting down change stream connections...');

  // Notify all connections
  for (const [id, conn] of activeConnections.entries()) {
    try {
      sendEvent(conn, 'shutdown', {
        reason: 'Server shutdown',
        timestamp: new Date().toISOString(),
      });
      conn.response.end();
    } catch (error) {
      console.error(`Error closing connection ${id}:`, error);
    }
  }

  activeConnections.clear();

  // Close MongoDB connection
  if (mongoClient) {
    await mongoClient.close();
    mongoClient = null;
    db = null;
  }

  console.log('✅ Change stream shutdown complete');
}

// Export functions for app initialization
module.exports = {
  router,
  initializeChangeStreams,
  shutdown,
};
