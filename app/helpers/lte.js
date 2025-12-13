import { helper } from '@ember/component/helper';

/**
 * Less than or equal to comparison helper
 *
 * Usage:
 *   {{#if (lte currentUser.roleLevel 2)}}
 *     Show limited features
 *   {{/if}}
 */
export function lte([a, b]) {
  return a <= b;
}

export default helper(lte);
