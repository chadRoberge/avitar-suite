/**
 * Role Hierarchy Constants
 *
 * Defines numeric hierarchy for roles to enable greater-than/less-than comparisons.
 * Higher numbers = more permissions.
 *
 * Usage in templates:
 *   {{#if (gte currentUser.roleLevel 3)}}
 *     Show admin features
 *   {{/if}}
 *
 * Usage in JS:
 *   if (this.currentUser.roleLevel >= ROLE_LEVELS.EDITOR) {
 *     // Allow editing
 *   }
 */

// Global role hierarchy (applies to entire system)
export const GLOBAL_ROLE_LEVELS = {
  CITIZEN: 1, // Citizens - lowest permissions
  CONTRACTOR: 2, // Contractors - can submit permits
  MUNICIPAL_USER: 3, // Municipal staff - varies by module permissions
  AVITAR_STAFF: 4, // Avitar staff - full system access
  AVITAR_ADMIN: 5, // Avitar admin - highest permissions
};

// Module-specific role hierarchy (applies within a module like Assessing, Building Permits)
export const MODULE_ROLE_LEVELS = {
  READONLY: 1, // Can only view data
  EDITOR: 2, // Can create and edit data
  REVIEWER: 3, // Can review and approve certain items
  ADMIN: 4, // Full module administration
};

// Map string roles to numeric levels
export const GLOBAL_ROLE_MAP = {
  citizen: GLOBAL_ROLE_LEVELS.CITIZEN,
  contractor: GLOBAL_ROLE_LEVELS.CONTRACTOR,
  municipal_user: GLOBAL_ROLE_LEVELS.MUNICIPAL_USER,
  avitar_staff: GLOBAL_ROLE_LEVELS.AVITAR_STAFF,
  avitar_admin: GLOBAL_ROLE_LEVELS.AVITAR_ADMIN,
};

export const MODULE_ROLE_MAP = {
  readonly: MODULE_ROLE_LEVELS.READONLY,
  viewer: MODULE_ROLE_LEVELS.READONLY, // Alias
  editor: MODULE_ROLE_LEVELS.EDITOR,
  contributor: MODULE_ROLE_LEVELS.EDITOR, // Alias
  reviewer: MODULE_ROLE_LEVELS.REVIEWER,
  approver: MODULE_ROLE_LEVELS.REVIEWER, // Alias
  admin: MODULE_ROLE_LEVELS.ADMIN,
  manager: MODULE_ROLE_LEVELS.ADMIN, // Alias
};

// Reverse maps for display (number to string)
export const GLOBAL_ROLE_NAMES = {
  [GLOBAL_ROLE_LEVELS.CITIZEN]: 'Citizen',
  [GLOBAL_ROLE_LEVELS.CONTRACTOR]: 'Contractor',
  [GLOBAL_ROLE_LEVELS.MUNICIPAL_USER]: 'Municipal User',
  [GLOBAL_ROLE_LEVELS.AVITAR_STAFF]: 'Avitar Staff',
  [GLOBAL_ROLE_LEVELS.AVITAR_ADMIN]: 'Avitar Admin',
};

export const MODULE_ROLE_NAMES = {
  [MODULE_ROLE_LEVELS.READONLY]: 'Read Only',
  [MODULE_ROLE_LEVELS.EDITOR]: 'Editor',
  [MODULE_ROLE_LEVELS.REVIEWER]: 'Reviewer',
  [MODULE_ROLE_LEVELS.ADMIN]: 'Admin',
};

// Helper function to get role level from string
export function getGlobalRoleLevel(roleString) {
  return GLOBAL_ROLE_MAP[roleString] || 0;
}

export function getModuleRoleLevel(roleString) {
  return MODULE_ROLE_MAP[roleString?.toLowerCase()] || 0;
}

// Standard module names used throughout the application
export const MODULES = {
  ASSESSING: 'assessing',
  BUILDING_PERMITS: 'building_permit',
  TAX_COLLECTION: 'taxCollection',
  TOWN_CLERK: 'townClerk',
  MOTOR_VEHICLE: 'motorVehicle',
  FINANCE: 'finance',
};

// Helper function to get role name from level
export function getGlobalRoleName(roleLevel) {
  return GLOBAL_ROLE_NAMES[roleLevel] || 'Unknown';
}

export function getModuleRoleName(roleLevel) {
  return MODULE_ROLE_NAMES[roleLevel] || 'Unknown';
}
