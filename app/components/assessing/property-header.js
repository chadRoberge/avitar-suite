import Component from '@glimmer/component';
import { inject as service } from '@ember/service';
import { action } from '@ember/object';
import { tracked } from '@glimmer/tracking';
import { schedule } from '@ember/runloop';

export default class PropertyHeaderComponent extends Component {
  @service assessing;
  @service router;

  @tracked isNavigating = false;
  @tracked _currentAcreage = null;
  @tracked showOwnerModal = false;

  get acreage() {
    // Check if property changed and clear cached acreage
    const currentPropertyId = this.args.property?.id;
    if (currentPropertyId && currentPropertyId !== this._lastLoadedPropertyId) {
      this._currentAcreage = null;
      // Load acreage for new property if not provided via landAssessment
      if (!this.args.landAssessment) {
        schedule('afterRender', this, () => {
          this.loadAcreageForProperty(currentPropertyId);
        });
      }
    }

    // First try to get acreage directly from property
    if (this.args.property?.acreage) {
      return this.args.property.acreage;
    }

    // Try to get from land assessment if passed as arg
    if (this.args.landAssessment?.calculated_totals?.totalAcreage) {
      return this.args.landAssessment.calculated_totals.totalAcreage;
    }

    // Return the tracked current acreage (loaded async)
    return this._currentAcreage;
  }

  get primaryOwnerName() {
    // Try new structure first, then fall back to legacy
    return (
      this.args.property?.owners?.primary?.primary_name ||
      this.args.property?.owner?.primary_name ||
      'Unknown Owner'
    );
  }

  get primaryOwnerAddress() {
    // Try new structure first, then fall back to legacy
    return (
      this.args.property?.owners?.primary?.mailing_address ||
      this.args.property?.owner?.mailing_address
    );
  }

  get hasAdditionalOwners() {
    const additionalOwners = this.args.property?.owners?.additional_owners;
    return additionalOwners && additionalOwners.length > 0;
  }

  get additionalOwnersCount() {
    const additionalOwners = this.args.property?.owners?.additional_owners;
    return additionalOwners ? additionalOwners.length : 0;
  }

  get totalOwnersCount() {
    const primary = this.args.property?.owners?.primary ? 1 : 0;
    return primary + this.additionalOwnersCount;
  }

  // Track which properties are currently loading to avoid duplicate requests
  _loadingProperties = new Set();
  _lastLoadedPropertyId = null;

  async loadAcreageForProperty(propertyId) {
    // Don't load if already loading
    if (this._loadingProperties.has(propertyId)) {
      return;
    }

    // If we already loaded for this property, no need to reload
    if (this._lastLoadedPropertyId === propertyId) {
      return;
    }

    this._loadingProperties.add(propertyId);

    try {
      const response = await this.assessing.getLandAssessment(propertyId);
      const landAssessment = response.assessment || response;
      const acreage = landAssessment?.calculated_totals?.totalAcreage || 0;

      // Only update if this is still the current property
      if (this.args.property?.id === propertyId) {
        this._currentAcreage = acreage;
        this._lastLoadedPropertyId = propertyId;
      }
    } catch (error) {
      console.warn('Could not load acreage for property:', propertyId, error);
      if (this.args.property?.id === propertyId) {
        this._currentAcreage = 0;
        this._lastLoadedPropertyId = propertyId;
      }
    } finally {
      this._loadingProperties.delete(propertyId);
    }
  }

  constructor() {
    super(...arguments);

    // Clear acreage and load for current property if needed
    if (this.args.property?.id && !this.args.landAssessment) {
      this._currentAcreage = null;
      this._lastLoadedPropertyId = null;
      schedule('afterRender', this, () => {
        this.loadAcreageForProperty(this.args.property.id);
      });
    }
  }

  @action
  async previousCard() {
    if (this.args.property.current_card <= 1 || this.isNavigating) return;

    this.isNavigating = true;
    try {
      const newCard = this.args.property.current_card - 1;
      await this.navigateToCard(newCard);
    } finally {
      this.isNavigating = false;
    }
  }

  @action
  async nextCard() {
    if (
      this.args.property.current_card >= this.args.property.cards.total_cards ||
      this.isNavigating
    )
      return;

    this.isNavigating = true;
    try {
      const newCard = this.args.property.current_card + 1;
      await this.navigateToCard(newCard);
    } finally {
      this.isNavigating = false;
    }
  }

  @action
  async addCard() {
    if (this.isNavigating) return;

    this.isNavigating = true;
    try {
      await this.assessing.localApi.post(
        `/properties/${this.args.property.id}/cards`,
        {
          description: `Card ${this.args.property.cards.total_cards + 1}`,
        },
      );

      // Reload the property to get updated card information
      if (this.args.onPropertyUpdate) {
        await this.args.onPropertyUpdate();
      }
    } catch (error) {
      console.error('Failed to add card:', error);
    } finally {
      this.isNavigating = false;
    }
  }

  async navigateToCard(cardNumber) {
    try {
      // Update the active card on the server
      await this.assessing.localApi.put(
        `/properties/${this.args.property.id}/cards/${cardNumber}/activate`,
      );

      // Update the current route with the card parameter
      const currentRoute = this.router.currentRouteName;
      const currentParams = this.router.currentRoute.params;

      // Add or update the card query parameter
      const queryParams = {
        ...this.router.currentRoute.queryParams,
        card: cardNumber,
      };

      // Transition to the same route with updated card parameter
      this.router.transitionTo(currentRoute, currentParams.property_id, {
        queryParams,
      });
    } catch (error) {
      console.error('Failed to navigate to card:', error);
    }
  }

  @action
  editOwner() {
    this.showOwnerModal = true;
  }

  @action
  showOwnersModal() {
    this.showOwnerModal = true;
  }

  @action
  closeOwnerModal() {
    this.showOwnerModal = false;
  }

  @action
  async handleOwnerUpdate() {
    // Refresh property data after owner update
    if (this.args.onPropertyUpdate) {
      await this.args.onPropertyUpdate();
    }
    this.closeOwnerModal();
  }
}
