import BaseRoute from '../../../base';
import { inject as service } from '@ember/service';

export default class CurrentUseRoute extends BaseRoute {
  @service api;
  @service municipality;

  async model() {
    const parentModel = this.modelFor('municipality.assessing.settings');
    const municipalityId = parentModel.municipality.id;
    // Use the year from the main assessment year selector
    const year = this.municipality.selectedAssessmentYear || new Date().getFullYear();

    try {
      // Fetch current use data in parallel
      // Pass year parameter to year-aware endpoint
      const [currentUseResponse, settingsResponse] = await Promise.all([
        this.api
          .get(`/municipalities/${municipalityId}/current-use?year=${year}`)
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

      // Extract year and lock status from response
      const configYear = currentUseResponse.year || year;
      const isYearLocked = currentUseResponse.isYearLocked || false;

      return {
        municipality: parentModel.municipality,
        currentUseCategories: currentUseResponse.currentUseCategories || [],
        settings: settingsResponse.settings || { showAdValorem: true },
        configYear: configYear,
        isYearLocked: isYearLocked,
      };
    } catch (error) {
      console.error('Error loading current use data:', error);

      // Return minimal model to prevent complete failure
      return {
        municipality: parentModel.municipality,
        currentUseCategories: [],
        settings: { showAdValorem: true },
        configYear: year,
        isYearLocked: false,
      };
    }
  }
}
