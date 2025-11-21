import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import { action } from '@ember/object';
import { tracked } from '@glimmer/tracking';

export default class MunicipalityAssessingRevaluationSheetController extends Controller {
  @service api;
  @service notifications;
  @service router;

  @tracked isDeleting = false;
  @tracked showPrintModal = false;
  @tracked showSettingsModal = false;
  @tracked isSavingSettings = false;

  // Form state for sheet settings
  @tracked sheetName = '';
  @tracked depreciationRate = 1.25;
  @tracked buildableSiteValue = 290000;
  @tracked siteAcreage = 2.0;
  @tracked excessFootFrontage = 160;
  @tracked excessAcreageValue = 10000;
  @tracked baseDate = '';
  @tracked annualTrend = 14.4;

  @action
  printSheet() {
    this.showPrintModal = true;
  }

  @action
  closePrintModal() {
    this.showPrintModal = false;
  }

  @action
  openSettingsModal() {
    // Load current settings from the model
    const settings = this.model.sheet.sheet_settings || {};
    this.sheetName = this.model.sheet.sheet_name || '';
    this.depreciationRate = settings.depreciation_rate || 1.25;
    this.buildableSiteValue = settings.buildable_site_value || 290000;
    this.siteAcreage = settings.site_acreage || 2.0;
    this.excessFootFrontage = settings.excess_foot_frontage || 160;
    this.excessAcreageValue = settings.excess_acreage_value || 10000;
    this.baseDate = settings.base_date
      ? new Date(settings.base_date).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];
    this.annualTrend = settings.annual_trend
      ? (settings.annual_trend * 100).toFixed(1)
      : '14.4';

    this.showSettingsModal = true;
  }

  @action
  closeSettingsModal() {
    this.showSettingsModal = false;
  }

  @action
  updateSheetName(event) {
    this.sheetName = event.target.value;
  }

  @action
  updateDepreciationRate(event) {
    this.depreciationRate = event.target.value;
  }

  @action
  updateBuildableSiteValue(event) {
    this.buildableSiteValue = event.target.value;
  }

  @action
  updateSiteAcreage(event) {
    this.siteAcreage = event.target.value;
  }

  @action
  updateExcessFootFrontage(event) {
    this.excessFootFrontage = event.target.value;
  }

  @action
  updateExcessAcreageValue(event) {
    this.excessAcreageValue = event.target.value;
  }

  @action
  updateBaseDate(event) {
    this.baseDate = event.target.value;
  }

  @action
  updateAnnualTrend(event) {
    this.annualTrend = event.target.value;
  }

  @action
  async saveSheetSettings() {
    this.isSavingSettings = true;
    try {
      // Parse and validate numeric values
      const parsedDepreciation = parseFloat(this.depreciationRate);
      const parsedSiteValue = parseFloat(this.buildableSiteValue);
      const parsedSiteAcreage = parseFloat(this.siteAcreage);
      const parsedExcessFootage = parseFloat(this.excessFootFrontage);
      const parsedExcessAcreage = parseFloat(this.excessAcreageValue);
      const parsedAnnualTrend = parseFloat(this.annualTrend);

      const updateData = {
        sheet_name: this.sheetName,
        sheet_settings: {
          depreciation_rate: isNaN(parsedDepreciation) ? 1.25 : parsedDepreciation,
          buildable_site_value: isNaN(parsedSiteValue) ? 290000 : parsedSiteValue,
          site_acreage: isNaN(parsedSiteAcreage) ? 2.0 : parsedSiteAcreage,
          excess_foot_frontage: isNaN(parsedExcessFootage) ? 160 : parsedExcessFootage,
          excess_acreage_value: isNaN(parsedExcessAcreage) ? 10000 : parsedExcessAcreage,
          base_date: new Date(this.baseDate).toISOString(),
          annual_trend: isNaN(parsedAnnualTrend) ? 0.144 : parsedAnnualTrend / 100, // Convert percentage to decimal
        },
      };

      console.log('Saving sheet settings:', updateData);
      console.log('Sheet settings details:', JSON.stringify(updateData.sheet_settings, null, 2));

      const response = await this.api.put(
        `/revaluations/${this.model.revaluation._id}/sheets/${this.model.sheet._id}`,
        updateData,
      );

      console.log('Save response:', response);

      this.notifications.success('Sheet settings saved successfully');
      this.closeSettingsModal();

      // Refresh both the current route and parent route to reload the sheet data
      // This ensures the parent's sheets array is also updated
      await this.router.refresh('municipality.assessing.revaluation');
      await this.router.refresh();
    } catch (error) {
      console.error('Error saving sheet settings:', error);
      this.notifications.error(
        error.message || 'Failed to save sheet settings',
      );
    } finally {
      this.isSavingSettings = false;
    }
  }

  @action
  async deleteSheet() {
    if (!confirm(`Are you sure you want to delete "${this.model.sheet.sheet_name}"?`)) {
      return;
    }

    this.isDeleting = true;
    try {
      await this.api.delete(
        `/revaluations/${this.model.revaluation._id}/sheets/${this.model.sheet._id}`,
      );
      this.notifications.success('Sheet deleted successfully');

      // Navigate back to the index route and refresh parent to update sidebar
      await this.router.transitionTo('municipality.assessing.revaluation.index');
      this.router.refresh('municipality.assessing.revaluation');
    } catch (error) {
      console.error('Error deleting sheet:', error);
      this.notifications.error('Failed to delete sheet');
    } finally {
      this.isDeleting = false;
    }
  }
}
