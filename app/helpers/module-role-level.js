import { helper } from '@ember/component/helper';

/**
 * Helper to get user's role level for a specific module
 *
 * Usage in templates:
 *   {{#let (module-role-level currentUser "assessing") as |roleLevel|}}
 *     {{#if (gte roleLevel 2)}}
 *       <button {{on "click" this.edit}}>Edit</button>
 *     {{/if}}
 *   {{/let}}
 *
 * Or directly in comparisons:
 *   {{#if (gte (module-role-level currentUser "assessing") 2)}}
 *     <button {{on "click" this.edit}}>Edit</button>
 *   {{/if}}
 *
 * Modules:
 *   - assessing
 *   - buildingPermits
 *   - taxCollection
 *   - townClerk
 *   - motorVehicle
 *   - finance
 *
 * Returns:
 *   1 = Read Only
 *   2 = Editor
 *   3 = Reviewer
 *   4 = Admin
 *   0 = No access
 */
export function moduleRoleLevel([currentUser, moduleName]) {
  if (!currentUser || !moduleName) {
    return 0;
  }

  return currentUser.getModuleRoleLevel(moduleName);
}

export default helper(moduleRoleLevel);
