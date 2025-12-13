import { helper } from '@ember/component/helper';

/**
 * Less than comparison helper
 *
 * Usage:
 *   {{#if (lt currentUser.roleLevel 3)}}
 *     Show message: "Contact admin to upgrade"
 *   {{/if}}
 */
export function lt([a, b]) {
  return a < b;
}

export default helper(lt);
