import Service from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { inject as service } from '@ember/service';

export default class CardNavigationService extends Service {
  @service router;
  @service assessing;
  @service('property-selection') propertySelection;

  @tracked isNavigating = false;

  constructor() {
    super(...arguments);

    // Listen for route changes to sync card state
    this.router.on('routeDidChange', () => {
      // Ensure card state is synced when route changes
      this.syncCardStateFromRouter();
    });
  }

  // Get current card number from router query params
  get currentCard() {
    return parseInt(this.router.currentRoute?.queryParams?.card || '1');
  }

  // Get current property with card information and fallback handling
  get currentProperty() {
    const property = this.propertySelection.selectedProperty;
    if (!property) return null;

    // Always ensure current_card is synced with router
    const enhancedProperty = { ...property };
    enhancedProperty.current_card = this.currentCard;

    // Enhanced fallback logic for missing cards data
    if (!property.cards) {
      console.warn('🃏 CardNavigation service - Selected property missing cards data, attempting fallback');

      // Try to reconstruct cards data from router state and context
      // If we're on card 2+, we know this is a multi-card property
      if (this.currentCard > 1) {
        console.log('🃏 CardNavigation service - Reconstructing cards data from router state');
        enhancedProperty.cards = {
          total_cards: '?', // Unknown total, but we know it's multi-card
          card_descriptions: []
        };
      }
    } else {
      console.log('🃏 CardNavigation service - Property has cards data:', property.cards);
    }

    return enhancedProperty;
  }

  // Check if property has multiple cards AND if current route supports card navigation
  get hasMultipleCards() {
    const property = this.currentProperty;
    if (!property) return false;

    // Check if current route should show card navigation
    if (!this.shouldShowCardNavigationForRoute()) {
      return false;
    }

    // First check if we have definitive card data
    if (property.cards?.total_cards) {
      return property.cards.total_cards > 1;
    }

    // Fallback: if we're on card 2+, assume multi-card property
    return this.currentCard > 1;
  }


  // Get total cards with fallback display
  get totalCards() {
    const property = this.currentProperty;
    if (property?.cards?.total_cards) {
      return property.cards.total_cards;
    }

    // If we don't have card data but we're showing navigation, show "?"
    if (this.hasMultipleCards) {
      return '?';
    }

    return 1;
  }

  // Check if we can navigate to previous card
  get canNavigateToPrevious() {
    return this.currentCard > 1 && !this.isNavigating;
  }

  // Check if we can navigate to next card
  get canNavigateToNext() {
    const property = this.currentProperty;
    if (!property || this.isNavigating) return false;

    // If we have definitive card data, use it
    if (property.cards?.total_cards) {
      return this.currentCard < property.cards.total_cards;
    }

    // If we don't have card data, assume we can't navigate forward
    // (this prevents infinite navigation into non-existent cards)
    return false;
  }

  // Sync the selected property's current_card with router state
  syncCardStateFromRouter() {
    const property = this.propertySelection.selectedProperty;
    if (property) {
      const cardFromRouter = this.currentCard;

      // Update property in service if card differs
      if (property.current_card !== cardFromRouter) {
        this.propertySelection.setSelectedProperty({
          ...property,
          current_card: cardFromRouter,
        });
      }
    }
  }

  // Navigate to a specific card
  async navigateToCard(cardNumber) {
    if (this.isNavigating) return;

    const property = this.currentProperty;
    if (!property) {
      console.error('No property available for card navigation');
      return;
    }

    this.isNavigating = true;

    try {
      // Update the active card on the server
      await this.assessing.localApi.put(
        `/properties/${property.id}/cards/${cardNumber}/activate`,
      );

      // Get current route info
      const currentRoute = this.router.currentRouteName;
      const currentParams = this.router.currentRoute.params;
      const propertyId = currentParams.property_id || property.id;

      if (!propertyId) {
        console.error('No property ID available for navigation');
        return;
      }

      // Update query parameters with new card
      const queryParams = {
        ...this.router.currentRoute.queryParams,
        card: cardNumber,
      };

      console.log('Card navigation service navigating to card:', {
        route: currentRoute,
        propertyId,
        cardNumber,
        queryParams,
      });

      // Transition to the same route with updated card parameter
      // This will trigger the route's model hook which will fetch card-specific data
      await this.router.transitionTo(currentRoute, propertyId, {
        queryParams,
      });

      // The route's model hook will update property-selection with fresh card-specific assessment data
      // No need to update it here - let the route handle it to avoid showing stale values

    } catch (error) {
      console.error('Failed to navigate to card:', error);
    } finally {
      this.isNavigating = false;
    }
  }

  // Navigate to previous card
  async previousCard() {
    if (this.canNavigateToPrevious) {
      await this.navigateToCard(this.currentCard - 1);
    }
  }

  // Navigate to next card
  async nextCard() {
    if (this.canNavigateToNext) {
      await this.navigateToCard(this.currentCard + 1);
    }
  }

  // Add a new card to the property
  async addCard() {
    if (this.isNavigating) return;

    const property = this.currentProperty;
    if (!property) {
      console.error('No property available for adding card');
      return;
    }

    this.isNavigating = true;

    try {
      const newCardNumber = (property.cards?.total_cards || 1) + 1;

      await this.assessing.localApi.post(
        `/properties/${property.id}/cards`,
        {
          description: `Card ${newCardNumber}`,
        },
      );

      // The property data will be refreshed by the route model hook
      // Return success so caller can trigger property reload if needed
      return true;

    } catch (error) {
      console.error('Failed to add card:', error);
      return false;
    } finally {
      this.isNavigating = false;
    }
  }

  // Get card description for current card
  get currentCardDescription() {
    const property = this.currentProperty;
    if (!property?.cards?.card_descriptions) return null;

    const cardDesc = property.cards.card_descriptions.find(
      (desc) => desc.card_number === this.currentCard
    );

    return cardDesc?.description || null;
  }

  // Manual override for showing card navigation (useful for general route sections)
  @tracked _forceShowCardNavigation = false;

  setForceShowCardNavigation(force) {
    this._forceShowCardNavigation = force;
  }

  // Enhanced shouldShowCardNavigationForRoute that considers manual overrides
  shouldShowCardNavigationForRoute() {
    const currentRoute = this.router.currentRouteName;
    if (!currentRoute) return false;

    // Check for manual override first
    if (this._forceShowCardNavigation) {
      return true;
    }

    // Routes that should show card navigation (card-specific data)
    // General tab includes card-specific data: property notes, listing history, assessment history, and card-specific locations
    const cardAwareRoutes = [
      'municipality.assessing.general.property',
      'municipality.assessing.land.property',
      'municipality.assessing.building.property',
      'municipality.assessing.sketch.property',
      'municipality.assessing.features.property',
      'municipality.assessing.exemptions.property',
    ];

    return cardAwareRoutes.includes(currentRoute);
  }
}