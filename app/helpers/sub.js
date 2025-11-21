import { helper } from '@ember/component/helper';

/**
 * Subtract two numbers
 * @param {Array} positional - [minuend, subtrahend]
 * @returns {number} Result of subtraction
 */
export function sub([minuend, subtrahend]) {
  return Number(minuend) - Number(subtrahend);
}

export default helper(sub);
