import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MunicipalitySettingsEmailTemplatesRoute extends Route {
  @service api;
  @service municipality;

  async model() {
    try {
      const response = await this.api.get(
        `/municipalities/${this.municipality.currentMunicipality.id}/email-templates`,
      );

      return {
        templates: response.templates || [],
        municipality: this.municipality.currentMunicipality,
      };
    } catch (error) {
      console.error('Error loading email templates:', error);
      return {
        templates: [],
        municipality: this.municipality.currentMunicipality,
      };
    }
  }
}
