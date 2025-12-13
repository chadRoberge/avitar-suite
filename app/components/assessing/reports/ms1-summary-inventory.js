import Component from '@glimmer/component';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

/**
 * MS-1 Summary Inventory of Valuation Report Component
 *
 * New Hampshire Department of Revenue Administration (DRA) MS-1 form.
 * This is a state-mandated annual report showing comprehensive valuation data
 * including land, buildings, utilities, exemptions, and various RSA compliance items.
 */
export default class Ms1SummaryInventoryComponent extends Component {
  @service api;
  @service municipality;
  @service notifications;

  @tracked isGenerating = false;
  @tracked reportData = null;
  @tracked error = null;

  constructor() {
    super(...arguments);
    // Auto-generate report when component is created with parameters
    if (this.args.parameters?.assessment_year) {
      this.generateReport(this.args.parameters);
    }
  }

  /**
   * Generate the MS-1 report data
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
        ...parameters,
      };

      // Call API to generate MS-1 report data
      const response = await this.api.post(
        `/municipalities/${municipalityId}/reports/ms1-summary-inventory`,
        { parameters: reportParams },
      );

      this.reportData = response.data;
      this.notifications.success('MS-1 report generated successfully');
    } catch (error) {
      console.error('Failed to generate MS-1 report:', error);
      this.error = error.message || 'Failed to generate report';
      this.notifications.error(this.error);
    } finally {
      this.isGenerating = false;
    }
  }

  /**
   * Export report to PDF for printing
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
        `/municipalities/${municipalityId}/reports/ms1-summary-inventory/export`,
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
        type: 'application/pdf',
      });

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `MS-1-${this.municipality.currentMunicipality.name}-${this.reportData.assessmentYear}.pdf`;
      link.click();

      window.URL.revokeObjectURL(url);
      this.notifications.success('MS-1 report exported successfully');
    } catch (error) {
      console.error('Failed to export MS-1 report:', error);
      this.notifications.error('Failed to export report');
    }
  }

  /**
   * Print the report directly
   */
  @action
  printReport() {
    if (!this.reportData) {
      this.notifications.error('No report data to print');
      return;
    }

    window.print();
  }

  /**
   * Computed properties for report sections
   */
  get municipalityInfo() {
    return {
      name: this.municipality.currentMunicipality?.name || '',
      county: this.municipality.currentMunicipality?.county || '',
      assessor: this.reportData?.assessor || '',
      preparedBy: this.reportData?.preparedBy || '',
      preparedDate:
        this.reportData?.preparedDate || new Date().toISOString().split('T')[0],
    };
  }

  get landValuationSummary() {
    if (!this.reportData?.land) return null;

    return {
      currentUse: this.reportData.land.currentUse || { acres: 0, value: 0 },
      conservationRestriction: this.reportData.land.conservationRestriction || {
        acres: 0,
        value: 0,
      },
      discretionaryEasements: this.reportData.land.discretionaryEasements || {
        acres: 0,
        value: 0,
      },
      discretionaryPreservation: this.reportData.land
        .discretionaryPreservation || { acres: 0, value: 0 },
      farmStructures: this.reportData.land.farmStructures || {
        acres: 0,
        value: 0,
      },
      residentialLand: this.reportData.land.residential || {
        acres: 0,
        value: 0,
      },
      commercialIndustrialLand: this.reportData.land.commercialIndustrial || {
        acres: 0,
        value: 0,
      },
      totalLand: this.reportData.land.taxableTotal || { acres: 0, value: 0 },
      exemptLand: this.reportData.land.exempt || { acres: 0, value: 0 },
    };
  }

  get buildingValuationSummary() {
    if (!this.reportData?.buildings) return null;

    return {
      residential: this.reportData.buildings.residential || 0,
      manufacturedHousing: this.reportData.buildings.manufacturedHousing || 0,
      commercialIndustrial: this.reportData.buildings.commercialIndustrial || 0,
      totalBuildings: this.reportData.buildings.taxableTotal || 0,
      exemptBuildings: this.reportData.buildings.exempt || 0,
    };
  }

  get utilitiesValuation() {
    if (!this.reportData?.utilities) return null;

    return {
      electricCompanies: this.reportData.utilities.electricCompanies || [],
      totalUtilities: this.reportData.utilities.total || 0,
    };
  }

  get valuationBeforeExemptions() {
    if (!this.reportData) return 0;

    const land = this.landValuationSummary?.totalLand?.value || 0;
    const buildings = this.buildingValuationSummary?.totalBuildings || 0;
    const utilities = this.utilitiesValuation?.totalUtilities || 0;

    return land + buildings + utilities;
  }

  get exemptionsSummary() {
    if (!this.reportData?.exemptions) return null;

    return {
      blind: this.reportData.exemptions.blind || { count: 0, value: 0 },
      elderly: this.reportData.exemptions.elderly || { count: 0, value: 0 },
      disabled: this.reportData.exemptions.disabled || { count: 0, value: 0 },
      woodHeating: this.reportData.exemptions.woodHeating || {
        count: 0,
        value: 0,
      },
      solarWind: this.reportData.exemptions.solarWind || { count: 0, value: 0 },
      waterPollution: this.reportData.exemptions.waterPollution || {
        count: 0,
        value: 0,
      },
      airPollution: this.reportData.exemptions.airPollution || {
        count: 0,
        value: 0,
      },
      totalExemptions: this.reportData.exemptions.total || 0,
    };
  }

  get veteransCreditsSummary() {
    if (!this.reportData?.veteransCredits) return null;

    return {
      standard: this.reportData.veteransCredits.standard || {
        count: 0,
        amount: 0,
      },
      serviceConnectedDisability: this.reportData.veteransCredits
        .serviceConnectedDisability || { count: 0, amount: 0 },
      allVeterans: this.reportData.veteransCredits.allVeterans || {
        count: 0,
        amount: 0,
      },
      total: this.reportData.veteransCredits.total || { count: 0, amount: 0 },
    };
  }

  get netValuation() {
    return (
      this.valuationBeforeExemptions -
      (this.exemptionsSummary?.totalExemptions || 0)
    );
  }

  get currentUseDetails() {
    if (!this.reportData?.currentUse) return null;

    return {
      parcelsInCurrentUse: this.reportData.currentUse.parcels || 0,
      acresInCurrentUse: this.reportData.currentUse.acres || 0,
      totalAcres: this.reportData.currentUse.totalAcres || 0,
      removedFromCurrentUse: this.reportData.currentUse.removedAcres || 0,
      landUseChangeTax: this.reportData.currentUse.landUseChangeTax || 0,
    };
  }

  get conservationRestrictionDetails() {
    if (!this.reportData?.conservationRestriction) return null;

    return {
      parcels: this.reportData.conservationRestriction.parcels || 0,
      acres: this.reportData.conservationRestriction.acres || 0,
      assessedValue: this.reportData.conservationRestriction.assessedValue || 0,
    };
  }

  get municipalAdoptionQuestions() {
    if (!this.reportData?.municipalAdoptions) return null;

    return this.reportData.municipalAdoptions;
  }
}
