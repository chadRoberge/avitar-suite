import { helper } from '@ember/component/helper';
import {
  GLOBAL_ROLE_LEVELS,
  MODULE_ROLE_LEVELS,
} from '../constants/role-hierarchy';

/**
 * Helper to access role level constants in templates
 *
 * Usage:
 *   {{#if (gte currentUser.roleLevel (role-level "AVITAR_STAFF"))}}
 *     Show staff features
 *   {{/if}}
 *
 *   {{#if (gte currentUser.currentMunicipalRoleLevel (role-level "EDITOR" "module"))}}
 *     <button {{on "click" this.edit}}>Edit</button>
 *   {{/if}}
 *
 * Global roles:
 *   - CITIZEN (1)
 *   - CONTRACTOR (2)
 *   - MUNICIPAL_USER (3)
 *   - AVITAR_STAFF (4)
 *   - AVITAR_ADMIN (5)
 *
 * Module roles (use second param "module"):
 *   - READONLY (1)
 *   - EDITOR (2)
 *   - REVIEWER (3)
 *   - ADMIN (4)
 */
export function roleLevel([roleName, type = 'global']) {
  if (type === 'module') {
    return MODULE_ROLE_LEVELS[roleName] || 0;
  }
  return GLOBAL_ROLE_LEVELS[roleName] || 0;
}

export default helper(roleLevel);
