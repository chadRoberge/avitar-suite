import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

/**
 * Bottom Sheet Component
 *
 * A slide-up panel component for mobile interfaces.
 * Supports drag-to-close gesture and multiple snap points.
 *
 * @argument {boolean} isOpen - Whether the sheet is visible
 * @argument {string} title - Optional title for the header
 * @argument {Function} onClose - Called when sheet should close
 * @argument {Function} onExpand - Called when sheet should expand (optional)
 * @argument {Array<number>} snapPoints - Array of viewport height percentages (default: [0.5, 0.9])
 * @argument {number} snapIndex - Current snap point index (default: 0)
 */
export default class BottomSheetComponent extends Component {
  @tracked dragY = 0;
  @tracked isDragging = false;
  @tracked isClosing = false;

  startY = 0;
  startTime = 0;

  get snapPoints() {
    return this.args.snapPoints ?? [0.5, 0.9];
  }

  get currentSnapIndex() {
    return this.args.snapIndex ?? 0;
  }

  get sheetStyle() {
    if (this.isDragging) {
      // During drag, apply the drag offset
      const snapPercent = (1 - this.snapPoints[this.currentSnapIndex]) * 100;
      const dragPercent = (this.dragY / window.innerHeight) * 100;
      return `transform: translateY(calc(${snapPercent}% + ${dragPercent}%));`;
    }
    // At rest, use the snap point
    const snapPercent = (1 - this.snapPoints[this.currentSnapIndex]) * 100;
    return `transform: translateY(${snapPercent}%);`;
  }

  get sheetClass() {
    let classes = 'bottom-sheet';
    if (this.isDragging) {
      classes += ' bottom-sheet--dragging';
    }
    if (this.isClosing) {
      classes += ' bottom-sheet--closing';
    }
    return classes;
  }

  @action
  handleDragStart(event) {
    // Only handle touch events on the handle
    if (event.target.closest('.bottom-sheet__handle')) {
      this.isDragging = true;
      this.startY = event.touches[0].clientY;
      this.startTime = Date.now();
    }
  }

  @action
  handleDrag(event) {
    if (!this.isDragging) return;

    const currentY = event.touches[0].clientY;
    const deltaY = currentY - this.startY;

    // Only allow dragging down (positive deltaY) or up to expand
    this.dragY = deltaY;
  }

  @action
  handleDragEnd() {
    if (!this.isDragging) return;

    this.isDragging = false;

    const dragDistance = this.dragY;
    const dragTime = Date.now() - this.startTime;
    const velocity = Math.abs(dragDistance) / dragTime;

    // Threshold for closing (drag down more than 100px or fast swipe)
    const closeThreshold = 100;
    const velocityThreshold = 0.5;

    if (
      dragDistance > closeThreshold ||
      (dragDistance > 50 && velocity > velocityThreshold)
    ) {
      // Close the sheet
      this.close();
    } else if (dragDistance < -closeThreshold) {
      // Expand the sheet (if onExpand is provided)
      this.args.onExpand?.();
    }

    // Reset drag state
    this.dragY = 0;
    this.startY = 0;
    this.startTime = 0;
  }

  @action
  handleOverlayClick() {
    this.close();
  }

  @action
  close() {
    this.isClosing = true;

    // Wait for animation to complete before calling onClose
    setTimeout(() => {
      this.isClosing = false;
      this.args.onClose?.();
    }, 250); // Match the CSS transition duration
  }

  @action
  stopPropagation(event) {
    event.stopPropagation();
  }
}
