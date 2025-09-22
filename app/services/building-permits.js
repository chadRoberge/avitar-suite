import Service from '@ember/service';
import { inject as service } from '@ember/service';

export default class BuildingPermitsService extends Service {
  @service api;
  @service municipality;

  // === Applications ===

  async getApplications(filters = {}) {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.api.get(
      `/municipalities/${municipalityId}/permit-applications`,
      filters,
    );
  }

  async getApplication(applicationId) {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.api.get(
      `/municipalities/${municipalityId}/permit-applications/${applicationId}`,
    );
  }

  async createApplication(applicationData) {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.api.post(
      `/municipalities/${municipalityId}/permit-applications`,
      applicationData,
    );
  }

  async updateApplication(applicationId, data) {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.api.patch(
      `/municipalities/${municipalityId}/permit-applications/${applicationId}`,
      data,
    );
  }

  async submitApplication(applicationId) {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.api.post(
      `/municipalities/${municipalityId}/permit-applications/${applicationId}/submit`,
    );
  }

  // === Permits ===

  async getPermits(filters = {}) {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.api.get(`/municipalities/${municipalityId}/permits`, filters);
  }

  async getPermit(permitId) {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.api.get(
      `/municipalities/${municipalityId}/permits/${permitId}`,
    );
  }

  async issuePermit(applicationId, permitData) {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.api.post(`/municipalities/${municipalityId}/permits`, {
      application_id: applicationId,
      ...permitData,
    });
  }

  async updatePermit(permitId, data) {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.api.patch(
      `/municipalities/${municipalityId}/permits/${permitId}`,
      data,
    );
  }

  async revokePermit(permitId, reason) {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.api.post(
      `/municipalities/${municipalityId}/permits/${permitId}/revoke`,
      {
        reason,
      },
    );
  }

  async closePermit(permitId, closeData) {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.api.post(
      `/municipalities/${municipalityId}/permits/${permitId}/close`,
      closeData,
    );
  }

  // === Inspections ===

  async getInspections(filters = {}) {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.api.get(
      `/municipalities/${municipalityId}/inspections`,
      filters,
    );
  }

  async getInspection(inspectionId) {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.api.get(
      `/municipalities/${municipalityId}/inspections/${inspectionId}`,
    );
  }

  async scheduleInspection(permitId, inspectionData) {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.api.post(`/municipalities/${municipalityId}/inspections`, {
      permit_id: permitId,
      ...inspectionData,
    });
  }

  async updateInspection(inspectionId, data) {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.api.patch(
      `/municipalities/${municipalityId}/inspections/${inspectionId}`,
      data,
    );
  }

  async completeInspection(inspectionId, results) {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.api.post(
      `/municipalities/${municipalityId}/inspections/${inspectionId}/complete`,
      results,
    );
  }

  async rescheduleInspection(inspectionId, newDateTime, reason) {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.api.post(
      `/municipalities/${municipalityId}/inspections/${inspectionId}/reschedule`,
      {
        new_date_time: newDateTime,
        reason,
      },
    );
  }

  // === Code Enforcement ===

  async getViolations(filters = {}) {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.api.get(
      `/municipalities/${municipalityId}/code-violations`,
      filters,
    );
  }

  async createViolation(violationData) {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.api.post(
      `/municipalities/${municipalityId}/code-violations`,
      violationData,
    );
  }

  async updateViolation(violationId, data) {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.api.patch(
      `/municipalities/${municipalityId}/code-violations/${violationId}`,
      data,
    );
  }

  async resolveViolation(violationId, resolutionData) {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.api.post(
      `/municipalities/${municipalityId}/code-violations/${violationId}/resolve`,
      resolutionData,
    );
  }

  // === Digital Plan Review (Professional Feature) ===

  async uploadPlans(applicationId, files) {
    const municipalityId = this.municipality.currentMunicipality.id;
    const formData = new FormData();
    files.forEach((file) => formData.append('plans[]', file));
    formData.append('application_id', applicationId);

    return this.api.request(`/municipalities/${municipalityId}/plan-uploads`, {
      method: 'POST',
      body: formData,
      headers: {}, // Let browser set Content-Type for multipart/form-data
    });
  }

  async getPlansReview(applicationId) {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.api.get(
      `/municipalities/${municipalityId}/permit-applications/${applicationId}/plans-review`,
    );
  }

  async submitPlansReview(applicationId, reviewData) {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.api.post(
      `/municipalities/${municipalityId}/permit-applications/${applicationId}/plans-review`,
      reviewData,
    );
  }

  // === Workflow Automation (Enterprise Feature) ===

  async getWorkflowTemplates() {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.api.get(`/municipalities/${municipalityId}/workflow-templates`);
  }

  async createWorkflow(templateId, applicationId) {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.api.post(`/municipalities/${municipalityId}/workflows`, {
      template_id: templateId,
      application_id: applicationId,
    });
  }

  async getWorkflowStatus(workflowId) {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.api.get(
      `/municipalities/${municipalityId}/workflows/${workflowId}`,
    );
  }

  // === Fees ===

  async calculateFees(applicationData) {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.api.post(
      `/municipalities/${municipalityId}/calculate-fees`,
      applicationData,
    );
  }

  async getFeeSchedule() {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.api.get(`/municipalities/${municipalityId}/fee-schedule`);
  }

  async updateFeeSchedule(feeScheduleData) {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.api.patch(
      `/municipalities/${municipalityId}/fee-schedule`,
      feeScheduleData,
    );
  }

  // === Reporting ===

  async getPermitReport(startDate, endDate, options = {}) {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.api.get(`/municipalities/${municipalityId}/permit-report`, {
      start_date: startDate,
      end_date: endDate,
      ...options,
    });
  }

  async getInspectionReport(startDate, endDate, options = {}) {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.api.get(`/municipalities/${municipalityId}/inspection-report`, {
      start_date: startDate,
      end_date: endDate,
      ...options,
    });
  }

  async getCodeEnforcementReport(startDate, endDate, options = {}) {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.api.get(
      `/municipalities/${municipalityId}/code-enforcement-report`,
      {
        start_date: startDate,
        end_date: endDate,
        ...options,
      },
    );
  }

  // === Statistics ===

  async getPermitStats(year = null) {
    const municipalityId = this.municipality.currentMunicipality.id;
    const params = year ? { year } : {};
    return this.api.get(
      `/municipalities/${municipalityId}/permit-stats`,
      params,
    );
  }

  async getInspectionStats(year = null) {
    const municipalityId = this.municipality.currentMunicipality.id;
    const params = year ? { year } : {};
    return this.api.get(
      `/municipalities/${municipalityId}/inspection-stats`,
      params,
    );
  }
}
