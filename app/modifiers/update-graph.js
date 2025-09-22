import { modifier } from 'ember-modifier';

export default modifier(function updateGraph(
  element,
  [data, xField, yField, drawGraphFn],
) {
  // Support legacy format (tiers, zoneName, drawGraphFn) for backward compatibility
  if (
    typeof xField === 'string' &&
    typeof yField === 'string' &&
    typeof drawGraphFn === 'function'
  ) {
    // New format: data, xField, yField, drawGraphFn
    if (data && drawGraphFn) {
      drawGraphFn(element);
    }
  } else if (typeof xField === 'function') {
    // Legacy format: tiers, zoneName, drawGraphFn (xField is actually drawGraphFn)
    if (data && xField) {
      xField(element);
    }
  }
});
