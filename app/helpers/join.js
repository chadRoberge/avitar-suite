import { helper } from '@ember/component/helper';

/**
 * Join array elements with a separator
 * @param {Array} positional - [separator, array] or [array] (comma default)
 * @returns {string} Joined string
 */
export function join(positional) {
  if (positional.length === 1) {
    // Only array provided, use comma as default separator
    const array = positional[0];
    if (!array || !Array.isArray(array)) {
      return '';
    }
    return array.join(', ');
  } else if (positional.length === 2) {
    // Separator and array provided
    const [separator, array] = positional;
    if (!array || !Array.isArray(array)) {
      return '';
    }
    return array.join(separator);
  }
  return '';
}

export default helper(join);
