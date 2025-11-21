// In-memory storage for import progress
// In production, you might want to use Redis or a database
const progressStore = new Map();

class ImportProgress {
  constructor(importId, totalItems) {
    this.importId = importId;
    this.totalItems = totalItems;
    this.processedItems = 0;
    this.currentPhase = '';
    this.status = 'in_progress';
    this.startTime = Date.now();
    this.errors = [];
  }

  update(processedItems, currentPhase = null) {
    this.processedItems = processedItems;
    if (currentPhase) {
      this.currentPhase = currentPhase;
    }
    this.lastUpdate = Date.now();
  }

  addError(error) {
    this.errors.push({
      message: error.message,
      timestamp: Date.now(),
    });
  }

  complete(results) {
    this.status = 'completed';
    this.processedItems = this.totalItems;
    this.endTime = Date.now();
    this.results = results;
  }

  fail(error) {
    this.status = 'failed';
    this.endTime = Date.now();
    this.error = error.message;
  }

  getProgress() {
    const elapsed = (this.lastUpdate || Date.now()) - this.startTime;
    const percentage = this.totalItems > 0
      ? Math.round((this.processedItems / this.totalItems) * 100)
      : 0;

    // Estimate time remaining
    let estimatedTimeRemaining = null;
    if (this.processedItems > 0 && this.processedItems < this.totalItems) {
      const itemsPerMs = this.processedItems / elapsed;
      const remainingItems = this.totalItems - this.processedItems;
      estimatedTimeRemaining = Math.round(remainingItems / itemsPerMs);
    }

    return {
      importId: this.importId,
      status: this.status,
      totalItems: this.totalItems,
      processedItems: this.processedItems,
      percentage,
      currentPhase: this.currentPhase,
      elapsedTime: elapsed,
      estimatedTimeRemaining,
      errors: this.errors,
      results: this.results,
      error: this.error,
    };
  }
}

// Module exports
module.exports = {
  createProgress(importId, totalItems) {
    const progress = new ImportProgress(importId, totalItems);
    progressStore.set(importId, progress);
    return progress;
  },

  getProgress(importId) {
    const progress = progressStore.get(importId);
    return progress ? progress.getProgress() : null;
  },

  updateProgress(importId, processedItems, currentPhase) {
    const progress = progressStore.get(importId);
    if (progress) {
      progress.update(processedItems, currentPhase);
    }
  },

  completeProgress(importId, results) {
    const progress = progressStore.get(importId);
    if (progress) {
      progress.complete(results);
    }
  },

  failProgress(importId, error) {
    const progress = progressStore.get(importId);
    if (progress) {
      progress.fail(error);
    }
  },

  deleteProgress(importId) {
    progressStore.delete(importId);
  },

  // Cleanup old completed/failed imports (older than 1 hour)
  cleanup() {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    for (const [importId, progress] of progressStore.entries()) {
      if (progress.endTime && progress.endTime < oneHourAgo) {
        progressStore.delete(importId);
      }
    }
  },
};

// Run cleanup every 15 minutes
setInterval(() => {
  module.exports.cleanup();
}, 15 * 60 * 1000);
