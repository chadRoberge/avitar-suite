import Service, { inject as service } from '@ember/service';

export default class ReportsService extends Service {
  @service api;
  @service municipality;

  // ========================
  // ASSESSING REPORTS
  // ========================

  async generateAssessmentReport(reportType, parameters = {}) {
    return await this.api.post('/reports/assessing/assessment', {
      type: reportType,
      parameters,
      municipalityId: this.municipality.currentMunicipality?.id,
    });
  }

  async generatePropertyAssessmentSummary(propertyIds, options = {}) {
    return await this.api.post('/reports/assessing/property-summary', {
      propertyIds,
      options,
      municipalityId: this.municipality.currentMunicipality?.id,
    });
  }

  async generateAssessmentRoll(year, options = {}) {
    return await this.api.post('/reports/assessing/assessment-roll', {
      year,
      options,
      municipalityId: this.municipality.currentMunicipality?.id,
    });
  }

  async generateExemptionAnalysis(parameters = {}) {
    return await this.api.post('/reports/assessing/exemption-analysis', {
      parameters,
      municipalityId: this.municipality.currentMunicipality?.id,
    });
  }

  async generateMarketAnalysis(propertyId, options = {}) {
    return await this.api.post('/reports/assessing/market-analysis', {
      propertyId,
      options,
      municipalityId: this.municipality.currentMunicipality?.id,
    });
  }

  async generateSalesComparablesReport(propertyId, radius = 1, options = {}) {
    return await this.api.post('/reports/assessing/sales-comparables', {
      propertyId,
      radius,
      options,
      municipalityId: this.municipality.currentMunicipality?.id,
    });
  }

  async generatePropertyRecordCard(propertyId, cardNumber = 1, options = {}) {
    return await this.api.post('/reports/assessing/property-record-card', {
      propertyId,
      cardNumber,
      options,
      municipalityId: this.municipality.currentMunicipality?.id,
    });
  }

  // ========================
  // BUILDING PERMIT REPORTS
  // ========================

  async generateBuildingPermitReport(reportType, parameters = {}) {
    return await this.api.post('/reports/building-permits/permit-report', {
      type: reportType,
      parameters,
      municipalityId: this.municipality.currentMunicipality?.id,
    });
  }

  async generatePermitActivityReport(dateRange, options = {}) {
    return await this.api.post('/reports/building-permits/activity', {
      dateRange,
      options,
      municipalityId: this.municipality.currentMunicipality?.id,
    });
  }

  async generateInspectionReport(parameters = {}) {
    return await this.api.post('/reports/building-permits/inspections', {
      parameters,
      municipalityId: this.municipality.currentMunicipality?.id,
    });
  }

  async generateContractorReport(parameters = {}) {
    return await this.api.post('/reports/building-permits/contractors', {
      parameters,
      municipalityId: this.municipality.currentMunicipality?.id,
    });
  }

  // ========================
  // TAX COLLECTION REPORTS
  // ========================

  async generateTaxCollectionReport(reportType, parameters = {}) {
    return await this.api.post('/reports/tax-collection/collection-report', {
      type: reportType,
      parameters,
      municipalityId: this.municipality.currentMunicipality?.id,
    });
  }

  async generateTaxBillReport(taxYear, options = {}) {
    return await this.api.post('/reports/tax-collection/tax-bills', {
      taxYear,
      options,
      municipalityId: this.municipality.currentMunicipality?.id,
    });
  }

  async generateDelinquencyReport(parameters = {}) {
    return await this.api.post('/reports/tax-collection/delinquency', {
      parameters,
      municipalityId: this.municipality.currentMunicipality?.id,
    });
  }

  async generateAbatementReport(parameters = {}) {
    return await this.api.post('/reports/tax-collection/abatements', {
      parameters,
      municipalityId: this.municipality.currentMunicipality?.id,
    });
  }

  async generatePaymentHistoryReport(propertyId, options = {}) {
    return await this.api.post('/reports/tax-collection/payment-history', {
      propertyId,
      options,
      municipalityId: this.municipality.currentMunicipality?.id,
    });
  }

  // ========================
  // TOWN CLERK REPORTS
  // ========================

  async generateTownClerkReport(reportType, parameters = {}) {
    return await this.api.post('/reports/town-clerk/clerk-report', {
      type: reportType,
      parameters,
      municipalityId: this.municipality.currentMunicipality?.id,
    });
  }

  async generateVitalRecordsReport(parameters = {}) {
    return await this.api.post('/reports/town-clerk/vital-records', {
      parameters,
      municipalityId: this.municipality.currentMunicipality?.id,
    });
  }

  async generateLicenseReport(licenseType, parameters = {}) {
    return await this.api.post('/reports/town-clerk/licenses', {
      licenseType,
      parameters,
      municipalityId: this.municipality.currentMunicipality?.id,
    });
  }

  async generateElectionReport(parameters = {}) {
    return await this.api.post('/reports/town-clerk/elections', {
      parameters,
      municipalityId: this.municipality.currentMunicipality?.id,
    });
  }

  // ========================
  // MOTOR VEHICLE REPORTS
  // ========================

  async generateMotorVehicleReport(reportType, parameters = {}) {
    return await this.api.post('/reports/motor-vehicle/vehicle-report', {
      type: reportType,
      parameters,
      municipalityId: this.municipality.currentMunicipality?.id,
    });
  }

  async generateRegistrationReport(parameters = {}) {
    return await this.api.post('/reports/motor-vehicle/registrations', {
      parameters,
      municipalityId: this.municipality.currentMunicipality?.id,
    });
  }

  async generateDecalReport(parameters = {}) {
    return await this.api.post('/reports/motor-vehicle/decals', {
      parameters,
      municipalityId: this.municipality.currentMunicipality?.id,
    });
  }

  async generateVehicleInventoryReport(parameters = {}) {
    return await this.api.post('/reports/motor-vehicle/inventory', {
      parameters,
      municipalityId: this.municipality.currentMunicipality?.id,
    });
  }

  // ========================
  // UTILITY REPORTS
  // ========================

  async generateUtilityReport(reportType, parameters = {}) {
    return await this.api.post('/reports/utilities/utility-report', {
      type: reportType,
      parameters,
      municipalityId: this.municipality.currentMunicipality?.id,
    });
  }

  async generateWaterUsageReport(parameters = {}) {
    return await this.api.post('/reports/utilities/water-usage', {
      parameters,
      municipalityId: this.municipality.currentMunicipality?.id,
    });
  }

  async generateSewerUsageReport(parameters = {}) {
    return await this.api.post('/reports/utilities/sewer-usage', {
      parameters,
      municipalityId: this.municipality.currentMunicipality?.id,
    });
  }

  async generateUtilityBillingReport(parameters = {}) {
    return await this.api.post('/reports/utilities/billing', {
      parameters,
      municipalityId: this.municipality.currentMunicipality?.id,
    });
  }

  async generateMeterReadingReport(parameters = {}) {
    return await this.api.post('/reports/utilities/meter-readings', {
      parameters,
      municipalityId: this.municipality.currentMunicipality?.id,
    });
  }

  // ========================
  // FUND ACCOUNTING REPORTS
  // ========================

  async generateFundAccountingReport(reportType, parameters = {}) {
    return await this.api.post('/reports/fund-accounting/accounting-report', {
      type: reportType,
      parameters,
      municipalityId: this.municipality.currentMunicipality?.id,
    });
  }

  async generateBudgetReport(fiscalYear, options = {}) {
    return await this.api.post('/reports/fund-accounting/budget', {
      fiscalYear,
      options,
      municipalityId: this.municipality.currentMunicipality?.id,
    });
  }

  async generateRevenueReport(parameters = {}) {
    return await this.api.post('/reports/fund-accounting/revenue', {
      parameters,
      municipalityId: this.municipality.currentMunicipality?.id,
    });
  }

  async generateExpenditureReport(parameters = {}) {
    return await this.api.post('/reports/fund-accounting/expenditures', {
      parameters,
      municipalityId: this.municipality.currentMunicipality?.id,
    });
  }

  async generateBalanceSheetReport(parameters = {}) {
    return await this.api.post('/reports/fund-accounting/balance-sheet', {
      parameters,
      municipalityId: this.municipality.currentMunicipality?.id,
    });
  }

  async generateCashFlowReport(parameters = {}) {
    return await this.api.post('/reports/fund-accounting/cash-flow', {
      parameters,
      municipalityId: this.municipality.currentMunicipality?.id,
    });
  }

  // ========================
  // COMMON REPORT UTILITIES
  // ========================

  async getReportStatus(reportId) {
    return await this.api.get(`/reports/status/${reportId}`);
  }

  async downloadReport(reportId, format = 'pdf') {
    return await this.api.get(
      `/reports/download/${reportId}?format=${format}`,
      {
        responseType: 'blob',
      },
    );
  }

  async getReportHistory(module = null, limit = 50) {
    const params = new URLSearchParams({
      municipalityId: this.municipality.currentMunicipality?.id,
      limit: limit.toString(),
    });

    if (module) {
      params.append('module', module);
    }

    return await this.api.get(`/reports/history?${params.toString()}`);
  }

  async deleteReport(reportId) {
    return await this.api.delete(`/reports/${reportId}`);
  }

  async scheduleReport(reportConfig) {
    return await this.api.post('/reports/schedule', {
      ...reportConfig,
      municipalityId: this.municipality.currentMunicipality?.id,
    });
  }

  async getScheduledReports() {
    return await this.api.get(
      `/reports/scheduled?municipalityId=${this.municipality.currentMunicipality?.id}`,
    );
  }

  async updateScheduledReport(scheduleId, reportConfig) {
    return await this.api.patch(
      `/reports/scheduled/${scheduleId}`,
      reportConfig,
    );
  }

  async deleteScheduledReport(scheduleId) {
    return await this.api.delete(`/reports/scheduled/${scheduleId}`);
  }
}
