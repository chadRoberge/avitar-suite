import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class MunicipalitySettingsEmailTemplatesController extends Controller {
  @service api;
  @service notifications;
  @service municipality;

  @tracked selectedTemplate = null;
  @tracked showEditModal = false;
  @tracked showPreviewModal = false;
  @tracked isLoading = false;
  @tracked searchText = '';
  @tracked filterCategory = 'all';

  get templates() {
    return this.model.templates || [];
  }

  get categories() {
    return [
      { value: 'all', label: 'All Categories' },
      { value: 'permits', label: 'Building Permits' },
      { value: 'inspections', label: 'Inspections' },
      { value: 'licenses', label: 'Licenses' },
      { value: 'general', label: 'General' },
    ];
  }

  get displayedTemplates() {
    let templates = this.templates;

    // Filter by category
    if (this.filterCategory !== 'all') {
      templates = templates.filter((t) => t.category === this.filterCategory);
    }

    // Filter by search
    if (this.searchText) {
      const search = this.searchText.toLowerCase();
      templates = templates.filter(
        (t) =>
          t.name?.toLowerCase().includes(search) ||
          t.description?.toLowerCase().includes(search)
      );
    }

    return templates;
  }

  get hasTemplates() {
    return this.displayedTemplates.length > 0;
  }

  @action
  updateSearch(event) {
    this.searchText = event.target.value;
  }

  @action
  updateFilter(event) {
    this.filterCategory = event.target.value;
  }

  @action
  openEditModal(template) {
    this.selectedTemplate = template;
    this.showEditModal = true;
  }

  @action
  closeEditModal() {
    this.showEditModal = false;
    this.selectedTemplate = null;
  }

  @action
  openPreviewModal(template) {
    this.selectedTemplate = template;
    this.showPreviewModal = true;
  }

  @action
  closePreviewModal() {
    this.showPreviewModal = false;
    this.selectedTemplate = null;
  }

  @action
  async saveTemplate(templateData) {
    this.isLoading = true;

    try {
      await this.api.put(
        `/municipalities/${this.municipality.currentMunicipality.id}/email-templates/${this.selectedTemplate._id}`,
        templateData
      );

      this.notifications.success('Email template saved successfully');
      this.closeEditModal();

      // Refresh templates
      this.send('refreshModel');
    } catch (error) {
      console.error('Error saving template:', error);
      this.notifications.error(
        error.message || 'Failed to save email template'
      );
    } finally {
      this.isLoading = false;
    }
  }

  @action
  async toggleTemplateActive(template) {
    this.isLoading = true;

    try {
      await this.api.put(
        `/municipalities/${this.municipality.currentMunicipality.id}/email-templates/${template._id}`,
        {
          is_active: !template.is_active,
        }
      );

      this.notifications.success(
        `Template ${!template.is_active ? 'activated' : 'deactivated'}`
      );

      // Refresh templates
      this.send('refreshModel');
    } catch (error) {
      console.error('Error toggling template:', error);
      this.notifications.error('Failed to update template status');
    } finally {
      this.isLoading = false;
    }
  }

  @action
  async resetToDefault(template) {
    if (
      !confirm(
        'Are you sure you want to reset this template to its default content? This cannot be undone.'
      )
    ) {
      return;
    }

    this.isLoading = true;

    try {
      await this.api.post(
        `/municipalities/${this.municipality.currentMunicipality.id}/email-templates/${template._id}/reset`
      );

      this.notifications.success('Template reset to default');

      // Refresh templates
      this.send('refreshModel');
    } catch (error) {
      console.error('Error resetting template:', error);
      this.notifications.error('Failed to reset template');
    } finally {
      this.isLoading = false;
    }
  }

  @action
  stopPropagation(event) {
    event.stopPropagation();
  }
}
