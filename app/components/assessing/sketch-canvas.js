import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';
import { schedule, next } from '@ember/runloop';
import * as d3 from 'd3';

export default class SketchCanvasComponent extends Component {
  @tracked svg = null;
  @tracked drawingShape = null;
  @tracked isDrawing = false;
  @tracked gridSize = 10; // 10 pixels per foot for house sketching
  @tracked snapToGrid = true; // Enable snap-to-grid by default
  @tracked gridOriginX = 0; // Grid origin X (center of canvas)
  @tracked gridOriginY = 0; // Grid origin Y (center of canvas)
  @tracked canvasId = Math.random().toString(36).substr(2, 9); // Unique ID for this canvas instance
  @tracked zoomScale = 1; // Current zoom level
  @tracked panX = 0; // Pan offset X
  @tracked panY = 0; // Pan offset Y
  @tracked isShiftPressed = false; // Track shift key for 90-degree constraints

  // Arc mode state tracking (3-click workflow)
  @tracked arcModeStep = 0; // 0 = not in arc mode, 1 = awaiting arc end, 2 = awaiting radius
  @tracked arcStartEdge = null; // Edge info from first click
  @tracked arcEndEdge = null; // Edge info from second click
  @tracked arcStartVertexIndex = null; // Index of inserted start vertex
  @tracked arcEndVertexIndex = null; // Index of inserted end vertex
  @tracked arcShape = null; // The shape being modified
  @tracked arcIndicesReversed = false; // True if end was inserted before start (affects bulge direction)

  // Arc edit mode (for editing existing arcs)
  @tracked showBulgeEditor = false; // Show the arc depth editor
  @tracked editingArcShape = null; // Shape containing the arc being edited
  @tracked editingArcVertexIndex = null; // Index of the vertex with bulge
  @tracked editingBulgeValue = ''; // Current bulge value being edited (kept for internal use)
  @tracked editingSagittaValue = ''; // Current sagitta (arc depth) in feet being edited (for display)

  constructor() {
    super(...arguments);

    // Track previous shapes for change detection
    this._previousShapes = null;
    this._previousSketchId = null;
    this._isInitialized = false;

    schedule('afterRender', () => {
      this.initializeCanvas();
      this._isInitialized = true;
      // Notify parent component that canvas is ready
      this.args.onCanvasReady?.(this);

      // Apply saved bounding box if available
      setTimeout(() => {
        this.applySavedBoundingBoxIfAvailable();
      }, 100);

      // Start monitoring for argument changes
      this.startChangeMonitoring();
    });

    // Add keyboard event listeners for shift key
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleKeyUp = this.handleKeyUp.bind(this);
    document.addEventListener('keydown', this.handleKeyDown);
    document.addEventListener('keyup', this.handleKeyUp);
  }

  willDestroy() {
    super.willDestroy();
    // Clean up keyboard event listeners
    document.removeEventListener('keydown', this.handleKeyDown);
    document.removeEventListener('keyup', this.handleKeyUp);

    // Clean up change monitoring
    if (this._changeCheckInterval) {
      clearInterval(this._changeCheckInterval);
    }
  }

  @action
  startChangeMonitoring() {
    // Poll for changes every 100ms when component is active
    this._changeCheckInterval = setInterval(() => {
      if (this._isInitialized && this.svg) {
        this.checkForArgumentChanges();
      }
    }, 100);
  }

  @action
  checkForArgumentChanges() {
    const shapes = this.args.shapes || [];
    const currentSketchId = this.args.sketch?._id || this.args.sketch?.id;

    // Detect if this is a completely different sketch (property change)
    const isNewSketch = currentSketchId !== this._previousSketchId;
    const shapesChanged =
      JSON.stringify(shapes) !== JSON.stringify(this._previousShapes);

    if (isNewSketch || shapesChanged) {
      // Store current values for next comparison
      this._previousShapes = shapes;
      this._previousSketchId = currentSketchId;

      if (isNewSketch) {
        this.clearAndReinitializeCanvas();
        this.updateShapesWithD3(shapes);
        // Apply bounding box for the new sketch
        setTimeout(() => {
          this.applySavedBoundingBoxIfAvailable();
        }, 50);
      } else {
        // Normal shape update for same sketch
        this.updateShapesWithD3(shapes);
      }
    }
  }

  handleKeyDown(event) {
    if (event.key === 'Shift') {
      this.isShiftPressed = true;
    }
  }

  handleKeyUp(event) {
    if (event.key === 'Shift') {
      this.isShiftPressed = false;
    }
  }

  get canvasWidth() {
    const isViewOnlyMode = !this.args.width;
    if (isViewOnlyMode) {
      // For view-only mode, use 100% width with viewBox
      return 1200; // Default viewBox width
    }
    return this.args.width || 800;
  }

  get canvasHeight() {
    return this.args.height || 600;
  }

  get shapesToRender() {
    // This getter makes the component reactive to shape changes
    const shapes = this.args.shapes || [];
    const currentSketchId = this.args.sketch?._id || this.args.sketch?.id;

    // Detect if this is a completely different sketch (property change)
    const isNewSketch = currentSketchId !== this._previousSketchId;
    const shapesChanged =
      JSON.stringify(shapes) !== JSON.stringify(this._previousShapes);

    if (this.svg && (isNewSketch || shapesChanged)) {
      // Store current values for next comparison
      this._previousShapes = shapes;
      this._previousSketchId = currentSketchId;

      if (isNewSketch) {
        // Complete canvas refresh for new sketch (property change)
        setTimeout(() => {
          this.clearAndReinitializeCanvas();
          this.updateShapesWithD3(shapes);
          // Apply bounding box for the new sketch
          setTimeout(() => {
            this.applySavedBoundingBoxIfAvailable();
          }, 50);
        }, 0);
      } else {
        // Normal shape update for same sketch
        setTimeout(() => this.updateShapesWithD3(shapes), 0);
      }
    } else {
    }

    return shapes;
  }

  @action
  clearAndReinitializeCanvas() {
    if (!this.svg) return;

    // Clear all content groups and reset state
    if (this.contentGroup) {
      this.contentGroup.selectAll('*').remove();
    }

    // Reset zoom/pan state
    this.zoomScale = 1;
    this.panX = 0;
    this.panY = 0;

    // Reset tracking variables
    this._lastShapesLength = 0;
    this._lastShapes = [];

    // Re-add the grid to the content group
    if (this.contentGroup) {
      this.addCoordinateGridToGroup(this.contentGroup);
    } else if (!this.args.isResponsive && this.svg) {
      // For non-responsive canvases, re-setup zoom and pan
      this.setupZoomAndPan();
    }
  }

  initializeCanvas() {
    const elementId = `sketch-canvas-${this.canvasId}`;
    const element = document.getElementById(elementId);

    if (!element) {
      // Try again after a short delay
      setTimeout(() => this.initializeCanvas(), 100);
      return;
    }

    this._lastShapesLength = 0;
    this._lastShapes = [];

    // Clear any existing SVG first
    d3.select(element).selectAll('*').remove();

    const isViewOnlyMode = !this.args.width;
    this.svg = d3
      .select(element)
      .append('svg')
      .attr('width', isViewOnlyMode ? '100%' : this.canvasWidth)
      .attr('height', isViewOnlyMode ? '100%' : this.canvasHeight)
      .attr(
        'viewBox',
        isViewOnlyMode ? `0 0 ${this.canvasWidth} ${this.canvasHeight}` : null,
      )
      .attr('preserveAspectRatio', isViewOnlyMode ? 'xMidYMid meet' : null)
      .style('border', '1px solid #ccc')
      .style('background', '#fff')
      .style('display', 'block')
      .style('max-width', isViewOnlyMode ? '100%' : null)
      .style('max-height', isViewOnlyMode ? '100%' : null);

    // Add grid pattern
    this.addGrid();

    // Add event listeners
    this.svg.on('click', this.handleCanvasClick.bind(this));
    this.svg.on('contextmenu', this.handleRightClick.bind(this));
    this.svg.on('mousemove', this.handleMouseMove.bind(this));

    // Render existing shapes
    this.renderShapes();

    // Register update callback with parent
    if (this.args.onForceUpdate) {
      this.args.onForceUpdate(() => {
        this.renderShapes();
      });
    }

    // Force a second render after a short delay in case shapes weren't ready
    setTimeout(() => {
      if (this.args.shapes && this.args.shapes.length > 0) {
        this.renderShapes();
      }
    }, 100);
  }

  @action
  addGrid() {
    if (!this.svg) {
      return;
    }

    // Calculate center of canvas
    const centerX = this.canvasWidth / 2;
    const centerY = this.canvasHeight / 2;

    // Set grid origin to center of canvas
    this.gridOriginX = centerX;
    this.gridOriginY = centerY;

    // Add coordinate system grid lines
    this.addCoordinateGrid();

    // Add zoom and pan functionality (only for non-responsive canvases)
    if (!this.args.isResponsive) {
      this.setupZoomAndPan();
    } else {
      // For responsive canvases, still create a content group for shapes
      this.contentGroup = this.svg
        .append('g')
        .attr('class', 'responsive-content');
      // Move existing grid to the content group for consistency
      const existingGrid = this.svg.select('.coordinate-grid');
      if (!existingGrid.empty()) {
        existingGrid.remove();
        this.addCoordinateGridToGroup(this.contentGroup);
      }
    }
  }

  @action
  addCoordinateGrid() {
    const gridGroup = this.svg.append('g').attr('class', 'coordinate-grid');

    // Create 100x100 foot grid (10 pixels per foot)
    const gridSpacing = this.gridSize; // 10 pixels per foot
    const majorGridSpacing = gridSpacing * 10; // Major lines every 10 feet

    const centerX = this.canvasWidth / 2;
    const centerY = this.canvasHeight / 2;

    // Minor grid lines (every foot)
    for (
      let x = centerX % gridSpacing;
      x < this.canvasWidth;
      x += gridSpacing
    ) {
      gridGroup
        .append('line')
        .attr('x1', x)
        .attr('y1', 0)
        .attr('x2', x)
        .attr('y2', this.canvasHeight)
        .attr('stroke', '#f0f0f0')
        .attr('stroke-width', 0.5);
    }

    for (
      let y = centerY % gridSpacing;
      y < this.canvasHeight;
      y += gridSpacing
    ) {
      gridGroup
        .append('line')
        .attr('x1', 0)
        .attr('y1', y)
        .attr('x2', this.canvasWidth)
        .attr('y2', y)
        .attr('stroke', '#f0f0f0')
        .attr('stroke-width', 0.5);
    }

    // Major grid lines (every 10 feet)
    for (
      let x = centerX % majorGridSpacing;
      x < this.canvasWidth;
      x += majorGridSpacing
    ) {
      gridGroup
        .append('line')
        .attr('x1', x)
        .attr('y1', 0)
        .attr('x2', x)
        .attr('y2', this.canvasHeight)
        .attr('stroke', '#d0d0d0')
        .attr('stroke-width', 1);
    }

    for (
      let y = centerY % majorGridSpacing;
      y < this.canvasHeight;
      y += majorGridSpacing
    ) {
      gridGroup
        .append('line')
        .attr('x1', 0)
        .attr('y1', y)
        .attr('x2', this.canvasWidth)
        .attr('y2', y)
        .attr('stroke', '#d0d0d0')
        .attr('stroke-width', 1);
    }
  }

  @action
  setupZoomAndPan() {
    // Create zoom behavior and store it as instance property
    this.zoom = d3
      .zoom()
      .scaleExtent([0.1, 5]) // Allow zoom from 10% to 500%
      .filter((event) => {
        // Allow all events, but we'll handle the logic differently
        return true;
      })
      .on('zoom', (event) => {
        const { transform } = event;

        // Update tracked zoom and pan values
        this.zoomScale = transform.k;
        this.panX = transform.x;
        this.panY = transform.y;

        // Apply transform to the main content group
        if (this.contentGroup) {
          this.contentGroup.attr('transform', transform);
        }

        // Re-render shapes to update text sizes
        this.renderShapes();
      });

    // Apply zoom behavior to the SVG background only, not to shape groups
    this.svg.call(this.zoom);

    // Create a group for all content that will be zoomed/panned
    this.contentGroup = this.svg.append('g').attr('class', 'zoom-content');

    // Add a background rect for pan detection (invisible but captures events)
    this.svg
      .insert('rect', '.zoom-content')
      .attr('class', 'zoom-background')
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('fill', 'transparent')
      .style('pointer-events', 'all');

    // Move existing grid to the zoom group
    const existingGrid = this.svg.select('.coordinate-grid');
    if (!existingGrid.empty()) {
      existingGrid.remove();
      this.addCoordinateGridToGroup(this.contentGroup);
    }
  }

  @action
  addCoordinateGridToGroup(group) {
    const gridGroup = group.append('g').attr('class', 'coordinate-grid');

    // Create 100x100 foot grid (10 pixels per foot)
    const gridSpacing = this.gridSize; // 10 pixels per foot
    const majorGridSpacing = gridSpacing * 10; // Major lines every 10 feet

    const centerX = this.canvasWidth / 2;
    const centerY = this.canvasHeight / 2;

    // Extend grid beyond canvas to handle zooming/panning
    const extendedWidth = this.canvasWidth * 3;
    const extendedHeight = this.canvasHeight * 3;
    const offsetX = -this.canvasWidth;
    const offsetY = -this.canvasHeight;

    // Minor grid lines (every foot)
    for (
      let x = offsetX + (centerX % gridSpacing);
      x < extendedWidth;
      x += gridSpacing
    ) {
      gridGroup
        .append('line')
        .attr('x1', x)
        .attr('y1', offsetY)
        .attr('x2', x)
        .attr('y2', extendedHeight)
        .attr('stroke', '#f0f0f0')
        .attr('stroke-width', 0.5);
    }

    for (
      let y = offsetY + (centerY % gridSpacing);
      y < extendedHeight;
      y += gridSpacing
    ) {
      gridGroup
        .append('line')
        .attr('x1', offsetX)
        .attr('y1', y)
        .attr('x2', extendedWidth)
        .attr('y2', y)
        .attr('stroke', '#f0f0f0')
        .attr('stroke-width', 0.5);
    }

    // Major grid lines (every 10 feet)
    for (
      let x = offsetX + (centerX % majorGridSpacing);
      x < extendedWidth;
      x += majorGridSpacing
    ) {
      gridGroup
        .append('line')
        .attr('x1', x)
        .attr('y1', offsetY)
        .attr('x2', x)
        .attr('y2', extendedHeight)
        .attr('stroke', '#d0d0d0')
        .attr('stroke-width', 1);
    }

    for (
      let y = offsetY + (centerY % majorGridSpacing);
      y < extendedHeight;
      y += majorGridSpacing
    ) {
      gridGroup
        .append('line')
        .attr('x1', offsetX)
        .attr('y1', y)
        .attr('x2', extendedWidth)
        .attr('y2', y)
        .attr('stroke', '#d0d0d0')
        .attr('stroke-width', 1);
    }
  }

  // Snap-to-grid helper functions
  @action
  snapToGridPoint(x, y) {
    if (!this.snapToGrid) return { x, y };

    // Snap relative to grid origin (center of canvas)
    const relativeX = x - this.gridOriginX;
    const relativeY = y - this.gridOriginY;

    const snappedRelativeX =
      Math.round(relativeX / this.gridSize) * this.gridSize;
    const snappedRelativeY =
      Math.round(relativeY / this.gridSize) * this.gridSize;

    return {
      x: snappedRelativeX + this.gridOriginX,
      y: snappedRelativeY + this.gridOriginY,
    };
  }

  @action
  snapToGridDistance(distance) {
    if (!this.snapToGrid) return distance;
    return Math.round(distance / this.gridSize) * this.gridSize;
  }

  @action
  constrainToRightAngles(x, y, referencePoint) {
    if (!this.isShiftPressed || !referencePoint) {
      return { x, y };
    }

    // For polygon drawing, we need to look at the previous segment to make this one perpendicular
    if (
      this.args.drawingMode === 'polygon' &&
      this.drawingShape?.points?.length >= 2
    ) {
      const points = this.drawingShape.points;
      const lastPoint = points[points.length - 1]; // Current end point
      const secondLastPoint = points[points.length - 2]; // Previous point

      // Calculate the direction vector of the previous segment
      const prevSegmentX = lastPoint.x - secondLastPoint.x;
      const prevSegmentY = lastPoint.y - secondLastPoint.y;

      // Calculate perpendicular directions (rotate 90 degrees)
      const perp1X = -prevSegmentY; // First perpendicular direction
      const perp1Y = prevSegmentX;
      const perp2X = prevSegmentY; // Second perpendicular direction (opposite)
      const perp2Y = -prevSegmentX;

      // Calculate the mouse direction from the reference point
      const mouseX = x - referencePoint.x;
      const mouseY = y - referencePoint.y;

      // Calculate dot products to see which perpendicular direction is closer to mouse direction
      const dot1 = mouseX * perp1X + mouseY * perp1Y;
      const dot2 = mouseX * perp2X + mouseY * perp2Y;

      // Choose the perpendicular direction that's more aligned with mouse movement
      const chosenPerpX = Math.abs(dot1) > Math.abs(dot2) ? perp1X : perp2X;
      const chosenPerpY = Math.abs(dot1) > Math.abs(dot2) ? perp1Y : perp2Y;

      // Normalize the chosen perpendicular vector
      const perpLength = Math.sqrt(
        chosenPerpX * chosenPerpX + chosenPerpY * chosenPerpY,
      );
      if (perpLength === 0) {
        return { x, y }; // Fallback if previous segment has zero length
      }

      const normPerpX = chosenPerpX / perpLength;
      const normPerpY = chosenPerpY / perpLength;

      // Project the mouse movement onto the chosen perpendicular direction
      const mouseLength = Math.sqrt(mouseX * mouseX + mouseY * mouseY);
      const projectionLength = mouseX * normPerpX + mouseY * normPerpY;

      // Return the point along the perpendicular direction
      return {
        x:
          referencePoint.x +
          normPerpX * Math.abs(projectionLength) * Math.sign(projectionLength),
        y:
          referencePoint.y +
          normPerpY * Math.abs(projectionLength) * Math.sign(projectionLength),
      };
    } else {
      // Fallback to horizontal/vertical constraint for other cases or first polygon segment
      const deltaX = x - referencePoint.x;
      const deltaY = y - referencePoint.y;

      // Determine if horizontal or vertical movement is stronger
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        // Lock to horizontal
        return { x, y: referencePoint.y };
      } else {
        // Lock to vertical
        return { x: referencePoint.x, y };
      }
    }
  }

  @action
  updateShapesWithD3(shapes) {
    if (!this.svg || !this.contentGroup) {
      return;
    }

    // D3 data join using shape IDs as keys - prefer _id (MongoDB), fallback to id, then index
    const shapeGroups = this.contentGroup
      .selectAll('.shape')
      .data(shapes, (d, i) => {
        const key = d._id || `temp-${i}`;
        return key;
      });

    // ENTER: Create new shape groups for new data
    const enterGroups = shapeGroups
      .enter()
      .append('g')
      .attr('class', 'shape')
      .on('click', (event, shape) => {
        // Always stop propagation to prevent pan behavior on shape clicks
        event.stopPropagation();

        // Only allow selection if not in drawing mode
        const isDrawingMode =
          this.args.drawingMode && this.args.drawingMode !== null;
        const isCurrentlyDrawing = this.isDrawing;
        const canSelect = !isDrawingMode && !isCurrentlyDrawing;

        if (canSelect) {
          this.args.onShapeSelect?.(shape);
          // Force re-render to show vertex handles immediately
          setTimeout(() => {
            this.renderShapes();
          }, 0);
        }
      })
      .on('mousedown', (event) => {
        // Stop mousedown propagation to prevent pan behavior on shapes
        event.stopPropagation();
      });

    // UPDATE: Merge enter and update selections
    const mergedGroups = enterGroups.merge(shapeGroups);

    // Render each shape in the merged selection
    mergedGroups.each((shape, index, nodes) => {
      const group = d3.select(nodes[index]);
      this.renderShapeInGroup(group, shape);
    });

    // EXIT: Remove shapes that are no longer in the data
    const exitGroups = shapeGroups.exit();
    exitGroups.remove();
  }

  @action
  renderShapeInGroup(group, shape) {
    // Clear any existing content in the group
    group.selectAll('*').remove();

    // Determine if shapes should be selectable (not during drawing operations)
    const isDrawingMode =
      this.args.drawingMode && this.args.drawingMode !== null;
    const isCurrentlyDrawing = this.isDrawing;
    const canSelect = !isDrawingMode && !isCurrentlyDrawing;

    // Set group attributes
    group
      .attr('data-shape-id', shape.id)
      .style('cursor', canSelect ? 'pointer' : 'default');

    // Check if this specific shape is selected
    const selectedShape = this.args.selectedShape;
    let isSelected = false;

    if (selectedShape && shape) {
      const selectedId = selectedShape.id || selectedShape._id;
      const shapeId = shape.id || shape._id;
      isSelected = selectedId && shapeId && selectedId === shapeId;
    }

    const fillColor = isSelected ? '#e3f2fd' : 'white';
    const strokeColor = isSelected ? '#0056b3' : '#007bff';

    // Render the shape based on its type
    switch (shape.type) {
      case 'rectangle':
        this.renderRectangle(group, shape, fillColor, strokeColor);
        break;
      case 'circle':
        this.renderCircle(group, shape, fillColor, strokeColor);
        break;
      case 'polygon':
        this.renderPolygon(group, shape, fillColor, strokeColor);
        break;
      case 'arc':
        this.renderArc(group, shape, fillColor, strokeColor);
        break;
    }

    // Add shape labels
    this.addShapeLabels(group, shape);

    // Only add vertex handles if the shape is selected AND we're not in a drawing mode AND not in view mode
    if (isSelected && canSelect && !this.args.isResponsive) {
      this.addVertexHandles(group, shape);
    }
  }

  // Keep old method for initial render
  renderShapes() {
    if (!this.svg) return;

    // For initial render, use D3 data join
    this.updateShapesWithD3(this.shapesToRender);
  }

  @action
  centerExistingShapes() {
    const shapes = this.shapesToRender;
    if (shapes.length === 0) return;

    // Calculate bounding box of all shapes
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;

    shapes.forEach((shape) => {
      const bounds = this.getShapeBounds(shape);
      minX = Math.min(minX, bounds.minX);
      minY = Math.min(minY, bounds.minY);
      maxX = Math.max(maxX, bounds.maxX);
      maxY = Math.max(maxY, bounds.maxY);
    });

    // Calculate the center of the canvas
    const canvasCenterX = this.canvasWidth / 2;
    const canvasCenterY = this.canvasHeight / 2;

    // Calculate the center of the existing shapes
    const shapeCenterX = (minX + maxX) / 2;
    const shapeCenterY = (minY + maxY) / 2;

    // Calculate offset needed to center the shapes
    const offsetX = canvasCenterX - shapeCenterX;
    const offsetY = canvasCenterY - shapeCenterY;

    // Apply offset to all shapes (modify the original coordinates)
    shapes.forEach((shape) => {
      this.applyOffsetToShape(shape, offsetX, offsetY);
    });
  }

  @action
  getShapeBounds(shape) {
    const coords = shape.coordinates;

    switch (shape.type) {
      case 'rectangle':
        return {
          minX: coords.x,
          minY: coords.y,
          maxX: coords.x + coords.width,
          maxY: coords.y + coords.height,
        };
      case 'circle':
        return {
          minX: coords.cx - coords.radius,
          minY: coords.cy - coords.radius,
          maxX: coords.cx + coords.radius,
          maxY: coords.cy + coords.radius,
        };
      case 'polygon':
        const xs = coords.points.map((p) => p.x);
        const ys = coords.points.map((p) => p.y);
        return {
          minX: Math.min(...xs),
          minY: Math.min(...ys),
          maxX: Math.max(...xs),
          maxY: Math.max(...ys),
        };
      case 'arc':
        return {
          minX: coords.cx - coords.radius,
          minY: coords.cy - coords.radius,
          maxX: coords.cx + coords.radius,
          maxY: coords.cy + coords.radius,
        };
      default:
        return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    }
  }

  @action
  applyOffsetToShape(shape, offsetX, offsetY) {
    const coords = shape.coordinates;

    switch (shape.type) {
      case 'rectangle':
        coords.x += offsetX;
        coords.y += offsetY;
        break;
      case 'circle':
        coords.cx += offsetX;
        coords.cy += offsetY;
        break;
      case 'polygon':
        coords.points.forEach((point) => {
          point.x += offsetX;
          point.y += offsetY;
        });
        break;
      case 'arc':
        coords.cx += offsetX;
        coords.cy += offsetY;
        break;
    }
  }

  @action
  renderShape(shape) {
    // Determine if shapes should be selectable (not during drawing operations)
    const isDrawingMode =
      this.args.drawingMode && this.args.drawingMode !== null;
    const isCurrentlyDrawing = this.isDrawing;
    const canSelect = !isDrawingMode && !isCurrentlyDrawing;

    const shapeGroup = this.contentGroup
      .append('g')
      .attr('class', 'shape')
      .attr('data-shape-id', shape.id)
      .style('cursor', canSelect ? 'pointer' : 'default')
      .on('click', (event) => {
        // Always stop propagation to prevent pan behavior on shape clicks
        event.stopPropagation();

        if (canSelect) {
          this.args.onShapeSelect?.(shape);
          // Force re-render to show vertex handles immediately
          setTimeout(() => {
            this.renderShapes();
          }, 0);
        }
      })
      .on('mousedown', (event) => {
        // Stop mousedown propagation to prevent pan behavior on shapes
        event.stopPropagation();
      });

    // Check if this specific shape is selected
    const selectedShape = this.args.selectedShape;
    let isSelected = false;

    if (selectedShape && shape) {
      const selectedId = selectedShape.id || selectedShape._id;
      const shapeId = shape.id || shape._id;
      isSelected = selectedId && shapeId && selectedId === shapeId;
    }

    const fillColor = isSelected ? '#e3f2fd' : 'white';
    const strokeColor = isSelected ? '#0056b3' : '#007bff';

    switch (shape.type) {
      case 'rectangle':
        this.renderRectangle(shapeGroup, shape, fillColor, strokeColor);
        break;
      case 'circle':
        this.renderCircle(shapeGroup, shape, fillColor, strokeColor);
        break;
      case 'polygon':
        this.renderPolygon(shapeGroup, shape, fillColor, strokeColor);
        break;
      case 'arc':
        this.renderArc(shapeGroup, shape, fillColor, strokeColor);
        break;
    }

    // Add shape labels
    this.addShapeLabels(shapeGroup, shape);

    // Only add vertex handles if the shape is selected AND we're not in a drawing mode AND not in view mode
    if (isSelected && canSelect && !this.args.isResponsive) {
      this.addVertexHandles(shapeGroup, shape);
    }
  }

  @action
  renderRectangle(group, shape, fill, stroke) {
    const coords = shape.coordinates;

    // Draw the rectangle
    group
      .append('rect')
      .attr('x', coords.x)
      .attr('y', coords.y)
      .attr('width', coords.width)
      .attr('height', coords.height)
      .attr('fill', fill)
      .attr('stroke', stroke)
      .attr('stroke-width', 2);

    // Add dimensions
    this.addRectangleDimensions(group, shape);
  }

  @action
  renderCircle(group, shape, fill, stroke) {
    const coords = shape.coordinates;
    group
      .append('circle')
      .attr('cx', coords.cx)
      .attr('cy', coords.cy)
      .attr('r', coords.radius)
      .attr('fill', fill)
      .attr('stroke', stroke)
      .attr('stroke-width', 2);

    // Add dimensions
    this.addCircleDimensions(group, shape);
  }

  @action
  renderPolygon(group, shape, fill, stroke) {
    const points = shape.coordinates.points;

    if (!points || points.length < 2) {
      return;
    }

    // Build SVG path string with support for arc segments (bulge)
    let pathData = `M ${points[0].x},${points[0].y}`;

    for (let i = 0; i < points.length; i++) {
      const currentPoint = points[i];
      const nextIndex = (i + 1) % points.length;
      const nextPoint = points[nextIndex];

      // Check if this point has a bulge (arc to next point)
      if (currentPoint.bulge && Math.abs(currentPoint.bulge) > 0.0001) {
        // Calculate arc parameters from bulge
        const arcParams = this.calculateArcFromBulge(
          currentPoint,
          nextPoint,
          currentPoint.bulge,
        );

        // Add arc command: A rx ry x-axis-rotation large-arc-flag sweep-flag x y
        pathData += ` A ${arcParams.radius},${arcParams.radius} 0 ${arcParams.largeArcFlag} ${arcParams.sweepFlag} ${nextPoint.x},${nextPoint.y}`;
      } else {
        // Straight line to next point
        if (i < points.length - 1) {
          pathData += ` L ${nextPoint.x},${nextPoint.y}`;
        }
      }
    }

    // Close the path
    pathData += ' Z';

    group
      .append('path')
      .attr('d', pathData)
      .attr('fill', fill)
      .attr('stroke', stroke)
      .attr('stroke-width', 2);

    // Calculate responsive font size for arc labels
    const arcBaseFontSize = 10;
    const arcFontSize = this.args.isResponsive
      ? arcBaseFontSize
      : arcBaseFontSize / this.zoomScale;
    const arcOffsetScale = this.args.isResponsive ? 1 : 1 / this.zoomScale;

    // Add arc labels for segments with bulge
    for (let i = 0; i < points.length; i++) {
      const currentPoint = points[i];
      const nextIndex = (i + 1) % points.length;
      const nextPoint = points[nextIndex];

      if (currentPoint.bulge && Math.abs(currentPoint.bulge) > 0.0001) {
        const arcParams = this.calculateArcFromBulge(
          currentPoint,
          nextPoint,
          currentPoint.bulge,
        );

        // Calculate midpoint of chord
        const midX = (currentPoint.x + nextPoint.x) / 2;
        const midY = (currentPoint.y + nextPoint.y) / 2;

        // Calculate perpendicular direction (normalized)
        const dx = nextPoint.x - currentPoint.x;
        const dy = nextPoint.y - currentPoint.y;
        const perpX = -dy / arcParams.chordLength;
        const perpY = dx / arcParams.chordLength;

        // Determine label position based on bulge direction
        // Flip direction to match the actual arc bulge (same as bulge calculation)
        const direction = currentPoint.bulge > 0 ? -1 : 1;

        // Position label BEYOND the arc apex - offset by sagitta + additional spacing
        const labelOffset = 10 * arcOffsetScale; // Additional offset beyond arc peak
        const totalOffset = arcParams.sagitta + labelOffset;
        const labelX = midX + perpX * totalOffset * direction;
        const labelY = midY + perpY * totalOffset * direction;

        // Calculate angle of chord for text rotation (perpendicular to chord)
        const chordAngle = (Math.atan2(dy, dx) * 180) / Math.PI;

        // Convert sagitta from pixels to feet (10 pixels = 1 foot)
        const sagittaInFeet = arcParams.sagitta / 10;

        // Add label text positioned beyond the arc curve
        group
          .append('text')
          .attr('x', labelX)
          .attr('y', labelY)
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'middle')
          .attr('font-size', `${arcFontSize}px`)
          .attr('font-weight', 'bold')
          .attr('fill', '#2196F3')
          .attr('stroke', 'white')
          .attr('stroke-width', 1.5 * arcOffsetScale)
          .attr('paint-order', 'stroke')
          .attr('transform', `rotate(${chordAngle}, ${labelX}, ${labelY})`)
          .text(`arc:${sagittaInFeet.toFixed(1)}'`);
      }
    }

    // Add dimensions
    this.addPolygonDimensions(group, shape);
  }

  /**
   * Calculate arc parameters from bulge factor
   * @param {object} startPoint - { x, y, bulge? }
   * @param {object} endPoint - { x, y }
   * @param {number} bulge - bulge factor (tan(angle/4))
   * @returns {object} - { radius, largeArcFlag, sweepFlag, sagitta, chordLength, includedAngle }
   */
  @action
  calculateArcFromBulge(startPoint, endPoint, bulge) {
    // Calculate chord length
    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    const chordLength = Math.sqrt(dx * dx + dy * dy);

    // Calculate included angle from bulge
    // bulge = tan(angle/4), so angle = 4 * atan(bulge)
    const includedAngle = 4 * Math.atan(Math.abs(bulge));

    // Calculate radius from chord and angle
    // radius = chordLength / (2 * sin(angle/2))
    const radius = chordLength / (2 * Math.sin(includedAngle / 2));

    // Calculate sagitta (arc height/depth)
    // sagitta = radius * (1 - cos(angle/2))
    const sagitta = radius * (1 - Math.cos(includedAngle / 2));

    // Determine arc flags
    // large-arc-flag: 1 if angle > 180°, 0 otherwise
    const largeArcFlag = Math.abs(includedAngle) > Math.PI ? 1 : 0;

    // sweep-flag: determines arc direction
    // Positive bulge = clockwise (sweep-flag = 1)
    // Negative bulge = counter-clockwise (sweep-flag = 0)
    const sweepFlag = bulge > 0 ? 1 : 0;

    return {
      radius: Math.abs(radius),
      largeArcFlag,
      sweepFlag,
      sagitta: Math.abs(sagitta),
      chordLength,
      includedAngle,
    };
  }

  @action
  renderArc(group, shape, fill, stroke) {
    const coords = shape.coordinates;
    const arc = d3
      .arc()
      .innerRadius(0)
      .outerRadius(coords.radius)
      .startAngle(coords.startAngle)
      .endAngle(coords.endAngle);

    group
      .append('path')
      .attr('d', arc)
      .attr('transform', `translate(${coords.cx},${coords.cy})`)
      .attr('fill', fill)
      .attr('stroke', stroke)
      .attr('stroke-width', 2);
  }

  @action
  addRectangleDimensions(group, shape) {
    const coords = shape.coordinates;
    const pixelsPerFoot = this.gridSize;
    const widthInFeet = Math.round((coords.width / pixelsPerFoot) * 10) / 10;
    const heightInFeet = Math.round((coords.height / pixelsPerFoot) * 10) / 10;

    // Calculate responsive font size based on zoom (but not for responsive mode)
    const baseFontSize = 12;
    const fontSize = this.args.isResponsive
      ? baseFontSize
      : baseFontSize / this.zoomScale;
    const offsetScale = this.args.isResponsive ? 1 : 1 / this.zoomScale;

    // Offset labels further inside during editing mode (non-responsive)
    const topOffset = this.args.isResponsive ? 10 : 17;
    const leftOffset = this.args.isResponsive ? 7.5 : 13;

    // Width dimension (inside, near top edge)
    group
      .append('text')
      .attr('x', coords.x + coords.width / 2)
      .attr('y', coords.y + topOffset * offsetScale)
      .attr('text-anchor', 'middle')
      .attr('font-size', `${fontSize}px`)
      .attr('font-weight', 'bold')
      .attr('fill', '#666')
      .attr('stroke', 'white')
      .attr('stroke-width', 2 * offsetScale)
      .attr('paint-order', 'stroke')
      .text(`${widthInFeet}'`);

    // Height dimension (inside, rotated 90 degrees, near left edge)
    const leftOffsetScaled = coords.x + leftOffset * offsetScale;
    group
      .append('text')
      .attr('x', leftOffsetScaled)
      .attr('y', coords.y + coords.height / 2)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('font-size', `${fontSize}px`)
      .attr('font-weight', 'bold')
      .attr('fill', '#666')
      .attr('stroke', 'white')
      .attr('stroke-width', 2 * offsetScale)
      .attr('paint-order', 'stroke')
      .attr(
        'transform',
        `rotate(-90, ${leftOffsetScaled}, ${coords.y + coords.height / 2})`,
      )
      .text(`${heightInFeet}'`);
  }

  @action
  addCircleDimensions(group, shape) {
    const coords = shape.coordinates;
    const pixelsPerFoot = this.gridSize;
    const radiusInFeet = Math.round((coords.radius / pixelsPerFoot) * 10) / 10;
    const diameterInFeet = Math.round(radiusInFeet * 2 * 10) / 10;

    // Calculate responsive font size based on zoom (but not for responsive mode)
    const baseFontSize = 12;
    const fontSize = this.args.isResponsive
      ? baseFontSize
      : baseFontSize / this.zoomScale;
    const offsetScale = this.args.isResponsive ? 1 : 1 / this.zoomScale;

    // Diameter dimension (horizontal through center)
    group
      .append('text')
      .attr('x', coords.cx)
      .attr('y', coords.cy - 2.5 * offsetScale)
      .attr('text-anchor', 'middle')
      .attr('font-size', `${fontSize}px`)
      .attr('font-weight', 'bold')
      .attr('fill', '#666')
      .attr('stroke', 'white')
      .attr('stroke-width', 2 * offsetScale)
      .attr('paint-order', 'stroke')
      .text(`⌀${diameterInFeet}'`);

    // Radius dimension (smaller text below)
    group
      .append('text')
      .attr('x', coords.cx)
      .attr('y', coords.cy + 5 * offsetScale)
      .attr('text-anchor', 'middle')
      .attr('font-size', `${fontSize * 0.8}px`)
      .attr('font-weight', 'bold')
      .attr('fill', '#888')
      .attr('stroke', 'white')
      .attr('stroke-width', 1.5 * offsetScale)
      .attr('paint-order', 'stroke')
      .text(`r=${radiusInFeet}'`);
  }

  @action
  addPolygonDimensions(group, shape) {
    const coords = shape.coordinates;
    const pixelsPerFoot = this.gridSize;

    // Calculate responsive font size based on zoom (but not for responsive mode)
    const baseFontSize = 10;
    const fontSize = this.args.isResponsive
      ? baseFontSize
      : baseFontSize / this.zoomScale;
    const offsetScale = this.args.isResponsive ? 1 : 1 / this.zoomScale;

    // Calculate polygon centroid for reference
    const centroid = this.getPolygonCentroid(coords.points);

    // Add dimensions for each edge
    coords.points.forEach((point, index) => {
      const nextIndex = (index + 1) % coords.points.length;
      const nextPoint = coords.points[nextIndex];

      // Calculate edge length
      const edgeLength = Math.sqrt(
        Math.pow(nextPoint.x - point.x, 2) + Math.pow(nextPoint.y - point.y, 2),
      );
      const edgeLengthInFeet =
        Math.round((edgeLength / pixelsPerFoot) * 10) / 10;

      // Calculate midpoint of edge
      const midX = (point.x + nextPoint.x) / 2;
      const midY = (point.y + nextPoint.y) / 2;

      // Calculate angle of edge for text rotation
      const angle =
        (Math.atan2(nextPoint.y - point.y, nextPoint.x - point.x) * 180) /
        Math.PI;

      // Calculate perpendicular vector pointing inward
      const edgeVecX = nextPoint.x - point.x;
      const edgeVecY = nextPoint.y - point.y;
      const edgeLength2 = Math.sqrt(edgeVecX * edgeVecX + edgeVecY * edgeVecY);

      // Perpendicular vector (rotated 90 degrees)
      const perpX = -edgeVecY / edgeLength2;
      const perpY = edgeVecX / edgeLength2;

      // Check if this perpendicular points toward centroid
      const toCentroidX = centroid.x - midX;
      const toCentroidY = centroid.y - midY;
      const dotProduct = perpX * toCentroidX + perpY * toCentroidY;

      // If dot product is negative, flip the perpendicular to point inward
      const inwardX = dotProduct >= 0 ? perpX : -perpX;
      const inwardY = dotProduct >= 0 ? perpY : -perpY;

      // Offset the text inward by a small amount (further inside during editing mode)
      const baseOffset = this.args.isResponsive ? 6 : 10;
      const offset = baseOffset * offsetScale;
      const textX = midX + inwardX * offset;
      const textY = midY + inwardY * offset;

      // Add dimension text inside the polygon
      group
        .append('text')
        .attr('x', textX)
        .attr('y', textY)
        .attr('text-anchor', 'middle')
        .attr('font-size', `${fontSize}px`)
        .attr('font-weight', 'bold')
        .attr('fill', '#666')
        .attr('stroke', 'white')
        .attr('stroke-width', 1.5 * offsetScale)
        .attr('paint-order', 'stroke')
        .attr('transform', `rotate(${angle}, ${textX}, ${textY})`)
        .text(`${edgeLengthInFeet}'`);
    });
  }

  /**
   * Add midpoint handles for vertex insertion on edges
   */
  @action
  addMidpointHandles(group, shape, points) {
    const handleSize = 8 / this.zoomScale;

    // Loop through each edge
    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      const nextIndex = (i + 1) % points.length;
      const nextPoint = points[nextIndex];

      // Calculate midpoint
      const midX = (point.x + nextPoint.x) / 2;
      const midY = (point.y + nextPoint.y) / 2;

      // Add red box handle at midpoint
      const handle = group
        .append('rect')
        .attr('class', 'midpoint-handle')
        .attr('x', midX - handleSize / 2)
        .attr('y', midY - handleSize / 2)
        .attr('width', handleSize)
        .attr('height', handleSize)
        .attr('fill', '#ff0000')
        .attr('stroke', 'white')
        .attr('stroke-width', 1.5 / this.zoomScale)
        .attr('cursor', 'pointer')
        .style('opacity', 0.7);

      // Add click handler to insert vertex
      handle.on('click', (event) => {
        event.stopPropagation();
        this.insertVertexAtMidpoint(shape, i, midX, midY);
      });

      // Add hover effects
      handle.on('mouseenter', function () {
        d3.select(this).style('opacity', 1).attr('fill', '#ff3333');
      });
      handle.on('mouseleave', function () {
        d3.select(this).style('opacity', 0.7).attr('fill', '#ff0000');
      });
    }
  }

  /**
   * Add arc edit handles (red boxes at arc peaks) for edges with bulges
   */
  @action
  addArcEditHandles(group, shape, points) {
    const arcOffsetScale = this.args.isResponsive ? 1 : 1 / this.zoomScale;

    // Loop through each edge to check for arcs
    for (let i = 0; i < points.length; i++) {
      const currentPoint = points[i];
      const nextIndex = (i + 1) % points.length;
      const nextPoint = points[nextIndex];

      // Only add handle if this edge has a bulge (is an arc)
      if (currentPoint.bulge && Math.abs(currentPoint.bulge) > 0.0001) {
        const arcParams = this.calculateArcFromBulge(
          currentPoint,
          nextPoint,
          currentPoint.bulge,
        );

        // Calculate midpoint of chord
        const midX = (currentPoint.x + nextPoint.x) / 2;
        const midY = (currentPoint.y + nextPoint.y) / 2;

        // Calculate perpendicular direction
        const dx = nextPoint.x - currentPoint.x;
        const dy = nextPoint.y - currentPoint.y;
        const perpX = -dy / arcParams.chordLength;
        const perpY = dx / arcParams.chordLength;

        // Determine direction based on bulge sign
        const direction = currentPoint.bulge > 0 ? -1 : 1;

        // Position handle at arc apex
        const handleSize = 8 * arcOffsetScale;
        const handleX = midX + perpX * arcParams.sagitta * direction;
        const handleY = midY + perpY * arcParams.sagitta * direction;

        // Add red box handle
        const handle = group
          .append('rect')
          .attr('class', 'arc-edit-handle')
          .attr('x', handleX - handleSize / 2)
          .attr('y', handleY - handleSize / 2)
          .attr('width', handleSize)
          .attr('height', handleSize)
          .attr('fill', '#ff4444')
          .attr('stroke', 'white')
          .attr('stroke-width', 1.5 * arcOffsetScale)
          .attr('cursor', 'pointer');

        // Add click handler
        handle.on('click', (event) => {
          event.stopPropagation();
          this.handleArcHandleClick(shape, i);
        });

        // Add hover effects
        handle.on('mouseenter', function () {
          d3.select(this).attr('fill', '#ff6666');
        });
        handle.on('mouseleave', function () {
          d3.select(this).attr('fill', '#ff4444');
        });
      }
    }
  }

  @action
  addShapeLabels(group, shape) {
    const coords = shape.coordinates;
    let labelX, labelY;

    // Calculate responsive font sizes based on zoom (but not for responsive mode)
    const areaFontSize = this.args.isResponsive ? 14 : 14 / this.zoomScale;
    const descFontSize = this.args.isResponsive ? 11 : 11 / this.zoomScale;
    const offsetScale = this.args.isResponsive ? 1 : 1 / this.zoomScale;

    // Calculate label position based on shape type
    switch (shape.type) {
      case 'rectangle':
        labelX = coords.x + coords.width / 2;
        labelY = coords.y + coords.height / 2;
        break;
      case 'circle':
        labelX = coords.cx;
        labelY = coords.cy;
        break;
      case 'polygon':
        const centroid = this.getPolygonCentroid(coords.points);
        labelX = centroid.x;
        labelY = centroid.y;
        break;
      case 'arc':
        labelX = coords.cx;
        labelY = coords.cy;
        break;
      default:
        return;
    }

    // Add area label with zoom-responsive styling
    if (shape.area) {
      group
        .append('text')
        .attr('x', labelX)
        .attr('y', labelY - 2.5 * offsetScale)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .attr('font-size', `${areaFontSize}px`)
        .attr('font-weight', 'bold')
        .attr('fill', '#007bff')
        .attr('stroke', 'white')
        .attr('stroke-width', 2 * offsetScale)
        .attr('paint-order', 'stroke')
        .text(`${Math.round(shape.area)} sf`);
    }

    // Add descriptions label with zoom-responsive styling
    if (shape.descriptions && shape.descriptions.length > 0) {
      // Handle both old (string) and new (object) formats
      const descriptionsText = shape.descriptions
        .map((desc) => {
          if (typeof desc === 'string') {
            return desc; // Old format: description is a string
          } else if (desc && desc.label) {
            return desc.label; // New format: description is an object with label
          }
          return ''; // Fallback for invalid descriptions
        })
        .filter(Boolean)
        .join(', ');

      group
        .append('text')
        .attr('x', labelX)
        .attr('y', labelY + 10 * offsetScale)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .attr('font-size', `${descFontSize}px`)
        .attr('font-weight', '600')
        .attr('fill', '#333')
        .attr('stroke', 'white')
        .attr('stroke-width', 1.5 * offsetScale)
        .attr('paint-order', 'stroke')
        .text(descriptionsText);
    }
  }

  @action
  addVertexHandles(group, shape) {
    const coords = shape.coordinates;
    const handleSize = 6 / this.zoomScale;

    switch (shape.type) {
      case 'rectangle':
        // Add handles at all four corners
        const corners = [
          { x: coords.x, y: coords.y, type: 'top-left', index: 0 },
          {
            x: coords.x + coords.width,
            y: coords.y,
            type: 'top-right',
            index: 1,
          },
          {
            x: coords.x + coords.width,
            y: coords.y + coords.height,
            type: 'bottom-right',
            index: 2,
          },
          {
            x: coords.x,
            y: coords.y + coords.height,
            type: 'bottom-left',
            index: 3,
          },
        ];

        corners.forEach((corner) => {
          this.addDraggableHandle(
            group,
            corner.x,
            corner.y,
            handleSize,
            shape,
            'rectangle',
            corner.index,
            corner.type,
          );
        });

        // Add midpoint handles for vertex insertion
        const { x, y, width, height } = coords;
        const rectPoints = [
          { x, y },
          { x: x + width, y },
          { x: x + width, y: y + height },
          { x, y: y + height },
        ];
        this.addMidpointHandles(group, shape, rectPoints);
        break;

      case 'circle':
        // Add handles at cardinal points
        const cardinalPoints = [
          {
            x: coords.cx,
            y: coords.cy - coords.radius,
            type: 'north',
            index: 0,
          },
          {
            x: coords.cx + coords.radius,
            y: coords.cy,
            type: 'east',
            index: 1,
          },
          {
            x: coords.cx,
            y: coords.cy + coords.radius,
            type: 'south',
            index: 2,
          },
          {
            x: coords.cx - coords.radius,
            y: coords.cy,
            type: 'west',
            index: 3,
          },
        ];

        cardinalPoints.forEach((point) => {
          this.addDraggableHandle(
            group,
            point.x,
            point.y,
            handleSize,
            shape,
            'circle',
            point.index,
            point.type,
          );
        });
        break;

      case 'polygon':
        // Add handles at all polygon vertices
        coords.points.forEach((point, index) => {
          this.addDraggableHandle(
            group,
            point.x,
            point.y,
            handleSize,
            shape,
            'polygon',
            index,
            'vertex',
          );
        });

        // Add midpoint handles for vertex insertion
        this.addMidpointHandles(group, shape, coords.points);

        // Add arc edit handles for edges with bulges
        this.addArcEditHandles(group, shape, coords.points);
        break;

      case 'arc':
        // Add handles at start, end, and center
        const startX = coords.cx + coords.radius * Math.cos(coords.startAngle);
        const startY = coords.cy + coords.radius * Math.sin(coords.startAngle);
        const endX = coords.cx + coords.radius * Math.cos(coords.endAngle);
        const endY = coords.cy + coords.radius * Math.sin(coords.endAngle);

        const arcPoints = [
          { x: coords.cx, y: coords.cy, type: 'center', index: 0 },
          { x: startX, y: startY, type: 'start', index: 1 },
          { x: endX, y: endY, type: 'end', index: 2 },
        ];

        arcPoints.forEach((point) => {
          this.addDraggableHandle(
            group,
            point.x,
            point.y,
            handleSize,
            shape,
            'arc',
            point.index,
            point.type,
          );
        });
        break;
    }
  }

  @action
  addDraggableHandle(group, x, y, size, shape, shapeType, index, handleType) {
    const handle = group
      .append('rect')
      .attr('class', 'vertex-handle')
      .attr('x', x - size / 2)
      .attr('y', y - size / 2)
      .attr('width', size)
      .attr('height', size)
      .attr('fill', 'red')
      .attr('stroke', 'white')
      .attr('stroke-width', 1 / this.zoomScale)
      .style('cursor', 'move');

    // Create drag behavior
    const drag = d3
      .drag()
      .on('start', (event) => {
        event.sourceEvent.stopPropagation();
        handle.attr('fill', '#ff4444'); // Darker red during drag
      })
      .on('drag', (event) => {
        // Get drag position relative to the content group (accounting for zoom/pan)
        const [dragX, dragY] = d3.pointer(event, this.contentGroup.node());

        // Apply snap-to-grid
        const snappedPoint = this.snapToGridPoint(dragX, dragY);

        // Update handle position
        handle
          .attr('x', snappedPoint.x - size / 2)
          .attr('y', snappedPoint.y - size / 2);

        // Update shape coordinates
        this.updateShapeVertex(
          shape,
          shapeType,
          index,
          handleType,
          snappedPoint.x,
          snappedPoint.y,
        );

        // Re-render the shape with new coordinates
        this.renderShapes();
      })
      .on('end', (event) => {
        event.sourceEvent.stopPropagation();
        handle.attr('fill', 'red'); // Return to normal color

        // Notify parent component of shape change
        if (this.args.onShapeSelect) {
          this.args.onShapeSelect(shape);
        }
      });

    handle.call(drag);

    // Prevent click event from propagating
    handle.on('click', (event) => {
      event.stopPropagation();
    });
  }

  @action
  updateShapeVertex(shape, shapeType, index, handleType, newX, newY) {
    const coords = shape.coordinates;

    switch (shapeType) {
      case 'rectangle':
        // Update rectangle based on which corner is being dragged
        switch (handleType) {
          case 'top-left':
            const newWidth = coords.x + coords.width - newX;
            const newHeight = coords.y + coords.height - newY;
            if (newWidth > 0 && newHeight > 0) {
              coords.width = newWidth;
              coords.height = newHeight;
              coords.x = newX;
              coords.y = newY;
            }
            break;
          case 'top-right':
            const newWidth2 = newX - coords.x;
            const newHeight2 = coords.y + coords.height - newY;
            if (newWidth2 > 0 && newHeight2 > 0) {
              coords.width = newWidth2;
              coords.height = newHeight2;
              coords.y = newY;
            }
            break;
          case 'bottom-right':
            const newWidth3 = newX - coords.x;
            const newHeight3 = newY - coords.y;
            if (newWidth3 > 0 && newHeight3 > 0) {
              coords.width = newWidth3;
              coords.height = newHeight3;
            }
            break;
          case 'bottom-left':
            const newWidth4 = coords.x + coords.width - newX;
            const newHeight4 = newY - coords.y;
            if (newWidth4 > 0 && newHeight4 > 0) {
              coords.width = newWidth4;
              coords.height = newHeight4;
              coords.x = newX;
            }
            break;
        }
        // Recalculate area
        shape.area =
          (coords.width * coords.height) / (this.gridSize * this.gridSize);
        break;

      case 'circle':
        // Update circle radius based on distance from center
        const centerX = coords.cx;
        const centerY = coords.cy;
        const newRadius = Math.sqrt(
          Math.pow(newX - centerX, 2) + Math.pow(newY - centerY, 2),
        );
        const snappedRadius = this.snapToGridDistance(newRadius);
        coords.radius = snappedRadius;
        // Recalculate area
        shape.area =
          (Math.PI * snappedRadius * snappedRadius) /
          (this.gridSize * this.gridSize);
        break;

      case 'polygon':
        // Update specific vertex
        if (coords.points[index]) {
          coords.points[index].x = newX;
          coords.points[index].y = newY;
          // Recalculate area
          shape.area =
            this.calculatePolygonArea(coords.points) /
            (this.gridSize * this.gridSize);
        }
        break;

      case 'arc':
        // Update arc based on handle type
        switch (handleType) {
          case 'center':
            coords.cx = newX;
            coords.cy = newY;
            break;
          case 'start':
            coords.startAngle = Math.atan2(newY - coords.cy, newX - coords.cx);
            break;
          case 'end':
            coords.endAngle = Math.atan2(newY - coords.cy, newX - coords.cx);
            break;
        }
        break;
    }
  }

  @action
  handleCanvasClick(event) {
    console.log(
      'Canvas clicked! Drawing mode:',
      this.args.drawingMode,
      'Arc mode step:',
      this.arcModeStep,
    );

    // Get the pointer coordinates relative to the contentGroup (accounting for zoom/pan)
    const [rawX, rawY] = d3.pointer(event, this.contentGroup.node());
    const { x, y } = this.snapToGridPoint(rawX, rawY);

    console.log('Click position:', { x, y });

    // Show visual feedback for snap
    this.showSnapFeedback(x, y);

    // Handle arc mode (3-click workflow for adding arcs to polygon edges)
    // Continue arc mode workflow if already started, even if drawing mode was cleared
    if (this.args.drawingMode === 'arc-segment' || this.arcModeStep > 0) {
      console.log('Routing to handleArcModeClick');
      this.handleArcModeClick(x, y);
      return;
    }

    if (!this.args.drawingMode) return;

    switch (this.args.drawingMode) {
      case 'rectangle':
        this.startRectangle(x, y);
        break;
      case 'circle':
        this.startCircle(x, y);
        break;
      case 'polygon':
        this.addPolygonPoint(x, y);
        break;
      case 'arc':
        this.startArc(x, y);
        break;
    }
  }

  /**
   * Handle 3-click arc mode workflow
   * Click 1: Select arc start edge (inserts vertex)
   * Click 2: Select arc end edge (inserts vertex)
   * Click 3: Set arc radius/bulge (click position determines bulge and direction)
   */
  @action
  handleArcModeClick(x, y) {
    if (this.arcModeStep === 0) {
      // Click 1: Find and mark arc start edge
      const edge = this.findClickedEdge(x, y);
      if (!edge) {
        console.log(
          'No edge clicked. Click on a polygon or rectangle edge to start arc.',
        );
        return;
      }

      // Convert rectangle to polygon if needed
      if (edge.shape.type === 'rectangle') {
        console.log('Converting rectangle to polygon before adding arc');
        this.convertRectangleToPolygon(edge.shape);

        // Re-render to show the converted polygon
        this.renderShapes();

        // Notify parent of shape change
        if (this.args.onShapeSelect) {
          this.args.onShapeSelect(edge.shape);
        }

        console.log('Polygon after conversion:', edge.shape.coordinates.points);
      }

      // Check if this edge already has a bulge (existing arc segment)
      const startVertex = edge.shape.coordinates.points[edge.edgeStartIndex];
      if (
        startVertex &&
        startVertex.bulge !== undefined &&
        Math.abs(startVertex.bulge) > 0.0001
      ) {
        // Edit existing arc segment
        console.log(`Editing existing arc with bulge: ${startVertex.bulge}`);

        // Get the next point to calculate arc parameters
        const nextIndex =
          (edge.edgeStartIndex + 1) % edge.shape.coordinates.points.length;
        const nextVertex = edge.shape.coordinates.points[nextIndex];

        // Calculate sagitta from bulge
        const arcParams = this.calculateArcFromBulge(
          startVertex,
          nextVertex,
          startVertex.bulge,
        );
        const sagittaFeet = arcParams.sagitta / this.gridSize;

        // Store both bulge and sagitta, preserving the sign
        const sign = startVertex.bulge >= 0 ? 1 : -1;

        this.editingArcShape = edge.shape;
        this.editingArcVertexIndex = edge.edgeStartIndex;
        this.editingBulgeValue = startVertex.bulge.toString();
        this.editingSagittaValue = (sagittaFeet * sign).toFixed(2);
        this.showBulgeEditor = true;
        return;
      }

      this.arcStartEdge = edge;
      this.arcShape = edge.shape;

      // Insert vertex at the clicked point on the edge
      this.arcStartVertexIndex = this.insertVertexOnEdge(
        edge.shape,
        edge.edgeStartIndex,
        edge.insertPoint,
      );

      console.log(
        `Arc start vertex inserted at index ${this.arcStartVertexIndex}, position (${edge.insertPoint.x}, ${edge.insertPoint.y})`,
      );

      this.arcModeStep = 1;
      console.log('Arc start set. Click on another edge for arc end.');
    } else if (this.arcModeStep === 1) {
      // Click 2: Find and mark arc end edge
      console.log(
        'Arc mode step 1: Looking for arc end edge at position:',
        x,
        y,
      );
      const edge = this.findClickedEdge(x, y);

      if (!edge) {
        console.log('No edge clicked. Click on a polygon edge for arc end.');
        return;
      }

      console.log('Found edge:', {
        shapeIndex: edge.shapeIndex,
        shapeType: edge.shape.type,
        edgeStartIndex: edge.edgeStartIndex,
        edgeEndIndex: edge.edgeEndIndex,
        insertPoint: edge.insertPoint,
      });
      console.log('Current arc shape type:', this.arcShape.type);
      console.log(
        'Are shapes the same reference?',
        edge.shape === this.arcShape,
      );

      // Must be on the same shape
      if (edge.shape !== this.arcShape) {
        console.log('Arc end must be on the same shape as arc start.');
        console.log('Edge shape:', edge.shape);
        console.log('Arc shape:', this.arcShape);
        return;
      }

      this.arcEndEdge = edge;

      // Insert vertex at the clicked point on the edge
      // Note: indices may have shifted due to first insertion
      console.log('Inserting arc end vertex...');
      this.arcEndVertexIndex = this.insertVertexOnEdge(
        edge.shape,
        edge.edgeStartIndex,
        edge.insertPoint,
      );

      console.log(
        `Arc end vertex inserted at index ${this.arcEndVertexIndex}, position (${edge.insertPoint.x}, ${edge.insertPoint.y})`,
      );

      // Adjust arc start index if the end vertex was inserted before it
      // When we insert a vertex at or before the start index, it shifts the start vertex forward
      // Also track that we reversed the order, which will affect bulge direction
      this.arcIndicesReversed = false;
      if (this.arcEndVertexIndex <= this.arcStartVertexIndex) {
        console.log(
          `Arc end was inserted before start. Adjusting start index from ${this.arcStartVertexIndex} to ${this.arcStartVertexIndex + 1}`,
        );
        this.arcStartVertexIndex = this.arcStartVertexIndex + 1;
        this.arcIndicesReversed = true;
        console.log(
          '⚠️ Arc indices reversed - will need to negate bulge for correct direction',
        );
      }

      console.log(
        `Final indices: start=${this.arcStartVertexIndex}, end=${this.arcEndVertexIndex}, reversed=${this.arcIndicesReversed}`,
      );

      this.arcModeStep = 2;
      console.log('Arc end set. Click to set the arc radius and direction.');
    } else if (this.arcModeStep === 2) {
      // Click 3: Calculate and apply bulge
      const points = this.arcShape.coordinates.points;

      // Get the actual vertex positions (they may have moved due to insertions)
      const startPoint = points[this.arcStartVertexIndex];
      const endPoint = points[this.arcEndVertexIndex];

      if (!startPoint || !endPoint) {
        console.error('Arc vertices not found');
        this.resetArcMode();
        return;
      }

      // Validate that start and end points are different
      const dx = endPoint.x - startPoint.x;
      const dy = endPoint.y - startPoint.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < 1) {
        console.error('Arc start and end points are too close together');
        alert(
          'Arc start and end points must be at different positions. Please try again.',
        );
        this.resetArcMode();
        return;
      }

      console.log(
        `Arc points: Start(${startPoint.x}, ${startPoint.y}) End(${endPoint.x}, ${endPoint.y}) Distance: ${distance}`,
      );
      console.log(`Arc indices reversed: ${this.arcIndicesReversed}`);

      // Determine which vertices to use for bulge calculation and application
      // The bulge must always be applied to the EARLIER vertex in polygon order
      let bulgeStartPoint, bulgeEndPoint, bulgeVertexIndex;

      if (this.arcIndicesReversed) {
        // When reversed, endVertexIndex is actually earlier in polygon order
        bulgeStartPoint = endPoint;
        bulgeEndPoint = startPoint;
        bulgeVertexIndex = this.arcEndVertexIndex;
        console.log(
          `Using reversed order: bulge from index ${this.arcEndVertexIndex} to ${this.arcStartVertexIndex}`,
        );
      } else {
        // Normal order
        bulgeStartPoint = startPoint;
        bulgeEndPoint = endPoint;
        bulgeVertexIndex = this.arcStartVertexIndex;
        console.log(
          `Using normal order: bulge from index ${this.arcStartVertexIndex} to ${this.arcEndVertexIndex}`,
        );
      }

      // Calculate bulge from cursor position
      const bulge = this.calculateBulgeFromPoint(
        bulgeStartPoint,
        bulgeEndPoint,
        {
          x,
          y,
        },
      );

      // Apply bulge to the correct vertex (the earlier one in polygon order)
      points[bulgeVertexIndex].bulge = bulge;

      console.log(
        `Arc created with bulge: ${bulge} at vertex index ${bulgeVertexIndex}`,
      );

      // Recalculate area
      this.arcShape.area =
        this.calculatePolygonArea(points) / (this.gridSize * this.gridSize);

      // Trigger re-render
      this.renderShapes();

      // Notify parent of shape change
      if (this.args.onShapeSelect) {
        this.args.onShapeSelect(this.arcShape);
      }

      // Reset arc mode
      this.resetArcMode();
    }
  }

  /**
   * Reset arc mode state
   */
  @action
  resetArcMode() {
    this.arcModeStep = 0;
    this.arcStartEdge = null;
    this.arcEndEdge = null;
    this.arcStartVertexIndex = null;
    this.arcEndVertexIndex = null;
    this.arcShape = null;
    this.arcIndicesReversed = false;
  }

  /**
   * Save the edited sagitta value (convert to bulge)
   */
  @action
  saveBulgeEdit() {
    if (!this.editingArcShape || this.editingArcVertexIndex === null) {
      return;
    }

    const sagittaFeet = parseFloat(this.editingSagittaValue);
    if (isNaN(sagittaFeet)) {
      alert('Please enter a valid number for the arc depth');
      return;
    }

    // Convert sagitta from feet to pixels
    const sagittaPixels = Math.abs(sagittaFeet) * this.gridSize;
    const sign = sagittaFeet >= 0 ? 1 : -1;

    // Get the current vertex and next vertex to calculate chord length
    const points = this.editingArcShape.coordinates.points;
    const vertex = points[this.editingArcVertexIndex];
    const nextIndex = (this.editingArcVertexIndex + 1) % points.length;
    const nextVertex = points[nextIndex];

    if (vertex && nextVertex) {
      // Calculate chord length
      const dx = nextVertex.x - vertex.x;
      const dy = nextVertex.y - vertex.y;
      const chordLength = Math.sqrt(dx * dx + dy * dy);

      // Calculate bulge from sagitta and chord length
      // Formula: radius = (sagitta^2 + (chord/2)^2) / (2 * sagitta)
      // Then: angle = 2 * asin(chord / (2*radius))
      // Finally: bulge = tan(angle/4)

      if (sagittaPixels < 0.01) {
        // Sagitta too small, treat as straight line
        vertex.bulge = 0;
      } else {
        const radius =
          (sagittaPixels * sagittaPixels +
            (chordLength / 2) * (chordLength / 2)) /
          (2 * sagittaPixels);
        const includedAngle = 2 * Math.asin(chordLength / (2 * radius));
        const bulge = Math.tan(includedAngle / 4);

        // Apply the sign
        vertex.bulge = bulge * sign;

        console.log(
          `Converted sagitta ${sagittaFeet}ft to bulge ${vertex.bulge}`,
        );
      }

      // Recalculate area
      this.editingArcShape.area =
        this.calculatePolygonArea(points) / (this.gridSize * this.gridSize);

      // Trigger re-render
      this.renderShapes();

      // Notify parent of shape change
      if (this.args.onShapeSelect) {
        this.args.onShapeSelect(this.editingArcShape);
      }
    }

    // Close editor
    this.closeBulgeEditor();
  }

  /**
   * Handle click on arc edit handle (red box at arc peak)
   */
  @action
  handleArcHandleClick(shape, vertexIndex) {
    const points = shape.coordinates.points;
    const vertex = points[vertexIndex];

    if (
      vertex &&
      vertex.bulge !== undefined &&
      Math.abs(vertex.bulge) > 0.0001
    ) {
      // Get the next point to calculate arc parameters
      const nextIndex = (vertexIndex + 1) % points.length;
      const nextVertex = points[nextIndex];

      // Calculate sagitta from bulge
      const arcParams = this.calculateArcFromBulge(
        vertex,
        nextVertex,
        vertex.bulge,
      );
      const sagittaFeet = arcParams.sagitta / this.gridSize;

      // Store both bulge and sagitta, preserving the sign
      const sign = vertex.bulge >= 0 ? 1 : -1;

      this.editingArcShape = shape;
      this.editingArcVertexIndex = vertexIndex;
      this.editingBulgeValue = vertex.bulge.toString();
      this.editingSagittaValue = (sagittaFeet * sign).toFixed(2);
      this.showBulgeEditor = true;
      console.log(
        `Opening arc editor for vertex ${vertexIndex}: bulge=${vertex.bulge}, sagitta=${sagittaFeet}ft`,
      );
    }
  }

  /**
   * Cancel bulge editing
   */
  @action
  closeBulgeEditor() {
    this.showBulgeEditor = false;
    this.editingArcShape = null;
    this.editingArcVertexIndex = null;
    this.editingBulgeValue = '';
    this.editingSagittaValue = '';
  }

  /**
   * Update the sagitta (arc depth) value being edited
   */
  @action
  updateSagittaValue(event) {
    this.editingSagittaValue = event.target.value;
  }

  /**
   * Stop event propagation (for modal clicks)
   */
  @action
  stopPropagation(event) {
    event.stopPropagation();
  }

  // Method to cancel current drawing (called from parent)
  @action
  cancelCurrentDrawing() {
    this.isDrawing = false;
    this.drawingShape = null;

    // Reset arc mode state
    this.resetArcMode();

    // Remove any drawing preview
    if (this.contentGroup) {
      this.contentGroup.select('.drawing-preview').remove();
      this.contentGroup.select('.arc-preview').remove();
      this.contentGroup.select('.edge-highlight').remove();
    }
  }

  // Method to start a new shape (called from parent)
  @action
  startNewDrawing() {
    this.cancelCurrentDrawing(); // Clear any existing drawing state
  }

  @action
  showSnapFeedback(x, y) {
    // Remove existing feedback
    this.contentGroup.select('.snap-feedback').remove();

    if (this.snapToGrid) {
      // Add temporary visual feedback for snap point
      this.contentGroup
        .append('circle')
        .attr('class', 'snap-feedback')
        .attr('cx', x)
        .attr('cy', y)
        .attr('r', 4)
        .attr('fill', '#007bff')
        .attr('stroke', '#fff')
        .attr('stroke-width', 2)
        .style('pointer-events', 'none')
        .transition()
        .duration(300)
        .attr('r', 8)
        .attr('opacity', 0)
        .remove();
    }
  }

  @action
  addDrawingDimensions(group, x, y, width, height) {
    // Convert pixels to feet (10 pixels = 1 foot for house sketching)
    const pixelsPerFoot = this.gridSize;
    const widthInFeet = Math.round((width / pixelsPerFoot) * 10) / 10; // Round to 1 decimal
    const heightInFeet = Math.round((height / pixelsPerFoot) * 10) / 10;

    // Width dimension (top of rectangle)
    if (width > 0) {
      group
        .append('text')
        .attr('x', x + width / 2)
        .attr('y', y - 5)
        .attr('text-anchor', 'middle')
        .attr('font-size', '12px')
        .attr('font-weight', 'bold')
        .attr('fill', '#007bff')
        .attr('stroke', '#fff')
        .attr('stroke-width', 3)
        .attr('paint-order', 'stroke')
        .text(`${widthInFeet}'`);
    }

    // Height dimension (right side of rectangle)
    if (height > 0) {
      group
        .append('text')
        .attr('x', x + width + 5)
        .attr('y', y + height / 2)
        .attr('text-anchor', 'start')
        .attr('dominant-baseline', 'middle')
        .attr('font-size', '12px')
        .attr('font-weight', 'bold')
        .attr('fill', '#007bff')
        .attr('stroke', '#fff')
        .attr('stroke-width', 3)
        .attr('paint-order', 'stroke')
        .text(`${heightInFeet}'`);
    }
  }

  @action
  startRectangle(x, y) {
    if (!this.isDrawing) {
      this.isDrawing = true;
      this.drawingShape = { startX: x, startY: y };
    } else {
      // Finish rectangle with snapped dimensions
      const snappedWidth = this.snapToGridDistance(
        Math.abs(x - this.drawingShape.startX),
      );
      const snappedHeight = this.snapToGridDistance(
        Math.abs(y - this.drawingShape.startY),
      );

      // Determine rectangle position based on drag direction
      const rectX =
        x < this.drawingShape.startX
          ? this.drawingShape.startX - snappedWidth
          : this.drawingShape.startX;
      const rectY =
        y < this.drawingShape.startY
          ? this.drawingShape.startY - snappedHeight
          : this.drawingShape.startY;

      const newShape = {
        type: 'rectangle',
        coordinates: {
          x: rectX,
          y: rectY,
          width: snappedWidth,
          height: snappedHeight,
        },
        area: (snappedWidth * snappedHeight) / (this.gridSize * this.gridSize), // Convert pixels to square feet
      };

      this.args.onShapeAdd?.(newShape);
      this.isDrawing = false;
      this.drawingShape = null;

      // Clear any drawing preview
      this.contentGroup?.select('.drawing-preview').remove();
    }
  }

  @action
  startCircle(x, y) {
    if (!this.isDrawing) {
      this.isDrawing = true;
      this.drawingShape = { centerX: x, centerY: y };
    } else {
      // Finish circle with snapped radius
      const rawRadius = Math.sqrt(
        Math.pow(x - this.drawingShape.centerX, 2) +
          Math.pow(y - this.drawingShape.centerY, 2),
      );
      const snappedRadius = this.snapToGridDistance(rawRadius);

      const newShape = {
        type: 'circle',
        coordinates: {
          cx: this.drawingShape.centerX,
          cy: this.drawingShape.centerY,
          radius: snappedRadius,
        },
        area:
          (Math.PI * snappedRadius * snappedRadius) /
          (this.gridSize * this.gridSize), // Convert to square feet
      };

      this.args.onShapeAdd?.(newShape);
      this.isDrawing = false;
      this.drawingShape = null;
    }
  }

  @action
  addPolygonPoint(x, y) {
    if (!this.isDrawing) {
      this.isDrawing = true;
      this.drawingShape = { points: [{ x, y }] };
    } else {
      // Apply 90-degree constraint if shift is held
      const lastPoint =
        this.drawingShape.points[this.drawingShape.points.length - 1];
      const constrainedPoint = this.constrainToRightAngles(x, y, lastPoint);
      this.drawingShape.points.push({
        x: constrainedPoint.x,
        y: constrainedPoint.y,
      });
    }
  }

  @action
  finishPolygon() {
    if (this.drawingShape && this.drawingShape.points.length >= 3) {
      const area =
        this.calculatePolygonArea(this.drawingShape.points) /
        (this.gridSize * this.gridSize);

      const newShape = {
        type: 'polygon',
        coordinates: {
          points: this.drawingShape.points,
        },
        area: area,
      };

      this.args.onShapeAdd?.(newShape);
      this.isDrawing = false;
      this.drawingShape = null;

      // Remove drawing preview
      this.contentGroup.select('.drawing-preview').remove();

      // Call the parent's finish polygon callback
      this.args.onFinishPolygon?.();
    }
  }

  @action
  calculatePolygonArea(points) {
    let area = 0;
    const n = points.length;

    // Calculate base polygon area using Shoelace formula (treating all edges as straight)
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      area += points[i].x * points[j].y;
      area -= points[j].x * points[i].y;
    }

    let baseArea = Math.abs(area) / 2;

    // Add/subtract circular segment areas for edges with bulge
    let arcAreaAdjustment = 0;

    for (let i = 0; i < n; i++) {
      const currentPoint = points[i];
      const nextIndex = (i + 1) % n;
      const nextPoint = points[nextIndex];

      // Check if this edge has an arc (bulge)
      if (currentPoint.bulge && Math.abs(currentPoint.bulge) > 0.0001) {
        const arcParams = this.calculateArcFromBulge(
          currentPoint,
          nextPoint,
          currentPoint.bulge,
        );

        // Calculate circular segment area
        // A_segment = (r²/2) * (θ - sin(θ))
        const segmentArea =
          ((arcParams.radius * arcParams.radius) / 2) *
          (arcParams.includedAngle - Math.sin(arcParams.includedAngle));

        // Positive bulge = arc curves outward (add area)
        // Negative bulge = arc curves inward (subtract area)
        arcAreaAdjustment +=
          currentPoint.bulge > 0 ? segmentArea : -segmentArea;
      }
    }

    return baseArea + arcAreaAdjustment;
  }

  @action
  getPolygonCentroid(points) {
    let cx = 0,
      cy = 0;
    points.forEach((point) => {
      cx += point.x;
      cy += point.y;
    });

    return {
      x: cx / points.length,
      y: cy / points.length,
    };
  }

  /**
   * Find if a click is on a polygon edge (line segment)
   * Returns edge info if clicked within threshold distance, null otherwise
   * @param {number} clickX - X coordinate of click
   * @param {number} clickY - Y coordinate of click
   * @param {number} threshold - Maximum distance from edge (default: 8 pixels)
   * @returns {object|null} - { shapeIndex, shape, edgeStartIndex, edgeEndIndex, insertPoint, distance }
   */
  @action
  findClickedEdge(clickX, clickY, threshold = 8) {
    const shapes = this.args.shapes || [];
    let closestEdge = null;
    let minDistance = threshold;

    shapes.forEach((shape, shapeIndex) => {
      let points = [];

      // Get points based on shape type
      if (shape.type === 'polygon') {
        points = shape.coordinates.points;
        if (!points || points.length < 2) return;
      } else if (shape.type === 'rectangle') {
        // Convert rectangle to points for edge detection
        const { x, y, width, height } = shape.coordinates;
        points = [
          { x, y },
          { x: x + width, y },
          { x: x + width, y: y + height },
          { x, y: y + height },
        ];
      } else {
        return; // Skip other shape types
      }

      // Check each edge
      for (let i = 0; i < points.length; i++) {
        const startPoint = points[i];
        const endIndex = (i + 1) % points.length;
        const endPoint = points[endIndex];

        // Calculate perpendicular distance from click to line segment
        const result = this.pointToSegmentDistance(
          clickX,
          clickY,
          startPoint.x,
          startPoint.y,
          endPoint.x,
          endPoint.y,
        );

        if (result.distance < minDistance) {
          minDistance = result.distance;
          closestEdge = {
            shapeIndex,
            shape,
            edgeStartIndex: i,
            edgeEndIndex: endIndex,
            insertPoint: result.closestPoint,
            distance: result.distance,
          };
        }
      }
    });

    return closestEdge;
  }

  /**
   * Convert a rectangle to a polygon
   * @param {object} shape - Rectangle shape to convert
   * @returns {object} - Updated shape as polygon
   */
  @action
  convertRectangleToPolygon(shape) {
    if (shape.type !== 'rectangle') {
      return shape;
    }

    const { x, y, width, height } = shape.coordinates;

    // Create polygon points from rectangle (clockwise from top-left)
    const points = [
      { x, y },
      { x: x + width, y },
      { x: x + width, y: y + height },
      { x, y: y + height },
    ];

    // Update shape to polygon
    shape.type = 'polygon';
    shape.coordinates = { points };

    // Recalculate area (should be same as rectangle area)
    shape.area =
      this.calculatePolygonArea(points) / (this.gridSize * this.gridSize);

    console.log('Converted rectangle to polygon');

    return shape;
  }

  /**
   * Calculate the distance from a point to a line segment
   * @returns {object} - { distance, closestPoint: {x, y} }
   */
  @action
  pointToSegmentDistance(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSquared = dx * dx + dy * dy;

    if (lengthSquared === 0) {
      // Degenerate segment (start and end are the same point)
      const dist = Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
      return { distance: dist, closestPoint: { x: x1, y: y1 } };
    }

    // Calculate projection parameter t (0 to 1 range represents points on the segment)
    let t = ((px - x1) * dx + (py - y1) * dy) / lengthSquared;
    t = Math.max(0, Math.min(1, t)); // Clamp to segment

    // Calculate closest point on segment
    const closestX = x1 + t * dx;
    const closestY = y1 + t * dy;

    // Calculate distance
    const distance = Math.sqrt((px - closestX) ** 2 + (py - closestY) ** 2);

    return {
      distance,
      closestPoint: { x: closestX, y: closestY },
    };
  }

  /**
   * Insert a new vertex on a polygon edge
   * @param {object} shape - The polygon shape
   * @param {number} afterIndex - Index of the vertex BEFORE the new one (insertion happens after this)
   * @param {object} point - { x, y } coordinates for the new vertex
   * @returns {number} - Index of the newly inserted vertex
   */
  @action
  insertVertexOnEdge(shape, afterIndex, point) {
    console.log('insertVertexOnEdge called with:', {
      shapeType: shape.type,
      afterIndex,
      point,
      currentPointsLength: shape.coordinates.points?.length,
    });

    if (shape.type !== 'polygon') {
      console.error('Can only insert vertices on polygons, got:', shape.type);
      return -1;
    }

    const points = shape.coordinates.points;
    if (!points || afterIndex < 0 || afterIndex >= points.length) {
      console.error('Invalid afterIndex for vertex insertion:', {
        hasPoints: !!points,
        afterIndex,
        pointsLength: points?.length,
      });
      return -1;
    }

    // Apply snap to grid
    const snappedPoint = this.snapToGridPoint(point.x, point.y);
    console.log('Snapped point:', snappedPoint);

    // Insert the new vertex after the specified index
    const newIndex = afterIndex + 1;
    points.splice(newIndex, 0, { x: snappedPoint.x, y: snappedPoint.y });

    console.log(
      'Vertex inserted at index:',
      newIndex,
      'New points length:',
      points.length,
    );

    // Recalculate area
    shape.area =
      this.calculatePolygonArea(points) / (this.gridSize * this.gridSize);

    // Trigger re-render
    this.renderShapes();

    return newIndex;
  }

  /**
   * Insert a new vertex at the midpoint of an edge and enable dragging
   */
  @action
  insertVertexAtMidpoint(shape, edgeIndex, midX, midY) {
    console.log('Inserting vertex at midpoint:', { edgeIndex, midX, midY });

    // Convert rectangle to polygon if needed
    if (shape.type === 'rectangle') {
      shape = this.convertRectangleToPolygon(shape);

      // Notify parent of shape type change
      if (this.args.onShapeSelect) {
        this.args.onShapeSelect(shape);
      }
    }

    // Insert the new vertex
    const newVertexIndex = this.insertVertexOnEdge(shape, edgeIndex, {
      x: midX,
      y: midY,
    });

    if (newVertexIndex === -1) {
      console.error('Failed to insert vertex');
      return;
    }

    console.log('Vertex inserted successfully at index:', newVertexIndex);

    // Enable dragging on the new vertex immediately
    this.enableVertexDragging(shape, newVertexIndex);
  }

  /**
   * Enable dragging behavior for a specific vertex
   */
  @action
  enableVertexDragging(shape, vertexIndex) {
    // Find the vertex handle in the DOM and add drag behavior
    setTimeout(() => {
      const points = shape.coordinates.points;
      if (!points || vertexIndex >= points.length) {
        return;
      }

      const vertex = points[vertexIndex];

      // Create a temporary draggable handle
      const handle = this.contentGroup
        .append('circle')
        .attr('class', 'temp-vertex-handle')
        .attr('cx', vertex.x)
        .attr('cy', vertex.y)
        .attr('r', 6 / this.zoomScale)
        .attr('fill', '#00ff00')
        .attr('stroke', 'white')
        .attr('stroke-width', 2 / this.zoomScale)
        .attr('cursor', 'move')
        .style('pointer-events', 'all');

      // Add drag behavior
      const drag = d3
        .drag()
        .on('drag', (event) => {
          const [rawX, rawY] = [event.x, event.y];
          const snapped = this.snapToGridPoint(rawX, rawY);

          // Update vertex position
          vertex.x = snapped.x;
          vertex.y = snapped.y;

          // Update handle position
          handle.attr('cx', snapped.x).attr('cy', snapped.y);

          // Re-render the shape
          this.renderShapes();
        })
        .on('end', () => {
          // Recalculate area
          shape.area =
            this.calculatePolygonArea(points) / (this.gridSize * this.gridSize);

          // Remove temporary handle
          handle.remove();

          // Final re-render
          this.renderShapes();

          // Notify parent
          if (this.args.onShapeSelect) {
            this.args.onShapeSelect(shape);
          }

          console.log('Vertex drag completed');
        });

      handle.call(drag);
    }, 100); // Small delay to ensure rendering is complete
  }

  /**
   * Calculate bulge factor from cursor position
   * Bulge is a DXF-style parameter: bulge = tan(angle/4)
   * Positive bulge = arc curves to the right (when traveling from start to end)
   * Negative bulge = arc curves to the left
   * @param {object} startPoint - { x, y } start of the chord
   * @param {object} endPoint - { x, y } end of the chord
   * @param {object} cursorPoint - { x, y } cursor position (determines arc height and direction)
   * @returns {number} - bulge factor (tan(angle/4))
   */
  @action
  calculateBulgeFromPoint(startPoint, endPoint, cursorPoint) {
    // Calculate chord length
    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    const chordLength = Math.sqrt(dx * dx + dy * dy);

    if (chordLength === 0) {
      return 0; // Degenerate case
    }

    // Calculate perpendicular distance from cursor to chord (with sign for direction)
    // Use cross product to determine which side of the line the cursor is on
    const crossProduct =
      (cursorPoint.x - startPoint.x) * (endPoint.y - startPoint.y) -
      (cursorPoint.y - startPoint.y) * (endPoint.x - startPoint.x);

    // Calculate perpendicular distance (unsigned)
    const perpDistance = Math.abs(crossProduct) / chordLength;

    // Calculate sagitta (arc height) from perpendicular distance
    // The cursor position gives us the approximate sagitta
    const sagitta = perpDistance;

    // Calculate radius from chord length and sagitta
    // Formula: radius = (sagitta/2) + (chordLength^2 / (8 * sagitta))
    // Increase threshold to prevent Infinity when cursor is very close to chord line
    if (sagitta < 5.0) {
      return 0; // Nearly straight line
    }

    const radius = sagitta / 2 + (chordLength * chordLength) / (8 * sagitta);

    // Calculate the included angle of the arc
    // sin(angle/2) = chordLength / (2 * radius)
    const halfAngle = Math.asin(Math.min(1, chordLength / (2 * radius)));
    const includedAngle = 2 * halfAngle;

    // Calculate bulge = tan(includedAngle / 4)
    let bulge = Math.tan(includedAngle / 4);

    // Apply direction based on cross product sign
    // Positive cross product = cursor is to the right of the chord vector = positive bulge
    // Negative cross product = cursor is to the left of the chord vector = negative bulge
    bulge = crossProduct > 0 ? bulge : -bulge;

    return bulge;
  }

  @action
  handleMouseMove(event) {
    // Handle arc mode edge highlighting
    // IMPORTANT: Check arcModeStep > 0 because drawingMode may be cleared after rectangle->polygon conversion
    if (this.args.drawingMode === 'arc-segment' || this.arcModeStep > 0) {
      if (this.arcModeStep === 2) {
        // Show arc preview for step 3
        this.updateArcPreview(event);
        return;
      } else if (this.arcModeStep === 0 || this.arcModeStep === 1) {
        // Show edge highlighting for steps 1 and 2
        this.updateEdgeHighlight(event);
        return;
      }
    }

    // Handle drawing preview during mouse move
    if (this.isDrawing) {
      this.updateDrawingPreview(event);
    }
  }

  /**
   * Update edge highlight when hovering in arc mode
   */
  @action
  updateEdgeHighlight(event) {
    try {
      // Remove existing highlight
      this.contentGroup.select('.edge-highlight').remove();

      // Get the pointer coordinates
      const [rawX, rawY] = d3.pointer(event, this.contentGroup.node());
      const { x, y } = this.snapToGridPoint(rawX, rawY);

      // Find edge near cursor
      const edge = this.findClickedEdge(x, y, 15); // Larger threshold for hover

      if (!edge) {
        return;
      }

      // Get points based on shape type
      let points = [];
      if (edge.shape.type === 'polygon') {
        points = edge.shape.coordinates.points;
      } else if (edge.shape.type === 'rectangle') {
        // Convert rectangle to points for highlighting
        const { x, y, width, height } = edge.shape.coordinates;
        points = [
          { x, y },
          { x: x + width, y },
          { x: x + width, y: y + height },
          { x, y: y + height },
        ];
      }

      // Validate points array
      if (
        !points ||
        points.length === 0 ||
        edge.edgeStartIndex >= points.length ||
        edge.edgeEndIndex >= points.length
      ) {
        console.warn('Invalid points or edge indices in updateEdgeHighlight');
        return;
      }

      const p1 = points[edge.edgeStartIndex];
      const p2 = points[edge.edgeEndIndex];

      // Additional validation
      if (
        !p1 ||
        !p2 ||
        p1.x === undefined ||
        p1.y === undefined ||
        p2.x === undefined ||
        p2.y === undefined
      ) {
        console.warn('Invalid point coordinates in updateEdgeHighlight');
        return;
      }

      // Check if this edge already has an arc (for visual feedback)
      // Only polygons can have arcs, rectangles don't (until converted)
      const startVertex =
        edge.shape.type === 'polygon' ? points[edge.edgeStartIndex] : null;
      const hasArc =
        startVertex &&
        startVertex.bulge !== undefined &&
        Math.abs(startVertex.bulge) > 0.0001;

      // Create highlight group
      const highlight = this.contentGroup
        .append('g')
        .attr('class', 'edge-highlight');

      // Highlight the edge
      if (hasArc) {
        // Show arc segment highlight
        const arcParams = this.calculateArcFromBulge(p1, p2, startVertex.bulge);
        const pathData = `M ${p1.x},${p1.y} A ${arcParams.radius},${arcParams.radius} 0 ${arcParams.largeArcFlag} ${arcParams.sweepFlag} ${p2.x},${p2.y}`;

        highlight
          .append('path')
          .attr('d', pathData)
          .attr('fill', 'none')
          .attr('stroke', '#4CAF50')
          .attr('stroke-width', 4)
          .attr('opacity', 0.6);
      } else {
        // Show straight edge highlight
        highlight
          .append('line')
          .attr('x1', p1.x)
          .attr('y1', p1.y)
          .attr('x2', p2.x)
          .attr('y2', p2.y)
          .attr('stroke', '#2196F3')
          .attr('stroke-width', 4)
          .attr('opacity', 0.6);
      }

      // Add snap point indicator at insertion point
      highlight
        .append('circle')
        .attr('cx', edge.insertPoint.x)
        .attr('cy', edge.insertPoint.y)
        .attr('r', 6 / this.zoomScale)
        .attr('fill', hasArc ? '#4CAF50' : '#2196F3')
        .attr('stroke', 'white')
        .attr('stroke-width', 2 / this.zoomScale);

      // Add label
      const labelText = hasArc
        ? 'Click to edit arc'
        : this.arcModeStep === 0
          ? 'Arc Start'
          : 'Arc End';
      highlight
        .append('text')
        .attr('x', edge.insertPoint.x)
        .attr('y', edge.insertPoint.y - 15 / this.zoomScale)
        .attr('text-anchor', 'middle')
        .attr('font-size', `${11 / this.zoomScale}px`)
        .attr('font-weight', 'bold')
        .attr('fill', hasArc ? '#4CAF50' : '#2196F3')
        .attr('stroke', 'white')
        .attr('stroke-width', 2 / this.zoomScale)
        .attr('paint-order', 'stroke')
        .text(labelText);

      // Calculate distances from insert point to vertices
      const dist1Pixels = Math.sqrt(
        Math.pow(edge.insertPoint.x - p1.x, 2) +
          Math.pow(edge.insertPoint.y - p1.y, 2),
      );
      const dist2Pixels = Math.sqrt(
        Math.pow(edge.insertPoint.x - p2.x, 2) +
          Math.pow(edge.insertPoint.y - p2.y, 2),
      );
      const dist1Feet = dist1Pixels / this.gridSize;
      const dist2Feet = dist2Pixels / this.gridSize;

      // Add distance labels near the vertices
      // Distance to first vertex
      highlight
        .append('text')
        .attr('x', p1.x)
        .attr('y', p1.y - 10 / this.zoomScale)
        .attr('text-anchor', 'middle')
        .attr('font-size', `${10 / this.zoomScale}px`)
        .attr('font-weight', 'bold')
        .attr('fill', '#FF9800')
        .attr('stroke', 'white')
        .attr('stroke-width', 2 / this.zoomScale)
        .attr('paint-order', 'stroke')
        .text(`${dist1Feet.toFixed(2)}ft`);

      // Distance to second vertex
      highlight
        .append('text')
        .attr('x', p2.x)
        .attr('y', p2.y - 10 / this.zoomScale)
        .attr('text-anchor', 'middle')
        .attr('font-size', `${10 / this.zoomScale}px`)
        .attr('font-weight', 'bold')
        .attr('fill', '#FF9800')
        .attr('stroke', 'white')
        .attr('stroke-width', 2 / this.zoomScale)
        .attr('paint-order', 'stroke')
        .text(`${dist2Feet.toFixed(2)}ft`);

      // Add small markers at the vertices
      highlight
        .append('circle')
        .attr('cx', p1.x)
        .attr('cy', p1.y)
        .attr('r', 4 / this.zoomScale)
        .attr('fill', '#FF9800')
        .attr('stroke', 'white')
        .attr('stroke-width', 1.5 / this.zoomScale);

      highlight
        .append('circle')
        .attr('cx', p2.x)
        .attr('cy', p2.y)
        .attr('r', 4 / this.zoomScale)
        .attr('fill', '#FF9800')
        .attr('stroke', 'white')
        .attr('stroke-width', 1.5 / this.zoomScale);
    } catch (error) {
      console.error('Error in updateEdgeHighlight:', error);
      // Remove any partial highlights
      this.contentGroup.select('.edge-highlight').remove();
    }
  }

  /**
   * Update visual preview for arc creation (step 3 of arc mode)
   */
  @action
  updateArcPreview(event) {
    // Remove existing preview
    this.contentGroup.select('.arc-preview').remove();

    if (
      !this.arcShape ||
      this.arcStartVertexIndex === null ||
      this.arcEndVertexIndex === null
    ) {
      return;
    }

    // Get the pointer coordinates
    const [rawX, rawY] = d3.pointer(event, this.contentGroup.node());
    const { x, y } = this.snapToGridPoint(rawX, rawY);

    const points = this.arcShape.coordinates.points;
    const startPoint = points[this.arcStartVertexIndex];
    const endPoint = points[this.arcEndVertexIndex];

    if (!startPoint || !endPoint) {
      return;
    }

    // Check if points are too close together (degenerate arc)
    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < 1) {
      // Show error message instead of preview
      const preview = this.contentGroup
        .append('g')
        .attr('class', 'arc-preview');

      preview
        .append('text')
        .attr('x', startPoint.x)
        .attr('y', startPoint.y - 20 / this.zoomScale)
        .attr('text-anchor', 'middle')
        .attr('font-size', `${12 / this.zoomScale}px`)
        .attr('font-weight', 'bold')
        .attr('fill', '#f44336')
        .attr('stroke', 'white')
        .attr('stroke-width', 2 / this.zoomScale)
        .attr('paint-order', 'stroke')
        .text('Start and end too close!');

      return;
    }

    // Determine correct order for preview (same logic as arc creation)
    let bulgeStartPoint, bulgeEndPoint;

    if (this.arcIndicesReversed) {
      // When reversed, endVertexIndex is actually earlier in polygon order
      bulgeStartPoint = endPoint;
      bulgeEndPoint = startPoint;
    } else {
      // Normal order
      bulgeStartPoint = startPoint;
      bulgeEndPoint = endPoint;
    }

    // Calculate preview bulge
    const bulge = this.calculateBulgeFromPoint(bulgeStartPoint, bulgeEndPoint, {
      x,
      y,
    });

    // Create preview group
    const preview = this.contentGroup.append('g').attr('class', 'arc-preview');

    // Calculate arc parameters for preview
    const arcParams = this.calculateArcFromBulge(
      bulgeStartPoint,
      bulgeEndPoint,
      bulge,
    );

    // Draw preview arc path
    const pathData = `M ${bulgeStartPoint.x},${bulgeStartPoint.y} A ${arcParams.radius},${arcParams.radius} 0 ${arcParams.largeArcFlag} ${arcParams.sweepFlag} ${bulgeEndPoint.x},${bulgeEndPoint.y}`;

    preview
      .append('path')
      .attr('d', pathData)
      .attr('fill', 'none')
      .attr('stroke', '#ff6b6b')
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '5,5');

    // Draw start and end markers
    preview
      .append('circle')
      .attr('cx', startPoint.x)
      .attr('cy', startPoint.y)
      .attr('r', 5 / this.zoomScale)
      .attr('fill', '#ff6b6b')
      .attr('stroke', 'white')
      .attr('stroke-width', 1);

    preview
      .append('circle')
      .attr('cx', endPoint.x)
      .attr('cy', endPoint.y)
      .attr('r', 5 / this.zoomScale)
      .attr('fill', '#ff6b6b')
      .attr('stroke', 'white')
      .attr('stroke-width', 1);

    // Calculate arc measurements in feet
    const arcLengthPixels = arcParams.radius * arcParams.includedAngle;
    const arcLengthFeet = arcLengthPixels / this.gridSize;
    const sagittaFeet = arcParams.sagitta / this.gridSize;

    // Add arc depth and length label
    const midX = (startPoint.x + endPoint.x) / 2;
    const midY = (startPoint.y + endPoint.y) / 2;

    preview
      .append('text')
      .attr('x', midX)
      .attr('y', midY - 10 / this.zoomScale)
      .attr('text-anchor', 'middle')
      .attr('font-size', `${12 / this.zoomScale}px`)
      .attr('font-weight', 'bold')
      .attr('fill', '#ff6b6b')
      .attr('stroke', 'white')
      .attr('stroke-width', 2 / this.zoomScale)
      .attr('paint-order', 'stroke')
      .text(
        `Depth: ${sagittaFeet.toFixed(2)}ft | Length: ${arcLengthFeet.toFixed(2)}ft`,
      );
  }

  handleRightClick(event) {
    event.preventDefault(); // Prevent context menu

    // Only handle right-click for polygon mode
    if (
      this.args.drawingMode === 'polygon' &&
      this.isDrawing &&
      this.drawingShape?.points?.length >= 3
    ) {
      this.finishPolygon();
    }
  }

  @action
  updateDrawingPreview(event) {
    // Remove existing preview
    this.contentGroup.select('.drawing-preview').remove();

    if (!this.drawingShape) return;

    // Get the pointer coordinates relative to the contentGroup (accounting for zoom/pan)
    const [rawX, rawY] = d3.pointer(event, this.contentGroup.node());
    const { x, y } = this.snapToGridPoint(rawX, rawY);
    const preview = this.contentGroup
      .append('g')
      .attr('class', 'drawing-preview');

    switch (this.args.drawingMode) {
      case 'rectangle':
        const snappedWidth = this.snapToGridDistance(
          Math.abs(x - this.drawingShape.startX),
        );
        const snappedHeight = this.snapToGridDistance(
          Math.abs(y - this.drawingShape.startY),
        );

        const rectX =
          x < this.drawingShape.startX
            ? this.drawingShape.startX - snappedWidth
            : this.drawingShape.startX;
        const rectY =
          y < this.drawingShape.startY
            ? this.drawingShape.startY - snappedHeight
            : this.drawingShape.startY;

        // Draw rectangle preview
        preview
          .append('rect')
          .attr('x', rectX)
          .attr('y', rectY)
          .attr('width', snappedWidth)
          .attr('height', snappedHeight)
          .attr('fill', 'none')
          .attr('stroke', '#007bff')
          .attr('stroke-width', 1)
          .attr('stroke-dasharray', '5,5');

        // Add dimension labels during drawing
        this.addDrawingDimensions(
          preview,
          rectX,
          rectY,
          snappedWidth,
          snappedHeight,
        );
        break;

      case 'circle':
        const rawRadius = Math.sqrt(
          Math.pow(x - this.drawingShape.centerX, 2) +
            Math.pow(y - this.drawingShape.centerY, 2),
        );
        const snappedRadius = this.snapToGridDistance(rawRadius);

        preview
          .append('circle')
          .attr('cx', this.drawingShape.centerX)
          .attr('cy', this.drawingShape.centerY)
          .attr('r', snappedRadius)
          .attr('fill', 'none')
          .attr('stroke', '#007bff')
          .attr('stroke-width', 1)
          .attr('stroke-dasharray', '5,5');
        break;

      case 'polygon':
        if (this.drawingShape.points && this.drawingShape.points.length > 0) {
          // Draw all existing segments as dotted lines
          for (let i = 0; i < this.drawingShape.points.length - 1; i++) {
            const currentPoint = this.drawingShape.points[i];
            const nextPoint = this.drawingShape.points[i + 1];
            preview
              .append('line')
              .attr('x1', currentPoint.x)
              .attr('y1', currentPoint.y)
              .attr('x2', nextPoint.x)
              .attr('y2', nextPoint.y)
              .attr('stroke', '#007bff')
              .attr('stroke-width', 2)
              .attr('stroke-dasharray', '5,5');
          }

          // Apply 90-degree constraint if shift is held
          const lastPoint =
            this.drawingShape.points[this.drawingShape.points.length - 1];
          const constrainedPoint = this.constrainToRightAngles(x, y, lastPoint);

          // Draw preview line from last point to constrained position
          preview
            .append('line')
            .attr('x1', lastPoint.x)
            .attr('y1', lastPoint.y)
            .attr('x2', constrainedPoint.x)
            .attr('y2', constrainedPoint.y)
            .attr('stroke', this.isShiftPressed ? '#ff6b6b' : '#007bff')
            .attr('stroke-width', this.isShiftPressed ? 2 : 1)
            .attr('stroke-dasharray', '3,3');

          // Add measurement for the current drawing segment
          const segmentLength = Math.sqrt(
            Math.pow(constrainedPoint.x - lastPoint.x, 2) +
              Math.pow(constrainedPoint.y - lastPoint.y, 2),
          );
          const segmentLengthInFeet =
            Math.round((segmentLength / this.gridSize) * 10) / 10;

          if (segmentLengthInFeet > 0) {
            const midX = (lastPoint.x + constrainedPoint.x) / 2;
            const midY = (lastPoint.y + constrainedPoint.y) / 2;
            const angle =
              (Math.atan2(
                constrainedPoint.y - lastPoint.y,
                constrainedPoint.x - lastPoint.x,
              ) *
                180) /
              Math.PI;

            // Calculate responsive font size
            const fontSize = 12 / this.zoomScale;

            preview
              .append('text')
              .attr('x', midX)
              .attr('y', midY - 5 / this.zoomScale)
              .attr('text-anchor', 'middle')
              .attr('font-size', `${fontSize}px`)
              .attr('font-weight', 'bold')
              .attr('fill', this.isShiftPressed ? '#ff6b6b' : '#007bff')
              .attr('stroke', 'white')
              .attr('stroke-width', 2 / this.zoomScale)
              .attr('paint-order', 'stroke')
              .attr('transform', `rotate(${angle}, ${midX}, ${midY})`)
              .text(`${segmentLengthInFeet}'`);
          }

          // Add red dot at the start point
          if (this.drawingShape.points.length >= 1) {
            const startPoint = this.drawingShape.points[0];
            preview
              .append('circle')
              .attr('cx', startPoint.x)
              .attr('cy', startPoint.y)
              .attr('r', 4 / this.zoomScale)
              .attr('fill', 'red')
              .attr('stroke', 'white')
              .attr('stroke-width', 1);
          }

          // Add dots at all other points
          this.drawingShape.points.forEach((point, index) => {
            if (index > 0) {
              // Skip start point (already red)
              preview
                .append('circle')
                .attr('cx', point.x)
                .attr('cy', point.y)
                .attr('r', 3 / this.zoomScale)
                .attr('fill', '#007bff')
                .attr('stroke', 'white')
                .attr('stroke-width', 1);
            }
          });
        }
        break;
    }

    // Show snap feedback at cursor position
    this.showSnapFeedback(x, y);
  }

  @action
  centerAndFitShapes() {
    if (!this.shapesToRender || this.shapesToRender.length === 0) {
      // If no shapes, reset to center
      this.resetViewToCenter();
      return null;
    }

    // Calculate bounding box of all shapes
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;

    this.shapesToRender.forEach((shape) => {
      shape.coordinates.forEach?.((coord) => {
        minX = Math.min(minX, coord.x);
        minY = Math.min(minY, coord.y);
        maxX = Math.max(maxX, coord.x);
        maxY = Math.max(maxY, coord.y);
      });

      // Handle different coordinate structures
      const coords = shape.coordinates;
      if (coords) {
        switch (shape.type) {
          case 'rectangle':
            minX = Math.min(minX, coords.x, coords.x + coords.width);
            maxX = Math.max(maxX, coords.x, coords.x + coords.width);
            minY = Math.min(minY, coords.y, coords.y + coords.height);
            maxY = Math.max(maxY, coords.y, coords.y + coords.height);
            break;
          case 'circle':
            minX = Math.min(minX, coords.cx - coords.radius);
            maxX = Math.max(maxX, coords.cx + coords.radius);
            minY = Math.min(minY, coords.cy - coords.radius);
            maxY = Math.max(maxY, coords.cy + coords.radius);
            break;
          case 'polygon':
            if (coords.points) {
              coords.points.forEach((point) => {
                minX = Math.min(minX, point.x);
                minY = Math.min(minY, point.y);
                maxX = Math.max(maxX, point.x);
                maxY = Math.max(maxY, point.y);
              });
            }
            break;
        }
      }
    });

    if (minX === Infinity) {
      this.resetViewToCenter();
      return null;
    }

    // Calculate center point of bounding box
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    // Calculate required scale to fit all shapes with some padding
    const boundingWidth = maxX - minX;
    const boundingHeight = maxY - minY;
    const padding = 50; // 50px padding on all sides

    const scaleX = (this.args.width - padding * 2) / boundingWidth;
    const scaleY = (this.args.height - padding * 2) / boundingHeight;
    let scale = Math.min(scaleX, scaleY);

    // Limit zoom range to reasonable values
    scale = Math.min(Math.max(scale, 0.5), 3);

    // Calculate transform to center the bounding box
    const translateX = this.args.width / 2 - centerX * scale;
    const translateY = this.args.height / 2 - centerY * scale;

    // Create bounding box data to return
    const boundingBoxData = {
      minX,
      minY,
      maxX,
      maxY,
      centerX,
      centerY,
      width: boundingWidth,
      height: boundingHeight,
      scale,
      translateX,
      translateY,
    };

    // Apply the transform
    const transform = d3.zoomIdentity
      .translate(translateX, translateY)
      .scale(scale);

    if (this.zoom && this.svg) {
      this.svg.transition().duration(500).call(this.zoom.transform, transform);
    }

    return boundingBoxData;
  }

  @action
  resetViewToCenter() {
    // Reset to center with 1x zoom
    const transform = d3.zoomIdentity
      .translate(this.args.width / 2, this.args.height / 2)
      .scale(1);

    if (this.zoom && this.svg) {
      this.svg.transition().duration(300).call(this.zoom.transform, transform);
    }
  }

  @action
  applySavedBoundingBox(boundingBoxData) {
    if (!boundingBoxData || !this.zoom || !this.svg) {
      return;
    }

    // Apply the saved transform without animation for initial load
    const transform = d3.zoomIdentity
      .translate(boundingBoxData.translateX, boundingBoxData.translateY)
      .scale(boundingBoxData.scale);

    this.svg.call(this.zoom.transform, transform);
  }

  @action
  applySavedBoundingBoxIfAvailable() {
    const isViewOnlyMode = !this.args.width;

    if (this.shapesToRender?.length > 0) {
      // Detect responsive mode by checking if no width is provided (edit modal provides width)
      const isViewOnlyMode = !this.args.width;

      if (isViewOnlyMode) {
        // For view-only canvas: use saved bounding box if available, otherwise auto-fit
        if (this.args.sketch?.bounding_box) {
          this.applyBoundingBoxToResponsiveCanvas(
            this.args.sketch.bounding_box,
          );
        } else {
          this.fitShapesToResponsiveCanvas();
        }
      } else {
        // For edit mode: always auto-fit shapes to make them all visible
        this.centerAndFitShapes();
      }
    }
  }

  @action
  applyBoundingBoxToResponsiveCanvas(boundingBoxData) {
    if (!boundingBoxData || !this.svg) {
      return;
    }

    // For responsive canvas, we modify the viewBox to show the bounding area
    // The boundingBoxData contains: minX, minY, maxX, maxY, width, height, etc.
    const padding = 50; // 50px padding on all sides
    const viewBoxX = boundingBoxData.minX - padding;
    const viewBoxY = boundingBoxData.minY - padding;
    const viewBoxWidth = boundingBoxData.width + padding * 2;
    const viewBoxHeight = boundingBoxData.height + padding * 2;

    this.svg.attr(
      'viewBox',
      `${viewBoxX} ${viewBoxY} ${viewBoxWidth} ${viewBoxHeight}`,
    );
  }

  @action
  fitShapesToResponsiveCanvas() {
    if (!this.shapesToRender || this.shapesToRender.length === 0) {
      return;
    }

    // Calculate bounding box of all shapes
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;

    this.shapesToRender.forEach((shape, index) => {
      const coords = shape.coordinates;

      if (coords) {
        switch (shape.type) {
          case 'rectangle':
            minX = Math.min(minX, coords.x, coords.x + coords.width);
            maxX = Math.max(maxX, coords.x, coords.x + coords.width);
            minY = Math.min(minY, coords.y, coords.y + coords.height);
            maxY = Math.max(maxY, coords.y, coords.y + coords.height);
            break;
          case 'circle':
            minX = Math.min(minX, coords.cx - coords.radius);
            maxX = Math.max(maxX, coords.cx + coords.radius);
            minY = Math.min(minY, coords.cy - coords.radius);
            maxY = Math.max(maxY, coords.cy + coords.radius);
            break;
          case 'polygon':
            if (coords.points) {
              coords.points.forEach((point) => {
                minX = Math.min(minX, point.x);
                minY = Math.min(minY, point.y);
                maxX = Math.max(maxX, point.x);
                maxY = Math.max(maxY, point.y);
              });
            }
            break;
          case 'line':
            // Handle line shapes
            if (
              coords.x1 !== undefined &&
              coords.y1 !== undefined &&
              coords.x2 !== undefined &&
              coords.y2 !== undefined
            ) {
              minX = Math.min(minX, coords.x1, coords.x2);
              maxX = Math.max(maxX, coords.x1, coords.x2);
              minY = Math.min(minY, coords.y1, coords.y2);
              maxY = Math.max(maxY, coords.y1, coords.y2);
            }
            break;
          default:
            console.warn(
              `🎯 Unknown shape type: ${shape.type}, coords:`,
              coords,
            );
            // Try to handle unknown shapes by looking for common coordinate patterns
            if (coords.x !== undefined && coords.y !== undefined) {
              minX = Math.min(minX, coords.x);
              maxX = Math.max(maxX, coords.x);
              minY = Math.min(minY, coords.y);
              maxY = Math.max(maxY, coords.y);

              if (coords.width && coords.height) {
                maxX = Math.max(maxX, coords.x + coords.width);
                maxY = Math.max(maxY, coords.y + coords.height);
              }
            }
            break;
        }
      } else {
        console.warn(`🎯 Shape ${index + 1} has no coordinates:`, shape);
      }
    });

    if (minX === Infinity) {
      return;
    }

    // Apply the viewBox to fit all shapes with padding
    const padding = 50;
    const viewBoxX = minX - padding;
    const viewBoxY = minY - padding;
    const viewBoxWidth = maxX - minX + padding * 2;
    const viewBoxHeight = maxY - minY + padding * 2;

    this.svg.attr(
      'viewBox',
      `${viewBoxX} ${viewBoxY} ${viewBoxWidth} ${viewBoxHeight}`,
    );
  }
}
