import { helper } from '@ember/component/helper';

/**
 * Range helper for generating arrays of sequential numbers
 *
 * Usage:
 * {{#each (range 5) as |index|}}
 *   <div>Item {{index}}</div>
 * {{/each}}
 *
 * {{#each (range 3 7) as |number|}}
 *   <div>Number {{number}}</div>
 * {{/each}}
 */
export default helper(function range([start, end]) {
  if (end === undefined) {
    // Single argument - generate range from 0 to start-1
    end = start;
    start = 0;
  }

  const length = end - start;
  return Array.from({ length }, (_, i) => start + i);
});