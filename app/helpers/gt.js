import { helper } from '@ember/component/helper';

/**
 * Greater than comparison helper
 *
 * Usage:
 *   {{#if (gt currentUser.roleLevel 2)}}
 *     Show features for roles above contractor
 *   {{/if}}
 */
export function gt([a, b]) {
  return a > b;
}

export default helper(gt);
