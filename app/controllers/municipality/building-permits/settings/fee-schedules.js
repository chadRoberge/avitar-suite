import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class MunicipalityBuildingPermitsSettingsFeeSchedulesController extends Controller {
  @service api;
  @service notifications;
  @service router;

  @tracked permitTypes = [];
  @tracked summary = [];
  @tracked municipalityId = null;

  // Selected permit type and its schedules
  @tracked selectedPermitType = null;
  @tracked feeSchedules = [];
  @tracked isLoadingSchedules = false;

  // Modal state
  @tracked isModalOpen = false;
  @tracked isEditMode = false;
  @tracked selectedSchedule = null;
  @tracked isSaving = false;

  // Form data for creating/editing a schedule
  @tracked formData = {
    name: '',
    effectiveDate: '',
    changeNotes: '',
    changeReason: 'annual_adjustment',
    feeConfiguration: {
      baseAmount: 0,
      calculationType: 'flat',
      perSqftRate: 0,
      percentageRate: 0,
      minimumFee: 0,
      maximumFee: null,
      additionalFees: [],
    },
  };

  get changeReasonOptions() {
    return [
      { value: 'initial_setup', label: 'Initial Setup' },
      { value: 'annual_adjustment', label: 'Annual Adjustment' },
      { value: 'policy_change', label: 'Policy Change' },
      { value: 'correction', label: 'Correction' },
      { value: 'inflation_adjustment', label: 'Inflation Adjustment' },
      { value: 'council_decision', label: 'Council Decision' },
      { value: 'state_mandate', label: 'State Mandate' },
      { value: 'other', label: 'Other' },
    ];
  }

  get calculationTypeOptions() {
    return [
      { value: 'flat', label: 'Flat Fee' },
      { value: 'per_sqft', label: 'Per Square Foot' },
      { value: 'percentage', label: 'Percentage of Value' },
      { value: 'tiered', label: 'Tiered (by Value)' },
    ];
  }

  get additionalFeeTypeOptions() {
    return [
      { value: 'plan_review', label: 'Plan Review' },
      { value: 'inspection', label: 'Inspection' },
      { value: 'reinspection', label: 'Re-inspection' },
      { value: 'expedite', label: 'Expedite' },
      { value: 'technology', label: 'Technology Fee' },
      { value: 'administrative', label: 'Administrative' },
      { value: 'other', label: 'Other' },
    ];
  }

  get activeSchedule() {
    return this.feeSchedules.find((s) => s.status === 'active');
  }

  get draftSchedules() {
    return this.feeSchedules.filter((s) => s.status === 'draft');
  }

  get scheduledSchedules() {
    return this.feeSchedules.filter((s) => s.status === 'scheduled');
  }

  get archivedSchedules() {
    return this.feeSchedules.filter((s) => s.status === 'archived');
  }

  getStatusBadgeClass(status) {
    const classes = {
      draft: 'avitar-badge--secondary',
      scheduled: 'avitar-badge--warning',
      active: 'avitar-badge--success',
      archived: 'avitar-badge--muted',
    };
    return `avitar-badge ${classes[status] || 'avitar-badge--secondary'}`;
  }

  formatCurrency(value) {
    if (value === null || value === undefined) return '-';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(value);
  }

  formatDate(date) {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  @action
  async selectPermitType(permitType) {
    this.selectedPermitType = permitType;
    await this.loadSchedulesForPermitType(permitType._id);
  }

  @action
  async loadSchedulesForPermitType(permitTypeId) {
    this.isLoadingSchedules = true;
    try {
      const data = await this.api.get(
        `/municipalities/${this.municipalityId}/permit-types/${permitTypeId}/fee-schedules?includeArchived=true`,
      );
      this.feeSchedules = data.schedules || [];
    } catch (error) {
      console.error('Error loading fee schedules:', error);
      this.notifications.error('Failed to load fee schedules');
      this.feeSchedules = [];
    } finally {
      this.isLoadingSchedules = false;
    }
  }

  @action
  openCreateModal() {
    this.isEditMode = false;
    this.selectedSchedule = null;

    // Reset form with defaults
    const today = new Date().toISOString().split('T')[0];
    this.formData = {
      name: `Version ${this.feeSchedules.length + 1}`,
      effectiveDate: today,
      changeNotes: '',
      changeReason: 'annual_adjustment',
      feeConfiguration: {
        baseAmount: 0,
        calculationType: 'flat',
        perSqftRate: 0,
        percentageRate: 0,
        minimumFee: 0,
        maximumFee: null,
        additionalFees: [],
      },
    };

    // If there's an active schedule, copy its configuration
    if (this.activeSchedule) {
      const active = this.activeSchedule;
      this.formData = {
        ...this.formData,
        name: `Version ${this.feeSchedules.length + 1}`,
        feeConfiguration: {
          baseAmount: active.feeConfiguration?.baseAmount || 0,
          calculationType: active.feeConfiguration?.calculationType || 'flat',
          perSqftRate: active.feeConfiguration?.perSqftRate || 0,
          percentageRate: active.feeConfiguration?.percentageRate || 0,
          minimumFee: active.feeConfiguration?.minimumFee || 0,
          maximumFee: active.feeConfiguration?.maximumFee || null,
          additionalFees: active.feeConfiguration?.additionalFees || [],
        },
      };
    }

    this.isModalOpen = true;
  }

  @action
  openEditModal(schedule) {
    if (schedule.status !== 'draft') {
      this.notifications.warning('Only draft schedules can be edited');
      return;
    }

    this.isEditMode = true;
    this.selectedSchedule = schedule;

    const effectiveDate = schedule.effectiveDate
      ? new Date(schedule.effectiveDate).toISOString().split('T')[0]
      : '';

    this.formData = {
      name: schedule.name || '',
      effectiveDate,
      changeNotes: schedule.changeNotes || '',
      changeReason: schedule.changeReason || 'annual_adjustment',
      feeConfiguration: {
        baseAmount: schedule.feeConfiguration?.baseAmount || 0,
        calculationType: schedule.feeConfiguration?.calculationType || 'flat',
        perSqftRate: schedule.feeConfiguration?.perSqftRate || 0,
        percentageRate: schedule.feeConfiguration?.percentageRate || 0,
        minimumFee: schedule.feeConfiguration?.minimumFee || 0,
        maximumFee: schedule.feeConfiguration?.maximumFee || null,
        additionalFees: schedule.feeConfiguration?.additionalFees || [],
      },
    };

    this.isModalOpen = true;
  }

  @action
  closeModal() {
    this.isModalOpen = false;
    this.selectedSchedule = null;
    this.isEditMode = false;
  }

  @action
  updateFormField(field, event) {
    this.formData = {
      ...this.formData,
      [field]: event.target.value,
    };
  }

  @action
  updateFeeConfigField(field, event) {
    const value =
      field === 'calculationType'
        ? event.target.value
        : parseFloat(event.target.value) || 0;

    this.formData = {
      ...this.formData,
      feeConfiguration: {
        ...this.formData.feeConfiguration,
        [field]: value,
      },
    };
  }

  @action
  addAdditionalFee() {
    const newFee = {
      name: '',
      type: 'other',
      calculationType: 'flat',
      amount: 0,
      isOptional: false,
      description: '',
    };

    this.formData = {
      ...this.formData,
      feeConfiguration: {
        ...this.formData.feeConfiguration,
        additionalFees: [
          ...this.formData.feeConfiguration.additionalFees,
          newFee,
        ],
      },
    };
  }

  @action
  updateAdditionalFee(index, field, event) {
    const fees = [...this.formData.feeConfiguration.additionalFees];
    fees[index] = {
      ...fees[index],
      [field]:
        field === 'amount'
          ? parseFloat(event.target.value) || 0
          : field === 'isOptional'
            ? event.target.checked
            : event.target.value,
    };

    this.formData = {
      ...this.formData,
      feeConfiguration: {
        ...this.formData.feeConfiguration,
        additionalFees: fees,
      },
    };
  }

  @action
  removeAdditionalFee(index) {
    const fees = [...this.formData.feeConfiguration.additionalFees];
    fees.splice(index, 1);

    this.formData = {
      ...this.formData,
      feeConfiguration: {
        ...this.formData.feeConfiguration,
        additionalFees: fees,
      },
    };
  }

  @action
  stopPropagation(event) {
    event.stopPropagation();
  }

  @action
  async saveSchedule() {
    if (!this.formData.name || !this.formData.effectiveDate) {
      this.notifications.error('Please fill in all required fields');
      return;
    }

    this.isSaving = true;

    try {
      const scheduleData = {
        name: this.formData.name,
        effectiveDate: this.formData.effectiveDate,
        changeNotes: this.formData.changeNotes,
        changeReason: this.formData.changeReason,
        feeConfiguration: this.formData.feeConfiguration,
      };

      if (this.isEditMode && this.selectedSchedule) {
        // Update existing draft
        await this.api.put(
          `/municipalities/${this.municipalityId}/permit-types/${this.selectedPermitType._id}/fee-schedules/${this.selectedSchedule._id}`,
          scheduleData,
        );
        this.notifications.success('Fee schedule updated');
      } else {
        // Create new (optionally copy from active)
        const createData = { ...scheduleData };
        if (this.activeSchedule) {
          createData.copyFromVersionId = this.activeSchedule._id;
        }
        await this.api.post(
          `/municipalities/${this.municipalityId}/permit-types/${this.selectedPermitType._id}/fee-schedules`,
          createData,
        );
        this.notifications.success('Fee schedule created');
      }

      this.closeModal();
      await this.loadSchedulesForPermitType(this.selectedPermitType._id);
    } catch (error) {
      console.error('Error saving fee schedule:', error);
      this.notifications.error(error.error || 'Failed to save fee schedule');
    } finally {
      this.isSaving = false;
    }
  }

  @action
  async activateSchedule(schedule) {
    if (
      !confirm(
        `Are you sure you want to activate "${schedule.name || 'Version ' + schedule.version}"? This will make it the active fee schedule for new permits.`,
      )
    ) {
      return;
    }

    try {
      await this.api.post(
        `/municipalities/${this.municipalityId}/permit-types/${this.selectedPermitType._id}/fee-schedules/${schedule._id}/activate`,
        {},
      );
      this.notifications.success('Fee schedule activated');
      await this.loadSchedulesForPermitType(this.selectedPermitType._id);
    } catch (error) {
      console.error('Error activating fee schedule:', error);
      this.notifications.error(error.error || 'Failed to activate fee schedule');
    }
  }

  @action
  async scheduleActivation(schedule) {
    const futureDate = prompt(
      'Enter the activation date (YYYY-MM-DD):',
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    );

    if (!futureDate) return;

    try {
      await this.api.post(
        `/municipalities/${this.municipalityId}/permit-types/${this.selectedPermitType._id}/fee-schedules/${schedule._id}/activate`,
        { scheduleFor: futureDate },
      );
      this.notifications.success(`Fee schedule scheduled for ${futureDate}`);
      await this.loadSchedulesForPermitType(this.selectedPermitType._id);
    } catch (error) {
      console.error('Error scheduling fee schedule:', error);
      this.notifications.error(error.error || 'Failed to schedule activation');
    }
  }

  @action
  async cancelScheduledActivation(schedule) {
    if (
      !confirm('Are you sure you want to cancel the scheduled activation?')
    ) {
      return;
    }

    try {
      await this.api.post(
        `/municipalities/${this.municipalityId}/permit-types/${this.selectedPermitType._id}/fee-schedules/${schedule._id}/cancel-schedule`,
        {},
      );
      this.notifications.success('Scheduled activation cancelled');
      await this.loadSchedulesForPermitType(this.selectedPermitType._id);
    } catch (error) {
      console.error('Error cancelling scheduled activation:', error);
      this.notifications.error(error.error || 'Failed to cancel scheduled activation');
    }
  }

  @action
  async deleteSchedule(schedule) {
    if (schedule.status !== 'draft') {
      this.notifications.warning('Only draft schedules can be deleted');
      return;
    }

    if (
      !confirm(
        `Are you sure you want to delete "${schedule.name || 'Version ' + schedule.version}"?`,
      )
    ) {
      return;
    }

    try {
      await this.api.delete(
        `/municipalities/${this.municipalityId}/permit-types/${this.selectedPermitType._id}/fee-schedules/${schedule._id}`,
      );
      this.notifications.success('Fee schedule deleted');
      await this.loadSchedulesForPermitType(this.selectedPermitType._id);
    } catch (error) {
      console.error('Error deleting fee schedule:', error);
      this.notifications.error(error.error || 'Failed to delete fee schedule');
    }
  }

  @action
  viewScheduleDetails(schedule) {
    // For now, open edit modal in view-only mode for non-drafts
    this.selectedSchedule = schedule;
    const effectiveDate = schedule.effectiveDate
      ? new Date(schedule.effectiveDate).toISOString().split('T')[0]
      : '';

    this.formData = {
      name: schedule.name || '',
      effectiveDate,
      changeNotes: schedule.changeNotes || '',
      changeReason: schedule.changeReason || '',
      feeConfiguration: {
        baseAmount: schedule.feeConfiguration?.baseAmount || 0,
        calculationType: schedule.feeConfiguration?.calculationType || 'flat',
        perSqftRate: schedule.feeConfiguration?.perSqftRate || 0,
        percentageRate: schedule.feeConfiguration?.percentageRate || 0,
        minimumFee: schedule.feeConfiguration?.minimumFee || 0,
        maximumFee: schedule.feeConfiguration?.maximumFee || null,
        additionalFees: schedule.feeConfiguration?.additionalFees || [],
      },
    };

    this.isEditMode = schedule.status === 'draft';
    this.isModalOpen = true;
  }
}
