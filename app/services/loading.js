import Service from '@ember/service';
import { tracked } from '@glimmer/tracking';

export default class LoadingService extends Service {
  @tracked isLoading = false;
  @tracked loadingMessage = '';
  @tracked progressData = null;

  activeRequests = new Set();
  showDelayTimer = null;
  hideDelayTimer = null;
  minimumShowTime = 500; // Minimum time to show loading (500ms)
  showDelay = 300; // Delay before showing loading (300ms)
  loadingStartTime = null;

  startLoading(message = 'Loading...') {
    const requestId = Symbol('request');
    this.activeRequests.add(requestId);

    this.loadingMessage = message;

    // Clear any pending hide timer
    if (this.hideDelayTimer) {
      clearTimeout(this.hideDelayTimer);
      this.hideDelayTimer = null;
    }

    // If already showing, don't restart the delay
    if (this.isLoading) {
      return requestId;
    }

    // Start delay timer to show loading
    if (!this.showDelayTimer) {
      this.showDelayTimer = setTimeout(() => {
        // Only show if we still have active requests
        if (this.activeRequests.size > 0) {
          this.isLoading = true;
          this.loadingStartTime = Date.now();
        }
        this.showDelayTimer = null;
      }, this.showDelay);
    }

    return requestId;
  }

  stopLoading(requestId) {
    if (requestId) {
      this.activeRequests.delete(requestId);
    }

    // Only proceed with hiding if no other requests are active
    if (this.activeRequests.size === 0) {
      this._hideLoading();
    }
  }

  _hideLoading() {
    // Clear show delay timer if it hasn't fired yet
    if (this.showDelayTimer) {
      clearTimeout(this.showDelayTimer);
      this.showDelayTimer = null;
      // If we never showed the loading, just clean up
      this.loadingMessage = '';
      return;
    }

    // If not currently showing, nothing to hide
    if (!this.isLoading) {
      this.loadingMessage = '';
      return;
    }

    // Calculate how long loading has been shown
    const timeShown = Date.now() - this.loadingStartTime;

    if (timeShown < this.minimumShowTime) {
      // Show for remaining minimum time
      const remainingTime = this.minimumShowTime - timeShown;

      this.hideDelayTimer = setTimeout(() => {
        this.isLoading = false;
        this.loadingMessage = '';
        this.loadingStartTime = null;
        this.hideDelayTimer = null;
      }, remainingTime);
    } else {
      // Hide immediately
      this.isLoading = false;
      this.loadingMessage = '';
      this.loadingStartTime = null;
    }
  }

  setProgress(progressData) {
    this.progressData = progressData;
  }

  clearProgress() {
    this.progressData = null;
  }

  setMessage(message) {
    this.loadingMessage = message;
  }

  stopAllLoading() {
    this.activeRequests.clear();

    // Clear all timers
    if (this.showDelayTimer) {
      clearTimeout(this.showDelayTimer);
      this.showDelayTimer = null;
    }

    if (this.hideDelayTimer) {
      clearTimeout(this.hideDelayTimer);
      this.hideDelayTimer = null;
    }

    this.isLoading = false;
    this.loadingMessage = '';
    this.progressData = null;
    this.loadingStartTime = null;
  }
}
