import Component from '@glimmer/component';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

/**
 * Tax Impact Analysis Report Component
 *
 * This component generates a tax impact analysis report showing how
 * changes in assessment values affect tax revenue and individual property taxes.
 */
export default class TaxImpactAnalysisComponent extends Component {
  @service api;
  @service municipality;
  @service notifications;

  @tracked isGenerating = false;
  @tracked reportData = null;
  @tracked error = null;

  /**
   * Generate the tax impact analysis report
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
        base_year: parameters.base_year || new Date().getFullYear() - 1,
        comparison_year: parameters.comparison_year || new Date().getFullYear(),
        tax_rate: parameters.tax_rate || 0,
        property_class: parameters.property_class || 'all',
        zone: parameters.zone || 'all',
        neighborhood: parameters.neighborhood || 'all',
        ...parameters,
      };

      // Call API to generate report data
      const response = await this.api.post(
        `/municipalities/${municipalityId}/reports/tax-impact-analysis`,
        { parameters: reportParams },
      );

      this.reportData = response.data;
      this.notifications.success('Tax impact analysis generated successfully');
    } catch (error) {
      console.error('Failed to generate tax impact analysis:', error);
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
        `/municipalities/${municipalityId}/reports/tax-impact-analysis/export`,
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
      link.download = `tax-impact-analysis-${new Date().toISOString().split('T')[0]}.${format}`;
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
      baseYearTaxRevenue: this.reportData.summary?.base_year_revenue || 0,
      comparisonYearTaxRevenue:
        this.reportData.summary?.comparison_year_revenue || 0,
      revenueDifference: this.reportData.summary?.revenue_difference || 0,
      revenuePercentChange: this.reportData.summary?.revenue_percent_change || 0,
      averageTaxIncrease: this.reportData.summary?.average_tax_increase || 0,
      propertiesWithIncrease:
        this.reportData.summary?.properties_with_increase || 0,
      propertiesWithDecrease:
        this.reportData.summary?.properties_with_decrease || 0,
    };
  }
}
