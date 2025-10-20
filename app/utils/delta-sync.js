import { compress, decompress } from 'lz-string';

/**
 * Delta Sync Utilities
 * Provides efficient field-level change detection, compression, and conflict resolution
 */

export const CONFLICT_RESOLUTION_STRATEGIES = {
  CLIENT_WINS: 'client-wins',
  SERVER_WINS: 'server-wins',
  TIMESTAMP_WINS: 'timestamp-wins',
  MERGE_FIELDS: 'merge-fields',
  MANUAL_REVIEW: 'manual-review',
};

export const DELTA_OPERATION_TYPES = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  FIELD_UPDATE: 'field-update',
  ARRAY_PUSH: 'array-push',
  ARRAY_REMOVE: 'array-remove',
  NESTED_UPDATE: 'nested-update',
};

/**
 * Creates a delta between two objects representing the changes
 */
export function createDelta(oldObject, newObject, options = {}) {
  const {
    includeMetadata = true,
    compressValues = true,
    maxDepth = 10,
    excludeFields = [],
  } = options;

  if (!oldObject && newObject) {
    return {
      type: DELTA_OPERATION_TYPES.CREATE,
      data: compressValues ? compress(JSON.stringify(newObject)) : newObject,
      compressed: compressValues,
      timestamp: new Date().toISOString(),
      ...(includeMetadata && {
        metadata: { operation: 'create', fields: Object.keys(newObject) },
      }),
    };
  }

  if (oldObject && !newObject) {
    return {
      type: DELTA_OPERATION_TYPES.DELETE,
      timestamp: new Date().toISOString(),
      ...(includeMetadata && { metadata: { operation: 'delete' } }),
    };
  }

  const changes = detectFieldChanges(
    oldObject,
    newObject,
    '',
    maxDepth,
    excludeFields,
  );

  if (changes.length === 0) {
    return null; // No changes detected
  }

  const delta = {
    type: DELTA_OPERATION_TYPES.UPDATE,
    changes: compressValues
      ? changes.map((change) => ({
          ...change,
          value:
            typeof change.value === 'string'
              ? change.value
              : compress(JSON.stringify(change.value)),
          compressed: typeof change.value !== 'string',
        }))
      : changes,
    compressed: compressValues,
    timestamp: new Date().toISOString(),
    ...(includeMetadata && {
      metadata: {
        operation: 'update',
        fields: changes.map((c) => c.field),
        changeCount: changes.length,
      },
    }),
  };

  return delta;
}

/**
 * Applies a delta to an object
 */
export function applyDelta(object, delta, options = {}) {
  const { validateTypes = true, createIfMissing = true } = options;

  if (!delta) return object;

  let result = object ? { ...object } : {};

  switch (delta.type) {
    case DELTA_OPERATION_TYPES.CREATE:
      const createData = delta.compressed
        ? JSON.parse(decompress(delta.data))
        : delta.data;
      result = { ...createData };
      break;

    case DELTA_OPERATION_TYPES.DELETE:
      result = null;
      break;

    case DELTA_OPERATION_TYPES.UPDATE:
      for (const change of delta.changes) {
        const value = change.compressed
          ? JSON.parse(decompress(change.value))
          : change.value;

        result = applyFieldChange(
          result,
          change.field,
          value,
          change.operation,
          {
            validateTypes,
            createIfMissing,
          },
        );
      }
      break;
  }

  return result;
}

/**
 * Detects field-level changes between two objects
 */
function detectFieldChanges(
  oldObj,
  newObj,
  prefix = '',
  depth = 0,
  excludeFields = [],
) {
  const changes = [];

  if (depth > 10) return changes; // Prevent infinite recursion

  const allKeys = new Set([
    ...(oldObj ? Object.keys(oldObj) : []),
    ...(newObj ? Object.keys(newObj) : []),
  ]);

  for (const key of allKeys) {
    const fieldPath = prefix ? `${prefix}.${key}` : key;

    if (excludeFields.includes(fieldPath)) continue;

    const oldValue = oldObj?.[key];
    const newValue = newObj?.[key];

    if (oldValue === undefined && newValue !== undefined) {
      // Field added
      changes.push({
        field: fieldPath,
        operation: 'add',
        value: newValue,
        oldValue: undefined,
        newValue: newValue,
      });
    } else if (oldValue !== undefined && newValue === undefined) {
      // Field removed
      changes.push({
        field: fieldPath,
        operation: 'remove',
        value: null,
        oldValue: oldValue,
        newValue: undefined,
      });
    } else if (oldValue !== newValue) {
      if (Array.isArray(oldValue) && Array.isArray(newValue)) {
        // Handle array changes
        const arrayChanges = detectArrayChanges(oldValue, newValue, fieldPath);
        changes.push(...arrayChanges);
      } else if (isObject(oldValue) && isObject(newValue)) {
        // Handle nested object changes
        const nestedChanges = detectFieldChanges(
          oldValue,
          newValue,
          fieldPath,
          depth + 1,
          excludeFields,
        );
        changes.push(...nestedChanges);
      } else {
        // Simple field update
        changes.push({
          field: fieldPath,
          operation: 'update',
          value: newValue,
          oldValue: oldValue,
          newValue: newValue,
        });
      }
    }
  }

  return changes;
}

/**
 * Detects changes in arrays
 */
function detectArrayChanges(oldArray, newArray, fieldPath) {
  const changes = [];

  // Simple approach: detect additions and removals
  if (oldArray.length !== newArray.length) {
    changes.push({
      field: fieldPath,
      operation: 'array-replace',
      value: newArray,
      oldValue: oldArray,
      newValue: newArray,
      metadata: {
        oldLength: oldArray.length,
        newLength: newArray.length,
      },
    });
  } else {
    // Check for item-level changes in same-length arrays
    for (let i = 0; i < newArray.length; i++) {
      if (!deepEqual(oldArray[i], newArray[i])) {
        changes.push({
          field: `${fieldPath}[${i}]`,
          operation: 'array-item-update',
          value: newArray[i],
          oldValue: oldArray[i],
          newValue: newArray[i],
          index: i,
        });
      }
    }
  }

  return changes;
}

/**
 * Applies a field change to an object
 */
function applyFieldChange(object, fieldPath, value, operation, options = {}) {
  const { createIfMissing = true } = options;
  const keys = fieldPath.split('.');
  let current = object;

  // Navigate to the parent of the target field
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];

    if (current[key] === undefined || current[key] === null) {
      if (createIfMissing) {
        current[key] = {};
      } else {
        return object; // Don't create missing path
      }
    }
    current = current[key];
  }

  const finalKey = keys[keys.length - 1];

  switch (operation) {
    case 'add':
    case 'update':
      current[finalKey] = value;
      break;
    case 'remove':
      delete current[finalKey];
      break;
    case 'array-replace':
      current[finalKey] = value;
      break;
    case 'array-item-update':
      if (Array.isArray(current[finalKey])) {
        const match = finalKey.match(/(.+)\[(\d+)\]$/);
        if (match) {
          const arrayKey = match[1];
          const index = parseInt(match[2]);
          if (current[arrayKey] && current[arrayKey][index] !== undefined) {
            current[arrayKey][index] = value;
          }
        }
      }
      break;
  }

  return object;
}

/**
 * Resolves conflicts between client and server deltas
 */
export function resolveConflict(
  clientDelta,
  serverDelta,
  strategy = CONFLICT_RESOLUTION_STRATEGIES.TIMESTAMP_WINS,
  options = {},
) {
  const { fieldPriorities = {}, customResolver = null } = options;

  if (customResolver) {
    return customResolver(clientDelta, serverDelta, options);
  }

  switch (strategy) {
    case CONFLICT_RESOLUTION_STRATEGIES.CLIENT_WINS:
      return {
        resolved: clientDelta,
        conflicts: [
          {
            field: 'all',
            resolution: 'client-wins',
            clientValue: clientDelta,
            serverValue: serverDelta,
          },
        ],
      };

    case CONFLICT_RESOLUTION_STRATEGIES.SERVER_WINS:
      return {
        resolved: serverDelta,
        conflicts: [
          {
            field: 'all',
            resolution: 'server-wins',
            clientValue: clientDelta,
            serverValue: serverDelta,
          },
        ],
      };

    case CONFLICT_RESOLUTION_STRATEGIES.TIMESTAMP_WINS:
      const clientTime = new Date(clientDelta.timestamp).getTime();
      const serverTime = new Date(serverDelta.timestamp).getTime();

      return {
        resolved: clientTime > serverTime ? clientDelta : serverDelta,
        conflicts: [
          {
            field: 'all',
            resolution: 'timestamp-wins',
            winner: clientTime > serverTime ? 'client' : 'server',
            clientTime,
            serverTime,
          },
        ],
      };

    case CONFLICT_RESOLUTION_STRATEGIES.MERGE_FIELDS:
      return mergeFieldLevelChanges(clientDelta, serverDelta, fieldPriorities);

    case CONFLICT_RESOLUTION_STRATEGIES.MANUAL_REVIEW:
      return {
        resolved: null,
        conflicts: [
          {
            field: 'all',
            resolution: 'manual-review-required',
            clientValue: clientDelta,
            serverValue: serverDelta,
          },
        ],
        requiresManualReview: true,
      };

    default:
      throw new Error(`Unknown conflict resolution strategy: ${strategy}`);
  }
}

/**
 * Merges field-level changes from client and server deltas
 */
function mergeFieldLevelChanges(
  clientDelta,
  serverDelta,
  fieldPriorities = {},
) {
  const conflicts = [];
  const mergedChanges = [];
  const processedFields = new Set();

  // Process client changes
  for (const clientChange of clientDelta.changes || []) {
    processedFields.add(clientChange.field);

    const serverChange = (serverDelta.changes || []).find(
      (sc) => sc.field === clientChange.field,
    );

    if (!serverChange) {
      // No conflict, use client change
      mergedChanges.push(clientChange);
    } else {
      // Conflict detected
      const priority = fieldPriorities[clientChange.field];
      let winningChange;

      if (priority === 'client') {
        winningChange = clientChange;
      } else if (priority === 'server') {
        winningChange = serverChange;
      } else {
        // Default to timestamp
        const clientTime = new Date(clientDelta.timestamp).getTime();
        const serverTime = new Date(serverDelta.timestamp).getTime();
        winningChange = clientTime > serverTime ? clientChange : serverChange;
      }

      mergedChanges.push(winningChange);
      conflicts.push({
        field: clientChange.field,
        resolution: priority || 'timestamp-wins',
        clientValue: clientChange.value,
        serverValue: serverChange.value,
        winner: winningChange === clientChange ? 'client' : 'server',
      });
    }
  }

  // Process remaining server changes
  for (const serverChange of serverDelta.changes || []) {
    if (!processedFields.has(serverChange.field)) {
      mergedChanges.push(serverChange);
    }
  }

  return {
    resolved: {
      ...clientDelta,
      changes: mergedChanges,
      timestamp: new Date().toISOString(),
      metadata: {
        ...clientDelta.metadata,
        merged: true,
        mergedFrom: [clientDelta.timestamp, serverDelta.timestamp],
      },
    },
    conflicts,
  };
}

/**
 * Compresses a delta for efficient transmission
 */
export function compressDelta(delta) {
  const compressed = compress(JSON.stringify(delta));
  return {
    compressed: true,
    data: compressed,
    originalSize: JSON.stringify(delta).length,
    compressedSize: compressed.length,
    compressionRatio: (
      compressed.length / JSON.stringify(delta).length
    ).toFixed(2),
  };
}

/**
 * Decompresses a delta
 */
export function decompressDelta(compressedDelta) {
  if (!compressedDelta.compressed) {
    return compressedDelta;
  }
  return JSON.parse(decompress(compressedDelta.data));
}

/**
 * Validates a delta structure
 */
export function validateDelta(delta) {
  const errors = [];

  if (!delta) {
    errors.push('Delta is null or undefined');
    return { valid: false, errors };
  }

  if (
    !delta.type ||
    !Object.values(DELTA_OPERATION_TYPES).includes(delta.type)
  ) {
    errors.push(`Invalid delta type: ${delta.type}`);
  }

  if (!delta.timestamp) {
    errors.push('Delta missing timestamp');
  }

  if (delta.type === DELTA_OPERATION_TYPES.UPDATE && !delta.changes) {
    errors.push('Update delta missing changes array');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// Helper functions
function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  if (isObject(a) && isObject(b)) {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;

    for (const key of keysA) {
      if (!keysB.includes(key)) return false;
      if (!deepEqual(a[key], b[key])) return false;
    }
    return true;
  }

  return false;
}
