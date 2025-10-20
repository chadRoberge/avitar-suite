import { helper } from '@ember/component/helper';

export default helper(function debugLog([message, value]) {
  console.log(`[DEBUG] ${message}:`, value);
  if (typeof value === 'object' && value !== null) {
    console.log(`[DEBUG] ${message} expanded:`, JSON.stringify(value, null, 2));
  }
  return value;
});
