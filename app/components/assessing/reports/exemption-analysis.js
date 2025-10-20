import Component from '@glimmer/component';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

/**
 * Exemption Analysis Report Component
 *
 * This component generates an analysis report of exemptions and credits
 * showing trends, impacts, and detailed breakdowns.
 */
export default class ExemptionAnalysisComponent extends Component {
  @service api;
  @service municipality;
  @service notifications;

  @tracked isGenerating = false;
  @tracked reportData = null;
  @tracked error = null;

  @action
  async generateReport(parameters = {}) {
    this.isGenerating = true;
    this.error = null;
    this.reportData = null;

    try {
      const municipalityId = this.municipality.currentMunicipality?.id;

      const reportParams = {
        assessment_year: parameters.assessment_year || new Date().getFullYear(),
        exemption_types: parameters.exemption_types || [],
        include_historical: parameters.include_historical || false,
        comparison_years: parameters.comparison_years || 3,
        minimum_value: parameters.minimum_value || 0,
        ...parameters,
      };

      const response = await this.api.post(
        `/municipalities/${municipalityId}/reports/exemption-analysis`,
        { parameters: reportParams },
      );

      this.reportData = response.data;
      this.notifications.success('Exemption analysis generated successfully');
    } catch (error) {
      console.error('Failed to generate exemption analysis:', error);
      this.error = error.message || 'Failed to generate report';
      this.notifications.error(this.error);
    } finally {
      this.isGenerating = false;
    }
  }

  @action
  async exportReport(format = 'pdf') {
    if (!this.reportData) {
      this.notifications.error('No report data to export');
      return;
    }

    try {
      const municipalityId = this.municipality.currentMunicipality?.id;

      const response = await this.api.post(
        `/municipalities/${municipalityId}/reports/exemption-analysis/export`,
        {
          data: this.reportData,
          format: format,
        },
        {
          responseType: 'blob',
        },
      );

      const blob = new Blob([response], {
        type: format === 'pdf' ? 'application/pdf' : 'application/vnd.ms-excel',
      });

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `exemption-analysis-${new Date().toISOString().split('T')[0]}.${format}`;
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
      totalExemptions: this.reportData.summary?.total_exemptions || 0,
      totalExemptionValue: this.reportData.summary?.total_exemption_value || 0,
      totalCreditValue: this.reportData.summary?.total_credit_value || 0,
      exemptionTypes: this.reportData.summary?.by_exemption_type || [],
      impactAnalysis: this.reportData.summary?.impact_analysis || null,
      trends: this.reportData.summary?.trends || null,
    };
  }

  get hasHistoricalData() {
    return (
      this.reportData?.historical_data &&
      this.reportData.historical_data.length > 0
    );
  }
}
