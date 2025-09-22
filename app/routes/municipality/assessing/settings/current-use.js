import BaseRoute from '../../../base';
import { inject as service } from '@ember/service';

export default class CurrentUseRoute extends BaseRoute {
  @service api;

  async model() {
    const parentModel = this.modelFor('municipality.assessing.settings');
    const municipalityId = parentModel.municipality.id;

    try {
      // Fetch current use data in parallel
      const [currentUseResponse, settingsResponse] = await Promise.all([
        this.api
          .get(`/municipalities/${municipalityId}/current-use`)
          .catch((error) => {
            console.warn('Error fetching current use categories:', error);
            return { currentUseCategories: [] };
          }),
        this.api
          .get(`/municipalities/${municipalityId}/current-use-settings`)
          .catch((error) => {
            console.warn('Error fetching current use settings:', error);
            return { settings: { showAdValorem: true } };
          }),
      ]);

      console.log(
        'Loaded current use categories:',
        currentUseResponse.currentUseCategories,
      );
      console.log('Loaded current use settings:', settingsResponse.settings);

      return {
        municipality: parentModel.municipality,
        currentUseCategories: currentUseResponse.currentUseCategories || [],
        settings: settingsResponse.settings || { showAdValorem: true },
      };
    } catch (error) {
      console.error('Error loading current use data:', error);

      // Return minimal model to prevent complete failure
      return {
        municipality: parentModel.municipality,
        currentUseCategories: [],
        settings: { showAdValorem: true },
      };
    }
  }
}
