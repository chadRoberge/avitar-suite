# Building Permits Module - Technical Documentation

This document provides comprehensive technical documentation for the Building Permits module, including the commercial/contractor user dashboard, permit creation flow, and contractor management system.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [User Types & Access](#user-types--access)
3. [Database Models](#database-models)
4. [API Routes](#api-routes)
5. [Frontend Routes](#frontend-routes)
6. [Subscription & Feature System](#subscription--feature-system)
7. [Permit Creation Flow](#permit-creation-flow)
8. [Contractor Management](#contractor-management)
9. [Common Tasks](#common-tasks)

---

## Architecture Overview

### Key Architectural Decisions

- **Separate Contractor Model** - Not embedded in User model for scalability
- **Team Member Support** - Multiple users per contractor company
- **Cross-Municipality View** - Contractors see all permits regardless of town
- **Subscription-Based Features** - Premium features behind feature flags
- **Role-Based Routing** - Automatic redirect based on user type

### Data Flow

```
User Login
    ↓
Check global_role
    ↓
┌─────────────────────────────────────────────┐
│ contractor/citizen → /my-permits            │
│ municipal_user/staff → /municipality-select │
└─────────────────────────────────────────────┘
```

---

## User Types & Access

### Global Roles

| Role | Access | Primary Route |
|------|--------|---------------|
| `contractor` | Own company's permits across all municipalities | `/my-permits` |
| `citizen` | Only their own permits | `/my-permits` |
| `municipal_user` | All permits in their municipality | `/m/:slug/building-permits/queue` |
| `avitar_staff` | All municipalities, all permits | `/municipality-select` |
| `avitar_admin` | System-wide admin access | `/municipality-select` |

### Permission Levels

```javascript
permissionLevel: {
  avitar_admin: 900,
  avitar_staff: 800,
  municipal_user: 400,
  contractor: 200,
  citizen: 100
}
```

---

## Database Models

### 1. Contractor Model (`server/models/Contractor.js`)

#### Core Fields
```javascript
{
  // Company Information
  company_name: String (required),
  license_number: String (required, unique),
  license_state: String (required),
  license_expiration: Date (required),
  license_type: Enum,

  // Business Info
  business_info: {
    address: { street, city, state, zip },
    phone: String,
    email: String,
    website: String
  },

  // Team Structure
  owner_user_id: ObjectId (ref: User, required),
  members: [{
    user_id: ObjectId (ref: User),
    role: Enum ['owner', 'admin', 'employee', 'office_staff'],
    permissions: [String],
    title: String,
    is_active: Boolean
  }]
}
```

#### Subscription System
```javascript
{
  subscription: {
    plan: Enum ['free', 'basic', 'professional', 'enterprise'],
    status: Enum ['active', 'trial', 'past_due', 'cancelled', 'inactive'],
    trial_ends_at: Date,
    current_period_start: Date,
    current_period_end: Date,
    stripe_customer_id: String,
    stripe_subscription_id: String,

    features: {
      team_management: Boolean,
      stored_payment_methods: Boolean,
      advanced_reporting: Boolean,
      priority_support: Boolean,
      api_access: Boolean,
      custom_branding: Boolean,
      max_team_members: Number  // Free: 1, Basic: 5, Pro: 20, Enterprise: Unlimited
    }
  }
}
```

#### Payment Methods
```javascript
{
  payment_methods: [{
    stripe_payment_method_id: String (required),
    type: Enum ['card', 'bank_account'],
    is_default: Boolean,
    card_brand: String,  // visa, mastercard, amex
    card_last4: String,
    card_exp_month: Number,
    card_exp_year: Number,
    billing_name: String,
    billing_address: { street, city, state, zip, country },
    authorized_users: [ObjectId],  // Users who can use this card
    added_by: ObjectId (ref: User),
    added_at: Date
  }]
}
```

#### Municipality Approvals
```javascript
{
  municipality_approvals: [{
    municipality_id: ObjectId (ref: Municipality),
    municipality_name: String,
    status: Enum ['pending', 'approved', 'denied', 'suspended', 'revoked'],
    approved_by: ObjectId (ref: User),
    approved_date: Date,
    registration_number: String,
    restrictions: [String]
  }]
}
```

#### Helper Methods
```javascript
// Team Management
isMember(userId)                    // Check if user is team member
isOwner(userId)                     // Check if user is owner
getMemberRole(userId)               // Get user's role
userHasPermission(userId, perm)     // Check permission
addMember(userId, role, perms)      // Add team member
removeMember(userId)                // Remove team member

// Subscription Features
hasFeature(featureName)             // Check if feature enabled
canAddTeamMember()                  // Check team limit
getDefaultPaymentMethod()           // Get default payment
canUserUsePaymentMethod(userId, pmId) // Check card authorization

// Municipality
isApprovedForMunicipality(munId)    // Check approval status
addMunicipalityApproval(munId, ...)  // Request/grant approval
```

---

### 2. User Model Updates (`server/models/User.js`)

#### New Fields
```javascript
{
  global_role: Enum [..., 'contractor'],  // Added contractor
  contractor_id: ObjectId (ref: Contractor, sparse)
}
```

#### New Methods
```javascript
isContractor()           // Check if user is contractor
isCitizen()             // Check if user is citizen
isContractorOrCitizen() // Check if either
```

---

### 3. Permit Model Updates (`server/models/Permit.js`)

#### New Fields
```javascript
{
  // New contractor tracking
  contractor_id: ObjectId (ref: Contractor),  // Links to Contractor entity
  submitted_by: ObjectId (ref: User),         // User who submitted permit

  // Legacy contractor info (for backward compatibility)
  contractor: {
    companyName: String,
    licenseNumber: String,
    contactName: String,
    email: String,
    phone: String,
    address: String
  }
}
```

#### New Indexes
```javascript
{ municipalityId: 1, contractor_id: 1 }
{ municipalityId: 1, submitted_by: 1 }
{ contractor_id: 1, status: 1 }           // For contractor dashboard
{ submitted_by: 1, status: 1 }            // For user dashboard
{ createdBy: 1, status: 1 }               // For user's own permits
```

#### Static Query Methods
```javascript
// Find permits for a contractor company (all team members)
Permit.findByContractor(contractorId, options)

// Find permits created/submitted by a specific user
Permit.findByUser(userId, options)

// Smart method - contractors get all company permits, citizens get own
Permit.findAccessibleByUser(user, options)
```

**Example Usage:**
```javascript
// Contractor user - returns all permits for their company
const permits = await Permit.findAccessibleByUser(contractorUser);

// Citizen user - returns only their own permits
const permits = await Permit.findAccessibleByUser(citizenUser);
```

---

## API Routes

### Contractor Management (`/api/contractors`)

#### Public Routes
```javascript
GET  /contractors/search?municipalityId=xxx&search=xxx&verified_only=true
     → Search contractors for permit application
```

#### CRUD Operations
```javascript
POST   /contractors
       → Create new contractor (on registration)
       Body: { company_name, license_number, license_state, ... }

GET    /contractors/:contractorId
       → Get contractor details (members only)

PUT    /contractors/:contractorId
       → Update contractor info (owner/admin only)

DELETE /contractors/:contractorId
       → Deactivate contractor (owner only)
```

#### Team Member Management
```javascript
POST   /contractors/:contractorId/members
       → Add team member
       Body: { email, role, permissions, title }
       ✓ Checks subscription limits
       ✓ Checks feature access

PUT    /contractors/:contractorId/members/:userId
       → Update member role/permissions
       Body: { role, permissions, title }

DELETE /contractors/:contractorId/members/:userId
       → Remove team member
       ✓ Cannot remove owner
```

#### Municipality Approvals
```javascript
POST   /contractors/:contractorId/municipality-approvals
       → Request/grant municipality approval
       Body: { municipalityId, municipalityName, registrationNumber }
```

---

### Permit Routes (`/api/permits`)

#### User's Permits (Cross-Municipality)
```javascript
GET    /permits/my-permits?status=xxx&municipalityId=xxx
       → Get all permits accessible by current user
       ✓ Contractors: All company permits
       ✓ Citizens: Only their own permits
       ✓ Returns: permits, stats, byMunicipality, userInfo

Response:
{
  permits: [...],
  stats: { total, draft, submitted, under_review, approved, denied, closed },
  byMunicipality: [
    { municipality: { id, name, slug }, permits: [...] }
  ],
  userInfo: { isContractor, contractor_id }
}
```

#### Municipal Staff Routes
```javascript
GET    /municipalities/:municipalityId/permits/queue
       → Get permits queue for staff
       ✓ Filtered by municipality
       ✓ Includes: queue, needingAttention, expiringSoon, stats

POST   /municipalities/:municipalityId/permits
       → Create new permit
       Body: { permitData }
       ✓ Auto-sets contractor_id and submitted_by
```

---

## Frontend Routes

### My Permits Dashboard (`/my-permits`)

**Access:** Contractors and Citizens only

**Sub-routes:**
```javascript
/my-permits                    // Main dashboard (redirects to index)
/my-permits/index             // Active permits view
/my-permits/active            // Active permits (future)
/my-permits/history           // Historical permits (future)
/my-permits/permit/:permit_id // Permit detail
/my-permits/create            // Create new permit (5-step wizard)
```

**Features:**
- Cross-municipality permit list with municipality column
- Stats cards: Total, Active, Draft, Completed
- Tabbed interface: All, Active, Drafts, Completed
- Advanced filtering: search, municipality, status, sort
- Conditional UI based on contractor vs citizen
- "Manage Company" button for contractors

---

### Contractor Management (`/contractor-management`)

**Access:** Contractors only (with `contractor_id`)

**Sub-routes:**
```javascript
/contractor-management/team              // Team member management
/contractor-management/subscription      // Subscription & billing (future)
/contractor-management/payment-methods   // Stored payment methods (future)
/contractor-management/settings          // Company settings (future)
```

#### Team Management Page

**Features:**
- Subscription feature gate with upgrade prompts
- Team stats: Active Members, Plan, Available Slots
- Team member table with:
  - Avatar, name, email
  - Role (owner/admin/employee/office_staff)
  - Job title
  - Permissions (as badges)
  - Actions (edit/remove - except owner)

**Add Member Modal:**
- Email input (user must exist)
- Role selection
- Job title (optional)
- Granular permissions:
  - Submit Permits
  - Edit Permits
  - View All Permits
  - View Own Permits
  - Manage Team
  - Manage Company Info

**Validation:**
- Checks `hasFeature('team_management')`
- Validates against `max_team_members` limit
- Shows upgrade prompts when blocked

---

### Permit Creation Wizard (`/my-permits/create`)

**5-Step Process:**

#### Step 1: Municipality Selection
- Shows approved municipalities for contractors
- Card-based selection UI
- Auto-loads permit types for selected municipality

#### Step 2: Property Search & Selection
- Search bar (address or PID)
- Real-time property search
- Search results as cards
- Shows selected property with change option

#### Step 3: Permit Type Selection
- Shows configured permit types
- Icons and descriptions
- Categories: building, electrical, plumbing, etc.

#### Step 4: Permit Details Form
**Required:**
- Work Description (textarea)
- Estimated Value ($)

**Optional:**
- Scope of Work (textarea)
- Square Footage

**Pre-filled Applicant Info:**
- Name (from user profile)
- Email
- Phone

#### Step 5: Review & Submit
- Visual review of all selections
- Two options:
  - **Submit Application** → `status: 'submitted'`
  - **Save Draft** → `status: 'draft'`

**Navigation:**
- Progress bar with step indicators
- Previous/Next buttons
- Can click previous steps to review
- Cancel with confirmation

---

## Subscription & Feature System

### Subscription Plans

```javascript
plans: {
  free: {
    max_team_members: 1,  // Owner only
    team_management: false,
    stored_payment_methods: false,
    advanced_reporting: false,
    priority_support: false,
    api_access: false,
    custom_branding: false
  },
  basic: {
    max_team_members: 5,
    team_management: false,  // Still no team management
    ...
  },
  professional: {
    max_team_members: 20,
    team_management: true,   // ✓ Team management unlocked
    stored_payment_methods: true,
    advanced_reporting: true,
    ...
  },
  enterprise: {
    max_team_members: 999999,  // Unlimited
    team_management: true,
    stored_payment_methods: true,
    advanced_reporting: true,
    priority_support: true,
    api_access: true,
    custom_branding: true
  }
}
```

### Feature Gating Implementation

**Backend (Contractor Model):**
```javascript
contractor.hasFeature('team_management')  // Returns true/false
contractor.canAddTeamMember()             // Checks limit
```

**Frontend (Controller):**
```javascript
get hasTeamManagementFeature() {
  return this.contractor.subscription?.features?.team_management === true;
}

@action
openAddMemberModal() {
  if (!this.hasTeamManagementFeature) {
    this.notifications.warning('Premium feature. Please upgrade.');
    this.router.transitionTo('contractor-management.subscription');
    return;
  }

  if (!this.canAddMember) {
    this.notifications.warning('Team member limit reached.');
    this.router.transitionTo('contractor-management.subscription');
    return;
  }

  this.showAddMemberModal = true;
}
```

**Template (Feature Gate):**
```handlebars
{{#unless this.hasTeamManagementFeature}}
  <div class="upgrade-prompt">
    <h3>Team Management is a Premium Feature</h3>
    <p>Upgrade to Professional or Enterprise plan...</p>
    <LinkTo @route="contractor-management.subscription">
      Upgrade Now
    </LinkTo>
  </div>
{{/unless}}
```

### Subscription Status Checks

```javascript
// Active subscription required
subscription.status === 'active' || subscription.status === 'trial'

// Feature check
if (subscription.status === 'active' && subscription.features.team_management) {
  // Allow feature
}
```

---

## Permit Creation Flow

### Data Structure

```javascript
permitData = {
  // Selection Steps
  municipalityId: '...',           // Step 1
  propertyId: '...',               // Step 2
  permitTypeId: '...',             // Step 3
  type: 'building',                // Primary category

  // Details Step (Step 4)
  description: '...',              // Required
  scopeOfWork: '...',              // Optional
  estimatedValue: 50000,           // Required
  squareFootage: 2000,             // Optional

  applicant: {
    name: 'John Smith',            // Pre-filled
    email: 'john@contractor.com',  // Pre-filled
    phone: '555-1234',             // Pre-filled
    relationshipToProperty: 'contractor'
  },

  // Auto-set Fields
  contractor_id: '...',            // From currentUser
  submitted_by: '...',             // From currentUser
  createdBy: '...',                // From currentUser
  status: 'submitted' or 'draft'   // Step 5 choice
}
```

### Validation Rules

**Step 1:** `!!selectedMunicipality`
**Step 2:** `!!selectedProperty`
**Step 3:** `!!selectedPermitType`
**Step 4:**
```javascript
!!description && description.trim().length > 0 && estimatedValue >= 0
```
**Step 5:** All previous validations pass

### API Call (Submit)

```javascript
POST /municipalities/:municipalityId/permits
Body: permitData

// Backend auto-adds:
- Permit number generation
- Timestamps (applicationDate, etc.)
- Status history entry
```

---

## Contractor Management

### Team Member Permissions

**Available Permissions:**
```javascript
permissions: [
  'manage_team',           // Add/remove team members
  'submit_permits',        // Create and submit permits
  'edit_permits',          // Edit permit applications
  'view_all_permits',      // View all company permits
  'view_own_permits',      // Only view own permits
  'manage_company_info'    // Edit company settings
]
```

**Permission Inheritance:**
- **Owner**: Has all permissions automatically
- **Admin**: Usually has manage_team + manage_company_info
- **Employee**: Usually has submit_permits + edit_permits + view_all_permits
- **Office Staff**: Usually has view_all_permits only

### Team Member Roles

```javascript
roles: {
  owner: {
    description: 'Company owner',
    default_permissions: ['*'],  // All permissions
    can_be_removed: false
  },
  admin: {
    description: 'Can manage team and settings',
    default_permissions: [
      'manage_team',
      'submit_permits',
      'edit_permits',
      'view_all_permits',
      'manage_company_info'
    ]
  },
  employee: {
    description: 'Standard team member',
    default_permissions: [
      'submit_permits',
      'edit_permits',
      'view_all_permits'
    ]
  },
  office_staff: {
    description: 'Administrative support',
    default_permissions: [
      'view_all_permits'
    ]
  }
}
```

### Payment Method Authorization

**Stored Card Access:**
```javascript
// Owner adds payment method
contractor.payment_methods.push({
  stripe_payment_method_id: 'pm_xxx',
  card_last4: '4242',
  authorized_users: [userId1, userId2],  // Can use this card
  ...
});

// Check if user can use card
contractor.canUserUsePaymentMethod(userId, paymentMethodId)
  // Returns true if:
  // - User is owner, OR
  // - User is in authorized_users array
```

**Use Cases:**
1. Owner adds company card
2. Owner authorizes foreman and project manager
3. Foreman submits permit → can select this card for payment
4. Office staff (not authorized) → card hidden from them

---

## Common Tasks

### Add a New Subscription Feature

**1. Update Contractor Model:**
```javascript
// server/models/Contractor.js
subscription: {
  features: {
    team_management: Boolean,
    stored_payment_methods: Boolean,
    new_feature_name: Boolean,  // Add here
    ...
  }
}
```

**2. Add to Helper Method:**
```javascript
// Already works automatically via hasFeature()
contractor.hasFeature('new_feature_name')
```

**3. Frontend Check:**
```javascript
// In controller
get hasNewFeature() {
  return this.contractor.subscription?.features?.new_feature_name === true;
}

// In template
{{#if this.hasNewFeature}}
  <!-- Feature content -->
{{else}}
  <!-- Upgrade prompt -->
{{/if}}
```

---

### Create a New Team Permission

**1. Add to Available Permissions:**
```javascript
// app/controllers/contractor-management/team.js
get availablePermissions() {
  return [
    // ... existing
    {
      id: 'new_permission_name',
      label: 'New Permission',
      description: 'What this permission allows'
    }
  ];
}
```

**2. Check Permission on Backend:**
```javascript
// In route/middleware
const canDoAction = contractor.userHasPermission(
  userId,
  'new_permission_name'
);
```

**3. Check Permission on Frontend:**
```javascript
// In component/controller
const member = contractor.members.find(m => m.user_id === currentUserId);
const hasPermission = member?.permissions?.includes('new_permission_name');
```

---

### Add Contractor to Municipality

**1. Contractor requests approval:**
```javascript
POST /contractors/:contractorId/municipality-approvals
Body: {
  municipalityId: 'xxx',
  municipalityName: 'Town of Example',
  registrationNumber: '12345'  // Optional
}
```

**2. Municipal staff approves (or auto-approve if requester is staff):**
```javascript
// If requester is municipal_user with access to municipalityId
// → Auto-approves with status: 'approved'

// Otherwise
// → Creates with status: 'pending'
// → Municipal staff manually approves later
```

**3. Check approval status:**
```javascript
contractor.isApprovedForMunicipality(municipalityId)
  // Returns true if status === 'approved'
```

---

### Query Permits for Dashboard

**Contractor Dashboard:**
```javascript
// Backend automatically filters
GET /permits/my-permits

// Returns all permits where:
// - contractor_id matches user's contractor, OR
// - createdBy matches user._id, OR
// - submitted_by matches user._id
```

**Municipal Staff Dashboard:**
```javascript
GET /municipalities/:municipalityId/permits/queue

// Returns permits filtered by:
// - municipalityId
// - status: submitted, under_review, on_hold
```

---

## Testing Checklist

### Contractor Registration & Setup
- [ ] Create contractor account
- [ ] Verify contractor_id linked to user
- [ ] Check default subscription (plan: 'free')
- [ ] Verify owner is in members array
- [ ] Login redirects to `/my-permits`

### Team Management (Free Plan)
- [ ] Try to add team member → Shows upgrade prompt
- [ ] Verify feature gate prevents access
- [ ] Check upgrade link works

### Team Management (Professional Plan)
- [ ] Set subscription plan to 'professional'
- [ ] Set `features.team_management = true`
- [ ] Add team member successfully
- [ ] Verify member appears in table
- [ ] Edit member permissions
- [ ] Remove member (not owner)
- [ ] Try to remove owner → Blocked

### Permit Creation Flow
- [ ] Click "New Application"
- [ ] Step 1: Select municipality (only approved ones shown)
- [ ] Step 2: Search property, select result
- [ ] Step 3: Select permit type
- [ ] Step 4: Fill details, validate required fields
- [ ] Step 5: Review, submit
- [ ] Verify permit created with contractor_id and submitted_by
- [ ] Check permit appears in dashboard

### Dashboard Filtering
- [ ] Search by permit number
- [ ] Filter by municipality
- [ ] Filter by status
- [ ] Sort by date/status/municipality
- [ ] Clear filters
- [ ] Verify municipality column shows correct data

### Cross-Municipality View
- [ ] Create permits in multiple municipalities
- [ ] Verify all show in single dashboard
- [ ] Verify municipality column differentiates them
- [ ] Filter to single municipality

### Subscription Limits
- [ ] Set max_team_members to 2
- [ ] Add 2 members successfully
- [ ] Try to add 3rd → Shows limit reached message
- [ ] Verify upgrade prompt shown

---

## File Structure

```
server/
├── models/
│   ├── Contractor.js           // Contractor entity with subscription
│   ├── User.js                 // Added contractor_id reference
│   └── Permit.js               // Added contractor_id, submitted_by
└── routes/
    ├── contractors.js          // Contractor CRUD & team management
    └── permits.js              // Added /permits/my-permits endpoint

app/
├── routes/
│   ├── my-permits.js           // Main contractor/citizen dashboard
│   ├── my-permits/
│   │   ├── index.js
│   │   └── create.js           // 5-step permit wizard
│   └── contractor-management/
│       ├── team.js             // Team member management
│       ├── subscription.js     // Future: Subscription page
│       ├── payment-methods.js  // Future: Payment methods
│       └── settings.js         // Future: Company settings
├── controllers/
│   ├── my-permits/
│   │   ├── index.js
│   │   └── create.js
│   └── contractor-management/
│       └── team.js
├── templates/
│   ├── my-permits.hbs          // Layout with header
│   ├── my-permits/
│   │   ├── index.hbs           // Dashboard with filters
│   │   └── create.hbs          // 5-step wizard UI
│   └── contractor-management/
│       └── team.hbs            // Team management UI
└── services/
    └── current-user.js         // Added contractor helper methods
```

---

## Environment Variables

For Stripe integration (when implementing subscription/payment):

```env
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_PUBLISHABLE_KEY=pk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
```

---

## Future Enhancements

### Subscription Management
- Stripe integration for plan upgrades
- Subscription management UI
- Webhook handlers for subscription events
- Trial period handling
- Billing history

### Payment Methods
- Add/remove payment methods UI
- Authorize users for card access
- Default payment method selection
- Payment method expiration warnings

### Advanced Features
- Usage analytics and reporting
- API access for enterprise customers
- Custom branding (logos, colors)
- Priority support ticketing
- Bulk permit submission
- Template permits

### Team Collaboration
- Permit assignment to team members
- Activity feed/audit log
- Team notifications
- Shared notes on permits

---

## Support & Troubleshooting

### Common Issues

**User can't access contractor management:**
- Verify `global_role === 'contractor'`
- Verify `contractor_id` is set
- Check contractor exists in database

**Team management blocked:**
- Check `subscription.status === 'active'`
- Check `subscription.features.team_management === true`
- Verify not at `max_team_members` limit

**Permit creation fails:**
- Verify contractor approved for municipality
- Check all required fields filled
- Verify property exists in municipality
- Check permit type is active

**Can't add team member:**
- Verify user exists (search by email)
- Check user isn't already a member
- Verify not at team limit
- Check feature is enabled

---

## Credits

Built with:
- **Ember.js 6.1.0** (Octane Edition)
- **MongoDB/Mongoose** for data persistence
- **Express.js** for API routes
- **Stripe** integration (pending) for subscriptions

---

Last Updated: 2025-01-15
Version: 1.0.0
