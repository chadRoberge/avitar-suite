import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';

export default class SketchEditModalComponent extends Component {
  @service assessing;
  @service municipality;

  @tracked drawingMode = null;
  @tracked selectedShape = null;
  @tracked preSelectedAttributes = [];
  @tracked editedSketch = null;
  @tracked sketchSubAreaFactors = [];
  @tracked factorsMap = new Map();
  @tracked factorsLoaded = false;
  canvasUpdateCallback = null;

  constructor() {
    super(...arguments);
    console.log('🏗️ SketchEditModal constructor called');

    // Initialize factorsMap to prevent errors before async loading completes
    this.factorsMap = new Map();
    this.factorsLoaded = false;

    this.loadSketchSubAreaFactors();
    this.initializeEditedSketch();
  }

  async loadSketchSubAreaFactors() {
    try {
      console.log('🔄 Starting to load sketch sub-area factors...');
      console.log(
        'Municipality service:',
        this.municipality?.currentMunicipality?.id,
      );
      console.log('Assessing service:', this.assessing);

      const response = await this.assessing.getSketchSubAreaFactors();
      console.log('📡 Raw API Response:', response);
      console.log('📡 Response type:', typeof response);
      console.log(
        '📡 Response keys:',
        response ? Object.keys(response) : 'null',
      );

      // Handle different API response formats:
      // Case 1: Array containing object with sketchSubAreaFactors property: [{sketchSubAreaFactors: [...]}]
      // Case 2: Direct array of factors: [factor1, factor2, ...]
      // Case 3: Object with sketchSubAreaFactors property: {sketchSubAreaFactors: [...]}
      if (
        Array.isArray(response) &&
        response.length > 0 &&
        response[0].sketchSubAreaFactors
      ) {
        this.sketchSubAreaFactors = response[0].sketchSubAreaFactors;
      } else if (Array.isArray(response)) {
        this.sketchSubAreaFactors = response;
      } else {
        this.sketchSubAreaFactors = response.sketchSubAreaFactors || [];
      }
      console.log(
        '🧐 Assigned sketchSubAreaFactors:',
        this.sketchSubAreaFactors,
      );
      console.log(
        '🧐 sketchSubAreaFactors length:',
        this.sketchSubAreaFactors.length,
      );
      console.log('🧐 First factor details:', this.sketchSubAreaFactors[0]);

      // Create a map for quick lookup: displayText -> rate (points/100)
      this.factorsMap = new Map();
      console.log('🧐 Starting forEach loop...');
      this.sketchSubAreaFactors.forEach((factor, index) => {
        console.log(`🧐 Processing factor ${index}:`, factor);
        console.log(`🧐 Factor keys:`, Object.keys(factor));
        console.log(
          `🧐 Factor displayText: "${factor.displayText}", points: ${factor.points}`,
        );

        // Skip if displayText is missing
        if (!factor.displayText) {
          console.log(`⚠️ Skipping factor ${index} - missing displayText`);
          return;
        }

        // Convert points to decimal rate (points are stored as percentages)
        const rate = factor.points / 100;
        console.log(`🧐 Calculated rate: ${rate}`);
        console.log(
          `🧐 Setting map key: "${factor.displayText.toUpperCase()}"`,
        );
        this.factorsMap.set(factor.displayText.toUpperCase(), rate);
        console.log(`🧐 Map size after setting: ${this.factorsMap.size}`);
      });
      console.log('🧐 forEach loop completed');

      console.log(
        '✅ Loaded sketch sub-area factors:',
        this.sketchSubAreaFactors.length,
        'factors',
      );
      console.log('📊 Factors map:', Array.from(this.factorsMap.entries()));
      this.factorsLoaded = true;
    } catch (error) {
      console.error('❌ Failed to load sketch sub-area factors:', error);
      console.error('Error details:', error.message, error.stack);
      // Fallback to empty map - will use default rate of 1.0
      this.factorsMap = new Map();
      this.factorsLoaded = true; // Still mark as loaded to avoid infinite loading
    }
  }

  willUpdateArgs(changes) {
    // Reinitialize when sketch prop changes (like when modal opens)
    if (changes.sketch && changes.sketch.prev !== changes.sketch.next) {
      this.initializeEditedSketch();

      // Force re-render after a brief delay to ensure canvas is ready
      setTimeout(() => {
        // Trigger reactivity
        this.editedSketch = { ...this.editedSketch };
      }, 50);
    }

    // Also reinitialize when modal opens (isOpen changes to true)
    if (changes.isOpen && !changes.isOpen.prev && changes.isOpen.next) {
      this.initializeEditedSketch();
    }
  }

  initializeEditedSketch() {
    if (this.args.sketch) {
      // Edit existing sketch - make a deep copy but preserve the ID
      this.editedSketch = this.deepCopy(this.args.sketch);

      // Normalize ID property - ensure we have both id and _id if one exists
      const sketchId = this.editedSketch.id || this.editedSketch._id;
      if (sketchId) {
        this.editedSketch.id = sketchId;
        this.editedSketch._id = sketchId;
      }

      // Ensure shapes array exists and each shape has descriptions array
      if (!this.editedSketch.shapes) {
        this.editedSketch.shapes = [];
      } else {
        // Ensure each shape has the proper structure and convert to new format
        this.editedSketch.shapes = this.editedSketch.shapes.map((shape) => {
          let descriptions = shape.descriptions || [];

          // Convert from old format if needed
          if (descriptions.length > 0 && typeof descriptions[0] === 'string') {
            // Old format: descriptions as array of strings, effective_areas as object
            descriptions = this.calculateEffectiveAreas(
              shape.area || 0,
              descriptions,
            );
          } else if (!Array.isArray(descriptions)) {
            // Handle edge cases
            descriptions = [];
          }

          return {
            ...shape,
            descriptions: descriptions, // Now array of {label, effective_area} objects
            total_effective_area:
              this.calculateTotalEffectiveArea(descriptions),
          };
        });
      }

      // Calculate totals for existing sketch to ensure description_details is populated
      this.calculateSketchTotals();
    } else {
      // Create new sketch template - no ID (server will assign one)
      // Get card number from parent component args
      const cardNumber = this.args.cardNumber || 1;
      this.editedSketch = {
        name: `Building Sketch - Card ${cardNumber}`,
        description: '',
        building_type: 'residential',
        card_number: cardNumber,
        shapes: [],
        total_area: 0,
        total_effective_area: 0,
        description_details: {},
        description_codes: [],
        description_totals: {},
      };
    }
  }

  @action
  deepCopy(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  @action
  updateField(fieldName, event) {
    const value = event.target ? event.target.value : event;
    this.editedSketch[fieldName] =
      fieldName === 'card_number' ? parseInt(value) : value;
  }

  @action
  setDrawingMode(mode) {
    this.drawingMode = this.drawingMode === mode ? null : mode;
    this.selectedShape = null;
  }

  @action
  selectShape(shape) {
    this.selectedShape = shape;
    this.drawingMode = null;
  }

  @action
  clearSelection() {
    this.selectedShape = null;

    // Force canvas to re-render to remove selection styling and vertex handles
    if (this.canvasUpdateCallback) {
      this.canvasUpdateCallback();
    }
  }

  @action
  handleCanvasUpdate(updateCallback) {
    this.canvasUpdateCallback = updateCallback;
  }

  @action
  handleCanvasReady(canvasComponent) {
    this.canvasComponent = canvasComponent;
  }

  // Method to sync version from server response after successful save
  syncVersionFromServer(serverSketch) {
    if (this.editedSketch && serverSketch) {
      this.editedSketch.__v = serverSketch.__v;
      // Also sync any other server fields that might have changed
      this.editedSketch._id = serverSketch._id;
      this.editedSketch.updated_at = serverSketch.updated_at;
    }
  }

  @action
  addShape(shapeData) {
    const stringDescriptions = [...(this.preSelectedAttributes || [])];
    const descriptions = this.calculateEffectiveAreas(
      shapeData.area,
      stringDescriptions,
    );

    // Generate temporary client-side ID for new shapes until server assigns _id
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const newShape = {
      _id: tempId, // Temporary ID - server will replace with real MongoDB _id on save
      type: shapeData.type,
      coordinates: shapeData.coordinates,
      area: shapeData.area,
      descriptions: descriptions, // Array of {label, effective_area} objects
      total_effective_area: this.calculateTotalEffectiveArea(descriptions),
      created_at: new Date(),
    };

    this.editedSketch.shapes = [...(this.editedSketch.shapes || []), newShape];
    this.calculateSketchTotals();

    // Auto-select the newly created shape for immediate editing
    this.selectedShape = newShape;
    this.drawingMode = null; // Exit drawing mode after shape is created

    // Force the shapesForCanvas getter to re-evaluate by accessing it
    setTimeout(() => {
      const shapes = this.shapesForCanvas;

      // Also trigger the canvas component's shapesToRender getter
      this.editedSketch = { ...this.editedSketch };

      // Force canvas to re-render directly
      if (this.canvasUpdateCallback) {
        this.canvasUpdateCallback();
      }

      // Notify parent controller to sync sketchBeingEdited immediately
      if (this.args.onShapeChange) {
        this.args.onShapeChange(this.editedSketch);
      }
    }, 0);
  }

  @action
  deleteShape(shapeId) {
    // Make sure editedSketch exists and has shapes initialized
    if (!this.editedSketch || !this.editedSketch.shapes) {
      this.initializeEditedSketch();
    }

    // If editedSketch.shapes is still empty, copy from args.sketch.shapes
    if (
      this.editedSketch.shapes.length === 0 &&
      this.args.sketch?.shapes?.length > 0
    ) {
      this.editedSketch.shapes = [...this.args.sketch.shapes];
    }

    // Use _id only (removing legacy id support)
    this.editedSketch.shapes = this.editedSketch.shapes.filter(
      (s) => s._id !== shapeId,
    );

    if (this.selectedShape?._id === shapeId) {
      this.selectedShape = null;
    }
    this.calculateSketchTotals();

    // Force reactivity by creating a new object reference
    this.editedSketch = { ...this.editedSketch };

    // Force the shapesForCanvas getter to re-evaluate by accessing it
    setTimeout(() => {
      const shapes = this.shapesForCanvas;

      // Force canvas component to update by re-setting shapes property
      // Create a completely new array reference to force reactivity
      this.editedSketch.shapes = [...this.editedSketch.shapes];
      this.editedSketch = { ...this.editedSketch };

      // Force canvas to re-render directly
      if (this.canvasUpdateCallback) {
        this.canvasUpdateCallback();
      }

      // Notify parent controller to sync sketchBeingEdited immediately
      if (this.args.onShapeChange) {
        this.args.onShapeChange(this.editedSketch);
      }
    }, 0);
  }

  @action
  addShapeDescription(shapeId, code) {
    const shape = this.editedSketch.shapes.find((s) => s._id === shapeId);
    if (!shape) return;

    // Get factor from database and calculate effective area
    const factor = this.factorsMap.get(code.toUpperCase()) || 1.0;
    const effectiveArea = Math.round(shape.area * factor);

    const newDescription = {
      label: code.toUpperCase(),
      effective_area: effectiveArea,
    };

    // Always add to the end (bottom of the list)
    shape.descriptions = [...(shape.descriptions || []), newDescription];
    shape.total_effective_area = this.calculateTotalEffectiveArea(
      shape.descriptions,
    );
    this.calculateSketchTotals();

    // Update selectedShape reference if it matches this shape
    if (this.selectedShape && this.selectedShape._id === shapeId) {
      this.selectedShape = shape;
    }

    // Force reactivity and immediate updates
    setTimeout(() => {
      const shapes = this.shapesForCanvas;

      // Also trigger the canvas component's shapesToRender getter
      this.editedSketch = { ...this.editedSketch };

      // Force canvas to re-render directly
      if (this.canvasUpdateCallback) {
        this.canvasUpdateCallback();
      }

      // Notify parent controller to sync sketchBeingEdited immediately
      if (this.args.onShapeChange) {
        this.args.onShapeChange(this.editedSketch);
      }
    }, 0);
  }

  @action
  removeShapeDescription(shapeId, index) {
    const shape = this.editedSketch.shapes.find((s) => s._id === shapeId);
    if (!shape) return;

    // Remove by index to maintain order
    shape.descriptions = (shape.descriptions || []).filter(
      (_, i) => i !== index,
    );
    shape.total_effective_area = this.calculateTotalEffectiveArea(
      shape.descriptions,
    );
    this.calculateSketchTotals();

    // Update selectedShape reference if it matches this shape
    if (this.selectedShape && this.selectedShape._id === shapeId) {
      this.selectedShape = shape;
    }

    // Force reactivity and immediate updates
    setTimeout(() => {
      const shapes = this.shapesForCanvas;

      // Also trigger the canvas component's shapesToRender getter
      this.editedSketch = { ...this.editedSketch };

      // Force canvas to re-render directly
      if (this.canvasUpdateCallback) {
        this.canvasUpdateCallback();
      }

      // Notify parent controller to sync sketchBeingEdited immediately
      if (this.args.onShapeChange) {
        this.args.onShapeChange(this.editedSketch);
      }
    }, 0);
  }

  @action
  clearShapeDescriptions(shapeId) {
    const shape = this.editedSketch.shapes.find((s) => s._id === shapeId);
    if (!shape) return;

    shape.descriptions = [];
    shape.total_effective_area = 0;
    this.calculateSketchTotals();

    // Update selectedShape reference if it matches this shape
    if (this.selectedShape && this.selectedShape._id === shapeId) {
      this.selectedShape = shape;
    }

    // Force reactivity and immediate updates
    setTimeout(() => {
      const shapes = this.shapesForCanvas;

      // Also trigger the canvas component's shapesToRender getter
      this.editedSketch = { ...this.editedSketch };

      // Force canvas to re-render directly
      if (this.canvasUpdateCallback) {
        this.canvasUpdateCallback();
      }

      // Notify parent controller to sync sketchBeingEdited immediately
      if (this.args.onShapeChange) {
        this.args.onShapeChange(this.editedSketch);
      }
    }, 0);
  }

  @action
  moveShapeDescriptionUp(shapeId, index) {
    const shape = this.editedSketch.shapes.find((s) => s._id === shapeId);
    if (!shape || !shape.descriptions || index === 0) return;

    // Swap with the item above (index - 1)
    const descriptions = [...shape.descriptions];
    [descriptions[index - 1], descriptions[index]] = [
      descriptions[index],
      descriptions[index - 1],
    ];

    shape.descriptions = descriptions;
    shape.effective_areas = this.calculateEffectiveAreas(
      shape.area,
      shape.descriptions,
    );
    shape.total_effective_area = this.calculateTotalEffectiveArea(
      shape.effective_areas,
    );
    this.calculateSketchTotals();

    // Update selectedShape reference if it matches this shape
    if (this.selectedShape && this.selectedShape._id === shapeId) {
      this.selectedShape = shape;
    }

    // Force reactivity and immediate updates
    setTimeout(() => {
      const shapes = this.shapesForCanvas;

      // Also trigger the canvas component's shapesToRender getter
      this.editedSketch = { ...this.editedSketch };

      // Force canvas to re-render directly
      if (this.canvasUpdateCallback) {
        this.canvasUpdateCallback();
      }

      // Notify parent controller to sync sketchBeingEdited immediately
      if (this.args.onShapeChange) {
        this.args.onShapeChange(this.editedSketch);
      }
    }, 0);
  }

  @action
  moveShapeDescriptionDown(shapeId, index) {
    const shape = this.editedSketch.shapes.find((s) => s._id === shapeId);
    if (!shape || !shape.descriptions || index >= shape.descriptions.length - 1)
      return;

    // Swap with the item below (index + 1)
    const descriptions = [...shape.descriptions];
    [descriptions[index], descriptions[index + 1]] = [
      descriptions[index + 1],
      descriptions[index],
    ];

    shape.descriptions = descriptions;
    shape.effective_areas = this.calculateEffectiveAreas(
      shape.area,
      shape.descriptions,
    );
    shape.total_effective_area = this.calculateTotalEffectiveArea(
      shape.effective_areas,
    );
    this.calculateSketchTotals();

    // Update selectedShape reference if it matches this shape
    if (this.selectedShape && this.selectedShape._id === shapeId) {
      this.selectedShape = shape;
    }

    // Force reactivity and immediate updates
    setTimeout(() => {
      const shapes = this.shapesForCanvas;

      // Also trigger the canvas component's shapesToRender getter
      this.editedSketch = { ...this.editedSketch };

      // Force canvas to re-render directly
      if (this.canvasUpdateCallback) {
        this.canvasUpdateCallback();
      }

      // Notify parent controller to sync sketchBeingEdited immediately
      if (this.args.onShapeChange) {
        this.args.onShapeChange(this.editedSketch);
      }
    }, 0);
  }

  @action
  finishPolygon() {
    // This will be handled by the canvas component
    // Just clear the drawing mode after polygon is completed
    this.drawingMode = null;
  }

  @action
  cancelDrawing() {
    // Cancel any current drawing operation
    this.drawingMode = null;
    this.selectedShape = null;
  }

  @action
  startNewShape() {
    // Keep the same drawing mode but reset any in-progress drawing
    // This allows starting a new shape of the same type
    this.selectedShape = null;
  }

  @action
  addPreSelectedAttribute(code) {
    // Always add to the end (bottom of the list)
    this.preSelectedAttributes = [...this.preSelectedAttributes, code];
  }

  @action
  removePreSelectedAttribute(index) {
    // Remove by index to maintain order
    this.preSelectedAttributes = this.preSelectedAttributes.filter(
      (_, i) => i !== index,
    );
  }

  @action
  clearPreSelectedAttributes() {
    this.preSelectedAttributes = [];
  }

  get preSelectedEffectiveRate() {
    return this.preSelectedAttributes
      .reduce((sum, code) => {
        return sum + (this.factorsMap.get(code.toUpperCase()) || 1.0);
      }, 0)
      .toFixed(2);
  }

  get preSelectedAttributesText() {
    return this.preSelectedAttributes.join(', ');
  }

  @action
  calculateEffectiveAreas(area, descriptions) {
    // Convert old string descriptions to new {label, effective_area} format
    const newDescriptions = [];

    descriptions.forEach((desc) => {
      // Get factor from database (points field) or default to 1.0
      const factor = this.factorsMap.get(desc.toUpperCase()) || 1.0;
      const effectiveArea = Math.round(area * factor);

      newDescriptions.push({
        label: desc.toUpperCase(),
        effective_area: effectiveArea,
      });
    });

    return newDescriptions;
  }

  @action
  calculateTotalEffectiveArea(descriptions) {
    // Sum all effective areas from description objects
    if (Array.isArray(descriptions)) {
      return descriptions.reduce(
        (sum, desc) => sum + (desc.effective_area || 0),
        0,
      );
    }
    // Backward compatibility for old object format
    return Object.values(descriptions || {}).reduce(
      (sum, area) => sum + area,
      0,
    );
  }

  @action
  calculateSketchTotals() {
    const totalArea = this.editedSketch.shapes.reduce(
      (sum, shape) => sum + (shape.area || 0),
      0,
    );
    const totalEffectiveArea = this.editedSketch.shapes.reduce(
      (sum, shape) => sum + (shape.total_effective_area || 0),
      0,
    );

    // Calculate comprehensive totals by description type across all shapes
    const descriptionTotals = {};
    const descriptionDetails = {};

    // Collect all unique description codes used in the sketch
    const allDescriptionCodes = new Set();

    this.editedSketch.shapes.forEach((shape) => {
      if (shape.descriptions && shape.descriptions.length > 0) {
        shape.descriptions.forEach((desc) => {
          // Handle both old (string) and new (object) formats
          if (typeof desc === 'string') {
            allDescriptionCodes.add(desc);
          } else if (desc && desc.label) {
            allDescriptionCodes.add(desc.label);
            // For new format, add to totals directly from the description
            descriptionTotals[desc.label] =
              (descriptionTotals[desc.label] || 0) + (desc.effective_area || 0);
          }
        });
      }

      // Handle old format effective_areas object (backward compatibility)
      if (
        shape.effective_areas &&
        shape.descriptions.length > 0 &&
        typeof shape.descriptions[0] === 'string'
      ) {
        Object.keys(shape.effective_areas).forEach((desc) => {
          descriptionTotals[desc] =
            (descriptionTotals[desc] || 0) + shape.effective_areas[desc];
        });
      }
    });

    // Create detailed breakdown for each description used
    Array.from(allDescriptionCodes).forEach((desc) => {
      const factor = this.factorsMap.get(desc.toUpperCase()) || 1.0;

      // Calculate total raw area for this description across all shapes
      let totalRawArea = 0;
      this.editedSketch.shapes.forEach((shape) => {
        if (shape.descriptions && shape.descriptions.length > 0) {
          // Handle both old (string) and new (object) formats for includes check
          const hasDescription = shape.descriptions.some((d) => {
            if (typeof d === 'string') {
              return d === desc;
            } else if (d && d.label) {
              return d.label === desc;
            }
            return false;
          });

          if (hasDescription) {
            totalRawArea += shape.area || 0;
          }
        }
      });

      descriptionDetails[desc] = {
        code: desc,
        rate: factor,
        total_area: Math.round(totalRawArea),
        effective_area: Math.round(descriptionTotals[desc] || 0),
        description: this.getDescriptionText(desc),
      };
    });

    this.editedSketch.total_area = Math.round(totalArea);
    this.editedSketch.total_effective_area = Math.round(totalEffectiveArea);
    this.editedSketch.description_totals = descriptionTotals; // Legacy format: { "HSF": 150, "FFF": 400 }
    this.editedSketch.description_details = descriptionDetails; // New detailed format for printing
    this.editedSketch.description_codes = Array.from(allDescriptionCodes); // Array of codes used
  }

  @action
  handleOverlayClick(event) {
    if (event.target === event.currentTarget) {
      this.args.onClose?.();
    }
  }

  @action
  preventClose(event) {
    event.stopPropagation();
  }

  @action
  handleSave(event) {
    if (event) {
      event.preventDefault();
    }

    // Ensure sketch has a name for database storage
    if (!this.editedSketch.name) {
      this.editedSketch.name = `Building Sketch - Card ${this.args.cardNumber || 1}`;
    }

    // Calculate and include bounding box data before save
    if (this.canvasComponent && this.canvasComponent.centerAndFitShapes) {
      console.log('Getting bounding box data before save...');
      const boundingBoxData = this.canvasComponent.centerAndFitShapes();
      if (boundingBoxData) {
        console.log('Saving bounding box:', boundingBoxData);
        this.editedSketch.bounding_box = boundingBoxData;
      } else {
        console.log('No bounding box data returned');
      }
    } else {
      console.log('No canvas component or centerAndFitShapes method available');
    }

    // Call the parent's save callback with edited sketch (including bounding box)
    this.args.onSave?.(this.editedSketch);
  }

  get availableDescriptions() {
    // Use database factors instead of hardcoded rates
    if (!this.factorsLoaded || this.factorsMap.size === 0) {
      console.log(
        'Factors not loaded yet or empty. factorsLoaded:',
        this.factorsLoaded,
        'factorsMap size:',
        this.factorsMap.size,
      );
      return [];
    }

    const descriptions = Array.from(this.factorsMap.keys()).map((code) => {
      const factor = this.sketchSubAreaFactors.find(
        (f) => f.displayText.toUpperCase() === code,
      );
      return {
        code,
        rate: this.factorsMap.get(code),
        points: factor ? factor.points : 0, // Original points for display
        description: this.getDescriptionText(code),
      };
    });

    console.log('Available descriptions from database:', descriptions);
    return descriptions;
  }

  getDescriptionText(code) {
    const descriptions = {
      HSF: 'Half Story Finished',
      FFF: 'Full Floor Finished',
      BMU: 'Basement Unfinished',
      BMF: 'Basement Finished',
      ATU: 'Attic Unfinished',
      ATF: 'Attic Finished',
      GAR: 'Garage',
      POR: 'Porch',
      DEC: 'Deck',
      BAL: 'Balcony',
    };
    return descriptions[code] || code;
  }

  // Helper method to extract label from description (handles both string and object formats)
  getDescriptionLabel(desc) {
    if (typeof desc === 'string') {
      return desc; // Old format: description is a string
    } else if (desc && desc.label) {
      return desc.label; // New format: description is an object with label
    }
    return ''; // Fallback for invalid descriptions
  }

  // Helper method to extract effective area from description (handles both formats)
  getDescriptionEffectiveArea(desc) {
    if (typeof desc === 'string') {
      // Old format: calculate based on shape area and rate
      // This would need access to the shape, so return 0 for now
      return 0;
    } else if (desc && desc.effective_area !== undefined) {
      return desc.effective_area; // New format: has effective_area property
    }
    return 0; // Fallback
  }

  @action
  getDescriptionRate(code) {
    // Use database factors instead of hardcoded rates
    return this.factorsMap.get(code?.toUpperCase()) || 1.0;
  }

  get shapesForCanvas() {
    // Check if we have a mismatch between args.sketch and editedSketch IDs
    if (this.args.sketch && this.editedSketch) {
      const argsId = this.args.sketch.id || this.args.sketch._id;
      const editedId = this.editedSketch.id || this.editedSketch._id;

      if (argsId && editedId && argsId !== editedId) {
        setTimeout(() => {
          this.initializeEditedSketch();
        }, 0);
        return this.args.sketch.shapes || [];
      }
    }

    // Check for different initialization scenarios:
    if (this.args.sketch) {
      // Case 1: editedSketch doesn't exist or shapes is undefined
      if (!this.editedSketch || this.editedSketch.shapes === undefined) {
        setTimeout(() => {
          this.initializeEditedSketch();
        }, 0);
        return this.args.sketch.shapes;
      }

      // Case 2: editedSketch exists but has fewer shapes than args.sketch (initial load scenario)
      if (
        this.editedSketch.shapes.length === 0 &&
        this.args.sketch.shapes.length > 0
      ) {
        // Only reinitialize if this looks like initial load, not a legitimate delete
        const hasSketchId = this.editedSketch.id || this.editedSketch._id;
        const argsHasId = this.args.sketch.id || this.args.sketch._id;

        // For initial load, if editedSketch is empty but args.sketch has shapes, always copy
        // This handles the case where editedSketch was created without proper ID copying
        setTimeout(() => {
          this.initializeEditedSketch();
        }, 0);
        return this.args.sketch.shapes;
      }
    }

    // Sync version information from args.sketch if it's newer
    if (this.args.sketch && this.editedSketch) {
      const argsVersion = this.args.sketch.__v;
      const editedVersion = this.editedSketch.__v;
      if (argsVersion && editedVersion && argsVersion > editedVersion) {
        this.editedSketch.__v = argsVersion;
        this.editedSketch.updated_at = this.args.sketch.updated_at;
      }
    }

    // If editedSketch exists and has been initialized, always use it (even if empty)
    if (this.editedSketch && this.editedSketch.shapes !== undefined) {
      // Return a new array reference to force Ember reactivity
      return [...this.editedSketch.shapes];
    }
    // Otherwise, if we have args.sketch shapes, return them directly as fallback
    else if (this.args.sketch?.shapes && this.args.sketch.shapes.length > 0) {
      return this.args.sketch.shapes;
    } else {
      return [];
    }
  }
}
