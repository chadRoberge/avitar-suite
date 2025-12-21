import Component from '@glimmer/component';
import { inject as service } from '@ember/service';
import { action } from '@ember/object';
import { tracked } from '@glimmer/tracking';

/**
 * Municipality Selector Component
 *
 * An ember-power-select dropdown styled to match the topbar brand area.
 * Allows users to switch between municipalities without leaving the current page.
 *
 * Features:
 * - Shows current municipality with logo/initial and name
 * - Dropdown lists all available municipalities with their branding
 * - Handles municipality switching via the municipality service
 */
export default class MunicipalitySelectorComponent extends Component {
  @service municipality;
  @service router;
  @service('property-selection') propertySelection;

  @tracked isLoading = false;

  get currentMunicipality() {
    return this.municipality.currentMunicipality;
  }

  get availableMunicipalities() {
    return this.municipality.availableMunicipalities || [];
  }

  get hasMultipleMunicipalities() {
    return this.availableMunicipalities.length > 1;
  }

  get brandingConfig() {
    return this.currentMunicipality?.branding_config || {};
  }

  get municipalityInitial() {
    const name =
      this.currentMunicipality?.displayName || this.currentMunicipality?.name;
    return name ? name.charAt(0).toUpperCase() : 'A';
  }

  @action
  async selectMunicipality(municipality) {
    if (!municipality || municipality.id === this.currentMunicipality?.id) {
      return;
    }

    this.isLoading = true;

    try {
      // Clear any selected property when switching municipalities
      this.propertySelection.clearSelectedProperty();

      // Load the new municipality
      await this.municipality.loadMunicipality(municipality.slug);

      // Navigate to the new municipality's dashboard
      // Keep the same route structure, just change the municipality slug
      const currentRoute = this.router.currentRouteName;

      if (currentRoute.startsWith('municipality.')) {
        // Extract the sub-route (e.g., 'building-permits.queue' from 'municipality.building-permits.queue')
        const subRoute = currentRoute.replace('municipality.', '');

        // Try to navigate to the same sub-route in the new municipality
        try {
          this.router.transitionTo(
            `municipality.${subRoute}`,
            municipality.slug,
          );
        } catch {
          // If that route doesn't exist in new municipality, go to dashboard
          this.router.transitionTo('municipality.dashboard', municipality.slug);
        }
      } else {
        // Default to dashboard for non-municipality routes
        this.router.transitionTo('municipality.dashboard', municipality.slug);
      }
    } catch (error) {
      console.error('Error switching municipality:', error);
    } finally {
      this.isLoading = false;
    }
  }

  @action
  searchMunicipalities(term) {
    if (!term) {
      return this.availableMunicipalities;
    }

    const searchTerm = term.toLowerCase();
    return this.availableMunicipalities.filter((m) => {
      const name = (m.displayName || m.name || '').toLowerCase();
      const state = (m.state || '').toLowerCase();
      return name.includes(searchTerm) || state.includes(searchTerm);
    });
  }
}
