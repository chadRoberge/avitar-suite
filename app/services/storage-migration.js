import Service from '@ember/service';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';

export default class StorageMigrationService extends Service {
  @service indexedDb;
  @service localStorage; // Existing localStorage service

  @tracked migrationInProgress = false;
  @tracked migrationComplete = false;
  @tracked migrationStats = null;

  async checkMigrationStatus() {
    // Check if migration has already been completed
    try {
      await this.indexedDb.initializeDatabase(); // Ensure DB is ready

      const metadata = await this.indexedDb.db.metadata.get(
        'migration_completed',
      );
      if (metadata && metadata.value === true) {
        this.migrationComplete = true;
        console.log('Migration already completed previously');
        return true;
      }

      return false;
    } catch (error) {
      console.error('Failed to check migration status:', error);
      return false;
    }
  }

  async performMigration() {
    if (this.migrationInProgress) {
      console.log('Migration already in progress');
      return;
    }

    if (this.migrationComplete) {
      console.log('Migration already completed');
      return;
    }

    this.migrationInProgress = true;

    try {
      console.log('🔄 Starting localStorage to IndexedDB migration');

      const startTime = Date.now();
      const stats = {
        totalItems: 0,
        migratedItems: 0,
        errors: [],
        collections: {},
      };

      // Define collection mappings from localStorage to IndexedDB
      const collectionMappings = {
        municipalities: 'municipalities',
        properties: 'properties',
        assessments: 'assessments',
        sketches: 'sketches',
        features: 'features',
        views: 'views', // This might be stored as 'property-views' in localStorage
        viewAttributes: 'viewAttributes',
        zoneBaseValues: 'zoneBaseValues',
      };

      // Migrate each collection
      for (const [localStorageKey, indexedDbCollection] of Object.entries(
        collectionMappings,
      )) {
        try {
          console.log(`Migrating ${localStorageKey} -> ${indexedDbCollection}`);

          const migrationResult = await this.migrateCollection(
            localStorageKey,
            indexedDbCollection,
          );

          stats.collections[indexedDbCollection] = migrationResult;
          stats.totalItems += migrationResult.total;
          stats.migratedItems += migrationResult.migrated;
          stats.errors.push(...migrationResult.errors);

          console.log(
            `✅ Migrated ${migrationResult.migrated}/${migrationResult.total} items from ${localStorageKey}`,
          );
        } catch (error) {
          console.error(
            `Failed to migrate collection ${localStorageKey}:`,
            error,
          );
          stats.errors.push({
            collection: localStorageKey,
            error: error.message,
          });
        }
      }

      // Migrate individual cached items (like property assessments, sketches, etc.)
      await this.migrateIndividualItems(stats);

      // Mark migration as complete
      await this.indexedDb.db.metadata.put({
        key: 'migration_completed',
        value: true,
        lastUpdated: new Date().toISOString(),
        stats: stats,
      });

      const duration = Date.now() - startTime;
      stats.duration = duration;

      this.migrationStats = stats;
      this.migrationComplete = true;

      console.log(`🎉 Migration completed in ${duration}ms`);
      console.log('Migration stats:', stats);

      // Optional: Clear localStorage after successful migration
      if (stats.errors.length === 0) {
        await this.clearLocalStorageAfterMigration();
      }
    } catch (error) {
      console.error('Migration failed:', error);
      throw error;
    } finally {
      this.migrationInProgress = false;
    }
  }

  async migrateCollection(localStorageKey, indexedDbCollection) {
    const result = {
      total: 0,
      migrated: 0,
      errors: [],
    };

    try {
      // Get data from localStorage service
      const localData = this.localStorage.getCollection(localStorageKey);

      if (!localData || !Array.isArray(localData)) {
        console.log(`No data found in localStorage for ${localStorageKey}`);
        return result;
      }

      result.total = localData.length;

      // Migrate each item
      for (const item of localData) {
        try {
          // Transform the item for IndexedDB
          const transformedItem = this.transformItem(item, indexedDbCollection);

          // Add to IndexedDB
          await this.indexedDb.put(indexedDbCollection, transformedItem);
          result.migrated++;
        } catch (error) {
          console.error(
            `Failed to migrate item from ${localStorageKey}:`,
            error,
          );
          result.errors.push({
            item: item.id || 'unknown',
            error: error.message,
          });
        }
      }
    } catch (error) {
      console.error(
        `Failed to get collection ${localStorageKey} from localStorage:`,
        error,
      );
      result.errors.push({
        collection: localStorageKey,
        error: error.message,
      });
    }

    return result;
  }

  async migrateIndividualItems(stats) {
    // Migrate individually cached items (not in collections)
    const individualItemPatterns = [
      /^item_properties_.*_assessment_current$/,
      /^item_properties_.*_sketches$/,
      /^item_properties_.*_features$/,
      /^property_.*$/,
      /^assessment_.*$/,
      /^sketch_.*$/,
    ];

    let individualMigrated = 0;
    let individualErrors = [];

    // Scan localStorage for individual items
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);

      for (const pattern of individualItemPatterns) {
        if (pattern.test(key)) {
          try {
            const item = JSON.parse(localStorage.getItem(key));

            if (item && item.data) {
              // Determine which collection this item belongs to
              const collection = this.determineCollectionFromKey(key);

              if (collection) {
                const transformedItem = this.transformItem(
                  item.data,
                  collection,
                );
                await this.indexedDb.put(collection, transformedItem);
                individualMigrated++;
              }
            }
          } catch (error) {
            console.error(`Failed to migrate individual item ${key}:`, error);
            individualErrors.push({
              key: key,
              error: error.message,
            });
          }
          break; // Found a pattern match, no need to check others
        }
      }
    }

    stats.collections['individual_items'] = {
      total: individualMigrated + individualErrors.length,
      migrated: individualMigrated,
      errors: individualErrors,
    };

    stats.totalItems += individualMigrated + individualErrors.length;
    stats.migratedItems += individualMigrated;
    stats.errors.push(...individualErrors);

    console.log(`Migrated ${individualMigrated} individual items`);
  }

  determineCollectionFromKey(key) {
    if (key.includes('assessment')) return 'assessments';
    if (key.includes('sketch')) return 'sketches';
    if (key.includes('feature')) return 'features';
    if (key.includes('view')) return 'views';
    if (key.includes('properties')) return 'properties';

    return null;
  }

  transformItem(item, collection) {
    // Add IndexedDB-specific metadata
    const transformed = {
      ...item,
      _lastSynced:
        item.updated_at || item.created_at || new Date().toISOString(),
      _syncState: 'synced', // Assume migrated data is already synced
      _conflictVersion: 1,
    };

    // Remove localStorage-specific fields
    delete transformed.source;
    delete transformed.dirty;
    delete transformed.cached_at;

    // Collection-specific transformations
    switch (collection) {
      case 'properties':
        // Ensure required fields
        if (!transformed.municipalityId && transformed.municipality_id) {
          transformed.municipalityId = transformed.municipality_id;
        }
        break;

      case 'assessments':
        // Ensure required fields
        if (!transformed.propertyId && transformed.property_id) {
          transformed.propertyId = transformed.property_id;
        }
        if (!transformed.municipalityId && transformed.municipality_id) {
          transformed.municipalityId = transformed.municipality_id;
        }
        break;

      case 'views':
        // Ensure required fields for property views
        if (!transformed.propertyId && transformed.property_id) {
          transformed.propertyId = transformed.property_id;
        }
        if (!transformed.municipalityId && transformed.municipality_id) {
          transformed.municipalityId = transformed.municipality_id;
        }
        break;

      case 'sketches':
        if (!transformed.propertyId && transformed.property_id) {
          transformed.propertyId = transformed.property_id;
        }
        if (!transformed.municipalityId && transformed.municipality_id) {
          transformed.municipalityId = transformed.municipality_id;
        }
        break;

      case 'features':
        if (!transformed.sketchId && transformed.sketch_id) {
          transformed.sketchId = transformed.sketch_id;
        }
        if (!transformed.propertyId && transformed.property_id) {
          transformed.propertyId = transformed.property_id;
        }
        if (!transformed.municipalityId && transformed.municipality_id) {
          transformed.municipalityId = transformed.municipality_id;
        }
        break;

      case 'viewAttributes':
        if (!transformed.municipalityId && transformed.municipality_id) {
          transformed.municipalityId = transformed.municipality_id;
        }
        break;
    }

    return transformed;
  }

  async clearLocalStorageAfterMigration() {
    console.log('🧹 Clearing localStorage after successful migration');

    try {
      // Clear collection data
      const collectionsToRemove = [
        'municipalities',
        'properties',
        'assessments',
        'sketches',
        'features',
        'views',
        'viewAttributes',
        'zoneBaseValues',
      ];

      for (const collection of collectionsToRemove) {
        this.localStorage.clearCollection(collection);
      }

      // Clear individual cached items
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);

        if (
          key.startsWith('item_') ||
          key.startsWith('property_') ||
          key.startsWith('assessment_') ||
          key.startsWith('sketch_')
        ) {
          keysToRemove.push(key);
        }
      }

      for (const key of keysToRemove) {
        localStorage.removeItem(key);
      }

      // Add a flag to indicate localStorage has been cleared
      await this.indexedDb.db.metadata.put({
        key: 'localStorage_cleared',
        value: true,
        lastUpdated: new Date().toISOString(),
      });

      console.log(`✅ Cleared ${keysToRemove.length} localStorage items`);
    } catch (error) {
      console.error('Failed to clear localStorage after migration:', error);
    }
  }

  async getMigrationStats() {
    if (this.migrationStats) {
      return this.migrationStats;
    }

    try {
      const metadata = await this.indexedDb.db.metadata.get(
        'migration_completed',
      );
      if (metadata && metadata.stats) {
        return metadata.stats;
      }
    } catch (error) {
      console.error('Failed to get migration stats:', error);
    }

    return null;
  }

  async forceMigration() {
    // Force migration even if it was already completed
    this.migrationComplete = false;

    // Clear the completion flag
    try {
      await this.indexedDb.db.metadata.delete('migration_completed');
    } catch (error) {
      console.warn('Failed to clear migration completion flag:', error);
    }

    return this.performMigration();
  }

  async validateMigration() {
    console.log('🔍 Validating migration results');

    const validation = {
      success: true,
      issues: [],
      stats: {},
    };

    try {
      // Get stats from both storages
      const indexedDbStats = await this.indexedDb.getStorageStats();
      const localStorageStats = this.getLocalStorageStats();

      validation.stats.indexedDb = indexedDbStats;
      validation.stats.localStorage = localStorageStats;

      // Check if IndexedDB has data
      const totalIndexedDbItems = Object.values(indexedDbStats).reduce(
        (sum, count) => sum + count,
        0,
      );

      if (totalIndexedDbItems === 0) {
        validation.success = false;
        validation.issues.push('No data found in IndexedDB after migration');
      }

      // Log validation results
      console.log('Migration validation:', validation);
    } catch (error) {
      console.error('Migration validation failed:', error);
      validation.success = false;
      validation.issues.push(`Validation error: ${error.message}`);
    }

    return validation;
  }

  getLocalStorageStats() {
    const stats = {};
    let totalItems = 0;

    const collections = [
      'municipalities',
      'properties',
      'assessments',
      'sketches',
      'features',
      'views',
    ];

    for (const collection of collections) {
      try {
        const data = this.localStorage.getCollection(collection);
        const count = Array.isArray(data) ? data.length : 0;
        stats[collection] = count;
        totalItems += count;
      } catch (error) {
        stats[collection] = 0;
      }
    }

    stats.total = totalItems;
    return stats;
  }
}
