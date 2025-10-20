import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';

export default class MunicipalityAssessingReportsController extends Controller {
  @service('router') router;
  @service api;
  @service municipality;
  @service notifications;

  @tracked reports = [];
  @tracked groupedReports = {};
  @tracked selectedReport = null;
  @tracked reportParameters = {};
  @tracked reportOutput = null;
  @tracked isGenerating = false;
  @tracked selectedCategory = 'all';
  @tracked expandedCategories = ['assessment'];

  get availableCategories() {
    const categories = [
      { value: 'all', label: 'All Reports' },
      { value: 'property', label: 'Property Reports' },
      { value: 'exemption', label: 'Exemption Reports' },
      { value: 'assessment', label: 'Assessment Reports' },
      { value: 'tax', label: 'Tax Reports' },
      { value: 'owner', label: 'Owner Reports' },
      { value: 'analysis', label: 'Analysis Reports' },
      { value: 'compliance', label: 'Compliance Reports' },
      { value: 'other', label: 'Other Reports' },
    ];
    return categories;
  }

  get filteredReports() {
    if (this.selectedCategory === 'all') {
      return this.reports;
    }
    return this.reports.filter(
      (report) => report.category === this.selectedCategory,
    );
  }

  get reportsByCategory() {
    const categories = {};
    this.reports.forEach((report) => {
      const category = report.category || 'other';
      if (!categories[category]) {
        categories[category] = [];
      }
      categories[category].push(report);
    });
    return categories;
  }

  get hasSelectedReport() {
    return this.selectedReport !== null;
  }

  get canGenerateReport() {
    if (!this.selectedReport) return false;

    // Check if all required parameters are provided
    const requiredParams =
      this.selectedReport.parameters?.filter((param) => param.required) || [];
    return requiredParams.every((param) => {
      const value = this.reportParameters[param.name];
      return value !== undefined && value !== null && value !== '';
    });
  }

  get selectedReportComponentName() {
    if (!this.selectedReport?.component_name) return false;
    // Convert kebab-case to PascalCase and add module path
    // 'property-assessment-summary' -> 'Assessing::Reports::PropertyAssessmentSummary'
    const pascalCase = this.selectedReport.component_name
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join('');
    return `assessing/reports/${this.selectedReport.component_name}`;

    // return `Assessing::Reports::${pascalCase}`;
  }

  @action
  setupReports(model) {
    this.reports = model.reports || [];
    this.groupedReports = model.groupedReports || {};
    this.selectedReport = null;
    this.reportParameters = {};
    this.reportOutput = null;
    this.isGenerating = false;
  }

  @action
  selectCategory(category) {
    this.selectedCategory = category;
    this.selectedReport = null;
    this.reportParameters = {};
    this.reportOutput = null;
  }

  @action
  toggleCategory(categoryName) {
    if (this.expandedCategories.includes(categoryName)) {
      this.expandedCategories = this.expandedCategories.filter(
        (cat) => cat !== categoryName,
      );
    } else {
      this.expandedCategories = [...this.expandedCategories, categoryName];
    }
  }

  @action
  selectReport(report) {
    console.log(report);
    this.selectedReport = report;
    this.reportParameters = {};
    this.reportOutput = null;

    // Initialize parameters with default values
    if (report.parameters) {
      const params = {};
      report.parameters.forEach((param) => {
        if (param.default_value !== undefined) {
          params[param.name] = param.default_value;
        }
      });
      this.reportParameters = params;
    }
  }

  @action
  updateParameter(paramName, event) {
    const value = event.target.value;
    this.reportParameters = {
      ...this.reportParameters,
      [paramName]: value,
    };
  }

  @action
  async generateReport(outputFormat = 'pdf') {
    if (!this.selectedReport || !this.canGenerateReport) {
      this.notifications.error('Please complete all required parameters');
      return;
    }

    this.isGenerating = true;
    this.reportOutput = null;

    try {
      const municipalityId = this.municipality.currentMunicipality?.id;

      const response = await this.api.post(
        `/municipalities/${municipalityId}/assessing-reports/${this.selectedReport._id}/execute`,
        {
          parameters: this.reportParameters,
          output_format: outputFormat,
        },
      );

      this.reportOutput = {
        executionId: response.execution_id,
        outputFormat: outputFormat,
        estimatedCompletion: response.estimated_completion,
        status: 'generating',
      };

      this.notifications.success('Report generation started successfully');

      // Here you could implement polling to check report status
      // For now, we'll just show the execution info
    } catch (error) {
      console.error('Failed to generate report:', error);
      this.notifications.error(
        'Failed to generate report: ' + (error.message || 'Unknown error'),
      );
    } finally {
      this.isGenerating = false;
    }
  }

  @action
  previewReport() {
    this.generateReport('html');
  }

  @action
  downloadReport(format = 'pdf') {
    this.generateReport(format);
  }

  @action
  clearSelection() {
    this.selectedReport = null;
    this.reportParameters = {};
    this.reportOutput = null;
  }

  @action
  refreshReports() {
    // Refresh the route to reload reports
    this.router.transitionTo('municipality.assessing.reports');
  }
}
