import { helper } from '@ember/component/helper';

/**
 * Map helper - applies a function to each element in an array
 * @param {Array} positional - [function, array]
 * @returns {Array} Mapped array
 */
export function map([fn, array]) {
  if (!Array.isArray(array)) {
    return [];
  }

  return array.map((item) => fn(item));
}

export default helper(map);
