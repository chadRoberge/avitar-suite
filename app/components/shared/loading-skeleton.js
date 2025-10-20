import Component from '@glimmer/component';

/**
 * Loading Skeleton Component
 *
 * Provides animated skeleton loading states for different UI patterns
 *
 * @param {string} type - The skeleton type (property-header, assessment-card, history-list, etc.)
 * @param {number} count - Number of skeleton items to show
 * @param {string} height - Custom height for skeleton
 * @param {string} size - Size variant (small, medium, large)
 */
export default class LoadingSkeletonComponent extends Component {
  // Helper to generate range for templates
  get range() {
    return (count) => Array.from({ length: count }, (_, i) => i);
  }
}
