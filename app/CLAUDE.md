# Building Permits Module - Claude Code Reference

This file provides quick reference for Claude Code when working with the Building Permits module's frontend code (routes, templates, controllers, components).

## Quick Navigation

- [Route Structure](#route-structure)
- [Controller Patterns](#controller-patterns)
- [Template Conventions](#template-conventions)
- [Component Guidelines](#component-guidelines)
- [Service Usage](#service-usage)
- [Common Patterns](#common-patterns)

---

## Route Structure

### My Permits Dashboard (Contractors & Citizens)

```
/my-permits
├── /my-permits (index)           - Main dashboard with permit list
├── /my-permits/create            - 5-step permit creation wizard
├── /my-permits/permit/:id        - Permit detail view
├── /my-permits/active            - Active permits (future)
└── /my-permits/history           - Historical permits (future)
```

**Route Files:**
```
app/routes/my-permits.js
app/routes/my-permits/index.js
app/routes/my-permits/create.js
```

**Key Pattern:**
```javascript
// app/routes/my-permits.js - Parent route
export default class MyPermitsRoute extends Route {
  @service('current-user') currentUser;
  @service api;

  async beforeModel() {
    // Only contractors and citizens can access
    if (!this.currentUser.isContractorOrCitizen) {
      this.router.transitionTo('municipality-select');
    }
  }

  async model() {
    const response = await this.api.get('/permits/my-permits');
    return {
      permits: response.permits,
      stats: response.stats,
      byMunicipality: response.byMunicipality,
      userInfo: response.userInfo
    };
  }
}
```

---

### Contractor Management

```
/contractor-management
├── /contractor-management/team              - Team member management
├── /contractor-management/subscription      - Subscription & billing
├── /contractor-management/payment-methods   - Payment methods
└── /contractor-management/settings          - Company settings
```

**Route Files:**
```
app/routes/contractor-management.js
app/routes/contractor-management/team.js
app/routes/contractor-management/subscription.js (future)
app/routes/contractor-management/payment-methods.js (future)
app/routes/contractor-management/settings.js (future)
```

**Key Pattern:**
```javascript
// app/routes/contractor-management.js - Parent route with contractor check
export default class ContractorManagementRoute extends Route {
  @service('current-user') currentUser;
  @service api;

  async beforeModel() {
    // Only contractors with contractor_id can access
    if (!this.currentUser.isContractor || !this.currentUser.user?.contractor_id) {
      this.router.transitionTo('my-permits');
    }
  }

  async model() {
    const contractorId = this.currentUser.user.contractor_id;
    const response = await this.api.get(`/contractors/${contractorId}`);
    return {
      contractor: response.contractor,
      user: this.currentUser.user,
      isOwner: response.contractor.owner_user_id === this.currentUser.user._id
    };
  }
}

// Child routes inherit parent model
export default class ContractorManagementTeamRoute extends Route {
  model() {
    return this.modelFor('contractor-management');
  }
}
```

---

## Controller Patterns

### Dashboard Controller Pattern

**File:** `app/controllers/my-permits/index.js`

```javascript
import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';

export default class MyPermitsIndexController extends Controller {
  @service router;
  @service('current-user') currentUser;

  // Tracked state for filters
  @tracked selectedTab = 'all';
  @tracked searchText = '';
  @tracked filterStatus = 'all';
  @tracked filterMunicipality = 'all';
  @tracked sortBy = 'date_desc';

  // Computed properties for options
  get statusOptions() {
    return [
      { value: 'all', label: 'All Statuses' },
      { value: 'draft', label: 'Draft' },
      // ... more options
    ];
  }

  // Filtered data
  get displayedPermits() {
    let permits = this.model.permits || [];

    // Apply filters
    if (this.selectedTab === 'active') {
      permits = permits.filter(p =>
        ['submitted', 'under_review', 'approved'].includes(p.status)
      );
    }

    // Apply search
    if (this.searchText) {
      const search = this.searchText.toLowerCase();
      permits = permits.filter(p =>
        p.permitNumber?.toLowerCase().includes(search) ||
        p.propertyAddress?.toLowerCase().includes(search)
      );
    }

    // Add computed properties (for template usage)
    permits = permits.map(p => ({
      ...p,
      statusBadge: this.getStatusBadge(p.status)
    }));

    return permits;
  }

  // Helper method for status badges
  getStatusBadge(status) {
    const badges = {
      draft: { class: 'avitar-badge avitar-badge--secondary', text: 'Draft' },
      submitted: { class: 'avitar-badge avitar-badge--primary', text: 'Submitted' },
      // ... more statuses
    };
    return badges[status] || { class: 'avitar-badge', text: status };
  }

  // Actions
  @action
  selectTab(tab) {
    this.selectedTab = tab;
  }

  @action
  updateSearch(event) {
    this.searchText = event.target.value;
  }

  @action
  viewPermit(permit) {
    this.router.transitionTo('my-permits.permit', permit.id);
  }
}
```

**Key Points:**
- Use `@tracked` for reactive state
- Computed properties with `get` for derived data
- `@action` for event handlers
- Pre-compute display data (like badges) in getter, not template
- Use service injection for router, api, notifications

---

### Wizard Controller Pattern

**File:** `app/controllers/my-permits/create.js`

```javascript
export default class MyPermitsCreateController extends Controller {
  @service router;
  @service api;
  @service notifications;

  // Wizard state
  @tracked currentStep = 1;
  @tracked selectedMunicipality = null;
  @tracked selectedProperty = null;
  @tracked selectedPermitType = null;

  // Validation
  get canGoNext() {
    switch (this.currentStep) {
      case 1: return !!this.selectedMunicipality;
      case 2: return !!this.selectedProperty;
      case 3: return !!this.selectedPermitType;
      case 4: return this.validatePermitDetails();
      default: return false;
    }
  }

  // Navigation
  @action
  nextStep() {
    if (this.canGoNext && this.currentStep < 5) {
      this.currentStep++;
      window.scrollTo(0, 0);  // Scroll to top on step change
    }
  }

  @action
  previousStep() {
    if (this.currentStep > 1) {
      this.currentStep--;
      window.scrollTo(0, 0);
    }
  }

  // Async actions
  @action
  async submitPermit() {
    this.isLoading = true;
    try {
      const permitData = {
        ...this.model.wizard.permitData,
        status: 'submitted',
        contractor_id: this.currentUser.user.contractor_id,
        submitted_by: this.currentUser.user._id
      };
      await this.api.post(`/municipalities/${this.selectedMunicipality.id}/permits`, permitData);
      this.notifications.success('Permit submitted successfully!');
      this.router.transitionTo('my-permits');
    } catch (error) {
      this.notifications.error(error.message || 'Failed to submit permit');
    } finally {
      this.isLoading = false;
    }
  }
}
```

**Key Points:**
- Multi-step validation with `canGoNext`
- Scroll to top on step changes
- Loading states for async operations
- Proper error handling with notifications
- Navigate away on success

---

### Feature-Gated Controller Pattern

**File:** `app/controllers/contractor-management/team.js`

```javascript
export default class ContractorManagementTeamController extends Controller {
  @service api;
  @service notifications;
  @service router;

  @tracked showAddMemberModal = false;

  // Feature checks
  get contractor() {
    return this.model.contractor;
  }

  get hasTeamManagementFeature() {
    return this.contractor.subscription?.features?.team_management === true;
  }

  get maxTeamMembers() {
    return this.contractor.subscription?.features?.max_team_members || 1;
  }

  get canAddMember() {
    return this.activeMembers.length < this.maxTeamMembers;
  }

  // Actions with feature gating
  @action
  openAddMemberModal() {
    // Check feature access
    if (!this.hasTeamManagementFeature) {
      this.notifications.warning('Team management is a premium feature.');
      this.router.transitionTo('contractor-management.subscription');
      return;
    }

    // Check limits
    if (!this.canAddMember) {
      this.notifications.warning(`Team member limit reached (${this.maxTeamMembers}).`);
      this.router.transitionTo('contractor-management.subscription');
      return;
    }

    this.showAddMemberModal = true;
  }

  @action
  async addTeamMember() {
    this.isLoading = true;
    try {
      await this.api.post(`/contractors/${this.contractor._id}/members`, {
        email: this.newMemberEmail,
        role: this.newMemberRole,
        permissions: this.newMemberPermissions
      });
      this.notifications.success('Team member added successfully');
      this.closeAddMemberModal();
      this.send('refreshModel');  // Refresh parent route model
    } catch (error) {
      this.notifications.error(error.message || 'Failed to add team member');
    } finally {
      this.isLoading = false;
    }
  }
}
```

**Key Points:**
- Feature checks via computed properties
- Gate actions before showing UI
- Redirect to upgrade page when blocked
- Use `this.send('refreshModel')` to reload parent route data

---

## Template Conventions

### Layout Structure

All building permit templates follow this pattern:

```handlebars
{{page-title "Page Title"}}

{{! Header with navigation }}
<header class="avitar-header avitar-bg-primary">
  <div class="avitar-container">
    {{! Title and actions }}
  </div>
</header>

{{! Main content }}
<main class="avitar-main">
  <div class="avitar-container avitar-py-6">
    {{! Content here }}
  </div>
</main>
```

---

### Dashboard Template Pattern

**File:** `app/templates/my-permits/index.hbs`

```handlebars
{{page-title "My Permits Dashboard"}}

{{! Action Bar }}
<div class="avitar-flex avitar-justify-between avitar-items-center avitar-mb-6">
  <div>
    <h2 class="avitar-text-2xl avitar-font-bold">Title</h2>
    <p class="avitar-text-sm avitar-text-muted">Subtitle</p>
  </div>
  <button type="button" class="avitar-btn avitar-btn--primary" {{on "click" this.action}}>
    <i class="fas fa-plus avitar-mr-2"></i>
    Button Text
  </button>
</div>

{{! Stats Cards }}
<div class="avitar-grid avitar-grid-cols-4 avitar-gap-6 avitar-mb-6">
  {{#each this.statsCards as |stat|}}
    <div class="avitar-card avitar-card--stat">
      <div class="avitar-card__body">
        <div class="avitar-stat">
          <div class="avitar-stat__value">{{stat.value}}</div>
          <div class="avitar-stat__label">{{stat.label}}</div>
        </div>
      </div>
    </div>
  {{/each}}
</div>

{{! Tabs }}
<div class="avitar-card">
  <div class="avitar-card__header avitar-bg-gray-50">
    <div class="avitar-tabs">
      <button type="button"
        class="avitar-tab {{if (eq this.selectedTab 'all') 'avitar-tab--active'}}"
        {{on "click" (fn this.selectTab "all")}}>
        All
      </button>
    </div>
  </div>

  <div class="avitar-card__body">
    {{! Filters }}
    <div class="avitar-flex avitar-gap-3 avitar-mb-4">
      <input type="text" class="avitar-input"
        placeholder="Search..."
        value={{this.searchText}}
        {{on "input" this.updateSearch}} />

      <select class="avitar-select" {{on "change" this.setFilter}}>
        {{#each this.filterOptions as |option|}}
          <option value={{option.value}} selected={{eq this.filter option.value}}>
            {{option.label}}
          </option>
        {{/each}}
      </select>
    </div>

    {{! Table }}
    {{#if this.displayedItems.length}}
      <table class="avitar-table avitar-table--hover">
        <thead>
          <tr>
            <th>Column 1</th>
            <th>Column 2</th>
          </tr>
        </thead>
        <tbody>
          {{#each this.displayedItems as |item|}}
            <tr {{on "click" (fn this.viewItem item)}}>
              <td>{{item.field}}</td>
            </tr>
          {{/each}}
        </tbody>
      </table>
    {{else}}
      {{! Empty state }}
      <div class="avitar-empty-state avitar-py-8">
        <i class="fas fa-icon fa-3x avitar-text-muted avitar-mb-4"></i>
        <h3 class="avitar-text-lg avitar-font-semibold">No Items</h3>
        <p class="avitar-text-muted">Message here</p>
      </div>
    {{/if}}
  </div>
</div>
```

---

### Modal Template Pattern

```handlebars
{{#if this.showModal}}
  <div class="avitar-modal-overlay avitar-modal-overlay--visible"
    {{on "click" this.closeModal}}>
    <div class="avitar-modal avitar-modal--lg"
      {{on "click" this.stopPropagation}}
      role="dialog"
      aria-modal="true">

      {{! Header }}
      <div class="avitar-modal__header">
        <h2 class="avitar-modal__title">
          <i class="fas fa-icon avitar-mr-2"></i>
          Modal Title
        </h2>
        <button type="button" class="avitar-modal__close" {{on "click" this.closeModal}}>
          <i class="fas fa-times"></i>
        </button>
      </div>

      {{! Body }}
      <div class="avitar-modal__body">
        <div class="avitar-space-y-4">
          <div>
            <label class="avitar-label">Field Label</label>
            <input type="text" class="avitar-input"
              value={{this.fieldValue}}
              {{on "input" this.updateField}} />
          </div>
        </div>
      </div>

      {{! Footer }}
      <div class="avitar-modal__footer">
        <button type="button" class="avitar-btn avitar-btn--secondary"
          {{on "click" this.closeModal}}>
          Cancel
        </button>
        <button type="button" class="avitar-btn avitar-btn--primary"
          {{on "click" this.submitAction}}
          disabled={{this.isLoading}}>
          {{#if this.isLoading}}
            <i class="fas fa-spinner fa-spin avitar-mr-2"></i>
            Saving...
          {{else}}
            Save
          {{/if}}
        </button>
      </div>
    </div>
  </div>
{{/if}}
```

**Key Points:**
- Overlay click closes modal
- Inner div has `stopPropagation` to prevent close on content click
- Loading states on submit button
- Proper ARIA attributes

---

### Feature Gate Template Pattern

```handlebars
{{! Feature Gate with Upgrade Prompt }}
{{#unless this.hasFeature}}
  <div class="avitar-card avitar-bg-warning-light avitar-border-warning avitar-mb-6">
    <div class="avitar-card__body avitar-p-4">
      <div class="avitar-flex avitar-items-start avitar-gap-4">
        <div class="avitar-flex-shrink-0">
          <div class="avitar-w-12 avitar-h-12 avitar-rounded-full avitar-bg-warning avitar-text-white avitar-flex avitar-items-center avitar-justify-center">
            <i class="fas fa-lock fa-lg"></i>
          </div>
        </div>
        <div class="avitar-flex-1">
          <h3 class="avitar-text-lg avitar-font-semibold avitar-mb-2">
            Premium Feature
          </h3>
          <p class="avitar-text-muted avitar-mb-4">
            Upgrade to unlock this feature.
          </p>
          <LinkTo @route="contractor-management.subscription" class="avitar-btn avitar-btn--primary">
            <i class="fas fa-arrow-up avitar-mr-2"></i>
            Upgrade Now
          </LinkTo>
        </div>
      </div>
    </div>
  </div>
{{/unless}}

{{! Actual feature content (only shows if feature enabled) }}
{{#if this.hasFeature}}
  {{! Feature content here }}
{{/if}}
```

---

### Wizard Template Pattern

**File:** `app/templates/my-permits/create.hbs`

```handlebars
{{! Progress Indicator }}
<div class="avitar-card avitar-mb-6">
  <div class="avitar-card__body avitar-py-4">
    {{! Step circles }}
    <div class="avitar-flex avitar-justify-between avitar-mb-4">
      {{#each this.steps as |step|}}
        <div class="avitar-flex avitar-flex-col avitar-items-center avitar-flex-1"
          {{on "click" (fn this.goToStep step.number)}}>
          <div class="avitar-w-12 avitar-h-12 avitar-rounded-full
            {{if (eq this.currentStep step.number) 'avitar-bg-primary avitar-text-white'
              (if (gt this.currentStep step.number) 'avitar-bg-success avitar-text-white'
                'avitar-bg-gray-200 avitar-text-gray-600')}}">
            {{#if (gt this.currentStep step.number)}}
              <i class="fas fa-check"></i>
            {{else}}
              <i class="fas fa-{{step.icon}}"></i>
            {{/if}}
          </div>
          <span class="avitar-text-xs avitar-font-medium">{{step.name}}</span>
        </div>
      {{/each}}
    </div>

    {{! Progress bar }}
    <div class="avitar-w-full avitar-bg-gray-200 avitar-rounded-full avitar-h-2">
      <div class="avitar-bg-primary avitar-h-2 avitar-rounded-full"
        style="width: {{this.progressPercentage}}%"></div>
    </div>
  </div>
</div>

{{! Step Content }}
<div class="avitar-card">
  <div class="avitar-card__body">
    {{#if (eq this.currentStep 1)}}
      {{! Step 1 content }}
    {{else if (eq this.currentStep 2)}}
      {{! Step 2 content }}
    {{/if}}
  </div>

  {{! Navigation Footer }}
  <div class="avitar-card__footer avitar-flex avitar-justify-between">
    <div>
      {{#if this.canGoPrevious}}
        <button type="button" class="avitar-btn avitar-btn--secondary"
          {{on "click" this.previousStep}}>
          <i class="fas fa-arrow-left avitar-mr-2"></i>
          Previous
        </button>
      {{/if}}
    </div>

    <div>
      {{#if this.isLastStep}}
        <button type="button" class="avitar-btn avitar-btn--primary"
          {{on "click" this.submitWizard}}
          disabled={{this.isLoading}}>
          Submit
        </button>
      {{else}}
        <button type="button" class="avitar-btn avitar-btn--primary"
          {{on "click" this.nextStep}}
          disabled={{(not this.canGoNext)}}>
          Next
          <i class="fas fa-arrow-right avitar-ml-2"></i>
        </button>
      {{/if}}
    </div>
  </div>
</div>
```

---

## Component Guidelines

### Component Creation

When creating new components for building permits:

```bash
ember generate component building-permits/component-name
```

**File structure:**
```
app/components/building-permits/
├── component-name.js
└── component-name.hbs
```

---

### Component Pattern

```javascript
// app/components/building-permits/permit-card.js
import Component from '@glimmer/component';
import { action } from '@ember/object';

export default class BuildingPermitsPermitCardComponent extends Component {
  // Args from parent:
  // @permit - permit object
  // @onView - action to view permit

  get statusBadgeClass() {
    const status = this.args.permit.status;
    const classes = {
      draft: 'avitar-badge--secondary',
      submitted: 'avitar-badge--primary',
      approved: 'avitar-badge--success'
    };
    return `avitar-badge ${classes[status] || 'avitar-badge--secondary'}`;
  }

  @action
  handleClick() {
    this.args.onView?.(this.args.permit);
  }
}
```

```handlebars
{{! app/components/building-permits/permit-card.hbs }}
<div class="avitar-card avitar-card--hover" {{on "click" this.handleClick}}>
  <div class="avitar-card__body">
    <div class="avitar-flex avitar-justify-between avitar-items-start">
      <div>
        <h3 class="avitar-font-semibold">{{@permit.permitNumber}}</h3>
        <p class="avitar-text-sm avitar-text-muted">{{@permit.propertyAddress}}</p>
      </div>
      <span class={{this.statusBadgeClass}}>
        {{@permit.status}}
      </span>
    </div>
  </div>
</div>
```

**Usage in template:**
```handlebars
{{#each this.permits as |permit|}}
  <BuildingPermits::PermitCard
    @permit={{permit}}
    @onView={{this.viewPermit}} />
{{/each}}
```

---

## Service Usage

### Current User Service

**File:** `app/services/current-user.js`

```javascript
// In route/controller/component
@service('current-user') currentUser;

// Check user type
this.currentUser.isContractor           // true if contractor
this.currentUser.isCitizen             // true if citizen
this.currentUser.isContractorOrCitizen // true if either
this.currentUser.isMunicipalStaff      // true if municipal or avitar staff

// Access user data
this.currentUser.user.first_name
this.currentUser.user.email
this.currentUser.user.contractor_id
```

---

### API Service

**File:** `app/services/api.js`

```javascript
@service api;

// GET request
const response = await this.api.get('/permits/my-permits');
const data = await this.api.get('/contractors/123');

// GET with query params
const response = await this.api.get('/properties/search', {
  q: 'search term',
  limit: 20
});

// POST request
await this.api.post('/contractors/123/members', {
  email: 'user@example.com',
  role: 'employee'
});

// PUT request
await this.api.put('/contractors/123', {
  company_name: 'New Name'
});

// DELETE request
await this.api.delete('/contractors/123/members/456');

// Error handling
try {
  const response = await this.api.get('/some-endpoint');
} catch (error) {
  console.error('API Error:', error);
  this.notifications.error(error.message || 'Request failed');
}
```

---

### Notifications Service

**File:** `app/services/notifications.js`

```javascript
@service notifications;

// Success
this.notifications.success('Operation completed successfully');

// Error
this.notifications.error('Operation failed');

// Warning
this.notifications.warning('Please upgrade your subscription');

// Info
this.notifications.info('New feature available');
```

---

### Router Service

```javascript
@service router;

// Navigate to route
this.router.transitionTo('my-permits');
this.router.transitionTo('my-permits.permit', permitId);
this.router.transitionTo('contractor-management.team');

// Check current route
this.router.currentRouteName === 'my-permits.index'

// Navigate back
window.history.back();  // Or use a back button
```

---

## Common Patterns

### ⚠️ CRITICAL: Block Parameter Naming in Templates

**Always avoid using HTML tag names as block parameter names in `{{#each}}` loops!**

This is especially important when iterating over items inside HTML elements with the same name:

**Problem:** Using `|option|` inside `<select>` with `<option>` tags causes Ember to interpret "option" as a dynamic component, resulting in: `Error: Expected a dynamic component definition`

```handlebars
{{! ❌ WRONG - causes component error }}
<select>
  {{#each this.items as |option|}}
    <option value={{option.value}}>{{option.label}}</option>
  {{/each}}
</select>

{{! ✅ CORRECT - use descriptive names }}
<select>
  {{#each this.items as |item|}}
    <option value={{item.value}}>{{item.label}}</option>
  {{/each}}
</select>

{{! ✅ ALSO CORRECT - be specific }}
<select>
  {{#each this.roleOptions as |roleOption|}}
    <option value={{roleOption.value}}>{{roleOption.label}}</option>
  {{/each}}
</select>
```

**Safe block parameter names:** `|item|`, `|permit|`, `|license|`, `|roleOption|`, `|stateOption|`, `|licenseOption|`

**Avoid:** `|option|`, `|div|`, `|span|`, `|button|`, `|select|`, `|input|`

---

### Loading States

```javascript
// Controller
@tracked isLoading = false;

@action
async performAction() {
  this.isLoading = true;
  try {
    await this.api.post('/endpoint', data);
  } finally {
    this.isLoading = false;  // Always reset in finally
  }
}
```

```handlebars
{{! Template }}
<button type="button" {{on "click" this.performAction}} disabled={{this.isLoading}}>
  {{#if this.isLoading}}
    <i class="fas fa-spinner fa-spin avitar-mr-2"></i>
    Loading...
  {{else}}
    Click Me
  {{/if}}
</button>
```

---

### Computed Properties for Lists

```javascript
// Always filter/compute in getter, not template
get displayedItems() {
  let items = this.model.items || [];

  // Filter
  if (this.filter !== 'all') {
    items = items.filter(item => item.status === this.filter);
  }

  // Search
  if (this.searchText) {
    const search = this.searchText.toLowerCase();
    items = items.filter(item =>
      item.name?.toLowerCase().includes(search)
    );
  }

  // Sort
  items = items.sort((a, b) => {
    // sorting logic
  });

  // Add computed display properties
  items = items.map(item => ({
    ...item,
    displayValue: this.formatValue(item.value),
    badge: this.getBadge(item.status)
  }));

  return items;
}
```

---

### Form Field Updates

```javascript
// Controller
@tracked formData = {
  name: '',
  email: '',
  role: 'employee'
};

@action
updateField(field, event) {
  this.formData[field] = event.target.value;
}

// Or individual actions
@action
updateName(event) {
  this.formData.name = event.target.value;
}
```

```handlebars
{{! Template }}
<input type="text" class="avitar-input"
  value={{this.formData.name}}
  {{on "input" (fn this.updateField "name")}} />

<select class="avitar-select" {{on "change" (fn this.updateField "role")}}>
  <option value="employee">Employee</option>
  <option value="admin">Admin</option>
</select>
```

---

### Dropdown/Select with Objects

**CRITICAL: Avoid naming conflicts with HTML tags!**

When using `{{#each}}` with `<option>` tags inside `<select>` elements, **DO NOT** use `|option|` as the block parameter name. This causes Ember to interpret it as a dynamic component, resulting in the error: "Expected a dynamic component definition".

```javascript
// Controller
get roleOptions() {
  return [
    { value: 'employee', label: 'Employee', description: 'Standard member' },
    { value: 'admin', label: 'Admin', description: 'Can manage team' }
  ];
}

@tracked selectedRole = 'employee';
```

```handlebars
{{! Template - CORRECT (use descriptive block param name) }}
<select class="avitar-select" {{on "change" this.updateRole}}>
  {{#each this.roleOptions as |roleOption|}}
    <option value={{roleOption.value}} selected={{eq this.selectedRole roleOption.value}}>
      {{roleOption.label}} - {{roleOption.description}}
    </option>
  {{/each}}
</select>

{{! WRONG - DO NOT DO THIS! }}
{{!--
<select class="avitar-select">
  {{#each this.roleOptions as |option|}}
    <option value={{option.value}}>  <!-- ERROR: Ember interprets "option" as component -->
      {{option.label}}
    </option>
  {{/each}}
</select>
--}}
```

**General Rule:** Use descriptive block parameter names that describe the data, not generic HTML tag names:
- ✅ `|licenseOption|`, `|roleOption|`, `|stateOption|`, `|item|`, `|permit|`
- ❌ `|option|`, `|div|`, `|span|`, `|button|`

---

### Checkbox Toggles

```javascript
// Controller
@tracked selectedPermissions = [];

@action
togglePermission(permissionId) {
  if (this.selectedPermissions.includes(permissionId)) {
    this.selectedPermissions = this.selectedPermissions.filter(p => p !== permissionId);
  } else {
    this.selectedPermissions = [...this.selectedPermissions, permissionId];
  }
}
```

```handlebars
{{! Template }}
{{#each this.availablePermissions as |permission|}}
  <label class="avitar-flex avitar-items-center avitar-gap-2">
    <input type="checkbox" class="avitar-checkbox"
      checked={{includes this.selectedPermissions permission.id}}
      {{on "change" (fn this.togglePermission permission.id)}} />
    {{permission.label}}
  </label>
{{/each}}
```

---

### Refresh Parent Route Data

```javascript
// In child route controller
@action
async saveData() {
  await this.api.post('/endpoint', data);
  this.send('refreshModel');  // Refreshes parent route's model
}
```

---

### Stop Event Propagation

```handlebars
{{! Prevent row click when clicking button inside row }}
<tr {{on "click" (fn this.viewRow row)}}>
  <td>{{row.name}}</td>
  <td {{on "click" this.stopPropagation}}>
    <button {{on "click" (fn this.deleteRow row)}}>Delete</button>
  </td>
</tr>
```

```javascript
// Controller
@action
stopPropagation(event) {
  event.stopPropagation();
}
```

---

### Confirmation Dialogs

```javascript
@action
async deleteItem(item) {
  if (!confirm(`Are you sure you want to delete ${item.name}?`)) {
    return;
  }

  this.isLoading = true;
  try {
    await this.api.delete(`/items/${item.id}`);
    this.notifications.success('Item deleted');
    this.send('refreshModel');
  } catch (error) {
    this.notifications.error('Failed to delete item');
  } finally {
    this.isLoading = false;
  }
}
```

---

## CSS Class Reference

### Avitar Design System Classes

**Layout:**
```
avitar-container          - Max-width container
avitar-layout            - Full page layout wrapper
avitar-main              - Main content area
avitar-flex              - Flexbox
avitar-grid              - Grid layout
avitar-grid-cols-2/3/4   - Grid columns
avitar-gap-2/3/4/6       - Gap spacing
```

**Cards:**
```
avitar-card              - Basic card
avitar-card--hover       - Hover effect
avitar-card--stat        - Stat card variant
avitar-card__header      - Card header
avitar-card__body        - Card body
avitar-card__footer      - Card footer
avitar-card__title       - Card title
```

**Buttons:**
```
avitar-btn               - Base button
avitar-btn--primary      - Primary action
avitar-btn--secondary    - Secondary action
avitar-btn--danger       - Destructive action
avitar-btn--ghost        - Ghost/transparent
avitar-btn--sm           - Small size
avitar-btn--lg           - Large size
```

**Badges:**
```
avitar-badge             - Base badge
avitar-badge--primary    - Blue
avitar-badge--success    - Green
avitar-badge--warning    - Yellow
avitar-badge--danger     - Red
avitar-badge--info       - Light blue
avitar-badge--secondary  - Gray
avitar-badge--sm         - Small size
avitar-badge--lg         - Large size
```

**Forms:**
```
avitar-input             - Text input
avitar-select            - Select dropdown
avitar-checkbox          - Checkbox
avitar-label             - Form label
```

**Tables:**
```
avitar-table             - Base table
avitar-table--hover      - Row hover effect
avitar-table--striped    - Striped rows
avitar-table-container   - Scrollable wrapper
```

**Modals:**
```
avitar-modal-overlay            - Modal backdrop
avitar-modal-overlay--visible   - Visible state
avitar-modal                    - Modal container
avitar-modal--lg                - Large modal
avitar-modal__header            - Modal header
avitar-modal__title             - Modal title
avitar-modal__close             - Close button
avitar-modal__body              - Modal content
avitar-modal__footer            - Modal footer
```

**Tabs:**
```
avitar-tabs              - Tab container
avitar-tab               - Individual tab
avitar-tab--active       - Active tab
```

**Utility:**
```
avitar-text-primary      - Primary color text
avitar-text-muted        - Muted/gray text
avitar-text-danger       - Red text
avitar-text-sm/lg/xl/2xl - Text sizes
avitar-font-medium/semibold/bold - Font weights
avitar-mb-2/4/6          - Margin bottom
avitar-mt-2/4/6          - Margin top
avitar-p-2/4/6           - Padding
avitar-py-4              - Padding Y-axis
avitar-px-4              - Padding X-axis
avitar-rounded           - Rounded corners
avitar-border            - Border
avitar-bg-gray-50        - Background colors
```

---

## Handlebars Helpers

### Built-in Helpers

```handlebars
{{! Conditionals }}
{{#if condition}}...{{/if}}
{{#unless condition}}...{{/unless}}
{{#if condition}}...{{else}}...{{/if}}

{{! Equality }}
{{#if (eq value1 value2)}}...{{/if}}
{{#if (ne value1 value2)}}...{{/if}}

{{! Loops }}
{{#each items as |item|}}...{{/each}}
{{#each items as |item index|}}...{{/each}}

{{! else for empty arrays }}
{{#each items as |item|}}
  {{item.name}}
{{else}}
  No items
{{/each}}
```

### Custom Helpers (Available)

```handlebars
{{! Date formatting }}
{{date-format permit.applicationDate "MMM DD, YYYY"}}
{{date-format permit.createdAt "MM/DD/YYYY HH:mm"}}

{{! String helpers }}
{{substring text 0 1}}  - First character
{{join array ", "}}      - Join array to string

{{! Comparison }}
{{or value1 value2}}     - Returns first truthy value
{{sub num1 num2}}        - Subtraction

{{! Check if array includes value }}
{{includes array value}}
```

---

## Debugging Tips

### Logging in Templates

```handlebars
{{! Log to console }}
{{log "Debug value:" this.someValue}}
{{log permit}}

{{! Display in template (dev only) }}
<pre>{{json-stringify permit}}</pre>
```

### Logging in Controllers/Routes

```javascript
// In actions
@action
debugAction(item) {
  console.log('Action called with:', item);
  console.log('Current state:', this.someTrackedProperty);
}

// In computed properties
get displayedItems() {
  const items = this.computeItems();
  console.log('Computed items:', items);
  return items;
}
```

---

## Performance Tips

1. **Pre-compute in Controllers, Not Templates**
   ```javascript
   // Good - compute once in getter
   get displayedItems() {
     return this.items.map(item => ({
       ...item,
       badge: this.getBadge(item.status)
     }));
   }

   // Bad - computes on every render
   // {{this.getBadge item.status}}
   ```

2. **Use `@cached` for Expensive Computations**
   ```javascript
   import { cached } from '@glimmer/tracking';

   @cached
   get expensiveComputation() {
     // Heavy processing here
     return processedData;
   }
   ```

3. **Avoid Inline Functions in Templates**
   ```handlebars
   {{! Bad - creates new function each render }}
   <button {{on "click" (fn (fn this.action item))}}>

   {{! Good - use direct action reference }}
   <button {{on "click" (fn this.action item)}}>
   ```

---

## Testing Checklist

When building new features:

- [ ] Route redirects work for user types
- [ ] Loading states shown during API calls
- [ ] Error handling with user-friendly messages
- [ ] Empty states for no data
- [ ] Form validation before submission
- [ ] Success notifications on save
- [ ] Modal closes after success
- [ ] Data refreshes after mutations
- [ ] Subscription gates check correctly
- [ ] Limits enforced (team members, etc.)

---

Last Updated: 2025-01-15
