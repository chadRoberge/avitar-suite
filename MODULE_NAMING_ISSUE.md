# Module Naming Convention Issue

## Problem

There are **multiple building permit modules** with different names in the database:
1. `buildingPermits` (camelCase) - Old/manually created module
2. `building_permit` (snake_case singular) - Created from Stripe trial activation

## Root Cause

### Inconsistent Naming Across Codebase

**1. Code Constants** (`server/config/modules.js`):
```javascript
BUILDING_PERMITS: 'buildingPermits'  // camelCase
```

**2. Permissions** (`server/config/permissions.js`):
```javascript
case 'building_permits':  // snake_case plural
```

**3. Stripe Products** (metadata):
```json
{
  "module": "building_permit"  // snake_case singular
}
```

### How Modules Are Created

**Trial Activation Flow:**
1. User clicks "Start Trial" on subscription page
2. Frontend calls: `POST /municipalities/:id/modules/:module/trial`
3. Module name comes from: `this.args.module.module` (line 70 of trial-activation-modal.js)
4. This uses the Stripe product's `module` metadata value: `"building_permit"`
5. Backend creates module with this exact name in database

**Result:** Module created with name `building_permit` (from Stripe)

**Manual/Script Creation:**
- If module was created manually or via setup script
- Likely used the constant from `server/config/modules.js`: `buildingPermits`

**Result:** Module created with name `buildingPermits` (from code constant)

## Impact

1. **Duplicate modules in database** - Municipality has both `buildingPermits` and `building_permit`
2. **User confusion** - Both show as "Building Permits" in add user modal
3. **Permission mismatches** - Different parts of code expect different module names
4. **Subscription tracking issues** - Only `building_permit` has trial subscription

## Solution

### Short Term (Immediate Fix)

**Clean up database** - Remove duplicate building permit modules:

```javascript
// MongoDB command to remove duplicate buildingPermits module
db.municipalities.updateOne(
  { name: "Test Township" },
  { $unset: { "module_config.modules.buildingPermits": "" } }
)
```

Keep only `building_permit` since it has the active trial subscription.

### Long Term (Recommended Fix)

**Standardize module naming across the entire codebase:**

1. **Choose ONE naming convention** (recommend: snake_case singular to match Stripe)
   - `assessing`
   - `building_permit`
   - `code_enforcement`
   - `tax_collection`
   - etc.

2. **Update Stripe product metadata** to use standardized names:
   ```bash
   stripe products update prod_xxx --metadata module=building_permit
   ```

3. **Update code constants** in `server/config/modules.js`:
   ```javascript
   const MODULES = {
     ASSESSING: 'assessing',
     BUILDING_PERMIT: 'building_permit',  // Changed from 'buildingPermits'
     TAX_COLLECTION: 'tax_collection',
     // etc.
   };
   ```

4. **Update permissions** in `server/config/permissions.js`:
   ```javascript
   case 'building_permit':  // Match new standard
   ```

5. **Create migration script** to rename existing modules in all municipalities:
   ```javascript
   // Rename buildingPermits -> building_permit
   db.municipalities.updateMany(
     { "module_config.modules.buildingPermits": { $exists: true } },
     {
       $rename: { "module_config.modules.buildingPermits": "module_config.modules.building_permit" }
     }
   )
   ```

6. **Update formatModuleName** to handle both old and new names during transition:
   ```javascript
   formatModuleName(moduleName) {
     const nameMap = {
       assessing: 'Assessing',
       'building_permit': 'Building Permits',
       'building-permits': 'Building Permits',  // Legacy
       'buildingPermits': 'Building Permits',   // Legacy
       // etc.
     };
     return nameMap[moduleName] || moduleName;
   }
   ```

## Current Database State

Test Township has:
- ✅ `assessing` - tier: premium, subscription: trialing
- ⚠️ `buildingPermits` - tier: basic, subscription: none (DUPLICATE - remove this)
- ✅ `building_permit` - tier: basic, subscription: trialing (KEEP this one)

## Recommendation

1. **Immediate**: Remove the `buildingPermits` module from Test Township
2. **Next sprint**: Standardize all module names to snake_case singular
3. **Create migration**: Rename all existing modules in production database
4. **Update documentation**: Document the standard module naming convention

## Files That Need Updates

If standardizing to `building_permit`:

- `server/config/modules.js` - Update BUILDING_PERMITS constant
- `server/config/permissions.js` - Update case statement
- `server/middleware/moduleAuth.js` - Update any hardcoded names
- Frontend route files - Update any hardcoded module references
- Documentation - Update module name references
