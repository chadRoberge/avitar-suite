import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MunicipalityAssessingLandPropertyRoute extends Route {
  @service assessing;
  @service router;
  @service('property-selection') propertySelection;
  @service('current-user') currentUser;

  queryParams = {
    card: {
      refreshModel: true,
    },
    assessment_year: {
      refreshModel: true,
    },
  };

  async model(params, transition) {
    try {
      const { property_id } = params;
      const cardNumber = transition.to.queryParams.card || 1;
      const assessmentYear = transition.to.queryParams.assessment_year;

      // Load property with card info, land assessment data (includes views and waterfronts), and current assessment totals
      const [propertyResponse, landAssessmentResponse] = await Promise.all([
        this.assessing.getPropertyWithCard(property_id, cardNumber),
        this.assessing.getLandAssessmentForYear(
          property_id,
          cardNumber,
          assessmentYear,
        ),
      ]);

      // DEBUG: Log what we received
      console.log('🚨 ROUTE MODEL - Land assessment response structure:', {
        hasResponse: !!landAssessmentResponse,
        hasAssessment: !!landAssessmentResponse?.assessment,
        assessmentKeys: landAssessmentResponse?.assessment
          ? Object.keys(landAssessmentResponse.assessment)
          : [],
        hasWaterfrontProp:
          landAssessmentResponse?.assessment?.hasOwnProperty('waterfront'),
        waterfrontValue: landAssessmentResponse?.assessment?.waterfront,
        waterfrontType: typeof landAssessmentResponse?.assessment?.waterfront,
        waterfrontIsArray: Array.isArray(
          landAssessmentResponse?.assessment?.waterfront,
        ),
        waterfrontLength:
          landAssessmentResponse?.assessment?.waterfront?.length,
      });

      // CRITICAL: Check if we got cached data without waterfront field
      // This can happen when offline or with stale IndexedDB cache
      const hasWaterfrontField =
        landAssessmentResponse?.assessment?.hasOwnProperty('waterfront');
      const isOldCacheFormat =
        !hasWaterfrontField && landAssessmentResponse?.assessment;

      if (isOldCacheFormat) {
        console.warn(
          '⚠️ [WATERFRONT FIX] Detected old cache format missing waterfront field!',
          {
            hasAssessment: !!landAssessmentResponse?.assessment,
            hasWaterfrontField,
            assessmentKeys: landAssessmentResponse?.assessment
              ? Object.keys(landAssessmentResponse.assessment)
              : [],
          },
        );

        // Clear BOTH the local-first cache AND IndexedDB collection cache
        if (this.assessing.localApi && this.assessing.localApi.clearCache) {
          // Clear the simple key-value cache
          const cacheKey = `_properties_${property_id}_assessment_land_card_${cardNumber}`;
          try {
            this.assessing.localApi.clearCache(cacheKey);
            console.log('✅ Cleared local-first cache:', cacheKey);
          } catch (e) {
            console.error('❌ Failed to clear local-first cache:', e);
          }
        }

        // CRITICAL: Also clear from IndexedDB land_assessments collection
        // This is necessary because HybridAPI caches in collections, not just keys
        try {
          const dbRequest = indexedDB.open('avitar-local-storage');
          dbRequest.onsuccess = (event) => {
            const db = event.target.result;
            if (db.objectStoreNames.contains('land_assessments')) {
              const transaction = db.transaction(
                ['land_assessments'],
                'readwrite',
              );
              const store = transaction.objectStore('land_assessments');
              const getAllRequest = store.getAll();

              getAllRequest.onsuccess = () => {
                const items = getAllRequest.result;
                const itemsToDelete = items.filter(
                  (item) =>
                    item.property_id === property_id &&
                    (item.card_number === cardNumber || !item.card_number),
                );

                if (itemsToDelete.length > 0) {
                  const deleteTransaction = db.transaction(
                    ['land_assessments'],
                    'readwrite',
                  );
                  const deleteStore =
                    deleteTransaction.objectStore('land_assessments');
                  itemsToDelete.forEach((item) => {
                    if (item._id) {
                      deleteStore.delete(item._id);
                    }
                  });
                  console.log(
                    `✅ Cleared ${itemsToDelete.length} land assessment(s) from IndexedDB`,
                  );
                }
              };
            }
          };
        } catch (e) {
          console.warn('Could not clear IndexedDB land_assessments:', e);
        }

        // Wait a moment for IndexedDB deletion to complete
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Try to reload with cache bypass (will work if online, fail gracefully if offline)
        try {
          console.log('🔄 Attempting fresh network fetch...');
          const freshLandAssessmentResponse =
            await this.assessing.getLandAssessmentForYear(
              property_id,
              cardNumber,
              assessmentYear,
              { skipCache: true, forceNetwork: true },
            );
          // Replace the cached response with fresh data
          Object.assign(landAssessmentResponse, freshLandAssessmentResponse);
          console.log('✅ Successfully loaded fresh data with waterfronts:', {
            hasWaterfront:
              !!freshLandAssessmentResponse?.assessment?.waterfront,
            waterfrontCount:
              freshLandAssessmentResponse?.assessment?.waterfront?.length || 0,
          });
        } catch (error) {
          console.error(
            '❌ Failed to fetch fresh data (possibly offline):',
            error.message,
          );
          // If we're offline and can't refresh, at least add an empty waterfront array
          // so the template doesn't break
          if (!landAssessmentResponse.assessment.waterfront) {
            landAssessmentResponse.assessment.waterfront = [];
            console.log(
              'ℹ️ Added empty waterfront array to prevent template errors',
            );
          }
        }
      }

      // Get current total assessment to update property header
      let currentAssessment = null;
      try {
        currentAssessment = await this.assessing.getCurrentAssessmentForYear(
          property_id,
          cardNumber,
          assessmentYear,
        );
        // Debug logging removed
      } catch (error) {
        console.warn('Could not load current assessment totals:', error);
      }

      // Create a clean copy of the property with the current card
      const property = propertyResponse.property || propertyResponse;
      const cleanProperty = JSON.parse(JSON.stringify(property));
      cleanProperty.current_card = parseInt(cardNumber);

      // Ensure cards information is preserved for navigation
      if (property.cards) {
        cleanProperty.cards = property.cards;
      }

      // Update property with current assessment total for header display
      if (currentAssessment) {
        // Fix: Use the same property path as the general route
        const assessment = currentAssessment.assessment || currentAssessment;

        // Extract individual component values ONLY from the card-specific assessment
        // Do NOT fall back to property-level values to avoid showing wrong card's data
        // Use nullish coalescing (??) for .value checks to handle 0 as a valid value
        const buildingValue =
          assessment?.building?.value ??
          (typeof assessment?.building === 'number'
            ? assessment.building
            : null) ??
          assessment?.calculated_totals?.buildingValue ??
          assessment?.buildingValue ??
          0;

        // Use land assessment data directly for accurate land taxable value
        // Service layer normalizes response format
        const landAssessmentForCalc =
          landAssessmentResponse.assessment || landAssessmentResponse;

        // Calculate land taxable value from land assessment calculated totals
        // For current use land: landMarketValue - totalCurrentUseCredit = land taxable value
        const landMarketValue =
          landAssessmentForCalc?.calculated_totals?.landMarketValue ?? 0;
        const totalCurrentUseCredit =
          landAssessmentForCalc?.calculated_totals?.totalCurrentUseCredit ?? 0;
        const landTaxableValueFromCalculation =
          landMarketValue - totalCurrentUseCredit;
        // Debug calculation logging removed

        const landValue =
          landTaxableValueFromCalculation !== 0
            ? landTaxableValueFromCalculation
            : (landAssessmentForCalc?.taxable_value ??
              assessment?.land?.value ??
              (typeof assessment?.land === 'number' ? assessment.land : null) ??
              assessment?.calculated_totals?.landTaxableValue ??
              assessment?.landValue ??
              0);

        const featuresValue =
          assessment?.other_improvements?.value ??
          (typeof assessment?.features === 'number'
            ? assessment.features
            : null) ??
          assessment?.calculated_totals?.featuresValue ??
          assessment?.featuresValue ??
          assessment?.otherValue ??
          0;

        // Calculate CARD-SPECIFIC total from components
        // Only include land value for Card 1 (base land is parcel-level, only Card 1 gets it)
        const cardLandValue = parseInt(cardNumber) === 1 ? landValue : 0;
        const cardTotalFromComponents =
          buildingValue + cardLandValue + featuresValue;
        const cardProvidedTotal =
          assessment?.total_value ||
          assessment?.total ||
          assessment?.calculated_totals?.totalTaxableValue ||
          assessment?.totalTaxableValue ||
          assessment?.total_assessed_value ||
          0;

        // Card-specific assessment total
        const currentCardAssessment =
          cardProvidedTotal > cardTotalFromComponents
            ? cardProvidedTotal
            : cardTotalFromComponents;

        // PARCEL total (sum of all cards) - use assessment_summary if available
        const parcelTotalValue =
          property.assessment_summary?.total_value ||
          property.assessed_value ||
          currentCardAssessment;

        cleanProperty.current_card_assessment = currentCardAssessment;
        cleanProperty.assessed_value = parcelTotalValue;
        cleanProperty.tax_year = assessmentYear || new Date().getFullYear();
      }

      // Preserve cards data from currently selected property if not present in new data
      const currentProperty = this.propertySelection.selectedProperty;
      if (
        currentProperty &&
        currentProperty.id === property.id &&
        currentProperty.cards &&
        !cleanProperty.cards
      ) {
        console.log(
          '🃏 Land route preserving cards data for property',
          property.id,
        );
        cleanProperty.cards = currentProperty.cards;
      }

      // Update property selection service so other routes work correctly
      this.propertySelection.setSelectedProperty(cleanProperty);

      // Service layer normalizes response format
      const landAssessment =
        landAssessmentResponse.assessment || landAssessmentResponse;
      const cleanLandAssessment = landAssessment
        ? JSON.parse(JSON.stringify(landAssessment))
        : {};

      console.log('🌊 Land Route - Model loaded with waterfronts:', {
        waterfrontCount: cleanLandAssessment?.waterfront?.length || 0,
        hasCalculatedTotals: !!cleanLandAssessment?.calculated_totals,
        waterfrontMarketValue:
          cleanLandAssessment?.calculated_totals?.waterfrontMarketValue || 0,
        waterfrontTaxableValue:
          cleanLandAssessment?.calculated_totals?.waterfrontTaxableValue || 0,
      });

      return {
        property: cleanProperty,
        landAssessment: cleanLandAssessment,
        landHistory: landAssessmentResponse.history || [],
        comparables: landAssessmentResponse.comparables || [],
        views: landAssessmentResponse.views || [],
        viewAttributes: landAssessmentResponse.viewAttributes || [],
        zones: landAssessmentResponse.zones || [],
        showPropertySelection: false,
      };
    } catch (error) {
      console.error('Failed to load land assessment:', error);
      this.router.transitionTo('municipality.assessing.properties');
    }
  }

  setupController(controller, model) {
    super.setupController(controller, model);

    // Store route reference for refresh functionality
    controller.landRoute = this;

    // Ensure current user permissions are updated
    // This fixes the issue where edit buttons don't appear on first navigation
    this.currentUser._updateCurrentPermissions();
  }
}
