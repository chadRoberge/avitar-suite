import { helper } from '@ember/component/helper';

/**
 * Greater than or equal to comparison helper
 *
 * Usage:
 *   {{#if (gte currentUser.roleLevel 3)}}
 *     Show admin features
 *   {{/if}}
 *
 *   {{#if (gte currentUser.currentMunicipalRoleLevel MODULE_ROLE_LEVELS.EDITOR)}}
 *     <button {{on "click" this.edit}}>Edit</button>
 *   {{/if}}
 */
export function gte([a, b]) {
  return a >= b;
}

export default helper(gte);
