# Quick Start: Module-Specific Role Permissions

## Key Concept

**Users have different role levels for different modules.** A user might be an Editor in Building Permits but only Read Only in Assessing.

## Modules in the System

```
- assessing          (Assessing/Property Valuation)
- buildingPermits    (Building Permits)
- taxCollection      (Tax Collection)
- townClerk          (Town Clerk)
- motorVehicle       (Motor Vehicle)
- finance            (Finance)
```

## Role Levels (Within Each Module)

```
1 = Read Only     - Can only view data
2 = Editor        - Can create and edit data
3 = Reviewer      - Can review and approve items
4 = Admin         - Full module administration
```

## Template Usage - Module-Specific (RECOMMENDED)

This is the **primary way** to check permissions since users have different roles per module.

### Show Edit Button (Editors and above in Assessing)
```handlebars
{{! Check role specifically for Assessing module }}
{{#if (has-module-role this.currentUser "assessing" 2)}}
  <button {{on "click" this.edit}}>Edit</button>
{{/if}}
```

### Show Delete Button (Admins only in Building Permits)
```handlebars
{{#if (has-module-role this.currentUser "buildingPermits" 4)}}
  <button {{on "click" this.delete}}>Delete</button>
{{/if}}
```

### Show Different Messages Based on Module Permission
```handlebars
{{#if (has-module-role this.currentUser "taxCollection" 2)}}
  <p>Create your first tax lien to get started</p>
{{else}}
  <p>Contact a Tax Collection editor for access</p>
{{/if}}
```

### Multiple Module Checks
```handlebars
{{! Show button if user has Editor role in EITHER module }}
{{#if (or
  (has-module-role this.currentUser "assessing" 2)
  (has-module-role this.currentUser "buildingPermits" 2))}}
  <button>Edit Property</button>
{{/if}}
```

## Alternative Template Syntax

You can also get the role level and compare it:

```handlebars
{{! Get role level, then compare }}
{{#if (gte (module-role-level this.currentUser "assessing") 2)}}
  <button {{on "click" this.edit}}>Edit</button>
{{/if}}
```

This is useful when you need to use the role level multiple times:

```handlebars
{{#let (module-role-level this.currentUser "assessing") as |roleLevel|}}
  {{#if (gte roleLevel 1)}}
    <button {{on "click" this.view}}>View</button>
  {{/if}}
  {{#if (gte roleLevel 2)}}
    <button {{on "click" this.edit}}>Edit</button>
  {{/if}}
  {{#if (gte roleLevel 4)}}
    <button {{on "click" this.delete}}>Delete</button>
  {{/if}}
{{/let}}
```

## Controller Usage

### Import Constants
```javascript
import { MODULE_ROLE_LEVELS, MODULES } from '../constants/role-hierarchy';

export default class MyController extends Controller {
  @service('current-user') currentUser;

  // Check module-specific permission
  get canEditAssessing() {
    return this.currentUser.getModuleRoleLevel(MODULES.ASSESSING) >= MODULE_ROLE_LEVELS.EDITOR;
  }

  get canDeleteBuildingPermits() {
    return this.currentUser.getModuleRoleLevel(MODULES.BUILDING_PERMITS) >= MODULE_ROLE_LEVELS.ADMIN;
  }

  @action
  deleteItem() {
    // Check permission for this specific module
    if (this.currentUser.getModuleRoleLevel('assessing') < MODULE_ROLE_LEVELS.ADMIN) {
      this.notifications.warning('Admin permission required in Assessing module');
      return;
    }
    // Proceed with deletion
  }
}
```

### Use Helper Methods
```javascript
export default class MyController extends Controller {
  @service('current-user') currentUser;

  @action
  saveProperty() {
    if (!this.currentUser.hasModuleRoleLevel('assessing', MODULE_ROLE_LEVELS.EDITOR)) {
      this.notifications.warning('Editor role required in Assessing');
      return;
    }
    // Proceed with save
  }
}
```

## Global Role Checks (Less Common)

Use these only for system-wide features that aren't module-specific:

### Global Roles
```
1 = Citizen
2 = Contractor
3 = Municipal User
4 = Avitar Staff
5 = Avitar Admin
```

### Global Permission Template
```handlebars
{{! Show Avitar staff-only debug tools }}
{{#if (gte currentUser.roleLevel 4)}}
  <div class="debug-tools">...</div>
{{/if}}
```

## Permission Level Guide by Module

### Assessing Module
| Action | Level | Template Code |
|--------|-------|---------------|
| View properties | 1 | `(has-module-role ... "assessing" 1)` |
| Edit properties | 2 | `(has-module-role ... "assessing" 2)` |
| Approve abatements | 3 | `(has-module-role ... "assessing" 3)` |
| Delete properties | 4 | `(has-module-role ... "assessing" 4)` |

### Building Permits Module
| Action | Level | Template Code |
|--------|-------|---------------|
| View permits | 1 | `(has-module-role ... "buildingPermits" 1)` |
| Create/edit permits | 2 | `(has-module-role ... "buildingPermits" 2)` |
| Approve permits | 3 | `(has-module-role ... "buildingPermits" 3)` |
| Delete permits | 4 | `(has-module-role ... "buildingPermits" 4)` |

### Tax Collection Module
| Action | Level | Template Code |
|--------|-------|---------------|
| View tax records | 1 | `(has-module-role ... "taxCollection" 1)` |
| Record payments | 2 | `(has-module-role ... "taxCollection" 2)` |
| Approve adjustments | 3 | `(has-module-role ... "taxCollection" 3)` |
| Delete records | 4 | `(has-module-role ... "taxCollection" 4)` |

## Real-World Example

See `app/templates/municipality/assessing/settings/waterfront.hbs` for a complete example with module-specific permissions:
- ✅ All buttons check "assessing" module role specifically
- ✅ Editor-level controls for add/edit buttons
- ✅ Admin-level controls for delete buttons
- ✅ Context-aware messages: "Contact an Assessing editor..."

## Migration from Old Checks

**Before:**
```handlebars
{{! Old way - checking municipality-wide role }}
{{#if (eq currentUser.currentMunicipalPermissions.role "admin")}}
  <button {{on "click" this.edit}}>Edit</button>
{{/if}}
```

**After:**
```handlebars
{{! New way - checking module-specific role }}
{{#if (has-module-role this.currentUser "assessing" 4)}}
  <button {{on "click" this.edit}}>Edit</button>
{{/if}}
```

## Common Patterns

### Pattern 1: Edit Button in Assessing
```handlebars
{{#if (has-module-role this.currentUser "assessing" 2)}}
  <button type="button" class="avitar-btn avitar-btn--primary" {{on "click" this.edit}}>
    <i class="fas fa-edit avitar-mr-2"></i>
    Edit Property
  </button>
{{/if}}
```

### Pattern 2: Delete Button in Building Permits
```handlebars
{{#if (has-module-role this.currentUser "buildingPermits" 4)}}
  <button type="button" class="avitar-btn avitar-btn--danger" {{on "click" this.delete}}>
    <i class="fas fa-trash avitar-mr-2"></i>
    Delete Permit
  </button>
{{/if}}
```

### Pattern 3: Empty State with Context-Aware Message
```handlebars
<div class="avitar-empty-state">
  <div class="avitar-text-muted avitar-mb-4">
    {{#if (has-module-role this.currentUser "taxCollection" 2)}}
      Create your first tax lien to get started
    {{else}}
      Contact a Tax Collection editor to create tax liens
    {{/if}}
  </div>
  {{#if (has-module-role this.currentUser "taxCollection" 2)}}
    <button {{on "click" this.create}}>Create Tax Lien</button>
  {{/if}}
</div>
```

### Pattern 4: Progressive Feature Display
```handlebars
<div class="feature-panel">
  {{! Everyone can view (level 1+) }}
  <button {{on "click" this.view}}>View</button>

  {{! Editors can edit (level 2+) }}
  {{#if (has-module-role this.currentUser "assessing" 2)}}
    <button {{on "click" this.edit}}>Edit</button>
  {{/if}}

  {{! Reviewers can approve (level 3+) }}
  {{#if (has-module-role this.currentUser "assessing" 3)}}
    <button {{on "click" this.approve}}>Approve</button>
  {{/if}}

  {{! Admins can delete (level 4) }}
  {{#if (has-module-role this.currentUser "assessing" 4)}}
    <button {{on "click" this.delete}}>Delete</button>
  {{/if}}
</div>
```

## Checklist for New Templates

When building a new feature:

1. [ ] **Identify the module** - Which module is this feature part of?
2. [ ] **Add service to controller** - `@service('current-user') currentUser;`
3. [ ] **Wrap edit buttons** - `{{#if (has-module-role this.currentUser "moduleName" 2)}}`
4. [ ] **Wrap delete buttons** - `{{#if (has-module-role this.currentUser "moduleName" 4)}}`
5. [ ] **Update empty states** - Add context-aware messages for read-only users
6. [ ] **Test with different roles** - Verify UI changes based on role level

## Available Helpers

```handlebars
{{has-module-role currentUser "moduleName" level}}   - Check if user has role in module ⭐
{{module-role-level currentUser "moduleName"}}       - Get user's role level in module
{{gte a b}}                                          - Greater than or equal
{{gt a b}}                                           - Greater than
{{lte a b}}                                          - Less than or equal
{{lt a b}}                                           - Less than
{{eq a b}}                                           - Equal to
```

## Key Takeaway

**Always check permissions at the module level**, not municipality-wide, because users can have different roles in different modules.

```handlebars
✅ CORRECT: {{#if (has-module-role this.currentUser "assessing" 2)}}
❌ WRONG:   {{#if (gte this.currentUser.currentMunicipalRoleLevel 2)}}
```

## Full Documentation

See `ROLE-BASED-PERMISSIONS.md` for comprehensive documentation with all patterns and examples.
