import Component from '@glimmer/component';

/**
 * Permit Inspections Component
 * Displays list of inspections for a permit
 */
export default class ContractorPermitInspectionsComponent extends Component {
  /**
   * Format inspection type from snake_case to Title Case
   * @param {string} type - The inspection type (e.g., 'foundation', 'rough_electrical')
   * @returns {string} Formatted type (e.g., 'Foundation', 'Rough Electrical')
   */
  formatInspectionType(type) {
    if (!type) return '';

    // Convert snake_case to Title Case
    return type
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Get badge class for inspection status
   * @param {string} status - The inspection status
   * @returns {string} Badge class
   */
  getStatusBadgeClass(status) {
    const statusMap = {
      scheduled: 'avitar-badge--primary',
      passed: 'avitar-badge--success',
      failed: 'avitar-badge--danger',
      cancelled: 'avitar-badge--secondary',
    };
    return `avitar-badge ${statusMap[status] || 'avitar-badge--warning'}`;
  }

  /**
   * Format status text
   * @param {string} status - The inspection status
   * @returns {string} Formatted status
   */
  formatStatus(status) {
    if (!status) return '';
    return status.charAt(0).toUpperCase() + status.slice(1);
  }
}
