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
      console.log('🎨 POLLING: Change detected!', {
        isNewSketch,
        shapesChanged,
        currentSketchId,
        previousSketchId: this._previousSketchId,
        shapesCount: shapes.length,
      });

      // Store current values for next comparison
      this._previousShapes = shapes;
      this._previousSketchId = currentSketchId;

      if (isNewSketch) {
        console.log(
          '🎨 POLLING: NEW SKETCH DETECTED - Complete canvas refresh',
        );
        // Complete canvas refresh for new sketch (property change)
        this.clearAndReinitializeCanvas();
        this.updateShapesWithD3(shapes);
        // Apply bounding box for the new sketch
        setTimeout(() => {
          this.applySavedBoundingBoxIfAvailable();
        }, 50);
      } else {
        console.log('🎨 POLLING: SHAPES CHANGED - Normal update');
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

    // Debug logging
    console.log('🎨 Canvas shapesToRender called:', {
      shapesCount: shapes.length,
      currentSketchId,
      previousSketchId: this._previousSketchId,
      hasSvg: !!this.svg,
      args: this.args,
    });

    // Detect if this is a completely different sketch (property change)
    const isNewSketch = currentSketchId !== this._previousSketchId;
    const shapesChanged =
      JSON.stringify(shapes) !== JSON.stringify(this._previousShapes);

    console.log('🎨 Change detection:', {
      isNewSketch,
      shapesChanged,
      currentSketchId,
      previousSketchId: this._previousSketchId,
    });

    if (this.svg && (isNewSketch || shapesChanged)) {
      console.log('🎨 Triggering canvas update:', {
        isNewSketch,
        shapesChanged,
      });

      // Store current values for next comparison
      this._previousShapes = shapes;
      this._previousSketchId = currentSketchId;

      if (isNewSketch) {
        console.log('🎨 NEW SKETCH DETECTED - Complete canvas refresh');
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
        console.log('🎨 SHAPES CHANGED - Normal update');
        // Normal shape update for same sketch
        setTimeout(() => this.updateShapesWithD3(shapes), 0);
      }
    } else {
      console.log('🎨 No changes detected or no SVG');
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
    if (!this.svg || !this.contentGroup) return;

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

    // Only add vertex handles if the shape is selected AND we're not in a drawing mode
    if (isSelected && canSelect) {
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

    // Only add vertex handles if the shape is selected AND we're not in a drawing mode
    if (isSelected && canSelect) {
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
    const points = shape.coordinates.points
      .map((p) => `${p.x},${p.y}`)
      .join(' ');

    group
      .append('polygon')
      .attr('points', points)
      .attr('fill', fill)
      .attr('stroke', stroke)
      .attr('stroke-width', 2);

    // Add dimensions
    this.addPolygonDimensions(group, shape);
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

    // Width dimension (inside, near top edge)
    group
      .append('text')
      .attr('x', coords.x + coords.width / 2)
      .attr('y', coords.y + 20 * offsetScale)
      .attr('text-anchor', 'middle')
      .attr('font-size', `${fontSize}px`)
      .attr('font-weight', 'bold')
      .attr('fill', '#666')
      .attr('stroke', 'white')
      .attr('stroke-width', 2 * offsetScale)
      .attr('paint-order', 'stroke')
      .text(`${widthInFeet}'`);

    // Height dimension (inside, rotated 90 degrees, near left edge)
    group
      .append('text')
      .attr('x', coords.x + 15 * offsetScale)
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
        `rotate(-90, ${coords.x + 15 * offsetScale}, ${coords.y + coords.height / 2})`,
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
      .attr('y', coords.cy - 5 * offsetScale)
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
      .attr('y', coords.cy + 10 * offsetScale)
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

      // Offset the text inward by a small amount
      const offset = 12 * offsetScale;
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
        .attr('y', labelY - 5 * offsetScale)
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
        .attr('y', labelY + 8 * offsetScale)
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
    if (!this.args.drawingMode) return;

    // Get the pointer coordinates relative to the contentGroup (accounting for zoom/pan)
    const [rawX, rawY] = d3.pointer(event, this.contentGroup.node());
    const { x, y } = this.snapToGridPoint(rawX, rawY);

    // Show visual feedback for snap
    this.showSnapFeedback(x, y);

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

  // Method to cancel current drawing (called from parent)
  @action
  cancelCurrentDrawing() {
    this.isDrawing = false;
    this.drawingShape = null;

    // Remove any drawing preview
    if (this.contentGroup) {
      this.contentGroup.select('.drawing-preview').remove();
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

    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      area += points[i].x * points[j].y;
      area -= points[j].x * points[i].y;
    }

    return Math.abs(area) / 2;
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

  @action
  handleMouseMove(event) {
    // Handle drawing preview during mouse move
    if (this.isDrawing) {
      this.updateDrawingPreview(event);
    }
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
    console.log('applySavedBoundingBoxIfAvailable called:', {
      isViewOnlyMode: isViewOnlyMode,
      shapesCount: this.shapesToRender?.length,
      hasBoundingBox: !!this.args.sketch?.bounding_box,
      boundingBox: this.args.sketch?.bounding_box,
      hasWidth: !!this.args.width,
    });

    if (this.shapesToRender?.length > 0) {
      // Detect responsive mode by checking if no width is provided (edit modal provides width)
      const isViewOnlyMode = !this.args.width;

      if (isViewOnlyMode) {
        // For view-only canvas: use saved bounding box if available, otherwise auto-fit
        if (this.args.sketch?.bounding_box) {
          console.log('View-only mode: Using saved bounding box');
          this.applyBoundingBoxToResponsiveCanvas(
            this.args.sketch.bounding_box,
          );
        } else {
          console.log(
            'View-only mode: No saved bounding box, auto-fitting shapes',
          );
          this.fitShapesToResponsiveCanvas();
        }
      } else {
        // For edit mode: always auto-fit shapes to make them all visible
        console.log('Edit mode: auto-fitting shapes');
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

    this.shapesToRender.forEach((shape) => {
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
