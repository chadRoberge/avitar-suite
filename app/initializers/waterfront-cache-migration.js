export function initialize(application) {
  // One-time migration to clear old land assessment caches that don't have waterfront data
  const MIGRATION_KEY = 'waterfront_cache_migration_v1_completed';
  const MIGRATION_VERSION = '2025-11-24-waterfront-field';

  // Check if migration already completed
  try {
    const migrationStatus = localStorage.getItem(MIGRATION_KEY);
    if (migrationStatus === MIGRATION_VERSION) {
      console.log('✅ Waterfront cache migration already completed');
      return;
    }

    console.log('🔄 Starting waterfront cache migration...');

    // Clear all land assessment caches from IndexedDB
    // This ensures all users get fresh data with the new waterfront field
    const dbName = 'avitar-local-storage';
    const request = indexedDB.open(dbName);

    request.onsuccess = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains('cache')) {
        console.log('ℹ️ No cache store found, skipping migration');
        localStorage.setItem(MIGRATION_KEY, MIGRATION_VERSION);
        return;
      }

      const transaction = db.transaction(['cache'], 'readwrite');
      const store = transaction.objectStore('cache');
      const getAllRequest = store.getAllKeys();

      getAllRequest.onsuccess = () => {
        const keys = getAllRequest.result;
        const landAssessmentKeys = keys.filter(
          (key) =>
            typeof key === 'string' &&
            key.includes('assessment_land') &&
            key.includes('_properties_'),
        );

        console.log(
          `Found ${landAssessmentKeys.length} land assessment cache entries to clear`,
        );

        if (landAssessmentKeys.length > 0) {
          const deleteTransaction = db.transaction(['cache'], 'readwrite');
          const deleteStore = deleteTransaction.objectStore('cache');

          landAssessmentKeys.forEach((key) => {
            deleteStore.delete(key);
          });

          deleteTransaction.oncomplete = () => {
            console.log(
              `✅ Cleared ${landAssessmentKeys.length} stale land assessment cache entries`,
            );
            localStorage.setItem(MIGRATION_KEY, MIGRATION_VERSION);
          };

          deleteTransaction.onerror = (error) => {
            console.error('❌ Error during cache migration:', error);
            // Mark as complete anyway to avoid infinite retries
            localStorage.setItem(MIGRATION_KEY, MIGRATION_VERSION);
          };
        } else {
          console.log('ℹ️ No stale land assessment caches found');
          localStorage.setItem(MIGRATION_KEY, MIGRATION_VERSION);
        }
      };

      getAllRequest.onerror = (error) => {
        console.error('❌ Error reading cache keys:', error);
        localStorage.setItem(MIGRATION_KEY, MIGRATION_VERSION);
      };
    };

    request.onerror = (error) => {
      console.error('❌ Error opening IndexedDB for migration:', error);
      localStorage.setItem(MIGRATION_KEY, MIGRATION_VERSION);
    };
  } catch (error) {
    console.error('❌ Waterfront cache migration failed:', error);
    // Mark as complete to avoid blocking app startup
    localStorage.setItem(MIGRATION_KEY, MIGRATION_VERSION);
  }
}

export default {
  initialize,
};
