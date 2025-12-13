# Stripe Product Tier Fix - Implementation Summary

## Problem

All product variants (Basic, Advanced, Premium) for a module were showing "Trial" status instead of just the specific product/tier that was actually subscribed.

### Root Cause
1. **Matching logic only checked module name**, not the specific product or tier
2. **Stripe products had incorrect tier metadata** - all showed `tier: "basic"` even for Premium/Advanced products
3. **Module config didn't store the stripe_product_id** when trials were started

## Solution Implemented

### Code Changes (Already Applied)

#### 1. Created `getPriceDataForModule` function
**File:** `server/services/stripeService.js` (lines 729-776)
- Returns `{ priceId, productId, tier }` instead of just `priceId`
- Extracts tier from product metadata
- Exported in module.exports (line 1242)

#### 2. Updated trial start endpoint
**File:** `server/routes/municipalitySubscriptions.js` (lines 75-130)
- Now uses `getPriceDataForModule` instead of `getPriceIdForModule`
- Stores `stripe_product_id` and `tier` in module config (lines 123-124)
- Added debug logging

#### 3. Enhanced module matching logic
**File:** `server/routes/municipalities.js` (lines 1314-1344)
- **Priority 1:** Match by `stripe_product_id` (most specific)
- **Priority 2:** Match by module name + tier
- **Priority 3:** Fallback to module name only (backward compatibility)

#### 4. Updated data structures
- Added `stripe_product_id` to activeModules array (line 1297)
- Added `stripe_product_id` to Stripe products response (line 575)

## Manual Steps Required

### Step 1: Fix Stripe Product Tier Metadata

Run these Stripe CLI commands to correct the tier metadata:

```bash
stripe products update prod_TUZhmF68amU7yy --metadata tier=premium
stripe products update prod_TUTM4WYawCFYE8 --metadata tier=advanced
stripe products update prod_TUTGFbdwbSMSkP --metadata tier=basic
stripe products update prod_StpVtTAUSOZqAg --metadata tier=advanced
stripe products update prod_Stobxzu5JiHn8H --metadata tier=basic
```

**Product Details:**
- `prod_TUZhmF68amU7yy` - Municipal Assessing CAMA - **Premium** (was "basic")
- `prod_TUTM4WYawCFYE8` - Municipal Assessing CAMA - **Advanced** (was "basic")
- `prod_TUTGFbdwbSMSkP` - Municipal Assessing CAMA - **Basic** (correct)
- `prod_StpVtTAUSOZqAg` - Municipal Building Permit Management - **Advanced** (was "basic")
- `prod_Stobxzu5JiHn8H` - Municipal Building Permits Management - **Basic** (correct)

### Step 2: Fix Existing Trial Subscriptions (Optional)

Existing trial subscriptions created before this fix don't have `stripe_product_id` stored. They will still work via tier matching, but for optimal matching, you can:

**Option A - Manual Database Update:**
Update the municipality's module_config to add the stripe_product_id for existing trials.

**Option B - Wait for next trial:**
When new trials are started, they will automatically have the stripe_product_id stored.

**Current State (Test Township):**
- `building_permit` module: tier='basic', stripe_product_id=undefined
- Currently matches via tier matching (which works fine)
- To add product ID, would need to determine which specific product was used

## How It Works Now

### New Trial Flow
1. User starts trial for "Municipal Assessing CAMA - Professional"
2. System calls `getPriceDataForModule` which returns:
   ```javascript
   {
     priceId: 'price_xxx',
     productId: 'prod_TUTM4WYawCFYE8',
     tier: 'advanced'
   }
   ```
3. Module config stores both `stripe_product_id` and `tier`
4. When displaying modules, system matches by product ID first (exact match)

### Module Matching Priority
```javascript
// 1. Exact product match (best)
if (am.stripe_product_id === module.stripe_product_id) return true;

// 2. Module + tier match (good)
if (am.module === module.module && am.tier === module.tier) return true;

// 3. Module only match (fallback for old data)
if (am.module === module.module && (!am.tier || !module.tier)) return true;
```

### Expected Result After Stripe Metadata Fix

When municipality has trial for "Municipal Assessing CAMA - Professional":
- ✅ **Professional tier** → `is_active: true`, `access_level: 'trial'`, shows "Trial" badge
- ✅ **Basic tier** → `is_active: false`, `access_level: 'none'`, shows "Upgrade" option
- ✅ **Premium tier** → `is_active: false`, `access_level: 'none'`, shows "Upgrade" option

## Testing Steps

1. **Update Stripe metadata** (run the CLI commands above)
2. **Refresh the modules page** in the browser
3. **Verify tier matching** in server logs:
   ```
   🔍 Module assessing (tier: premium): {
     hasActiveModule: false,  // Should be false for non-subscribed tiers
     matchedByProductId: false,
     matchedByTier: false
   }
   ```
4. **Start a new trial** for any module
5. **Check server logs** for:
   ```
   📦 Selected Stripe product for trial: {
     priceId: 'price_xxx',
     productId: 'prod_xxx',
     tier: 'premium',  // Should match the actual tier
     moduleName: 'assessing',
     parcelCount: 610
   }
   ```
6. **Verify the trial badge** only shows on the specific tier subscribed

## Backward Compatibility

- ✅ **Old trials without stripe_product_id** - Still work via tier matching
- ✅ **Modules without tier info** - Still work via module name matching
- ✅ **New trials** - Get full product ID and tier stored for best matching

## Files Modified

1. `server/services/stripeService.js`
   - Added `getPriceDataForModule` function
   - Updated `getAvailableModules` to include `stripe_product_id`

2. `server/routes/municipalitySubscriptions.js`
   - Updated trial start to use `getPriceDataForModule`
   - Store `stripe_product_id` and `tier` in module config

3. `server/routes/municipalities.js`
   - Enhanced module matching logic with 3-tier priority
   - Added `stripe_product_id` to activeModules array
   - Added detailed debug logging

## Next Steps

1. ✅ **Code changes** - Complete
2. ⏳ **Stripe metadata fix** - Run the CLI commands above
3. ⏳ **Test with real trial** - Start a trial and verify correct tier matching
4. ⏳ **Monitor logs** - Check that matching works correctly

## Rollback Plan

If issues occur, the system has fallback matching by module name only, so existing functionality won't break. The new code is fully backward compatible.
