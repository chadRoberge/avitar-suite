/**
 * In-memory progress tracker for long-running operations
 * Stores progress state for recalculation jobs
 */
class ProgressTracker {
  constructor() {
    this.jobs = new Map();
    this.maxAge = 60 * 60 * 1000; // 1 hour

    // Clean up old jobs every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  /**
   * Create or update a job's progress
   * @param {String} jobId - Unique job identifier
   * @param {Object} data - Progress data
   */
  async update(jobId, data) {
    const existing = this.jobs.get(jobId) || {};

    const updatedJob = {
      ...existing,
      ...data,
      jobId,
      lastUpdated: new Date(),
    };

    this.jobs.set(jobId, updatedJob);
    return updatedJob;
  }

  /**
   * Get a job's current progress
   * @param {String} jobId - Job identifier
   * @returns {Object|null} Progress data or null if not found
   */
  get(jobId) {
    return this.jobs.get(jobId) || null;
  }

  /**
   * Remove a job from tracking
   * @param {String} jobId - Job identifier
   */
  delete(jobId) {
    this.jobs.delete(jobId);
  }

  /**
   * Clean up old completed/failed jobs
   */
  cleanup() {
    const now = Date.now();

    for (const [jobId, job] of this.jobs.entries()) {
      const age = now - new Date(job.lastUpdated).getTime();

      // Remove completed/failed jobs older than maxAge
      if (
        age > this.maxAge &&
        (job.status === 'completed' || job.status === 'failed')
      ) {
        console.log(`Cleaning up old job: ${jobId}`);
        this.jobs.delete(jobId);
      }
    }
  }

  /**
   * Get all active jobs
   * @returns {Array} Array of active jobs
   */
  getActiveJobs() {
    const activeJobs = [];

    for (const [jobId, job] of this.jobs.entries()) {
      if (job.status === 'running') {
        activeJobs.push(job);
      }
    }

    return activeJobs;
  }

  /**
   * Get total number of tracked jobs
   * @returns {Number} Number of tracked jobs
   */
  getJobCount() {
    return this.jobs.size;
  }
}

// Singleton instance
const progressTracker = new ProgressTracker();

module.exports = progressTracker;
