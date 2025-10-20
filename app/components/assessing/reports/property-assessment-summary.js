import Component from '@glimmer/component';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

/**
 * Property Assessment Summary Report Component
 *
 * This component generates a summary report of property assessments
 * for a given assessment year and optional property criteria.
 */
export default class PropertyAssessmentSummaryComponent extends Component {
  @service api;
  @service municipality;
  @service notifications;

  @tracked isGenerating = false;
  @tracked reportData = null;
  @tracked error = null;

  /**
   * Generate the property assessment summary report
   */
  @action
  async generateReport(parameters = {}) {
    this.isGenerating = true;
    this.error = null;
    this.reportData = null;

    try {
      const municipalityId = this.municipality.currentMunicipality?.id;

      // Default parameters
      const reportParams = {
        assessment_year: parameters.assessment_year || new Date().getFullYear(),
        property_class: parameters.property_class || 'all',
        zone: parameters.zone || 'all',
        neighborhood: parameters.neighborhood || 'all',
        include_exemptions: parameters.include_exemptions || false,
        ...parameters,
      };

      // Call API to generate report data
      const response = await this.api.post(
        `/municipalities/${municipalityId}/reports/property-assessment-summary`,
        { parameters: reportParams },
      );

      this.reportData = response.data;
      this.notifications.success(
        'Property assessment summary generated successfully',
      );
    } catch (error) {
      console.error('Failed to generate property assessment summary:', error);
      this.error = error.message || 'Failed to generate report';
      this.notifications.error(this.error);
    } finally {
      this.isGenerating = false;
    }
  }

  /**
   * Export report data to different formats
   */
  @action
  async exportReport(format = 'pdf') {
    if (!this.reportData) {
      this.notifications.error('No report data to export');
      return;
    }

    try {
      const municipalityId = this.municipality.currentMunicipality?.id;

      const response = await this.api.post(
        `/municipalities/${municipalityId}/reports/property-assessment-summary/export`,
        {
          data: this.reportData,
          format: format,
        },
        {
          responseType: 'blob',
        },
      );

      // Create download link
      const blob = new Blob([response], {
        type: format === 'pdf' ? 'application/pdf' : 'application/vnd.ms-excel',
      });

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `property-assessment-summary-${new Date().toISOString().split('T')[0]}.${format}`;
      link.click();

      window.URL.revokeObjectURL(url);
      this.notifications.success(`Report exported as ${format.toUpperCase()}`);
    } catch (error) {
      console.error('Failed to export report:', error);
      this.notifications.error('Failed to export report');
    }
  }

  get reportSummary() {
    if (!this.reportData) return null;

    return {
      totalProperties: this.reportData.properties?.length || 0,
      totalTaxableValue: this.reportData.summary?.total_assessed_value || 0,
      averageAssessedValue:
        this.reportData.summary?.average_assessed_value || 0,
      propertyClasses: this.reportData.summary?.by_property_class || {},
      exemptionsSummary: this.reportData.summary?.exemptions || null,
    };
  }
}
