import Component from '@glimmer/component';
import { inject as service } from '@ember/service';
import { action } from '@ember/object';
import { tracked } from '@glimmer/tracking';

export default class ConflictResolverComponent extends Component {
  @service syncManager;
  @service notifications;

  @tracked isVisible = false;
  @tracked currentConflict = null;

  constructor() {
    super(...arguments);

    // Check for conflicts on initialization
    this.checkForConflicts();

    // Listen for new conflicts
    setInterval(() => {
      this.checkForConflicts();
    }, 5000); // Check every 5 seconds
  }

  checkForConflicts() {
    try {
      const conflicts = this.syncManager.conflictItems;
      if (conflicts && conflicts.length > 0 && !this.isVisible) {
        this.currentConflict = conflicts[0];
        this.isVisible = true;
      }
    } catch (error) {
      console.warn('Error checking for conflicts:', error);
    }
  }

  @action
  resolveWithLocal() {
    if (this.currentConflict) {
      try {
        this.syncManager.resolveConflict(
          this.currentConflict.conflictId,
          'local',
        );
        this.notifications.success(
          `Conflict resolved with your local changes for ${this.currentConflict.collection}`,
        );
      } catch (error) {
        console.error('Error resolving conflict with local data:', error);
        this.notifications.error('Failed to resolve conflict');
      }
      this.nextConflict();
    }
  }

  @action
  resolveWithServer() {
    if (this.currentConflict) {
      try {
        this.syncManager.resolveConflict(
          this.currentConflict.conflictId,
          'server',
        );
        this.notifications.success(
          `Conflict resolved with server changes for ${this.currentConflict.collection}`,
        );
      } catch (error) {
        console.error('Error resolving conflict with server data:', error);
        this.notifications.error('Failed to resolve conflict');
      }
      this.nextConflict();
    }
  }

  @action
  nextConflict() {
    try {
      const conflicts = this.syncManager.conflictItems;
      if (conflicts && conflicts.length > 0) {
        this.currentConflict = conflicts[0];
      } else {
        this.isVisible = false;
        this.currentConflict = null;
      }
    } catch (error) {
      console.warn('Error getting next conflict:', error);
      this.isVisible = false;
      this.currentConflict = null;
    }
  }

  @action
  dismiss() {
    this.isVisible = false;
  }

  get conflictDetails() {
    if (!this.currentConflict) return null;

    const { collection, local, server, id } = this.currentConflict;

    // Compare key fields that might differ
    const differences = [];
    const allKeys = new Set([...Object.keys(local), ...Object.keys(server)]);

    allKeys.forEach((key) => {
      // Skip internal fields
      if (key.startsWith('_') || key === 'updated_at' || key === 'created_at') {
        return;
      }

      const localValue = local[key];
      const serverValue = server[key];

      if (localValue !== serverValue) {
        differences.push({
          field: key,
          local: localValue,
          server: serverValue,
        });
      }
    });

    return {
      collection,
      id,
      differences,
      localUpdated: local.updated_at,
      serverUpdated: server.updated_at,
    };
  }

  get remainingConflicts() {
    try {
      return this.syncManager.conflictItems?.length || 0;
    } catch (error) {
      return 0;
    }
  }
}
