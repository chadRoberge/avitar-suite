import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class MunicipalityAssessingSketchPropertyController extends Controller {
  @service api;
  @service assessing;
  @service notifications;
  @service('property-cache') propertyCache;
  @service realtime;
  @service('property-selection') propertySelection;

  @tracked sketches = [];
  @tracked currentSketch = null;
  @tracked drawingMode = null; // 'rectangle', 'polygon', 'circle', 'arc', null
  @tracked selectedShape = null;
  @tracked isEditModalOpen = false;
  @tracked sketchBeingEdited = null;
  @tracked isDirty = false;

  @action
  setupSketches() {
    console.log('🔧 setupSketches called with model:', {
      propertyId: this.model.property?.id,
      currentCard: this.model.property?.current_card,
      sketchesCount: this.model.sketches?.length || 0,
      sketches: this.model.sketches,
    });

    // Clear any stale currentSketch data when navigating between properties
    // This prevents showing sketch data from the previous property
    if (
      this.currentSketch &&
      this.currentSketch.property_id !== this.model.property?.id
    ) {
      console.log('🧹 Clearing stale sketch data from different property:', {
        currentSketchPropertyId: this.currentSketch.property_id,
        newPropertyId: this.model.property?.id,
        currentSketchId: this.currentSketch._id,
      });
      this.currentSketch = null;
    }

    // Clear edit modal state when setting up sketches for a new property
    // This prevents stale edit data from persisting across property navigation
    if (this.isEditModalOpen) {
      console.log('🧹 Clearing edit modal state due to property change');
      this.isEditModalOpen = false;
      this.sketchBeingEdited = null;
      this.isDirty = false;
    }

    // Get selected assessment year from model (or fall back to property tax year)
    const currentAssessmentYear =
      this.model.selectedAssessmentYear || this.model.property.tax_year;

    // Filter sketches for the current property, card, and assessment year
    let cardSketches =
      this.model.sketches?.filter(
        (s) =>
          s.card_number === this.model.property.current_card &&
          s.property_id === this.model.property.id &&
          s.assessment_year === currentAssessmentYear,
      ) || [];

    // If no sketches found for current year, try to find the latest version
    if (cardSketches.length === 0) {
      const allPropertyCardSketches =
        this.model.sketches?.filter(
          (s) =>
            s.card_number === this.model.property.current_card &&
            s.property_id === this.model.property.id,
        ) || [];

      if (allPropertyCardSketches.length > 0) {
        // Find the sketch with the highest __v (latest version)
        const latestSketch = allPropertyCardSketches.reduce(
          (latest, current) => {
            const latestVersion = latest.__v || 0;
            const currentVersion = current.__v || 0;
            return currentVersion > latestVersion ? current : latest;
          },
        );
        cardSketches = [latestSketch];
      }
    }

    // Deduplicate sketches - prefer ones with actual IDs over undefined IDs
    if (cardSketches.length > 1) {
      const sketchDetails = cardSketches.map((s) => ({
        id: s.id,
        property_id: s.property_id,
        card_number: s.card_number,
        assessment_year: s.assessment_year,
        version: s.__v,
        shapes_count: s.shapes?.length || 0,
        created_at: s.created_at,
        updated_at: s.updated_at,
      }));

      console.warn(
        `Multiple sketches found for property ${this.model.property.id}, card ${this.model.property.current_card}, assessment year ${currentAssessmentYear}. Deduplicating.`,
        sketchDetails,
      );

      // Sort by: has ID first, then by shapes count, then by most recent update
      const sortedSketches = cardSketches.sort((a, b) => {
        // Prefer sketches with real IDs
        if (a.id && !b.id) return -1;
        if (!a.id && b.id) return 1;

        // Then prefer sketches with more shapes
        const aShapes = a.shapes?.length || 0;
        const bShapes = b.shapes?.length || 0;
        if (bShapes !== aShapes) return bShapes - aShapes;

        // Finally prefer most recently updated
        const aUpdated = a.updated_at || a.created_at || '';
        const bUpdated = b.updated_at || b.created_at || '';
        return bUpdated.localeCompare(aUpdated);
      });

      const selectedSketch = sortedSketches[0];
      console.log(`Selected sketch:`, {
        id: selectedSketch.id,
        shapes_count: selectedSketch.shapes?.length || 0,
        updated_at: selectedSketch.updated_at,
      });

      cardSketches = [selectedSketch];
    }

    // Ensure sketches have calculated totals for view display
    const processedSketches = cardSketches.map((sketch) =>
      this.ensureSketchTotals(sketch),
    );

    this.sketches = processedSketches;
    const newCurrentSketch = processedSketches[0] || null;

    console.log('🔧 Setting currentSketch:', {
      previousSketch: this.currentSketch?._id,
      newSketch: newCurrentSketch?._id,
      propertyId: this.model.property?.id,
      shapesCount: newCurrentSketch?.shapes?.length || 0,
    });

    this.currentSketch = newCurrentSketch;

    // If no sketch found for this property, log it for debugging
    if (!newCurrentSketch && this.model.sketches?.length === 0) {
      console.log(
        'ℹ️ No sketches found for this property - canvas will show empty state',
      );
    } else if (!newCurrentSketch && this.model.sketches?.length > 0) {
      const sketchDetails = this.model.sketches?.map((s) => ({
        id: s.id || s._id,
        property_id: s.property_id,
        card_number: s.card_number,
        assessment_year: s.assessment_year,
        shapes_count: s.shapes?.length || 0,
        name: s.name,
      }));

      console.warn('⚠️ Sketches exist but none match current criteria:', {
        totalSketches: this.model.sketches?.length,
        propertyId: this.model.property?.id,
        currentCard: this.model.property?.current_card,
        assessmentYear:
          this.model.selectedAssessmentYear || this.model.property.tax_year,
      });

      console.log('📋 Available sketch details:', sketchDetails);

      // Log each sketch individually for better visibility
      sketchDetails.forEach((sketch, index) => {
        console.log(`📋 Sketch ${index + 1}:`, {
          id: sketch.id,
          property_id: sketch.property_id,
          card_number: sketch.card_number,
          assessment_year: sketch.assessment_year,
          shapes_count: sketch.shapes_count,
          name: sketch.name,
        });
      });

      // Try to find the best matching sketch for this property/card combo
      const propertyCardSketches =
        this.model.sketches?.filter(
          (s) =>
            s.property_id === this.model.property?.id &&
            s.card_number === this.model.property?.current_card,
        ) || [];

      if (propertyCardSketches.length > 0) {
        console.log(
          '📋 Found sketches for this property/card but different assessment year:',
          {
            foundSketches: propertyCardSketches.length,
            sketchYears: propertyCardSketches.map((s) => s.assessment_year),
            requestedYear:
              this.model.selectedAssessmentYear || this.model.property.tax_year,
          },
        );

        // Use the most recent sketch if no exact year match
        const mostRecentSketch = propertyCardSketches.reduce(
          (latest, current) => {
            const latestYear = latest.assessment_year || 0;
            const currentYear = current.assessment_year || 0;
            return currentYear > latestYear ? current : latest;
          },
        );

        console.log('🎯 Using most recent sketch as fallback:', {
          sketchId: mostRecentSketch._id || mostRecentSketch.id,
          year: mostRecentSketch.assessment_year,
          shapesCount: mostRecentSketch.shapes?.length || 0,
        });

        const processedFallbackSketch =
          this.ensureSketchTotals(mostRecentSketch);
        this.currentSketch = processedFallbackSketch;
        this.sketches = [processedFallbackSketch];
      }
    }
  }

  // Helper method to ensure sketch has proper totals calculated
  ensureSketchTotals(sketch) {
    if (!sketch || !sketch.shapes) return sketch;

    // Default area description rates (matching the edit modal)
    const defaultRates = new Map([
      ['HSF', 0.5], // Half Story Finished
      ['FFF', 1.0], // Full Floor Finished
      ['BMU', 0.75], // Basement Unfinished
      ['BMF', 1.0], // Basement Finished
      ['ATU', 0.5], // Attic Unfinished
      ['ATF', 0.75], // Attic Finished
      ['GAR', 0.25], // Garage
      ['POR', 0.1], // Porch
      ['DEC', 0.1], // Deck
      ['BAL', 0.1], // Balcony
    ]);

    // Process each shape to ensure it has effective areas calculated
    const processedShapes = sketch.shapes.map((shape) => {
      if (!shape.descriptions || shape.descriptions.length === 0) {
        return {
          ...shape,
          descriptions: [],
          effective_areas: {},
          total_effective_area: 0,
        };
      }

      // Handle both old and new description formats
      let effectiveAreas = {};
      let totalEffectiveArea = 0;

      if (shape.descriptions.length > 0) {
        if (typeof shape.descriptions[0] === 'string') {
          // Old format: descriptions are strings, calculate effective areas
          shape.descriptions.forEach((desc) => {
            const rate = defaultRates.get(desc.toUpperCase()) || 1.0;
            effectiveAreas[desc] = Math.round((shape.area || 0) * rate);
          });
          totalEffectiveArea = Object.values(effectiveAreas).reduce(
            (sum, area) => sum + area,
            0,
          );
        } else {
          // New format: descriptions are objects with {label, effective_area}
          shape.descriptions.forEach((desc) => {
            if (desc && desc.label) {
              effectiveAreas[desc.label] = desc.effective_area || 0;
            }
          });
          totalEffectiveArea = Object.values(effectiveAreas).reduce(
            (sum, area) => sum + area,
            0,
          );
        }
      }

      return {
        ...shape,
        effective_areas: effectiveAreas,
        total_effective_area: totalEffectiveArea,
      };
    });

    // Calculate sketch-level totals
    const totalArea = processedShapes.reduce(
      (sum, shape) => sum + (shape.area || 0),
      0,
    );
    const totalEffectiveArea = processedShapes.reduce(
      (sum, shape) => sum + (shape.total_effective_area || 0),
      0,
    );

    return {
      ...sketch,
      shapes: processedShapes,
      total_area: Math.round(totalArea),
      total_effective_area: Math.round(totalEffectiveArea),
    };
  }

  // Remove selectSketch since we only have one sketch per card

  @action
  stopPropagation(event) {
    event.stopPropagation();
  }

  @action
  handleViewCanvasUpdate(forceUpdateCallback) {
    this.viewCanvasForceUpdate = forceUpdateCallback;
  }

  @action
  editSketch(sketch) {
    // Ensure we're editing the current sketch, not a stale reference
    const sketchToEdit = sketch || this.currentSketch;

    if (!sketchToEdit) {
      console.error('No sketch available to edit');
      return;
    }

    console.log('🖊️ Starting to edit sketch:', {
      passedSketchId: sketch?._id,
      currentSketchId: this.currentSketch?._id,
      usingSketchId: sketchToEdit._id,
      propertyId: this.model.property?.id,
    });

    // Start editing: create a draft copy of the correct sketch
    this.sketchBeingEdited = { ...sketchToEdit }; // Draft state
    this.isDirty = false; // No changes yet
    this.isEditModalOpen = true;
  }

  @action
  editCurrentSketch() {
    // Edit the current sketch without relying on parameter passing
    if (!this.currentSketch) {
      console.error(
        '❌ No current sketch available to edit - sketches may not be loaded yet',
      );
      console.log('🔍 Debug state:', {
        hasModel: !!this.model,
        propertyId: this.model?.property?.id,
        sketchesCount: this.sketches?.length,
        currentSketch: !!this.currentSketch,
      });
      return;
    }

    // Verify the current sketch belongs to the current property
    if (this.currentSketch.property_id !== this.model?.property?.id) {
      console.warn(
        '⚠️ Current sketch belongs to different property, refreshing sketches',
      );
      this.setupSketches();

      // Try again after refresh
      if (
        !this.currentSketch ||
        this.currentSketch.property_id !== this.model?.property?.id
      ) {
        console.error('❌ Still no valid sketch after refresh');
        return;
      }
    }

    console.log('🖊️ Editing current sketch directly:', {
      sketchId: this.currentSketch._id,
      propertyId: this.model.property?.id,
      sketchPropertyId: this.currentSketch.property_id,
      cardNumber: this.currentSketch.card_number,
      shapesCount: this.currentSketch.shapes?.length || 0,
    });

    // Process the sketch data through the same logic as the property record card modal
    // to ensure proper effective area calculations and data consistency
    const processedSketch = this.ensureSketchTotals(this.currentSketch);

    // Create a draft copy of the processed sketch
    this.sketchBeingEdited = { ...processedSketch };
    this.isDirty = false;
    this.isEditModalOpen = true;

    console.log('✅ Edit modal opened with processed sketch data:', {
      totalArea: this.sketchBeingEdited.total_area,
      totalEffectiveArea: this.sketchBeingEdited.total_effective_area,
      shapesProcessed: this.sketchBeingEdited.shapes?.length || 0,
    });
  }

  @action
  addNewSketchModal() {
    // Create a new draft sketch
    this.sketchBeingEdited = {
      name: `Sketch for Card ${this.model.property.current_card}`,
      property_id: this.model.property.id,
      card_number: this.model.property.current_card,
      shapes: [],
      total_area: 0,
      total_effective_area: 0,
      building_type: 'residential',
    };
    this.isDirty = false;
    this.isEditModalOpen = true;
  }

  @action
  closeEditModal() {
    if (this.isDirty) {
      if (
        !confirm('You have unsaved changes. Are you sure you want to cancel?')
      ) {
        return; // User chose to keep editing
      }
    }

    this.isEditModalOpen = false;
    this.sketchBeingEdited = null;
    this.isDirty = false;
  }

  @action
  updateSketchBeingEdited(updatedSketch) {
    // Only update the draft state - NOT the saved state
    this.sketchBeingEdited = { ...updatedSketch };
    this.isDirty = true;

    // No automatic syncing - user controls when to save
  }

  @action
  async saveSketchFromModal(editedSketch, options = {}) {
    // Store the original saved state for rollback
    const originalSavedSketch = this.currentSketch
      ? { ...this.currentSketch }
      : null;

    try {
      // Step 1: Optimistically update the saved state immediately
      // Force full reactivity by creating new references
      const optimisticSketch = {
        ...editedSketch,
        shapes: [...(editedSketch.shapes || [])], // New array reference
      };
      this.currentSketch = optimisticSketch; // Update view immediately
      this.isDirty = false; // Mark as saved

      // Force view canvas to update immediately
      if (this.viewCanvasForceUpdate) {
        this.viewCanvasForceUpdate();
      }

      // Step 2: Save to server
      let savedSketch;
      const existingSketch = originalSavedSketch;
      const sketchId = existingSketch?._id || editedSketch._id;

      if (sketchId && existingSketch) {
        // Update existing sketch
        // Strip temporary IDs from shapes before updating
        const cleanedShapes = (editedSketch.shapes || []).map((shape) => {
          const { _id: shapeId, ...shapeWithoutId } = shape;

          // Also clean description _ids if they exist
          const cleanedDescriptions = (shapeWithoutId.descriptions || []).map(
            (desc) => {
              if (desc._id && desc._id.toString().startsWith('temp-')) {
                const { _id, ...descWithoutId } = desc;
                return descWithoutId;
              }
              return desc;
            },
          );

          // Only include _id if it's a real MongoDB ObjectId (not a temp ID)
          if (shapeId && !shapeId.toString().startsWith('temp-')) {
            return { ...shape, descriptions: cleanedDescriptions }; // Keep the original _id
          }
          return { ...shapeWithoutId, descriptions: cleanedDescriptions }; // Omit the temp _id
        });

        const cleanedSketch = {
          ...editedSketch,
          shapes: cleanedShapes,
        };

        const response = await this.assessing.updatePropertySketch(
          this.model.property.id,
          sketchId,
          cleanedSketch,
        );
        savedSketch = response.sketch;

        // After successful save, fetch fresh property data and update cache
        try {
          const freshProperty = await this.api.get(
            `/properties/${this.model.property.id}`,
          );

          if (freshProperty && freshProperty.property) {
            // Update local storage cache
            const cacheKey = `_properties_${this.model.property.id}`;
            this.assessing.localApi.localStorage.set(
              `item_${cacheKey}`,
              freshProperty,
            );

            // Also update in-memory property cache
            this.propertyCache.set(this.model.property.id, freshProperty);

            console.log(
              '✅ Updated cache with fresh property data after sketch update',
            );
          }
        } catch (error) {
          console.warn('Could not update cache after sketch save:', error);
          // Fall back to invalidation if update fails
          this.propertyCache.invalidate(this.model.property.id);
        }

        // Clear sketch-specific caches
        this.assessing.clearSketchCache(
          this.model.property.id,
          this.model.property.current_card,
        );

        // Emit realtime event to notify property record card modal to refresh immediately
        this.realtime.emit('sketch:updated', {
          propertyId: this.model.property.id,
          cardNumber: this.model.property.current_card,
          sketchId: savedSketch._id || savedSketch.id,
        });

        console.log(
          '✅ Updated caches and emitted sketch:updated event after update',
        );
      } else {
        // Create new sketch
        const { _id, ...sketchWithoutId } = editedSketch;

        // Strip temporary IDs from shapes (they start with "temp-")
        const cleanedShapes = (sketchWithoutId.shapes || []).map((shape) => {
          const { _id: shapeId, ...shapeWithoutId } = shape;

          // Also clean description _ids if they exist
          const cleanedDescriptions = (shapeWithoutId.descriptions || []).map(
            (desc) => {
              if (desc._id && desc._id.toString().startsWith('temp-')) {
                const { _id, ...descWithoutId } = desc;
                return descWithoutId;
              }
              return desc;
            },
          );

          // Only include _id if it's a real MongoDB ObjectId (not a temp ID)
          if (shapeId && !shapeId.toString().startsWith('temp-')) {
            return { ...shape, descriptions: cleanedDescriptions }; // Keep the original _id
          }
          return { ...shapeWithoutId, descriptions: cleanedDescriptions }; // Omit the temp _id
        });

        const sketchData = {
          ...sketchWithoutId,
          shapes: cleanedShapes,
          property_id: this.model.property.id,
          municipality_id: this.model.property.municipality_id,
          card_number: this.model.property.current_card,
        };

        const response = await this.assessing.createPropertySketch(
          this.model.property.id,
          sketchData,
        );
        savedSketch = response.sketch;

        // After successful save, fetch fresh property data and update cache
        try {
          const freshProperty = await this.api.get(
            `/properties/${this.model.property.id}`,
          );

          if (freshProperty && freshProperty.property) {
            // Update local storage cache
            const cacheKey = `_properties_${this.model.property.id}`;
            this.assessing.localApi.localStorage.set(
              `item_${cacheKey}`,
              freshProperty,
            );

            // Also update in-memory property cache
            this.propertyCache.set(this.model.property.id, freshProperty);

            console.log(
              '✅ Updated cache with fresh property data after sketch creation',
            );
          }
        } catch (error) {
          console.warn('Could not update cache after sketch save:', error);
          // Fall back to invalidation if update fails
          this.propertyCache.invalidate(this.model.property.id);
        }

        // Clear sketch-specific caches
        this.assessing.clearSketchCache(
          this.model.property.id,
          this.model.property.current_card,
        );

        // Emit realtime event to notify property record card modal to refresh immediately
        this.realtime.emit('sketch:updated', {
          propertyId: this.model.property.id,
          cardNumber: this.model.property.current_card,
          sketchId: savedSketch._id || savedSketch.id,
        });

        console.log(
          '✅ Updated caches and emitted sketch:updated event after creation',
        );
      }

      // Step 3: Update with server response (includes proper version)
      // Ensure totals are calculated on the saved sketch
      const processedSavedSketch = this.ensureSketchTotals(savedSketch);

      // Force reactivity with new references
      const finalSketch = {
        ...processedSavedSketch,
        shapes: [...(processedSavedSketch.shapes || [])],
      };
      this.currentSketch = finalSketch;
      this.sketchBeingEdited = finalSketch; // Sync draft with saved

      // Force view canvas to update
      if (this.viewCanvasForceUpdate) {
        this.viewCanvasForceUpdate();
      }

      // Cache already cleared immediately after save operation above

      // Update sketches list
      const sketchIndex = this.sketches.findIndex(
        (s) => s._id === savedSketch._id,
      );
      if (sketchIndex >= 0) {
        this.sketches[sketchIndex] = savedSketch;
        this.sketches = [...this.sketches];
      } else {
        // New sketch, add to list
        this.sketches = [...this.sketches, savedSketch];
      }

      this.notifications.success('Sketch saved successfully');
      this.closeEditModal();

      // Refresh assessment totals in property header
      await this.propertySelection.refreshCurrentAssessmentTotals(
        null,
        this.model,
      );

      return savedSketch;
    } catch (error) {
      // Step 4: Rollback optimistic update
      this.currentSketch = originalSavedSketch; // Restore original saved state
      this.isDirty = true; // Mark as having unsaved changes

      // Handle version conflicts with refresh and retry
      if (
        error.message?.includes('No matching document found') ||
        error.message?.includes('version')
      ) {
        try {
          // Refresh from server
          const sketchResponse = await this.assessing.getPropertySketches(
            this.model.property.id,
            this.model.property.current_card,
            { forceRefresh: true },
          );
          this.model.sketches = sketchResponse.sketches || [];
          this.setupSketches();

          // Retry with fresh version
          const refreshedSketch = this.currentSketch;
          if (refreshedSketch && editedSketch) {
            const retrySketch = { ...editedSketch, __v: refreshedSketch.__v };
            const result = await this.saveSketchFromModal(retrySketch, options);

            // Cache already cleared in recursive saveSketchFromModal call

            return result;
          }
        } catch (retryError) {
          // Ignore retry errors, fall through to user error
        }

        this.notifications.error(
          'Sketch was modified by another user. Please refresh and try again.',
        );
      } else {
        this.notifications.error('Failed to save sketch. Please try again.');
      }

      throw error;
    }
  }

  @action
  async refreshSketchProperty() {
    // Use the route reference to refresh
    if (this.sketchRoute) {
      this.sketchRoute.refresh();
    }

    // Also refresh assessment totals in property header
    await this.propertySelection.refreshCurrentAssessmentTotals(
      null,
      this.model,
    );
  }

  @action
  async deleteSketch(sketch) {
    const sketchId = sketch._id; // Use MongoDB _id only

    if (confirm(`Are you sure you want to delete "${sketch.name}"?`)) {
      try {
        if (sketchId) {
          await this.assessing.deletePropertySketch(
            this.model.property.id,
            sketchId,
          );
        }

        // Refresh sketches from the local-first cache instead of just filtering
        try {
          const sketchResponse = await this.assessing.getPropertySketches(
            this.model.property.id,
            this.model.property.current_card,
          );
          this.sketches = sketchResponse.sketches || [];

          // Update current sketch if the deleted one was current
          if (this.currentSketch === sketch) {
            this.currentSketch = this.sketches[0] || null;
          }
        } catch (error) {
          // Fallback to filtering if refresh fails
          this.sketches = this.sketches.filter((s) => s !== sketch);
          if (this.currentSketch === sketch) {
            this.currentSketch = this.sketches[0] || null;
          }
        }

        // After successful delete, fetch fresh property data and update cache
        try {
          const freshProperty = await this.api.get(
            `/properties/${this.model.property.id}`,
          );

          if (freshProperty && freshProperty.property) {
            // Update local storage cache
            const cacheKey = `_properties_${this.model.property.id}`;
            this.assessing.localApi.localStorage.set(
              `item_${cacheKey}`,
              freshProperty,
            );

            // Also update in-memory property cache
            this.propertyCache.set(this.model.property.id, freshProperty);

            console.log(
              '✅ Updated cache with fresh property data after sketch deletion',
            );
          }
        } catch (error) {
          console.warn('Could not update cache after sketch delete:', error);
          // Fall back to invalidation if update fails
          this.propertyCache.invalidate(this.model.property.id);
        }

        // Clear sketch-specific caches
        this.assessing.clearSketchCache(
          this.model.property.id,
          this.model.property.current_card,
        );

        // Emit realtime event to notify property record card modal to refresh immediately
        this.realtime.emit('sketch:updated', {
          propertyId: this.model.property.id,
          cardNumber: this.model.property.current_card,
          sketchId: sketchId,
          operation: 'delete',
        });

        console.log(
          '✅ Updated caches and emitted sketch:updated event after delete',
        );

        this.notifications.success('Sketch deleted successfully');
      } catch (error) {
        this.notifications.error('Failed to delete sketch');
      }
    }
  }
}
