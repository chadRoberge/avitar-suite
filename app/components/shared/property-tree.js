import Component from '@glimmer/component';

/**
 * Shared Property Tree Component
 *
 * Renders a collapsible tree of properties grouped by a specified criteria.
 * This is a presentation component - the parent component handles data loading,
 * filtering, and grouping logic.
 *
 * @param {object} groupedProperties - Object with group keys and arrays of properties
 *                                      Example: { "001": [prop1, prop2], "002": [prop3] }
 * @param {string} groupBy - Grouping method: 'pid', 'street', or 'lastname'
 * @param {string} selectedPropertyId - ID of currently selected property
 * @param {function} onSelectProperty - Callback when property is clicked
 * @param {function} getDisplayName - Function to get property display name
 * @param {function} getSecondaryInfo - Function to get property secondary info
 */
export default class SharedPropertyTreeComponent extends Component {
  // All logic is handled by parent component
  // This component is purely for rendering
}
