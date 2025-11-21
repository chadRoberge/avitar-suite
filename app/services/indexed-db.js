import Service from '@ember/service';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import Dexie from 'dexie';

export default class IndexedDbService extends Service {
  @service currentUser;

  @tracked isReady = false;
  @tracked db = null;

  constructor() {
    super(...arguments);
    this.initializeDatabase();
  }

  async initializeDatabase() {
    try {
      // Create database with versioned schema
      this.db = new Dexie('AvitarSuiteDB');

      // Define schema version 1
      this.db.version(1).stores({
        // Core data stores
        municipalities: '++id, name, code, _lastSynced, _syncState',
        properties:
          '++id, municipalityId, address, parcel_number, zone, [municipalityId+parcel_number], _lastSynced, _syncState',
        assessments:
          '++id, propertyId, municipalityId, year, [propertyId+year], _lastSynced, _syncState',
      });

      // Define schema version 2 - Add property_id index for assessments
      this.db.version(2).stores({
        // Core data stores
        municipalities: '++id, name, code, _lastSynced, _syncState',
        properties:
          '++id, municipalityId, address, parcel_number, zone, [municipalityId+parcel_number], _lastSynced, _syncState',
        assessments:
          '++id, propertyId, property_id, municipalityId, year, [propertyId+year], [property_id+year], _lastSynced, _syncState',
        views:
          '++id, propertyId, municipalityId, subjectId, widthId, distanceId, depthId, [propertyId+municipalityId], _lastSynced, _syncState',
        sketches:
          '++id, propertyId, municipalityId, [propertyId+municipalityId], _lastSynced, _syncState',
        features:
          '++id, sketchId, propertyId, property_id, municipalityId, [sketchId+propertyId], [property_id], _lastSynced, _syncState',

        // Support data stores
        viewAttributes:
          '++id, municipalityId, attributeType, name, [municipalityId+attributeType], _lastSynced, _syncState',
        zoneBaseValues:
          '++id, municipalityId, zoneCode, [municipalityId+zoneCode], _lastSynced, _syncState',

        // Sync management stores
        syncQueue:
          '++id, action, collection, recordId, data, timestamp, retryCount, _failed',
        metadata: '++key, value, lastUpdated',

        // Delta sync stores
        deltas:
          '++id, collection, documentId, delta, timestamp, attempts, synced, syncedAt',
        conflicts:
          '++id, collection, documentId, clientDelta, serverDelta, resolution, timestamp, resolved',
        changeLog: '++id, collection, documentId, operation, timestamp, userId',
      });

      // Define schema version 3 - Add exemptions support
      this.db.version(3).stores({
        // Core data stores
        municipalities: '++id, name, code, _lastSynced, _syncState',
        properties:
          '++id, municipalityId, address, parcel_number, zone, [municipalityId+parcel_number], _lastSynced, _syncState',
        assessments:
          '++id, propertyId, property_id, municipalityId, year, [propertyId+year], [property_id+year], _lastSynced, _syncState',
        views:
          '++id, propertyId, municipalityId, subjectId, widthId, distanceId, depthId, [propertyId+municipalityId], _lastSynced, _syncState',
        sketches:
          '++id, propertyId, property_id, municipalityId, [propertyId+municipalityId], [property_id], _lastSynced, _syncState',
        features:
          '++id, sketchId, propertyId, property_id, municipalityId, [sketchId+propertyId], [property_id], _lastSynced, _syncState',

        // Exemption data stores
        exemptions:
          '++id, propertyId, property_id, municipalityId, exemptionTypeId, assessmentYear, [propertyId+assessmentYear], [property_id+assessmentYear], _lastSynced, _syncState',
        exemptionTypes:
          '++id, municipalityId, name, code, [municipalityId+code], _lastSynced, _syncState',

        // Support data stores
        viewAttributes:
          '++id, municipalityId, attributeType, name, [municipalityId+attributeType], _lastSynced, _syncState',
        zoneBaseValues:
          '++id, municipalityId, zoneCode, [municipalityId+zoneCode], _lastSynced, _syncState',

        // Sync management stores
        syncQueue:
          '++id, action, collection, recordId, data, timestamp, retryCount, _failed',
        metadata: '++key, value, lastUpdated',

        // Delta sync stores
        deltas:
          '++id, collection, documentId, delta, timestamp, attempts, synced, syncedAt',
        conflicts:
          '++id, collection, documentId, clientDelta, serverDelta, resolution, timestamp, resolved',
        changeLog: '++id, collection, documentId, operation, timestamp, userId',
      });

      // Define schema version 4 - Add property_id index to sketches for proper filtering
      this.db.version(4).stores({
        // Core data stores (same as v3)
        municipalities: '++id, name, code, _lastSynced, _syncState',
        properties:
          '++id, municipalityId, address, parcel_number, zone, [municipalityId+parcel_number], _lastSynced, _syncState',
        assessments:
          '++id, propertyId, property_id, municipalityId, year, [propertyId+year], [property_id+year], _lastSynced, _syncState',
        views:
          '++id, propertyId, municipalityId, subjectId, widthId, distanceId, depthId, [propertyId+municipalityId], _lastSynced, _syncState',
        sketches:
          '++id, propertyId, property_id, municipalityId, [propertyId+municipalityId], [property_id], _lastSynced, _syncState',
        features:
          '++id, sketchId, propertyId, property_id, municipalityId, [sketchId+propertyId], [property_id], _lastSynced, _syncState',

        // Exemption data stores (same as v3)
        exemptions:
          '++id, propertyId, property_id, municipalityId, exemptionTypeId, assessmentYear, [propertyId+assessmentYear], [property_id+assessmentYear], _lastSynced, _syncState',
        exemptionTypes:
          '++id, municipalityId, name, code, [municipalityId+code], _lastSynced, _syncState',

        // Support data stores (same as v3)
        viewAttributes:
          '++id, municipalityId, attributeType, name, [municipalityId+attributeType], _lastSynced, _syncState',
        zoneBaseValues:
          '++id, municipalityId, zoneCode, [municipalityId+zoneCode], _lastSynced, _syncState',

        // Sync management stores (same as v3)
        syncQueue:
          '++id, action, collection, recordId, data, timestamp, retryCount, _failed',
        metadata: '++key, value, lastUpdated',

        // Delta sync stores (same as v3)
        deltas:
          '++id, collection, documentId, delta, timestamp, attempts, synced, syncedAt',
        conflicts:
          '++id, collection, documentId, clientDelta, serverDelta, resolution, timestamp, resolved',
        changeLog: '++id, collection, documentId, operation, timestamp, userId',
      });


      // Define schema version 5 - Add dedicated collections for municipality attribute endpoints
      this.db.version(5).stores({
        // Core data stores (same as v4)
        municipalities: '++id, name, code, _lastSynced, _syncState',
        properties:
          '++id, municipalityId, address, parcel_number, zone, [municipalityId+parcel_number], _lastSynced, _syncState',
        assessments:
          '++id, propertyId, property_id, municipalityId, year, [propertyId+year], [property_id+year], _lastSynced, _syncState',
        views:
          '++id, propertyId, municipalityId, subjectId, widthId, distanceId, depthId, [propertyId+municipalityId], _lastSynced, _syncState',
        sketches:
          '++id, propertyId, property_id, municipalityId, [propertyId+municipalityId], [property_id], _lastSynced, _syncState',
        features:
          '++id, sketchId, propertyId, property_id, municipalityId, [sketchId+propertyId], [property_id], _lastSynced, _syncState',

        // Exemption data stores (same as v4)
        exemptions:
          '++id, propertyId, property_id, municipalityId, exemptionTypeId, assessmentYear, [propertyId+assessmentYear], [property_id+assessmentYear], _lastSynced, _syncState',
        exemptionTypes:
          '++id, municipalityId, name, code, [municipalityId+code], _lastSynced, _syncState',

        // Support data stores (same as v4)
        viewAttributes:
          '++id, municipalityId, attributeType, name, [municipalityId+attributeType], _lastSynced, _syncState',
        zoneBaseValues:
          '++id, municipalityId, zoneCode, [municipalityId+zoneCode], _lastSynced, _syncState',

        // NEW: Municipality attribute endpoint collections (separated to prevent cache collisions)
        topology_attributes:
          '++id, municipalityId, displayText, attributeType, _lastSynced, _syncState',
        site_attributes:
          '++id, municipalityId, displayText, attributeType, _lastSynced, _syncState',
        driveway_attributes:
          '++id, municipalityId, displayText, attributeType, _lastSynced, _syncState',
        road_attributes:
          '++id, municipalityId, displayText, attributeType, _lastSynced, _syncState',
        land_use_details:
          '++id, municipalityId, code, displayText, _lastSynced, _syncState',
        land_taxation_categories:
          '++id, municipalityId, name, _lastSynced, _syncState',
        land_ladders:
          '++id, municipalityId, zoneId, _lastSynced, _syncState',
        current_use_settings:
          '++id, municipalityId, _lastSynced, _syncState',
        acreage_discount_settings:
          '++id, municipalityId, _lastSynced, _syncState',
        sketch_sub_area_factors:
          '++id, municipalityId, _lastSynced, _syncState',

        // Sync management stores (same as v4)
        syncQueue:
          '++id, action, collection, recordId, data, timestamp, retryCount, _failed',
        metadata: '++key, value, lastUpdated',

        // Delta sync stores (same as v4)
        deltas:
          '++id, collection, documentId, delta, timestamp, attempts, synced, syncedAt',
        conflicts:
          '++id, collection, documentId, clientDelta, serverDelta, resolution, timestamp, resolved',
        changeLog: '++id, collection, documentId, operation, timestamp, userId',
      });

      // Define schema version 6 - Add card_number index to features collection
      this.db.version(6).stores({
        // Core data stores (same as v5)
        municipalities: '++id, name, code, _lastSynced, _syncState',
        properties:
          '++id, municipalityId, address, parcel_number, zone, [municipalityId+parcel_number], _lastSynced, _syncState',
        assessments:
          '++id, propertyId, property_id, municipalityId, year, [propertyId+year], [property_id+year], _lastSynced, _syncState',
        views:
          '++id, propertyId, municipalityId, subjectId, widthId, distanceId, depthId, [propertyId+municipalityId], _lastSynced, _syncState',
        sketches:
          '++id, propertyId, property_id, municipalityId, [propertyId+municipalityId], [property_id], _lastSynced, _syncState',
        // NEW: Add card_number index to features for proper card filtering
        features:
          '++id, sketchId, propertyId, property_id, municipalityId, card_number, [sketchId+propertyId], [property_id], [property_id+card_number], _lastSynced, _syncState',

        // Exemption data stores (same as v5)
        exemptions:
          '++id, propertyId, property_id, municipalityId, exemptionTypeId, assessmentYear, [propertyId+assessmentYear], [property_id+assessmentYear], _lastSynced, _syncState',
        exemptionTypes:
          '++id, municipalityId, name, code, [municipalityId+code], _lastSynced, _syncState',

        // Support data stores (same as v5)
        viewAttributes:
          '++id, municipalityId, attributeType, name, [municipalityId+attributeType], _lastSynced, _syncState',
        zoneBaseValues:
          '++id, municipalityId, zoneCode, [municipalityId+zoneCode], _lastSynced, _syncState',

        // Municipality attribute endpoint collections (same as v5)
        topology_attributes:
          '++id, municipalityId, displayText, attributeType, _lastSynced, _syncState',
        site_attributes:
          '++id, municipalityId, displayText, attributeType, _lastSynced, _syncState',
        driveway_attributes:
          '++id, municipalityId, displayText, attributeType, _lastSynced, _syncState',
        road_attributes:
          '++id, municipalityId, displayText, attributeType, _lastSynced, _syncState',
        land_use_details:
          '++id, municipalityId, code, displayText, _lastSynced, _syncState',
        land_taxation_categories:
          '++id, municipalityId, name, _lastSynced, _syncState',
        land_ladders:
          '++id, municipalityId, zoneId, _lastSynced, _syncState',
        current_use_settings:
          '++id, municipalityId, _lastSynced, _syncState',
        acreage_discount_settings:
          '++id, municipalityId, _lastSynced, _syncState',
        sketch_sub_area_factors:
          '++id, municipalityId, _lastSynced, _syncState',

        // Sync management stores (same as v5)
        syncQueue:
          '++id, action, collection, recordId, data, timestamp, retryCount, _failed',
        metadata: '++key, value, lastUpdated',

        // Delta sync stores (same as v5)
        deltas:
          '++id, collection, documentId, delta, timestamp, attempts, synced, syncedAt',
        conflicts:
          '++id, collection, documentId, clientDelta, serverDelta, resolution, timestamp, resolved',
        changeLog: '++id, collection, documentId, operation, timestamp, userId',
      });

      // Define schema version 7 - Add separate collections for building and land assessments
      this.db.version(7).stores({
        // Core data stores (same as v6)
        municipalities: '++id, name, code, _lastSynced, _syncState',
        properties:
          '++id, municipalityId, address, parcel_number, zone, [municipalityId+parcel_number], _lastSynced, _syncState',
        assessments:
          '++id, propertyId, property_id, municipalityId, year, [propertyId+year], [property_id+year], _lastSynced, _syncState',
        views:
          '++id, propertyId, municipalityId, subjectId, widthId, distanceId, depthId, [propertyId+municipalityId], _lastSynced, _syncState',
        sketches:
          '++id, propertyId, property_id, municipalityId, [propertyId+municipalityId], [property_id], _lastSynced, _syncState',
        features:
          '++id, sketchId, propertyId, property_id, municipalityId, card_number, [sketchId+propertyId], [property_id], [property_id+card_number], _lastSynced, _syncState',

        // NEW: Separate collections for building and land assessments
        building_assessments:
          '++id, propertyId, property_id, municipalityId, card_number, effective_year, [property_id+card_number], [property_id+effective_year], _lastSynced, _syncState',
        land_assessments:
          '++id, propertyId, property_id, municipalityId, card_number, effective_year, [property_id+card_number], [property_id+effective_year], _lastSynced, _syncState',

        // Exemption data stores (same as v6)
        exemptions:
          '++id, propertyId, property_id, municipalityId, exemptionTypeId, assessmentYear, [propertyId+assessmentYear], [property_id+assessmentYear], _lastSynced, _syncState',
        exemptionTypes:
          '++id, municipalityId, name, code, [municipalityId+code], _lastSynced, _syncState',

        // Support data stores (same as v6)
        viewAttributes:
          '++id, municipalityId, attributeType, name, [municipalityId+attributeType], _lastSynced, _syncState',
        zoneBaseValues:
          '++id, municipalityId, zoneCode, [municipalityId+zoneCode], _lastSynced, _syncState',

        // Municipality attribute endpoint collections (same as v6)
        topology_attributes:
          '++id, municipalityId, displayText, attributeType, _lastSynced, _syncState',
        site_attributes:
          '++id, municipalityId, displayText, attributeType, _lastSynced, _syncState',
        driveway_attributes:
          '++id, municipalityId, displayText, attributeType, _lastSynced, _syncState',
        road_attributes:
          '++id, municipalityId, displayText, attributeType, _lastSynced, _syncState',
        land_use_details:
          '++id, municipalityId, code, displayText, _lastSynced, _syncState',
        land_taxation_categories:
          '++id, municipalityId, name, _lastSynced, _syncState',
        land_ladders:
          '++id, municipalityId, zoneId, _lastSynced, _syncState',
        current_use_settings:
          '++id, municipalityId, _lastSynced, _syncState',
        acreage_discount_settings:
          '++id, municipalityId, _lastSynced, _syncState',
        sketch_sub_area_factors:
          '++id, municipalityId, _lastSynced, _syncState',

        // Sync management stores (same as v6)
        syncQueue:
          '++id, action, collection, recordId, data, timestamp, retryCount, _failed',
        metadata: '++key, value, lastUpdated',

        // Delta sync stores (same as v6)
        deltas:
          '++id, collection, documentId, delta, timestamp, attempts, synced, syncedAt',
        conflicts:
          '++id, collection, documentId, clientDelta, serverDelta, resolution, timestamp, resolved',
        changeLog: '++id, collection, documentId, operation, timestamp, userId',
      });

      // Add hooks for automatic sync metadata
      this.db.properties.hook('creating', (primKey, obj, trans) => {
        obj._lastSynced = new Date().toISOString();
        obj._syncState = 'local';
        obj._conflictVersion = 1;
      });

      this.db.properties.hook(
        'updating',
        (modifications, primKey, obj, trans) => {
          modifications._lastSynced = new Date().toISOString();
          modifications._syncState = 'dirty';
          modifications._conflictVersion = (obj._conflictVersion || 1) + 1;
        },
      );

      // Add hooks for other critical tables
      const tables = [
        'assessments',
        'views',
        'sketches',
        'features',
        'viewAttributes',
        'exemptions',
        'exemptionTypes',
      ];
      tables.forEach((tableName) => {
        this.db[tableName].hook('creating', (primKey, obj, trans) => {
          obj._lastSynced = new Date().toISOString();
          obj._syncState = 'local';
          obj._conflictVersion = 1;
        });

        this.db[tableName].hook(
          'updating',
          (modifications, primKey, obj, trans) => {
            modifications._lastSynced = new Date().toISOString();
            modifications._syncState = 'dirty';
            modifications._conflictVersion = (obj._conflictVersion || 1) + 1;
          },
        );
      });

      // Define schema version 8 - Force clear properties cache to fix stale ObjectIds after import
      this.db.version(8).stores({
        // Same schema as v7
        municipalities: '++id, name, code, _lastSynced, _syncState',
        properties:
          '++id, municipalityId, address, parcel_number, zone, [municipalityId+parcel_number], _lastSynced, _syncState',
        assessments:
          '++id, propertyId, property_id, municipalityId, year, [propertyId+year], [property_id+year], _lastSynced, _syncState',
        land_assessments:
          '++id, propertyId, property_id, municipalityId, year, [propertyId+year], [property_id+year], _lastSynced, _syncState',
        views:
          '++id, propertyId, municipalityId, subjectId, widthId, distanceId, depthId, [propertyId+municipalityId], _lastSynced, _syncState',
        sketches:
          '++id, propertyId, property_id, municipalityId, [propertyId+municipalityId], [property_id], _lastSynced, _syncState',
        features:
          '++id, sketchId, propertyId, property_id, municipalityId, card_number, [sketchId+propertyId], [property_id], [property_id+card_number], _lastSynced, _syncState',
        exemptions:
          '++id, propertyId, property_id, municipalityId, exemptionTypeId, assessmentYear, [propertyId+assessmentYear], [property_id+assessmentYear], _lastSynced, _syncState',
        exemptionTypes:
          '++id, municipalityId, name, code, [municipalityId+code], _lastSynced, _syncState',
        viewAttributes:
          '++id, municipalityId, attributeType, name, [municipalityId+attributeType], _lastSynced, _syncState',
        zoneBaseValues:
          '++id, municipalityId, zoneCode, [municipalityId+zoneCode], _lastSynced, _syncState',
        topology_attributes:
          '++id, municipalityId, displayText, attributeType, _lastSynced, _syncState',
        site_attributes:
          '++id, municipalityId, displayText, attributeType, _lastSynced, _syncState',
        driveway_attributes:
          '++id, municipalityId, displayText, attributeType, _lastSynced, _syncState',
        road_attributes:
          '++id, municipalityId, displayText, attributeType, _lastSynced, _syncState',
        land_use_details:
          '++id, municipalityId, code, displayText, _lastSynced, _syncState',
        land_taxation_categories:
          '++id, municipalityId, name, _lastSynced, _syncState',
        land_ladders:
          '++id, municipalityId, zoneId, _lastSynced, _syncState',
        current_use_settings:
          '++id, municipalityId, _lastSynced, _syncState',
        acreage_discount_settings:
          '++id, municipalityId, _lastSynced, _syncState',
        sketch_sub_area_factors:
          '++id, municipalityId, _lastSynced, _syncState',
        syncQueue:
          '++id, action, collection, recordId, data, timestamp, retryCount, _failed',
        metadata: '++key, value, lastUpdated',
        deltas:
          '++id, collection, documentId, delta, timestamp, attempts, synced, syncedAt',
        conflicts:
          '++id, collection, documentId, clientDelta, serverDelta, resolution, timestamp, resolved',
        changeLog: '++id, collection, documentId, operation, timestamp, userId',
      }).upgrade(async (trans) => {
        // Clear all properties to force fresh fetch with correct ObjectIds
        console.log('🔄 Version 8 upgrade: Clearing all properties cache to fix stale ObjectIds');
        await trans.table('properties').clear();
        await trans.table('assessments').clear();
        await trans.table('land_assessments').clear();
        console.log('✅ Properties cache cleared - will fetch fresh data from server');
      });

      await this.db.open();
      this.isReady = true;

      console.log('IndexedDB initialized successfully');

      // Initialize metadata if needed
      await this.initializeMetadata();
    } catch (error) {
      console.error('Failed to initialize IndexedDB:', error);
      throw error;
    }
  }

  async initializeMetadata() {
    const existing = await this.db.metadata.get('db_version');
    if (!existing) {
      await this.db.metadata.put({
        key: 'db_version',
        value: '1.0.0',
        lastUpdated: new Date().toISOString(),
      });
    }

    const lastSyncExists = await this.db.metadata.get('last_full_sync');
    if (!lastSyncExists) {
      await this.db.metadata.put({
        key: 'last_full_sync',
        value: null,
        lastUpdated: new Date().toISOString(),
      });
    }
  }

  // === CRUD OPERATIONS ===

  async get(collection, id) {
    if (!this.isReady) {
      throw new Error('IndexedDB not ready');
    }

    try {
      const record = await this.db[collection].get(id);
      return record || null;
    } catch (error) {
      console.error(`Failed to get ${collection}:${id}`, error);
      throw error;
    }
  }

  async getAll(collection, filter = {}) {
    if (!this.isReady) {
      throw new Error('IndexedDB not ready');
    }

    try {
      let query = this.db[collection];

      // Apply filters
      if (Object.keys(filter).length > 0) {
        query = query.where(filter);
      }

      const records = await query.toArray();
      return records;
    } catch (error) {
      console.error(`Failed to get all ${collection}`, error);
      throw error;
    }
  }

  async query(collection, queryOptions) {
    if (!this.isReady) {
      throw new Error('IndexedDB not ready');
    }

    try {
      let query = this.db[collection];

      // Handle different query types
      if (queryOptions.where) {
        query = query.where(queryOptions.where);
      }

      if (queryOptions.orderBy) {
        query = query.orderBy(queryOptions.orderBy);
      }

      if (queryOptions.limit) {
        query = query.limit(queryOptions.limit);
      }

      if (queryOptions.offset) {
        query = query.offset(queryOptions.offset);
      }

      const records = await query.toArray();
      return records;
    } catch (error) {
      console.error(`Failed to query ${collection}`, error);
      throw error;
    }
  }

  async put(collection, record) {
    if (!this.isReady) {
      throw new Error('IndexedDB not ready');
    }

    try {
      // Ensure sync metadata is present
      if (!record._lastSynced) {
        record._lastSynced = new Date().toISOString();
      }
      if (!record._syncState) {
        record._syncState = 'local';
      }

      const id = await this.db[collection].put(record);

      // Queue for sync if not already synced
      if (record._syncState !== 'synced') {
        await this.queueForSync(collection, record.id || id, 'put', record);
      }

      return id;
    } catch (error) {
      console.error(`Failed to put ${collection}`, error);
      throw error;
    }
  }

  async add(collection, record) {
    if (!this.isReady) {
      throw new Error('IndexedDB not ready');
    }

    try {
      // Ensure sync metadata is present
      record._lastSynced = new Date().toISOString();
      record._syncState = 'local';
      record._conflictVersion = 1;

      const id = await this.db[collection].add(record);

      // Queue for sync
      await this.queueForSync(collection, id, 'post', record);

      return id;
    } catch (error) {
      console.error(`Failed to add ${collection}`, error);
      throw error;
    }
  }

  async update(collection, id, changes) {
    if (!this.isReady) {
      throw new Error('IndexedDB not ready');
    }

    try {
      // Add sync metadata to changes
      changes._lastSynced = new Date().toISOString();
      changes._syncState = 'dirty';

      const updated = await this.db[collection].update(id, changes);

      if (updated) {
        // Get the full record for sync queue
        const record = await this.db[collection].get(id);
        await this.queueForSync(collection, id, 'put', record);
      }

      return updated;
    } catch (error) {
      console.error(`Failed to update ${collection}:${id}`, error);
      throw error;
    }
  }

  async delete(collection, id) {
    if (!this.isReady) {
      throw new Error('IndexedDB not ready');
    }

    try {
      // Queue for sync before deleting
      await this.queueForSync(collection, id, 'delete', { id });

      await this.db[collection].delete(id);
      return true;
    } catch (error) {
      console.error(`Failed to delete ${collection}:${id}`, error);
      throw error;
    }
  }

  // === SYNC OPERATIONS ===

  async queueForSync(collection, recordId, action, data) {
    try {
      await this.db.syncQueue.add({
        action,
        collection,
        recordId,
        data,
        timestamp: new Date().toISOString(),
        retryCount: 0,
        _failed: false,
      });
    } catch (error) {
      console.error('Failed to queue for sync:', error);
    }
  }

  async getSyncQueue() {
    if (!this.isReady) {
      throw new Error('IndexedDB not ready');
    }

    return await this.db.syncQueue
      .where('_failed')
      .equals(false)
      .orderBy('timestamp')
      .toArray();
  }

  async markSyncComplete(queueId) {
    if (!this.isReady) {
      throw new Error('IndexedDB not ready');
    }

    await this.db.syncQueue.delete(queueId);
  }

  async markSyncFailed(queueId, error) {
    if (!this.isReady) {
      throw new Error('IndexedDB not ready');
    }

    await this.db.syncQueue.update(queueId, {
      _failed: true,
      retryCount: await this.db.syncQueue
        .get(queueId)
        .then((item) => (item.retryCount || 0) + 1),
      lastError: error.message,
      lastAttempt: new Date().toISOString(),
    });
  }

  async markRecordSynced(collection, id, serverData = null) {
    if (!this.isReady) {
      throw new Error('IndexedDB not ready');
    }

    const updates = {
      _syncState: 'synced',
      _lastSynced: new Date().toISOString(),
    };

    // Merge server data if provided (for conflict resolution)
    if (serverData) {
      Object.assign(updates, serverData);
    }

    await this.db[collection].update(id, updates);
  }

  // === ADVANCED QUERY METHODS ===

  async getPropertiesByMunicipality(municipalityId) {
    if (!this.isReady) {
      throw new Error('IndexedDB not ready');
    }

    return await this.db.properties
      .where('municipalityId')
      .equals(municipalityId)
      .toArray();
  }

  async getAssessmentsByProperty(propertyId) {
    if (!this.isReady) {
      throw new Error('IndexedDB not ready');
    }

    return await this.db.assessments
      .where('propertyId')
      .equals(propertyId)
      .toArray();
  }

  async getViewsByProperty(propertyId) {
    if (!this.isReady) {
      throw new Error('IndexedDB not ready');
    }

    return await this.db.views.where('propertyId').equals(propertyId).toArray();
  }

  async getSketchesByProperty(propertyId) {
    if (!this.isReady) {
      throw new Error('IndexedDB not ready');
    }

    return await this.db.sketches
      .where('propertyId')
      .equals(propertyId)
      .toArray();
  }

  async getFeaturesBySketch(sketchId) {
    if (!this.isReady) {
      throw new Error('IndexedDB not ready');
    }

    return await this.db.features.where('sketchId').equals(sketchId).toArray();
  }

  async getViewAttributesByType(municipalityId, attributeType) {
    if (!this.isReady) {
      throw new Error('IndexedDB not ready');
    }

    return await this.db.viewAttributes
      .where(['municipalityId', 'attributeType'])
      .equals([municipalityId, attributeType])
      .toArray();
  }

  // === UTILITY METHODS ===

  async clearCollection(collection) {
    if (!this.isReady) {
      throw new Error('IndexedDB not ready');
    }

    if (!this.db[collection]) {
      console.warn(`Collection "${collection}" does not exist in IndexedDB`);
      return;
    }

    await this.db[collection].clear();
    console.log(`IndexedDB collection "${collection}" cleared`);
  }

  async clearAll() {
    if (!this.isReady) {
      throw new Error('IndexedDB not ready');
    }

    const tables = [
      // Core data stores
      'municipalities',
      'properties',
      'assessments',
      'views',
      'sketches',
      'features',

      // Separate building and land assessment stores (v7+)
      'building_assessments',
      'land_assessments',

      // Exemption stores
      'exemptions',
      'exemptionTypes',

      // Support data stores
      'viewAttributes',
      'zoneBaseValues',

      // Municipality attribute stores
      'topology_attributes',
      'site_attributes',
      'driveway_attributes',
      'road_attributes',
      'land_use_details',
      'land_taxation_categories',
      'land_ladders',
      'current_use_settings',
      'acreage_discount_settings',
      'sketch_sub_area_factors',

      // Sync management stores
      'syncQueue',
      'metadata',

      // Delta sync stores
      'deltas',
      'conflicts',
      'changeLog',
    ];

    for (const table of tables) {
      if (this.db[table]) {
        await this.db[table].clear();
      }
    }

    console.log('IndexedDB cleared - all stores cleared');
  }

  async getStorageStats() {
    if (!this.isReady) {
      throw new Error('IndexedDB not ready');
    }

    const stats = {};
    const tables = [
      'municipalities',
      'properties',
      'assessments',
      'views',
      'sketches',
      'features',
      'viewAttributes',
      'zoneBaseValues',
      'syncQueue',
    ];

    for (const table of tables) {
      stats[table] = await this.db[table].count();
    }

    return stats;
  }

  async exportData() {
    if (!this.isReady) {
      throw new Error('IndexedDB not ready');
    }

    const data = {};
    const tables = [
      'municipalities',
      'properties',
      'assessments',
      'views',
      'sketches',
      'features',
      'viewAttributes',
      'zoneBaseValues',
    ];

    for (const table of tables) {
      data[table] = await this.db[table].toArray();
    }

    return data;
  }

  async importData(data) {
    if (!this.isReady) {
      throw new Error('IndexedDB not ready');
    }

    await this.db.transaction('rw', Object.keys(data), async () => {
      for (const [table, records] of Object.entries(data)) {
        if (this.db[table]) {
          await this.db[table].bulkPut(records);
        }
      }
    });

    console.log('Data imported successfully');
  }

  // === DELTA SYNC METHODS ===

  async storeDelta(deltaRecord) {
    if (!this.isReady) {
      throw new Error('IndexedDB not ready');
    }

    return await this.db.deltas.add(deltaRecord);
  }

  async getDeltas(filter = {}) {
    if (!this.isReady) {
      throw new Error('IndexedDB not ready');
    }

    let query = this.db.deltas;

    if (filter.collection) {
      query = query.where('collection').equals(filter.collection);
    }

    if (filter.documentId) {
      query = query.where('documentId').equals(filter.documentId);
    }

    if (filter.synced !== undefined) {
      query = query.filter((delta) => delta.synced === filter.synced);
    }

    return await query.toArray();
  }

  async updateDelta(deltaId, updates) {
    if (!this.isReady) {
      throw new Error('IndexedDB not ready');
    }

    return await this.db.deltas.update(deltaId, updates);
  }

  async deleteDelta(deltaId) {
    if (!this.isReady) {
      throw new Error('IndexedDB not ready');
    }

    return await this.db.deltas.delete(deltaId);
  }

  async getPendingChanges(collection, documentId) {
    if (!this.isReady) {
      throw new Error('IndexedDB not ready');
    }

    return await this.db.deltas
      .where(['collection', 'documentId'])
      .equals([collection, documentId])
      .and((delta) => !delta.synced)
      .toArray();
  }

  // === CONFLICT MANAGEMENT ===

  async storeConflictForReview(conflict) {
    if (!this.isReady) {
      throw new Error('IndexedDB not ready');
    }

    return await this.db.conflicts.add({
      ...conflict,
      resolved: false,
      timestamp: new Date().toISOString(),
    });
  }

  async getConflictsForReview() {
    if (!this.isReady) {
      throw new Error('IndexedDB not ready');
    }

    return await this.db.conflicts.where('resolved').equals(false).toArray();
  }

  async getConflictById(conflictId) {
    if (!this.isReady) {
      throw new Error('IndexedDB not ready');
    }

    return await this.db.conflicts.get(conflictId);
  }

  async removeConflictFromReview(conflictId) {
    if (!this.isReady) {
      throw new Error('IndexedDB not ready');
    }

    return await this.db.conflicts.delete(conflictId);
  }

  // === CHANGE LOG ===

  async logChange(collection, documentId, operation, userId = 'current-user') {
    if (!this.isReady) {
      throw new Error('IndexedDB not ready');
    }

    return await this.db.changeLog.add({
      collection,
      documentId,
      operation,
      userId,
      timestamp: new Date().toISOString(),
    });
  }

  async getChangeLog(collection = null, documentId = null, limit = 100) {
    if (!this.isReady) {
      throw new Error('IndexedDB not ready');
    }

    let query = this.db.changeLog;

    if (collection && documentId) {
      query = query
        .where(['collection', 'documentId'])
        .equals([collection, documentId]);
    } else if (collection) {
      query = query.where('collection').equals(collection);
    }

    return await query.orderBy('timestamp').reverse().limit(limit).toArray();
  }

  // === ENHANCED CRUD WITH DELTA TRACKING ===

  async saveRecord(collection, record, options = { trackChange: true }) {
    if (!this.isReady) {
      throw new Error('IndexedDB not ready');
    }

    const result = await this.db[collection].put(record);

    if (options.trackChange) {
      await this.logChange(collection, record.id, 'update');
    }

    return result;
  }

  async getRecord(collection, id) {
    if (!this.isReady) {
      throw new Error('IndexedDB not ready');
    }

    return await this.db[collection].get(id);
  }

  async deleteRecord(collection, id, options = { trackChange: true }) {
    if (!this.isReady) {
      throw new Error('IndexedDB not ready');
    }

    const result = await this.db[collection].delete(id);

    if (options.trackChange) {
      await this.logChange(collection, id, 'delete');
    }

    return result;
  }

  // === KEY-VALUE STORE FOR SETTINGS ===

  async getValue(key) {
    if (!this.isReady) {
      throw new Error('IndexedDB not ready');
    }

    const record = await this.db.metadata.get(key);
    return record?.value;
  }

  async setValue(key, value) {
    if (!this.isReady) {
      throw new Error('IndexedDB not ready');
    }

    return await this.db.metadata.put({
      key,
      value,
      lastUpdated: new Date().toISOString(),
    });
  }

  // Convenience aliases for metadata operations
  async getMetadata(key) {
    return await this.getValue(key);
  }

  async setMetadata(key, value) {
    return await this.setValue(key, value);
  }
}
