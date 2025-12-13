import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';

export default class MunicipalitySettingsSystemController extends Controller {
  @service api;
  @service municipality;
  @service notifications;
  @service('indexed-db') indexedDb;

  // Working copy of format settings (editable) - initialize with defaults
  @tracked mapDigits = 2;
  @tracked lotDigits = 3;
  @tracked subDigits = 3;
  @tracked separator = '-';
  @tracked removeLeadingZeros = true;
  @tracked showSubOnlyWhenPresent = false;

  // UI state
  @tracked isSaving = false;
  @tracked showPreview = false;
  @tracked isClearing = false;

  // Available digit options
  digitOptions = [2, 3, 4, 6];

  // Sample PIDs for preview
  samplePIDs = [
    '010010010000000000',
    '010010050000000000',
    '000005000001000001',
  ];

  // Load settings from model when model changes
  get pidFormat() {
    return this.model?.pidFormat;
  }

  constructor() {
    super(...arguments);
    // Will be initialized when model is available
  }

  // Update local state when model changes
  @action
  loadFormatSettings() {
    if (this.pidFormat) {
      const format = this.pidFormat.format;
      const display = this.pidFormat.display;

      this.mapDigits = format.map?.digits || 2;
      this.lotDigits = format.lot?.digits || 3;
      this.subDigits = format.sublot?.digits || 3;
      this.separator = display.separator || '-';
      this.removeLeadingZeros = !display.show_leading_zeros;
      this.showSubOnlyWhenPresent = display.compact_optional || false;
    }
  }

  // Computed: Current format configuration object
  get currentFormat() {
    return {
      mapDigits: this.mapDigits,
      lotDigits: this.lotDigits,
      subDigits: this.subDigits,
      separator: this.separator,
      removeLeadingZeros: this.removeLeadingZeros,
      showSubOnlyWhenPresent: this.showSubOnlyWhenPresent,
    };
  }

  // Computed: Total digits allocated
  get totalDigits() {
    return this.mapDigits + this.lotDigits + this.subDigits;
  }

  // Computed: Is configuration valid?
  get isValidConfiguration() {
    return this.totalDigits <= 18;
  }

  // Format a PID using current settings
  @action
  formatPID(rawPID) {
    if (!rawPID || rawPID.length !== 18) {
      return rawPID || 'Invalid PID';
    }

    // Guard against uninitialized state
    if (
      typeof this.mapDigits === 'undefined' ||
      typeof this.lotDigits === 'undefined' ||
      typeof this.subDigits === 'undefined'
    ) {
      return rawPID;
    }

    const map = rawPID.substring(0, this.mapDigits);
    const lot = rawPID.substring(
      this.mapDigits,
      this.mapDigits + this.lotDigits,
    );
    const sub = rawPID.substring(
      this.mapDigits + this.lotDigits,
      this.mapDigits + this.lotDigits + this.subDigits,
    );

    const parts = [];

    // Add map
    parts.push(this.removeLeadingZeros ? parseInt(map, 10).toString() : map);

    // Add lot
    parts.push(this.removeLeadingZeros ? parseInt(lot, 10).toString() : lot);

    // Add sub (conditionally)
    const subInt = parseInt(sub, 10);
    if (!this.showSubOnlyWhenPresent || subInt > 0) {
      parts.push(this.removeLeadingZeros ? subInt.toString() : sub);
    }

    return parts.join(this.separator);
  }

  // Computed: Current format preview for the first example
  get currentFormatPreview() {
    return this.formatPID('010010010000000000');
  }

  // Computed: Preview examples
  get previewExamples() {
    return this.samplePIDs.map((rawPID) => ({
      raw: rawPID,
      formatted: this.formatPID(rawPID),
    }));
  }

  // Actions
  @action
  updateMapDigits(event) {
    this.mapDigits = parseInt(event.target.value, 10);
  }

  @action
  updateLotDigits(event) {
    this.lotDigits = parseInt(event.target.value, 10);
  }

  @action
  updateSubDigits(event) {
    this.subDigits = parseInt(event.target.value, 10);
  }

  @action
  updateSeparator(event) {
    this.separator = event.target.value;
  }

  @action
  toggleRemoveLeadingZeros(event) {
    this.removeLeadingZeros = event.target.checked;
  }

  @action
  toggleShowSubOnlyWhenPresent(event) {
    this.showSubOnlyWhenPresent = event.target.checked;
  }

  @action
  togglePreview() {
    this.showPreview = !this.showPreview;
  }

  @action
  async saveFormatSettings() {
    if (!this.isValidConfiguration) {
      this.notifications.error(
        `Total digits (${this.totalDigits}) exceeds maximum of 18`,
      );
      return;
    }

    this.isSaving = true;
    try {
      const municipalityId = this.municipality.currentMunicipality?.id;

      const payload = {
        format: {
          map: {
            digits: this.mapDigits,
            position: 0,
            label: 'Map',
          },
          lot: {
            digits: this.lotDigits,
            position: this.mapDigits,
            label: 'Lot',
          },
          sublot: {
            digits: this.subDigits,
            position: this.mapDigits + this.lotDigits,
            label: 'Sublot',
            optional: true,
          },
          // Additional optional segments (not used by default, but required by model)
          unit: {
            digits: 0,
            position: 0,
            label: 'Unit',
            optional: true,
          },
          building: {
            digits: 0,
            position: 0,
            label: 'Building',
            optional: true,
          },
          condo: {
            digits: 0,
            position: 0,
            label: 'Condo',
            optional: true,
          },
          mobile: {
            digits: 0,
            position: 0,
            label: 'Mobile',
            optional: true,
          },
        },
        display: {
          separator: this.separator,
          show_leading_zeros: !this.removeLeadingZeros,
          compact_optional: this.showSubOnlyWhenPresent,
        },
        validation: {
          required_segments: ['map', 'lot'],
          total_digits: this.totalDigits,
        },
      };

      await this.api.put(
        `/municipalities/${municipalityId}/pid-format`,
        payload,
      );

      this.notifications.success('PID format settings saved successfully');
    } catch (error) {
      console.error('Error saving PID format:', error);
      this.notifications.error(
        error.message || 'Failed to save PID format settings',
      );
    } finally {
      this.isSaving = false;
    }
  }

  @action
  resetToDefault() {
    this.mapDigits = 2;
    this.lotDigits = 3;
    this.subDigits = 3;
    this.separator = '-';
    this.removeLeadingZeros = true;
    this.showSubOnlyWhenPresent = false;

    this.notifications.info('Reset to default format settings');
  }

  @action
  async clearLocalData() {
    // Show confirmation dialog
    const confirmed = window.confirm(
      'Are you sure you want to clear local data for this municipality?\n\n' +
        'This will:\n' +
        '• Delete all cached properties and assessments\n' +
        '• Delete all cached building permits\n' +
        '• Remove pending offline changes (they will be lost)\n' +
        '• Force a complete resynchronization\n\n' +
        'Your login session and preferences will be preserved.\n\n' +
        'The application will reload after clearing data.',
    );

    if (!confirmed) {
      return;
    }

    this.isClearing = true;

    try {
      const municipalityId = this.municipality.currentMunicipality?.id;

      if (!municipalityId) {
        throw new Error('No municipality selected');
      }

      // Clear IndexedDB data for this municipality only
      if (this.indexedDb.db) {
        console.log('🗑️ Clearing municipality data from IndexedDB...');

        // Get all table names from the database
        const tables = this.indexedDb.db.tables;

        // Clear data from each table for this municipality
        for (const table of tables) {
          if (
            table.schema.primKey.keyPath === 'id' ||
            table.schema.primKey.keyPath === '++id'
          ) {
            // Skip tables without municipalityId field
            if (
              !table.schema.indexes.some((idx) => idx.name === 'municipalityId')
            ) {
              continue;
            }

            // Delete all records for this municipality
            const count = await table
              .where('municipalityId')
              .equals(municipalityId)
              .delete();
            console.log(`  ✅ Deleted ${count} records from ${table.name}`);
          }
        }

        // Clear sync queue items for this municipality
        await this.indexedDb.db.table('syncQueue').clear();
        console.log('  ✅ Cleared sync queue');

        // Clear delta sync stores
        await this.indexedDb.db.table('deltas').clear();
        await this.indexedDb.db.table('conflicts').clear();
        await this.indexedDb.db.table('changeLog').clear();
        console.log('  ✅ Cleared sync metadata');
      }

      // Clear ALL localStorage and sessionStorage
      // This will log the user out, but ensures no stale data remains
      console.log(
        `  🧹 Clearing ALL localStorage (${localStorage.length} items)`,
      );
      localStorage.clear();
      console.log(`  ✅ LocalStorage cleared`);

      console.log(
        `  🧹 Clearing ALL sessionStorage (${sessionStorage.length} items)`,
      );
      sessionStorage.clear();
      console.log(`  ✅ SessionStorage cleared`);

      this.notifications.success(
        'Municipality data cleared. Reloading application...',
      );

      // Reload the application after a brief delay
      // Use hard reload to bypass any service worker caches
      setTimeout(() => {
        window.location.reload(true);
      }, 1000);
    } catch (error) {
      console.error('Error clearing local data:', error);
      this.notifications.error(error.message || 'Failed to clear local data');
      this.isClearing = false;
    }
  }
}
