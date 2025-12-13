# Module-Specific Permissions System - Summary

## The Problem

Users need different permission levels in different modules. For example:
- Jane is an **Editor** in Building Permits (can create/edit permits)
- Jane is **Read Only** in Tax Collection (can only view)
- Jane is an **Admin** in Town Clerk (full control)

The old system only checked municipality-wide roles, which didn't support this granularity.

## The Solution

A numeric role hierarchy system with **module-specific** permission checking.

## System Components

### 1. Role Hierarchy (`app/constants/role-hierarchy.js`)
```javascript
// Module roles - used within each module
1 = Read Only
2 = Editor
3 = Reviewer
4 = Admin

// Modules in system
- assessing
- buildingPermits
- taxCollection
- townClerk
- motorVehicle
- finance
```

### 2. Enhanced Current User Service (`app/services/current-user.js`)
```javascript
// Get role level for specific module
currentUser.getModuleRoleLevel('assessing')  // Returns 1-4

// Check if user has minimum role level in module
currentUser.hasModuleRoleLevel('assessing', MODULE_ROLE_LEVELS.EDITOR)  // Returns true/false
```

### 3. Template Helpers
```handlebars
{{! Primary helper - check role in specific module }}
{{has-module-role currentUser "assessing" 2}}  ⭐

{{! Alternative - get role level, then compare }}
{{module-role-level currentUser "assessing"}}

{{! Comparison helpers }}
{{gte a b}}  {{gt a b}}  {{lte a b}}  {{lt a b}}
```

## Usage Patterns

### Pattern 1: Edit Button (Most Common)
```handlebars
{{! Show edit button only if user has Editor role (2+) in Assessing }}
{{#if (has-module-role this.currentUser "assessing" 2)}}
  <button {{on "click" this.edit}}>Edit</button>
{{/if}}
```

### Pattern 2: Delete Button (Admins Only)
```handlebars
{{! Show delete button only if user has Admin role (4) in Building Permits }}
{{#if (has-module-role this.currentUser "buildingPermits" 4)}}
  <button {{on "click" this.delete}}>Delete</button>
{{/if}}
```

### Pattern 3: Context-Aware Messages
```handlebars
{{#if (has-module-role this.currentUser "taxCollection" 2)}}
  <p>Create your first tax lien</p>
{{else}}
  <p>Contact a Tax Collection editor for access</p>
{{/if}}
```

### Pattern 4: Progressive Feature Display
```handlebars
{{! Different features for different role levels }}
<div class="toolbar">
  {{! Level 1+ can view }}
  <button {{on "click" this.view}}>View</button>

  {{! Level 2+ can edit }}
  {{#if (has-module-role this.currentUser "assessing" 2)}}
    <button {{on "click" this.edit}}>Edit</button>
  {{/if}}

  {{! Level 3+ can approve }}
  {{#if (has-module-role this.currentUser "assessing" 3)}}
    <button {{on "click" this.approve}}>Approve</button>
  {{/if}}

  {{! Level 4 can delete }}
  {{#if (has-module-role this.currentUser "assessing" 4)}}
    <button {{on "click" this.delete}}>Delete</button>
  {{/if}}
</div>
```

## Controller Usage

```javascript
import { MODULE_ROLE_LEVELS, MODULES } from '../constants/role-hierarchy';

export default class AssessingController extends Controller {
  @service('current-user') currentUser;

  get canEdit() {
    return this.currentUser.getModuleRoleLevel(MODULES.ASSESSING) >= MODULE_ROLE_LEVELS.EDITOR;
  }

  @action
  deleteProperty() {
    if (this.currentUser.getModuleRoleLevel('assessing') < MODULE_ROLE_LEVELS.ADMIN) {
      this.notifications.warning('Admin permission required in Assessing');
      return;
    }
    // Proceed with deletion
  }
}
```

## Real-World Example

The waterfront settings page (`app/templates/municipality/assessing/settings/waterfront.hbs`) demonstrates all patterns:

```handlebars
{{! Add Water Body button - requires Editor role in Assessing }}
{{#if (has-module-role this.currentUser "assessing" 2)}}
  <button {{on "click" this.openNewWaterBodyModal}}>
    Add Water Body
  </button>
{{/if}}

{{! Edit button - Editor role }}
{{#if (has-module-role this.currentUser "assessing" 2)}}
  <button {{on "click" (fn this.edit waterBody)}}>Edit</button>
{{/if}}

{{! Delete button - Admin role only }}
{{#if (has-module-role this.currentUser "assessing" 4)}}
  <button {{on "click" (fn this.delete waterBody)}}>Delete</button>
{{/if}}

{{! Empty state with context-aware message }}
{{#if (has-module-role this.currentUser "assessing" 2)}}
  <p>Create your first water body to get started</p>
{{else}}
  <p>Contact an Assessing editor to configure water bodies</p>
{{/if}}
```

## Module-Specific vs Global

### Use Module-Specific (99% of cases)
```handlebars
✅ {{#if (has-module-role this.currentUser "assessing" 2)}}
```
For features within a specific module (Assessing, Building Permits, Tax Collection, etc.)

### Use Global (1% of cases)
```handlebars
{{#if (gte currentUser.roleLevel 4)}}  {{! Avitar Staff }}
```
For system-wide features like debug tools, global settings, etc.

## Migration Checklist

When updating an existing template:

1. **Identify the module** - Is this Assessing? Building Permits? Tax Collection?
2. **Find permission checks** - Search for role comparisons
3. **Update to module-specific** - Replace with `has-module-role` helper
4. **Update messages** - Specify module name: "Contact an Assessing editor..."
5. **Test with different roles** - Verify correct buttons show/hide

### Before
```handlebars
{{#if (eq currentUser.currentMunicipalPermissions.role "admin")}}
  <button>Edit</button>
{{/if}}

{{#if (or
  (eq currentUser.currentMunicipalPermissions.role "admin")
  (eq currentUser.currentMunicipalPermissions.role "editor"))}}
  <button>Save</button>
{{/if}}
```

### After
```handlebars
{{#if (has-module-role this.currentUser "assessing" 4)}}
  <button>Edit</button>
{{/if}}

{{#if (has-module-role this.currentUser "assessing" 2)}}
  <button>Save</button>
{{/if}}
```

## Benefits

✅ **Granular Control** - Different permissions per module
✅ **Cleaner Code** - Simple numeric comparisons vs complex OR conditions
✅ **Better UX** - Show relevant "contact X editor" messages
✅ **Scalable** - Easy to add new modules and permission levels
✅ **Maintainable** - Clear, consistent pattern across codebase

## Quick Reference

| What You Need | Template Code |
|---------------|---------------|
| Edit button in Assessing | `{{#if (has-module-role this.currentUser "assessing" 2)}}` |
| Delete button in Building Permits | `{{#if (has-module-role this.currentUser "buildingPermits" 4)}}` |
| Create button in Tax Collection | `{{#if (has-module-role this.currentUser "taxCollection" 2)}}` |
| Approve button in Town Clerk | `{{#if (has-module-role this.currentUser "townClerk" 3)}}` |

## Files Created

- `app/constants/role-hierarchy.js` - Role level constants and module names
- `app/helpers/has-module-role.js` - Primary permission check helper ⭐
- `app/helpers/module-role-level.js` - Get role level helper
- `app/helpers/gte.js`, `gt.js`, `lte.js`, `lt.js` - Comparison helpers
- `app/services/current-user.js` - Enhanced with module role methods
- `QUICK-START-ROLES.md` - Quick reference guide ⭐
- `ROLE-BASED-PERMISSIONS.md` - Comprehensive documentation
- `MODULE-PERMISSIONS-SUMMARY.md` - This file

## Need Help?

1. **Quick start** → Read `QUICK-START-ROLES.md`
2. **Copy/paste patterns** → Check waterfront settings template
3. **Comprehensive guide** → Read `ROLE-BASED-PERMISSIONS.md`

## Remember

**Always check permissions at the module level:**

```handlebars
✅ CORRECT: {{#if (has-module-role this.currentUser "assessing" 2)}}
❌ WRONG:   {{#if (gte this.currentUser.currentMunicipalRoleLevel 2)}}
```

Users have different roles in different modules!
