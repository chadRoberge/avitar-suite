import Controller from '@ember/controller';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';

export default class MunicipalitySelectController extends Controller {
  @service municipality;
  @service router;
  @service session;
  @tracked selectedMunicipality = null;
  @tracked setAsDefault = false;
  @tracked searchTerm = '';
  @tracked isLoading = false;

  get filteredMunicipalities() {
    if (!this.searchTerm) {
      return this.model || [];
    }

    const searchLower = this.searchTerm.toLowerCase();
    return (this.model || []).filter(
      (municipality) =>
        municipality.name.toLowerCase().includes(searchLower) ||
        municipality.displayName?.toLowerCase().includes(searchLower) ||
        municipality.code?.toLowerCase().includes(searchLower),
    );
  }

  @action
  updateSearch(event) {
    this.searchTerm = event.target.value;
  }

  @action
  selectMunicipality(municipality) {
    this.selectedMunicipality = municipality;
  }

  @action
  toggleDefault() {
    this.setAsDefault = !this.setAsDefault;
  }

  @action
  handleKeydown(municipality, event) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.selectMunicipality(municipality);
    }
  }

  @action
  async proceed() {
    if (!this.selectedMunicipality || this.isLoading) return;

    this.isLoading = true;

    try {
      if (this.setAsDefault) {
        await this.municipality.setDefaultMunicipality(
          this.selectedMunicipality.slug ||
            this.selectedMunicipality.code.toLowerCase(),
        );
      }

      const slug =
        this.selectedMunicipality.slug ||
        this.selectedMunicipality.code.toLowerCase();
      this.router.transitionTo('municipality.dashboard', slug);
    } catch (error) {
      console.error('Error proceeding to municipality:', error);
      // Could show error message here
    } finally {
      this.isLoading = false;
    }
  }

  @action
  logout() {
    this.session.invalidate();
    this.router.transitionTo('login');
  }

  // Helper method for dynamic municipality card styling
  getMunicipalityCardStyle(municipality, isSelected) {
    const primaryColor =
      municipality.branding_config?.primary_color || '#1f4788';
    const styles = [];

    // Only apply dynamic border color for non-selected cards
    // Selected cards use Avitar green via CSS
    if (!isSelected) {
      styles.push(`border-color: ${primaryColor}20`); // Light border
    }

    return styles.length > 0 ? styles.join('; ') + ';' : '';
  }

  // Helper for header background gradient
  getMunicipalityHeaderStyle(municipality) {
    const primaryColor =
      municipality.branding_config?.primary_color || '#1f4788';
    const secondaryColor =
      municipality.branding_config?.secondary_color || '#ffffff';

    return `background: linear-gradient(135deg, ${secondaryColor}f0 0%, ${primaryColor}10 100%);`;
  }

  // Helper for logo placeholder styling
  getLogoPlaceholderStyle(municipality) {
    const primaryColor =
      municipality.branding_config?.primary_color || '#1f4788';
    return `background: ${primaryColor}20; color: ${primaryColor};`;
  }
}
