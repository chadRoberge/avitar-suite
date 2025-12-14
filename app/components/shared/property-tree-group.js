import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

/**
 * Shared Property Tree Group Component
 *
 * A collapsible group for displaying properties in a tree structure.
 * Can be used by any module (assessing, building permits, tax collection, etc.)
 *
 * @param {string} groupKey - The group identifier (e.g., map number, street name, letter initial)
 * @param {array} properties - Array of properties in this group
 * @param {string} groupBy - Grouping method: 'pid', 'street', or 'lastname'
 * @param {string} selectedPropertyId - ID of currently selected property
 * @param {function} onSelectProperty - Callback when property is clicked
 * @param {function} getDisplayName - Function to get property display name
 * @param {function} getSecondaryInfo - Function to get property secondary info
 */
export default class SharedPropertyTreeGroupComponent extends Component {
  @tracked isExpanded = false;

  get groupIcon() {
    switch (this.args.groupBy) {
      case 'pid':
        return 'map-marked-alt';
      case 'street':
        return 'road';
      case 'lastname':
        return 'user';
      default:
        return 'folder';
    }
  }

  get groupTitle() {
    const key = this.args.groupKey;
    switch (this.args.groupBy) {
      case 'pid':
        return `Map ${key}`;
      case 'street':
        return key === 'Unknown/Vacant' ? 'Unknown/Vacant' : `${key} St`;
      case 'lastname':
        return `${key} Names`;
      default:
        return key;
    }
  }

  @action
  toggleExpanded() {
    this.isExpanded = !this.isExpanded;
  }

  @action
  selectProperty(property) {
    this.args.onSelectProperty?.(property);
  }
}
