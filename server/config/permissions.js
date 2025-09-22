/**
 * Permission Hierarchy System for Avitar Municipal Application
 *
 * Number-based hierarchy for easy mathematical comparisons in Ember logic
 * Higher numbers = more permissions
 * Use modulo operations to determine specific permission types
 */

// Base permission levels (0-99)
const PERMISSION_LEVELS = {
  // Public/Unauthenticated
  NONE: 0,

  // Residential Users (10-19)
  RESIDENTIAL_FREE: 10, // View own property, pay taxes
  RESIDENTIAL_PREMIUM: 15, // Historical data, alerts, document downloads

  // Commercial Users (20-39)
  COMMERCIAL_FREE: 20, // View own properties, pay taxes
  COMMERCIAL_BASIC: 25, // Multiple properties, basic reports
  COMMERCIAL_POWER: 30, // Advanced reports, bulk operations
  COMMERCIAL_SUPER: 35, // All commercial features, analytics

  // Municipal Staff (40-79)
  MUNICIPAL_BASIC: 40, // Basic municipal staff access
  MUNICIPAL_POWER: 50, // Department head level access
  MUNICIPAL_SUPER: 60, // Director/Manager level access

  // Department Specific (100-699) - Base + Department + Level
  // Formula: BASE_DEPT + (LEVEL * 10) + DEPT_CODE
  // Levels: 1=Basic, 2=Power, 3=Super
  // Department codes: 1=Assessing, 2=Building, 3=Clerk, 4=Tax, 5=MV, 6=Finance, 7=Code, 8=Planning, 9=IT

  // Assessing Department (101-139)
  ASSESSING_BASIC: 111, // View assessments, basic data entry
  ASSESSING_POWER: 121, // Edit assessments, run reports
  ASSESSING_SUPER: 131, // All assessing functions, manage settings

  // Building Permits Department (102-139)
  BUILDING_BASIC: 112, // View permits, basic data entry
  BUILDING_POWER: 122, // Edit permits, inspections, approvals
  BUILDING_SUPER: 132, // All building functions, manage codes

  // Town Clerk Department (103-139)
  CLERK_BASIC: 113, // View records, basic data entry
  CLERK_POWER: 123, // Vital records, licenses, certifications
  CLERK_SUPER: 133, // All clerk functions, manage forms

  // Tax Collection Department (104-139)
  TAX_BASIC: 114, // View tax records, payment processing
  TAX_POWER: 124, // Tax bills, collections, reports
  TAX_SUPER: 134, // All tax functions, manage rates

  // Motor Vehicle Department (105-139)
  MV_BASIC: 115, // View registrations, basic processing
  MV_POWER: 125, // Process registrations, manage renewals
  MV_SUPER: 135, // All MV functions, manage fees

  // Finance Department (106-139)
  FINANCE_BASIC: 116, // View financial data, basic entry
  FINANCE_POWER: 126, // Budgets, reports, analysis
  FINANCE_SUPER: 136, // All finance functions, audit trails

  // Code Enforcement (107-139)
  CODE_BASIC: 117, // View violations, basic data entry
  CODE_POWER: 127, // Issue violations, manage cases
  CODE_SUPER: 137, // All code functions, manage ordinances

  // Planning Department (108-139)
  PLANNING_BASIC: 118, // View applications, basic data entry
  PLANNING_POWER: 128, // Review applications, manage zoning
  PLANNING_SUPER: 138, // All planning functions, master plans

  // IT Department (109-139)
  IT_BASIC: 119, // Basic system access, user support
  IT_POWER: 129, // System configuration, user management
  IT_SUPER: 139, // All IT functions, system administration

  // Cross-Department Roles (700-799)
  INSPECTOR: 700, // Can edit in building permits, view-only elsewhere
  TREASURER: 710, // Full access to tax and finance
  CITY_MANAGER: 750, // High-level access across departments

  // System Administration (800-999)
  SYSTEM_ADMIN: 900, // Full system access
  SUPER_ADMIN: 999, // Ultimate access (Avitar staff)
};

// Department codes for permission calculations
const DEPARTMENTS = {
  ASSESSING: 1,
  BUILDING: 2,
  CLERK: 3,
  TAX: 4,
  MOTOR_VEHICLE: 5,
  FINANCE: 6,
  CODE_ENFORCEMENT: 7,
  PLANNING: 8,
  IT: 9,
};

// Permission categories for specific actions
const PERMISSIONS = {
  // View permissions
  VIEW_PUBLIC: 0,
  VIEW_OWN: 10,
  VIEW_DEPARTMENT: 40,
  VIEW_ALL: 60,

  // Edit permissions
  EDIT_NONE: 0,
  EDIT_OWN: 10,
  EDIT_BASIC: 40,
  EDIT_ADVANCED: 60,
  EDIT_ALL: 80,

  // Admin permissions
  ADMIN_NONE: 0,
  ADMIN_DEPARTMENT: 60,
  ADMIN_MUNICIPAL: 80,
  ADMIN_SYSTEM: 90,
};

/**
 * Helper functions for permission checking
 */
const PermissionHelpers = {
  // Check if user has minimum permission level
  hasMinimumPermission: (userLevel, requiredLevel) => {
    return userLevel >= requiredLevel;
  },

  // Check if user has permission for specific department
  hasDepartmentPermission: (userLevel, department, action = 'view') => {
    const deptCode = DEPARTMENTS[department.toUpperCase()];
    if (!deptCode) return false;

    // Check if user has department-specific permission
    const deptPermissionBase = 100 + deptCode;
    const userDeptLevel = Math.floor((userLevel - deptPermissionBase) / 10);

    if (userDeptLevel > 0) {
      switch (action.toLowerCase()) {
        case 'view':
          return true;
        case 'edit':
          return userDeptLevel >= 2; // Power level or higher
        case 'admin':
          return userDeptLevel >= 3; // Super level
        default:
          return false;
      }
    }

    // Check for cross-department roles
    if (userLevel >= PERMISSION_LEVELS.CITY_MANAGER) return true;
    if (userLevel >= PERMISSION_LEVELS.MUNICIPAL_SUPER && action === 'view')
      return true;

    return false;
  },

  // Check if user can access specific service
  canAccessService: (userLevel, service) => {
    switch (service.toLowerCase()) {
      case 'assessing':
        return userLevel >= PERMISSION_LEVELS.RESIDENTIAL_FREE;
      case 'building_permits':
        return userLevel >= PERMISSION_LEVELS.RESIDENTIAL_FREE;
      case 'town_clerk':
        return userLevel >= PERMISSION_LEVELS.RESIDENTIAL_FREE;
      case 'tax_collection':
        return userLevel >= PERMISSION_LEVELS.RESIDENTIAL_FREE;
      case 'motor_vehicle':
        return userLevel >= PERMISSION_LEVELS.RESIDENTIAL_FREE;
      case 'finance':
        return userLevel >= PERMISSION_LEVELS.MUNICIPAL_BASIC;
      case 'reports':
        return userLevel >= PERMISSION_LEVELS.COMMERCIAL_BASIC;
      case 'analytics':
        return userLevel >= PERMISSION_LEVELS.COMMERCIAL_SUPER;
      default:
        return false;
    }
  },

  // Get permission level name
  getPermissionLevelName: (level) => {
    for (const [key, value] of Object.entries(PERMISSION_LEVELS)) {
      if (value === level) {
        return key.toLowerCase().replace(/_/g, ' ');
      }
    }
    return 'unknown';
  },

  // Check if user is municipal staff
  isMunicipalStaff: (userLevel) => {
    return userLevel >= PERMISSION_LEVELS.MUNICIPAL_BASIC;
  },

  // Check if user is system admin
  isSystemAdmin: (userLevel) => {
    return userLevel >= PERMISSION_LEVELS.SYSTEM_ADMIN;
  },

  // Get user's highest department permission
  getHighestDepartmentPermission: (userLevel) => {
    if (userLevel < 111) return null;

    for (const [deptName, deptCode] of Object.entries(DEPARTMENTS)) {
      const basePermission = 100 + deptCode;
      if (
        userLevel >= basePermission + 10 &&
        userLevel <= basePermission + 39
      ) {
        const level = Math.floor((userLevel - basePermission) / 10);
        const levelName =
          level === 1 ? 'basic' : level === 2 ? 'power' : 'super';
        return {
          department: deptName.toLowerCase(),
          level: levelName,
          code: userLevel,
        };
      }
    }

    return null;
  },
};

// Export all permission-related constants and helpers
module.exports = {
  PERMISSION_LEVELS,
  DEPARTMENTS,
  PERMISSIONS,
  PermissionHelpers,
};
