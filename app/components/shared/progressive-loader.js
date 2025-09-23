import Component from '@glimmer/component';

/**
 * Progressive Loading Indicator Component
 *
 * Shows the current loading state and progress through data tiers
 */
export default class ProgressiveLoaderComponent extends Component {
  /**
   * Get CSS class for tier based on its state
   */
  getTierClass(tierState) {
    switch (tierState) {
      case 'complete':
        return 'progressive-loader__tier--complete';
      case 'loading':
        return 'progressive-loader__tier--loading';
      case 'error':
        return 'progressive-loader__tier--error';
      default:
        return 'progressive-loader__tier--pending';
    }
  }

  /**
   * Calculate progress percentage
   */
  getProgressPercentage(state) {
    if (!state) return 0;

    const tiers = ['tier1', 'tier2', 'tier3', 'tier4'];
    const completedTiers = tiers.filter(tier => state[tier] === 'complete').length;
    return Math.round((completedTiers / tiers.length) * 100);
  }

  /**
   * Get number of completed tiers
   */
  getCompletedTiers(state) {
    if (!state) return 0;

    const tiers = ['tier1', 'tier2', 'tier3', 'tier4'];
    return tiers.filter(tier => state[tier] === 'complete').length;
  }

  /**
   * Get elapsed time in seconds
   */
  getElapsedTime(startTime) {
    if (!startTime) return 0;
    return Math.round((Date.now() - startTime) / 100) / 10; // One decimal place
  }
}