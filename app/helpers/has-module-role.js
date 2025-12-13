import { helper } from '@ember/component/helper';

/**
 * Helper to check if user has a specific role level in a module
 *
 * Usage in templates:
 *   {{#if (has-module-role "assessing" 2)}}
 *     <button {{on "click" this.edit}}>Edit</button>
 *   {{/if}}
 *
 * Modules:
 *   - assessing
 *   - building_permit
 *   - taxCollection
 *   - townClerk
 *   - motorVehicle
 *   - finance
 *
 * Role Levels:
 *   1 = Read Only
 *   2 = Editor
 *   3 = Reviewer
 *   4 = Admin
 */
export function hasModuleRole([currentUser, moduleName, requiredLevel]) {
  if (!currentUser || !moduleName || requiredLevel === undefined) {
    return false;
  }

  // Get the user's role level for this specific module
  const userRoleLevel = currentUser.getModuleRoleLevel(moduleName);

  return userRoleLevel >= requiredLevel;
}

export default helper(hasModuleRole);
