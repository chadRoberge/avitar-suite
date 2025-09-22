import Service from '@ember/service';
import { inject as service } from '@ember/service';

export default class TaxCollectionService extends Service {
  @service api;
  @service municipality;

  // === Tax Bills ===

  async getTaxBills(filters = {}) {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.api.get(`/municipalities/${municipalityId}/tax-bills`, filters);
  }

  async getTaxBill(billId) {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.api.get(
      `/municipalities/${municipalityId}/tax-bills/${billId}`,
    );
  }

  async generateTaxBills(year, options = {}) {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.api.post(
      `/municipalities/${municipalityId}/tax-bills/generate`,
      {
        year,
        ...options,
      },
    );
  }

  async updateTaxBill(billId, data) {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.api.patch(
      `/municipalities/${municipalityId}/tax-bills/${billId}`,
      data,
    );
  }

  // === Payments ===

  async getPayments(filters = {}) {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.api.get(`/municipalities/${municipalityId}/payments`, filters);
  }

  async getPayment(paymentId) {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.api.get(
      `/municipalities/${municipalityId}/payments/${paymentId}`,
    );
  }

  async processPayment(billId, paymentData) {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.api.post(`/municipalities/${municipalityId}/payments`, {
      bill_id: billId,
      ...paymentData,
    });
  }

  async refundPayment(paymentId, amount, reason) {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.api.post(
      `/municipalities/${municipalityId}/payments/${paymentId}/refund`,
      {
        amount,
        reason,
      },
    );
  }

  // === Delinquencies ===

  async getDelinquencies(filters = {}) {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.api.get(
      `/municipalities/${municipalityId}/delinquencies`,
      filters,
    );
  }

  async markAsDelinquent(billIds, effectiveDate) {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.api.post(`/municipalities/${municipalityId}/delinquencies`, {
      bill_ids: billIds,
      effective_date: effectiveDate,
    });
  }

  async removeDelinquency(billId, reason) {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.api.delete(
      `/municipalities/${municipalityId}/delinquencies/${billId}`,
      {
        reason,
      },
    );
  }

  // === Liens Management (Enterprise Feature) ===

  async getLiens(filters = {}) {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.api.get(`/municipalities/${municipalityId}/liens`, filters);
  }

  async createLien(lienData) {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.api.post(`/municipalities/${municipalityId}/liens`, lienData);
  }

  async updateLien(lienId, data) {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.api.patch(
      `/municipalities/${municipalityId}/liens/${lienId}`,
      data,
    );
  }

  async releaseLien(lienId, releaseData) {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.api.post(
      `/municipalities/${municipalityId}/liens/${lienId}/release`,
      releaseData,
    );
  }

  // === Payment Plans (Professional Feature) ===

  async getPaymentPlans(filters = {}) {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.api.get(
      `/municipalities/${municipalityId}/payment-plans`,
      filters,
    );
  }

  async createPaymentPlan(planData) {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.api.post(
      `/municipalities/${municipalityId}/payment-plans`,
      planData,
    );
  }

  async updatePaymentPlan(planId, data) {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.api.patch(
      `/municipalities/${municipalityId}/payment-plans/${planId}`,
      data,
    );
  }

  // === Automated Reminders (Professional Feature) ===

  async getReminders(filters = {}) {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.api.get(`/municipalities/${municipalityId}/reminders`, filters);
  }

  async createReminderTemplate(templateData) {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.api.post(
      `/municipalities/${municipalityId}/reminder-templates`,
      templateData,
    );
  }

  async sendReminders(reminderCriteria) {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.api.post(
      `/municipalities/${municipalityId}/send-reminders`,
      reminderCriteria,
    );
  }

  // === Reporting ===

  async getCollectionReport(startDate, endDate, options = {}) {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.api.get(`/municipalities/${municipalityId}/collection-report`, {
      start_date: startDate,
      end_date: endDate,
      ...options,
    });
  }

  async getDelinquencyReport(asOfDate, options = {}) {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.api.get(
      `/municipalities/${municipalityId}/delinquency-report`,
      {
        as_of_date: asOfDate,
        ...options,
      },
    );
  }

  async getTaxCommitment(year) {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.api.get(
      `/municipalities/${municipalityId}/tax-commitment/${year}`,
    );
  }

  // === Statistics ===

  async getCollectionStats(year = null) {
    const municipalityId = this.municipality.currentMunicipality.id;
    const params = year ? { year } : {};
    return this.api.get(
      `/municipalities/${municipalityId}/collection-stats`,
      params,
    );
  }

  async getCollectionRate(year = null) {
    const municipalityId = this.municipality.currentMunicipality.id;
    const params = year ? { year } : {};
    return this.api.get(
      `/municipalities/${municipalityId}/collection-rate`,
      params,
    );
  }

  // === Bulk Operations ===

  async bulkProcessPayments(paymentData) {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.api.post(
      `/municipalities/${municipalityId}/payments/bulk`,
      paymentData,
    );
  }

  async importPayments(importData) {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.api.post(
      `/municipalities/${municipalityId}/payments/import`,
      importData,
    );
  }
}
