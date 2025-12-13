# Role-Based Permissions System

This document explains the numeric role hierarchy system for implementing permission-based UI features.

## Overview

The system uses **numeric role levels** instead of string comparisons, allowing you to use greater-than/less-than logic in templates and JavaScript:

```handlebars
{{! Instead of checking string equality }}
{{#if (eq currentUser.role "admin")}}

{{! Use numeric comparisons }}
{{#if (gte currentUser.currentMunicipalRoleLevel 4)}}
```

## Role Hierarchies

### Global Roles (System-Wide)

| Role | Level | Description |
|------|-------|-------------|
| Citizen | 1 | Citizens - lowest permissions |
| Contractor | 2 | Contractors - can submit permits |
| Municipal User | 3 | Municipal staff - varies by module |
| Avitar Staff | 4 | Avitar staff - full system access |
| Avitar Admin | 5 | Avitar admin - highest permissions |

### Module Roles (Within a Module)

| Role | Level | Description |
|------|-------|-------------|
| Read Only | 1 | Can only view data |
| Editor | 2 | Can create and edit data |
| Reviewer | 3 | Can review and approve items |
| Admin | 4 | Full module administration |

## Current User Service Properties

### Role Level Getters

```javascript
// Global role level (1-5)
this.currentUser.roleLevel
this.currentUser.globalRoleLevel  // Same as above

// Current municipality role level (1-4)
this.currentUser.currentMunicipalRoleLevel

// Specific module role level (1-4)
this.currentUser.getModuleRoleLevel('assessing')
this.currentUser.getModuleRoleLevel('buildingPermits')
```

### Role Check Methods

```javascript
// Check if user has at least a certain global role level
this.currentUser.hasGlobalRoleLevel(GLOBAL_ROLE_LEVELS.AVITAR_STAFF)

// Check if user has at least a certain municipal role level
this.currentUser.hasMunicipalRoleLevel(MODULE_ROLE_LEVELS.EDITOR)

// Check if user has at least a certain module role level
this.currentUser.hasModuleRoleLevel('assessing', MODULE_ROLE_LEVELS.REVIEWER)
```

## Template Usage

### Using Comparison Helpers

Available helpers: `gte`, `gt`, `lte`, `lt`, `eq`

```handlebars
{{! Show edit button for editors and above }}
{{#if (gte currentUser.currentMunicipalRoleLevel 2)}}
  <button {{on "click" this.edit}}>Edit</button>
{{/if}}

{{! Show delete button for admins only }}
{{#if (gte currentUser.currentMunicipalRoleLevel 4)}}
  <button {{on "click" this.delete}}>Delete</button>
{{/if}}

{{! Show message for users below editor level }}
{{#if (lt currentUser.currentMunicipalRoleLevel 2)}}
  <p class="avitar-text-muted">Contact your administrator to request edit access</p>
{{/if}}

{{! Show features for Avitar staff and above }}
{{#if (gte currentUser.roleLevel 4)}}
  <div class="admin-tools">
    {{! Admin tools here }}
  </div>
{{/if}}
```

### Using Role Level Constants

```handlebars
{{! Import the helper to use constants by name }}
{{#if (gte currentUser.currentMunicipalRoleLevel (role-level "EDITOR" "module"))}}
  <button {{on "click" this.edit}}>Edit</button>
{{/if}}

{{#if (gte currentUser.roleLevel (role-level "AVITAR_STAFF"))}}
  <div class="staff-only-section">
    {{! Staff features }}
  </div>
{{/if}}
```

### Common Template Patterns

#### Edit Button (Editors and Above)

```handlebars
{{#if (gte currentUser.currentMunicipalRoleLevel 2)}}
  <button type="button" class="avitar-btn avitar-btn--primary" {{on "click" this.edit}}>
    <i class="fas fa-edit avitar-mr-2"></i>
    Edit
  </button>
{{/if}}
```

#### Delete Button (Admins Only)

```handlebars
{{#if (gte currentUser.currentMunicipalRoleLevel 4)}}
  <button type="button" class="avitar-btn avitar-btn--danger" {{on "click" this.delete}}>
    <i class="fas fa-trash avitar-mr-2"></i>
    Delete
  </button>
{{/if}}
```

#### Settings Link (Reviewers and Above)

```handlebars
{{#if (gte currentUser.currentMunicipalRoleLevel 3)}}
  <LinkTo @route="municipality.assessing.settings" class="avitar-btn avitar-btn--secondary">
    <i class="fas fa-cog avitar-mr-2"></i>
    Settings
  </LinkTo>
{{/if}}
```

#### Module-Specific Permissions

```handlebars
{{! Show features based on module-specific role }}
{{#let (currentUser.getModuleRoleLevel "assessing") as |assessingRoleLevel|}}
  {{#if (gte assessingRoleLevel 2)}}
    <button {{on "click" this.editProperty}}>Edit Property</button>
  {{/if}}

  {{#if (gte assessingRoleLevel 3)}}
    <button {{on "click" this.approveAbatement}}>Approve Abatement</button>
  {{/if}}
{{/let}}
```

## Controller/Component Usage

### Import Constants

```javascript
import {
  GLOBAL_ROLE_LEVELS,
  MODULE_ROLE_LEVELS,
} from '../constants/role-hierarchy';

export default class MyController extends Controller {
  @service('current-user') currentUser;

  get canEdit() {
    return this.currentUser.currentMunicipalRoleLevel >= MODULE_ROLE_LEVELS.EDITOR;
  }

  get canApprove() {
    return this.currentUser.currentMunicipalRoleLevel >= MODULE_ROLE_LEVELS.REVIEWER;
  }

  get canDelete() {
    return this.currentUser.currentMunicipalRoleLevel >= MODULE_ROLE_LEVELS.ADMIN;
  }

  get isStaffOrAbove() {
    return this.currentUser.roleLevel >= GLOBAL_ROLE_LEVELS.AVITAR_STAFF;
  }

  @action
  async deleteItem(item) {
    // Check permission before action
    if (this.currentUser.currentMunicipalRoleLevel < MODULE_ROLE_LEVELS.ADMIN) {
      this.notifications.warning('You do not have permission to delete items');
      return;
    }

    // Proceed with deletion
    await this.api.delete(`/items/${item.id}`);
  }
}
```

### Using Role Check Methods

```javascript
export default class MyController extends Controller {
  @service('current-user') currentUser;

  @action
  performAction() {
    // Use the built-in check methods
    if (!this.currentUser.hasMunicipalRoleLevel(MODULE_ROLE_LEVELS.EDITOR)) {
      this.notifications.warning('Editor role required');
      return;
    }

    // Proceed with action
  }

  @action
  async approveItem(item) {
    if (!this.currentUser.hasModuleRoleLevel('assessing', MODULE_ROLE_LEVELS.REVIEWER)) {
      this.notifications.warning('Reviewer role required in Assessing module');
      return;
    }

    // Proceed with approval
    await this.api.post(`/items/${item.id}/approve`);
  }
}
```

## Complete Example

### Waterfront Edit Modal (Before)

```handlebars
{{! Old string-based check }}
{{#if (eq currentUser.currentMunicipalPermissions.role "admin")}}
  <button {{on "click" this.edit}}>Edit</button>
{{/if}}

{{#if (or
  (eq currentUser.currentMunicipalPermissions.role "admin")
  (eq currentUser.currentMunicipalPermissions.role "editor"))}}
  <button {{on "click" this.save}}>Save</button>
{{/if}}
```

### Waterfront Edit Modal (After)

```handlebars
{{! New numeric comparison - much cleaner! }}
{{#if (gte currentUser.currentMunicipalRoleLevel 4)}}
  <button {{on "click" this.edit}}>Edit</button>
{{/if}}

{{#if (gte currentUser.currentMunicipalRoleLevel 2)}}
  <button {{on "click" this.save}}>Save</button>
{{/if}}
```

## Progressive Feature Display

Show different UI elements based on role level:

```handlebars
<div class="feature-panel">
  {{! Everyone sees view button }}
  <button {{on "click" this.view}}>View</button>

  {{! Editors and above see edit button }}
  {{#if (gte currentUser.currentMunicipalRoleLevel 2)}}
    <button {{on "click" this.edit}}>Edit</button>
  {{/if}}

  {{! Reviewers and above see approve button }}
  {{#if (gte currentUser.currentMunicipalRoleLevel 3)}}
    <button {{on "click" this.approve}}>Approve</button>
  {{/if}}

  {{! Admins see delete button }}
  {{#if (gte currentUser.currentMunicipalRoleLevel 4)}}
    <button {{on "click" this.delete}}>Delete</button>
  {{/if}}

  {{! Avitar staff see debug tools }}
  {{#if (gte currentUser.roleLevel 4)}}
    <button {{on "click" this.debug}}>Debug</button>
  {{/if}}
</div>
```

## Migration Guide

### Step 1: Identify Current Permission Checks

Find templates using string-based role checks:

```bash
# Search for role string comparisons
grep -r "(eq.*role" app/templates/
grep -r "currentMunicipalPermissions.role" app/
```

### Step 2: Replace with Numeric Comparisons

**Before:**
```handlebars
{{#if (eq currentUser.currentMunicipalPermissions.role "admin")}}
```

**After:**
```handlebars
{{#if (gte currentUser.currentMunicipalRoleLevel 4)}}
```

### Step 3: Update Controllers/Components

**Before:**
```javascript
get canEdit() {
  return ['admin', 'editor'].includes(this.currentUser.currentMunicipalPermissions?.role);
}
```

**After:**
```javascript
import { MODULE_ROLE_LEVELS } from '../constants/role-hierarchy';

get canEdit() {
  return this.currentUser.currentMunicipalRoleLevel >= MODULE_ROLE_LEVELS.EDITOR;
}
```

## Best Practices

1. **Use Named Constants in JavaScript**
   ```javascript
   // Good - readable and maintainable
   if (this.currentUser.currentMunicipalRoleLevel >= MODULE_ROLE_LEVELS.EDITOR) {

   // Avoid - magic numbers
   if (this.currentUser.currentMunicipalRoleLevel >= 2) {
   ```

2. **Use Numbers in Templates (for simplicity)**
   ```handlebars
   {{! Good - simple and clear }}
   {{#if (gte currentUser.currentMunicipalRoleLevel 2)}}

   {{! Also good - more explicit but verbose }}
   {{#if (gte currentUser.currentMunicipalRoleLevel (role-level "EDITOR" "module"))}}
   ```

3. **Document Magic Numbers**
   ```handlebars
   {{! Editor level (2) and above can edit }}
   {{#if (gte currentUser.currentMunicipalRoleLevel 2)}}
     <button {{on "click" this.edit}}>Edit</button>
   {{/if}}
   ```

4. **Use Specific Role Levels**
   ```javascript
   // Good - specific to the module
   this.currentUser.getModuleRoleLevel('assessing')

   // Use when checking municipality-wide permissions
   this.currentUser.currentMunicipalRoleLevel

   // Use for system-wide checks
   this.currentUser.roleLevel
   ```

## Reference Table

### Quick Permission Lookup

| Feature | Minimum Role Level | Code |
|---------|-------------------|------|
| View data | 1 (Read Only) | `(gte ... 1)` |
| Edit data | 2 (Editor) | `(gte ... 2)` |
| Approve/Review | 3 (Reviewer) | `(gte ... 3)` |
| Delete/Admin | 4 (Admin) | `(gte ... 4)` |
| System tools | 4 (Avitar Staff) | `(gte currentUser.roleLevel 4)` |

### Helper Reference

| Helper | Description | Example |
|--------|-------------|---------|
| `gte` | Greater than or equal | `{{#if (gte a b)}}` |
| `gt` | Greater than | `{{#if (gt a b)}}` |
| `lte` | Less than or equal | `{{#if (lte a b)}}` |
| `lt` | Less than | `{{#if (lt a b)}}` |
| `eq` | Equal to | `{{#if (eq a b)}}` |
| `role-level` | Get constant | `{{role-level "EDITOR" "module"}}` |

## Backward Compatibility

The numeric system is fully backward compatible. All existing string-based checks continue to work:

```javascript
// Still works
this.currentUser.isAvitarStaff
this.currentUser.canManageModules
this.currentUser.hasModulePermission('assessing', 'create')

// New additions
this.currentUser.roleLevel
this.currentUser.currentMunicipalRoleLevel
this.currentUser.hasModuleRoleLevel('assessing', MODULE_ROLE_LEVELS.EDITOR)
```
