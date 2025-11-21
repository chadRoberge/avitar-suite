import Component from '@glimmer/component';
import { inject as service } from '@ember/service';
import { action } from '@ember/object';
import { tracked } from '@glimmer/tracking';
import { schedule } from '@ember/runloop';

export default class PropertyHeaderComponent extends Component {
  @service assessing;
  @service router;
  @service('property-selection') propertySelection;
  @service('card-navigation') cardNavigation;
  @service('current-user') currentUser;

  @tracked _currentAcreage = null;
  @tracked showOwnerModal = false;

  // Check if user can edit - this getter will re-evaluate when permissions change
  get canEdit() {
    // Access _permissionsLoadedAt to ensure this getter updates when permissions load
    if (!this.currentUser.permissionsReady) {
      return false;
    }
    return this.currentUser.hasModulePermission('assessing', 'update');
  }

  // Use property from card navigation service (which handles router sync)
  get property() {
    return this.cardNavigation.currentProperty || this.args.property;
  }

  get acreage() {
    // Check if property changed and clear cached acreage
    const currentPropertyId = this.property?.id;
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
    if (this.property?.acreage) {
      return this.property.acreage;
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
      this.property?.owners?.primary?.primary_name ||
      this.property?.owner?.primary_name ||
      'Unknown Owner'
    );
  }

  get primaryOwnerAddress() {
    // Try new structure first, then fall back to legacy
    return (
      this.property?.owners?.primary?.mailing_address ||
      this.property?.owner?.mailing_address
    );
  }

  get hasAdditionalOwners() {
    const additionalOwners = this.property?.owners?.additional_owners;
    return additionalOwners && additionalOwners.length > 0;
  }

  get additionalOwnersCount() {
    const additionalOwners = this.property?.owners?.additional_owners;
    return additionalOwners ? additionalOwners.length : 0;
  }

  get totalOwnersCount() {
    const primary = this.property?.owners?.primary ? 1 : 0;
    return primary + this.additionalOwnersCount;
  }

  // Delegate to card navigation service
  get shouldShowCardNavigation() {
    return this.cardNavigation.hasMultipleCards;
  }

  // Delegate to card navigation service
  get totalCardsDisplay() {
    return this.cardNavigation.totalCards;
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
      if (this.property?.id === propertyId) {
        this._currentAcreage = acreage;
        this._lastLoadedPropertyId = propertyId;
      }
    } catch (error) {
      console.warn('Could not load acreage for property:', propertyId, error);
      if (this.property?.id === propertyId) {
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
    if (this.property?.id && !this.args.landAssessment) {
      this._currentAcreage = null;
      this._lastLoadedPropertyId = null;
      schedule('afterRender', this, () => {
        this.loadAcreageForProperty(this.property.id);
      });
    }
  }

  @action
  async previousCard() {
    await this.cardNavigation.previousCard();
  }

  @action
  async nextCard() {
    await this.cardNavigation.nextCard();
  }

  @action
  async addCard() {
    const success = await this.cardNavigation.addCard();

    if (success && this.args.onPropertyUpdate) {
      // Reload the property to get updated card information
      await this.args.onPropertyUpdate();
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
