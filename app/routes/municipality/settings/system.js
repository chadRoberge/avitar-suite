import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MunicipalitySettingsSystemRoute extends Route {
  @service api;
  @service municipality;

  async model() {
    const municipalityId = this.municipality.currentMunicipality?.id;

    if (!municipalityId) {
      return {
        pidFormat: null,
        presets: [],
      };
    }

    try {
      // Fetch current PID format for this municipality
      const pidFormatResponse = await this.api.get(
        `/municipalities/${municipalityId}/pid-format`,
      );

      // Fetch available presets
      const presetsResponse = await this.api.get('/pid-format/presets');

      return {
        pidFormat: pidFormatResponse.pid_format,
        presets: presetsResponse.presets,
      };
    } catch (error) {
      console.error('Error loading PID format:', error);
      return {
        pidFormat: null,
        presets: {},
      };
    }
  }

  setupController(controller, model) {
    super.setupController(controller, model);
    // Load the format settings into controller's tracked properties
    controller.loadFormatSettings();
  }
}
