Avitar Suite - Styles Directory
Overview
This directory contains all styling for the Avitar Suite web application, a comprehensive municipal management platform encompassing Computer Assisted Mass Appraisal (CAMA), Building Permits, and Tax Collection modules.
Design Philosophy
Core Principles

Professional Trust - Municipal government software demands credibility and stability
Data Clarity - Users work with complex property data, assessments, and financial information daily
Efficiency First - Municipal workers use this software 8+ hours daily; optimize for speed and reduced eye strain
Accessibility - WCAG 2.1 AA compliance minimum; municipal staff have diverse needs
Consistency - Unified experience across CAMA, Building Permits, and Tax Collection modules

Design Goals

Clean, modern interface without trendy elements that date quickly
High information density without feeling cluttered
Clear visual hierarchy for scanning large data sets
Minimal cognitive load for repetitive tasks
Professional appearance suitable for presentations to town boards and taxpayers

## Quick Reference

**Main Stylesheet**: `app/styles/app.css` (4060+ lines)
**Component Stylesheets**: `app/styles/components/*.css`
**Naming Convention**: BEM-like `.avitar-[component]__[element]--[modifier]`
**Responsive Breakpoints**: Mobile (≤640px), Tablet (641-1024px), Desktop (≥1025px)

---

## Design Tokens (CSS Custom Properties)

### Brand Colors
```css
--avitar-green: #2d5a27          /* Primary brand color */
--avitar-green-light: #4a8c3a    /* Lighter green variant */
--avitar-green-dark: #1e3d1b     /* Darker green variant */
--avitar-green-pale: #e8f4e6     /* Pale background green */

--avitar-blue: #1e4d59           /* Secondary brand color */
--avitar-blue-light: #2d6b7a     /* Lighter blue variant */
--avitar-blue-dark: #14363f      /* Darker blue variant */
--avitar-blue-pale: #e6f1f3      /* Pale background blue */

--avitar-yellow: #f4c430         /* Warning/accent color */
--avitar-yellow-light: #f7d558
--avitar-yellow-dark: #d4a017
--avitar-yellow-pale: #fef9e7
```

### Semantic Colors
```css
--color-success: var(--avitar-green)
--color-warning: var(--avitar-yellow)
--color-info: var(--avitar-blue)
--color-danger: #dc2626
```

### Neutral Grays
```css
--color-gray-50: #f9fafb         /* Lightest */
--color-gray-100: #f3f4f6
--color-gray-200: #e5e7eb
--color-gray-300: #d1d5db
--color-gray-400: #9ca3af
--color-gray-500: #6b7280
--color-gray-600: #4b5563
--color-gray-700: #374151
--color-gray-800: #1f2937
--color-gray-900: #111827        /* Darkest */
```

### Typography Scale
```css
--font-size-xs: 0.65rem          /* 10.4px */
--font-size-sm: 0.775rem         /* 12.4px */
--font-size-base: 1rem           /* 16px */
--font-size-lg: 1.125rem         /* 18px */
--font-size-xl: 1.25rem          /* 20px */
--font-size-2xl: 1.5rem          /* 24px */
--font-size-3xl: 1.875rem        /* 30px */
--font-size-4xl: 2.25rem         /* 36px */
```

### Spacing Scale
```css
--space-1: 0.25rem    /* 4px */
--space-2: 0.5rem     /* 8px */
--space-3: 0.75rem    /* 12px */
--space-4: 1rem       /* 16px */
--space-5: 1.25rem    /* 20px */
--space-6: 1.5rem     /* 24px */
--space-8: 2rem       /* 32px */
--space-10: 2.5rem    /* 40px */
--space-12: 3rem      /* 48px */
--space-16: 4rem      /* 64px */
--space-20: 5rem      /* 80px */
--space-24: 6rem      /* 96px */
```

### Shadows
```css
--shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 5%)
--shadow-base: 0 1px 3px 0 rgb(0 0 0 / 10%), 0 1px 2px -1px rgb(0 0 0 / 10%)
--shadow-md: 0 4px 6px -1px rgb(0 0 0 / 10%), 0 2px 4px -2px rgb(0 0 0 / 10%)
--shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 10%), 0 4px 6px -4px rgb(0 0 0 / 10%)
--shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 10%), 0 8px 10px -6px rgb(0 0 0 / 10%)
--shadow-inner: inset 0 2px 4px 0 rgb(0 0 0 / 5%)
```

### Z-Index Layers
```css
--z-dropdown: 1000
--z-sticky: 1020
--z-fixed: 1030
--z-modal-backdrop: 1040
--z-modal: 1050
--z-tooltip: 1070
```

---

## Layout Components

### Main Layout Structure
```html
<!-- Standard layout with sidebar -->
<div class="avitar-layout avitar-layout--with-sidebar">
  <div class="avitar-layout__sidebar">
    <!-- Sidebar content -->
  </div>
  <div class="avitar-layout__main">
    <div class="avitar-content">
      <!-- Main content -->
    </div>
  </div>
</div>
```

**Classes:**
- `.avitar-layout` - Main container (min-height: 100vh, flex)
- `.avitar-layout--with-sidebar` - Row layout for sidebar
- `.avitar-layout__main` - Main content area
- `.avitar-content` - Content wrapper with padding

---

## Card Components

### Basic Card
```html
<div class="avitar-card">
  <div class="avitar-card__header">
    <h2 class="avitar-card__title">Card Title</h2>
    <div class="avitar-card__subtitle">Subtitle text</div>
  </div>
  <div class="avitar-card__body">
    <!-- Card content -->
  </div>
  <div class="avitar-card__footer">
    <div class="avitar-card__actions">
      <button class="avitar-btn avitar-btn--primary">Action</button>
    </div>
  </div>
</div>
```

**Base Classes:**
- `.avitar-card` - White background, rounded corners, shadow, hover effects

**Header Variants:**
- `.avitar-card__header` - Gray background with border
- `.avitar-card__header--colored` - Gradient green-blue background

**Body Variants:**
- `.avitar-card__body` - Standard padding
- `.avitar-card__body--compact` - Reduced padding
- `.avitar-card__body--no-padding` - No padding

**Status Variants (left border):**
- `.avitar-card--success` - Green border
- `.avitar-card--warning` - Yellow border
- `.avitar-card--info` - Blue border
- `.avitar-card--danger` - Red border

**Background Status Variants:**
- `.avitar-card--status-success` - Green pale background
- `.avitar-card--status-warning` - Yellow pale background
- `.avitar-card--status-info` - Blue pale background
- `.avitar-card--status-danger` - Red pale background

**Interactive Variants:**
- `.avitar-card--interactive` - Pointer cursor, prominent hover
- `.avitar-card--elevated` - Extra shadow
- `.avitar-card--flat` - No shadow, light border

**Grid Layout:**
```html
<div class="avitar-card-list avitar-card-list--cols-3">
  <!-- Cards automatically arranged in 3 columns (responsive) -->
</div>
```
- `.avitar-card-list--cols-2`, `--cols-3`, `--cols-4`

---

## Button System

### Button Variants
```html
<!-- Primary (green gradient) -->
<button class="avitar-btn avitar-btn--primary">Primary</button>

<!-- Secondary (blue gradient) -->
<button class="avitar-btn avitar-btn--secondary">Secondary</button>

<!-- Warning (yellow gradient) -->
<button class="avitar-btn avitar-btn--warning">Warning</button>

<!-- Success (solid green) -->
<button class="avitar-btn avitar-btn--success">Success</button>

<!-- Danger (solid red) -->
<button class="avitar-btn avitar-btn--danger">Danger</button>

<!-- Outline style -->
<button class="avitar-btn avitar-btn--outline">Outline</button>

<!-- Ghost style (transparent) -->
<button class="avitar-btn avitar-btn--ghost">Ghost</button>

<!-- Link style -->
<button class="avitar-btn avitar-btn--link">Link</button>
```

**Size Modifiers:**
- `.avitar-btn--xs` - 32px min height
- `.avitar-btn--sm` - 36px min height
- Default - 44px min height
- `.avitar-btn--lg` - 52px min height
- `.avitar-btn--xl` - 60px min height

**Width Modifier:**
- `.avitar-btn--full` - 100% width

**State Modifiers:**
- `.avitar-btn--disabled` or `:disabled` - Disabled state
- `.avitar-btn--loading` - Loading spinner animation

**With Icons:**
```html
<button class="avitar-btn avitar-btn--primary">
  <i class="fas fa-save avitar-mr-2"></i>
  Save Changes
</button>
```

**Button Groups:**
```html
<div class="avitar-btn-group">
  <button class="avitar-btn avitar-btn--primary">Left</button>
  <button class="avitar-btn avitar-btn--primary">Middle</button>
  <button class="avitar-btn avitar-btn--primary">Right</button>
</div>
```

---

## Form Components

### Form Structure
```html
<form class="avitar-form">
  <div class="avitar-form-group">
    <label class="avitar-label" for="input-id">Field Label</label>
    <input type="text" id="input-id" class="avitar-input" placeholder="Enter text">
    <div class="avitar-form-help">Helper text for this field</div>
  </div>

  <!-- Error state -->
  <div class="avitar-form-group">
    <label class="avitar-label" for="error-input">Email</label>
    <input type="email" id="error-input" class="avitar-input avitar-input--error">
    <div class="avitar-form-error">
      <i class="fas fa-exclamation-circle"></i>
      Please enter a valid email address
    </div>
  </div>
</form>
```

**Input Classes:**
- `.avitar-input` - Text inputs (48px min height)
- `.avitar-textarea` - Textarea (120px min height)
- `.avitar-select` - Select dropdowns (48px min height)
- `.avitar-input--error` - Error state (red border on focus)

**Form Layout:**
```html
<!-- Two-column form row (responsive) -->
<div class="avitar-form-row">
  <div class="avitar-form-group"><!-- First field --></div>
  <div class="avitar-form-group"><!-- Second field --></div>
</div>
```

**Required Labels:**
```html
<label class="avitar-label avitar-label--required">Required Field</label>
```

---

## Table Components

### Standard Table
```html
<div class="avitar-table-container">
  <table class="avitar-table">
    <thead>
      <tr>
        <th>Column 1</th>
        <th>Column 2</th>
        <th>Column 3</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Data 1</td>
        <td>Data 2</td>
        <td>Data 3</td>
      </tr>
    </tbody>
  </table>
</div>
```

**Features:**
- Automatic zebra striping on hover
- Full width, white background, rounded, shadow
- Responsive scrolling via `.avitar-table-container`

---

## Modal Components

### Basic Modal
```html
<div class="avitar-modal-overlay avitar-modal-overlay--visible">
  <div class="avitar-modal avitar-modal--md">
    <div class="avitar-modal__header">
      <div>
        <h3 class="avitar-modal__title">Modal Title</h3>
        <div class="avitar-modal__subtitle">Subtitle text</div>
      </div>
      <button class="avitar-modal__close">
        <i class="fas fa-times avitar-modal__close-icon"></i>
      </button>
    </div>

    <div class="avitar-modal__body">
      <!-- Modal content -->
    </div>

    <div class="avitar-modal__footer">
      <button class="avitar-btn avitar-btn--ghost">Cancel</button>
      <button class="avitar-btn avitar-btn--primary">Confirm</button>
    </div>
  </div>
</div>
```

**Size Modifiers:**
- `.avitar-modal--sm` - 400px max width
- `.avitar-modal--md` - 600px max width (default)
- `.avitar-modal--lg` - 800px max width
- `.avitar-modal--xl` - 1200px max width
- `.avitar-modal--full` - Near full viewport

**Header Variants:**
- `.avitar-modal__header` - Gradient background (default)
- `.avitar-modal__header--simple` - White background

**Body Variants:**
- `.avitar-modal__body--compact` - Smaller padding
- `.avitar-modal__body--no-padding` - No padding

**Status Variants:**
- `.avitar-modal--success` - Green header
- `.avitar-modal--warning` - Yellow header
- `.avitar-modal--danger` - Red header
- `.avitar-modal--info` - Blue header

---

## Alert/Notification Components

```html
<!-- Success alert -->
<div class="avitar-alert avitar-alert--success">
  <i class="fas fa-check-circle avitar-alert__icon"></i>
  <div class="avitar-alert__content">
    <div class="avitar-alert__title">Success!</div>
    <div class="avitar-alert__message">Your changes have been saved.</div>
  </div>
</div>

<!-- Warning alert -->
<div class="avitar-alert avitar-alert--warning">
  <i class="fas fa-exclamation-triangle avitar-alert__icon"></i>
  <div class="avitar-alert__content">
    <div class="avitar-alert__message">Please review your input.</div>
  </div>
</div>
```

**Variants:**
- `.avitar-alert--success` - Green background
- `.avitar-alert--warning` - Yellow background
- `.avitar-alert--info` - Blue background
- `.avitar-alert--danger` - Red background

---

## Navigation Components

### Sidebar Navigation
```html
<nav class="avitar-sidebar avitar-sidebar--open avitar-sidebar--with-topbar">
  <div class="avitar-sidebar__header">
    <h2 class="avitar-sidebar__title">
      <i class="fas fa-icon avitar-mr-2"></i>
      Navigation Title
    </h2>
    <div class="avitar-sidebar__subtitle">Subtitle text</div>
  </div>

  <div class="avitar-sidebar__nav">
    <div class="avitar-sidebar__section">
      <div class="avitar-sidebar__section-title">Section Name</div>

      <ul class="avitar-sidebar__nav-list">
        <li class="avitar-sidebar__nav-item">
          <a href="#" class="avitar-sidebar__nav-link avitar-sidebar__nav-link--active">
            <i class="fas fa-icon avitar-sidebar__nav-icon"></i>
            <span>Link Text</span>
          </a>
        </li>
      </ul>
    </div>
  </div>
</nav>
```

**State Classes:**
- `.avitar-sidebar--open` - Visible sidebar
- `.avitar-sidebar--with-topbar` - Adjusted for topbar
- `.avitar-sidebar__nav-link--active` - Active link (green left border)

---

## Loading States

### Spinner
```html
<!-- Default spinner (32x32px) -->
<div class="avitar-loading"></div>

<!-- Small spinner (20x20px) -->
<div class="avitar-loading avitar-loading--sm"></div>

<!-- Large spinner (48x48px) -->
<div class="avitar-loading avitar-loading--lg"></div>

<!-- Centered spinner -->
<div class="avitar-loading avitar-loading--center"></div>
```

### Full-Page Loading Overlay
```html
<div class="loading-overlay">
  <div class="loading-overlay__backdrop"></div>
  <div class="loading-overlay__content">
    <div class="avitar-loading avitar-loading--lg"></div>
    <div class="loading-overlay__message">Loading data...</div>
    <div class="loading-overlay__progress">
      <div class="loading-overlay__phase">Processing records</div>
      <div class="loading-overlay__progress-bar">
        <div class="loading-overlay__progress-fill" style="width: 65%"></div>
      </div>
      <div class="loading-overlay__progress-text">65%</div>
    </div>
  </div>
</div>
```

---

## Utility Classes

### Spacing Utilities

**Margins:**
```html
<!-- All margins -->
<div class="avitar-m-0">No margin</div>
<div class="avitar-m-2">0.5rem margin (8px)</div>
<div class="avitar-m-4">1rem margin (16px)</div>

<!-- Directional margins -->
<div class="avitar-mt-4">Top margin</div>
<div class="avitar-mb-4">Bottom margin</div>
<div class="avitar-ml-4">Left margin</div>
<div class="avitar-mr-4">Right margin</div>
```

**Padding:**
```html
<!-- All padding -->
<div class="avitar-p-4">1rem padding</div>

<!-- Directional padding -->
<div class="avitar-pt-4">Top padding</div>
<div class="avitar-pb-4">Bottom padding</div>
<div class="avitar-pl-4">Left padding</div>
<div class="avitar-pr-4">Right padding</div>

<!-- Combined vertical padding (top + bottom) -->
<div class="avitar-py-4">Top and bottom padding</div>
<div class="avitar-py-6">1.5rem vertical padding</div>

<!-- Combined horizontal padding (left + right) -->
<div class="avitar-px-4">Left and right padding</div>
<div class="avitar-px-6">1.5rem horizontal padding</div>
```

**Container:**
```html
<!-- Centered max-width container -->
<div class="avitar-container">Max-width 1400px, centered, with horizontal padding</div>

<!-- Common pattern for page content -->
<div class="avitar-container avitar-py-6 avitar-m-4">
  <!-- Page content with vertical padding and margin -->
</div>
```

**Scale:** 0, 1, 2, 3, 4, 5, 6, 8 (0rem to 2rem)

### Flexbox Utilities
```html
<!-- Flex container -->
<div class="avitar-flex avitar-items-center avitar-justify-between avitar-gap-4">
  <div>Item 1</div>
  <div>Item 2</div>
</div>

<!-- Flex direction -->
<div class="avitar-flex avitar-flex-col">Column layout</div>
<div class="avitar-flex avitar-flex-row">Row layout</div>

<!-- Justify content -->
<div class="avitar-justify-start">Start alignment</div>
<div class="avitar-justify-center">Center alignment</div>
<div class="avitar-justify-end">End alignment</div>
<div class="avitar-justify-between">Space between</div>
<div class="avitar-justify-around">Space around</div>

<!-- Align items -->
<div class="avitar-items-start">Align start</div>
<div class="avitar-items-center">Align center</div>
<div class="avitar-items-end">Align end</div>
<div class="avitar-items-stretch">Align stretch</div>

<!-- Flex grow -->
<div class="avitar-flex-1">Flex: 1</div>
```

### Typography Utilities
```html
<!-- Font sizes -->
<span class="avitar-text-xs">Extra small text</span>
<span class="avitar-text-sm">Small text</span>
<span class="avitar-text-lg">Large text</span>
<span class="avitar-text-xl">Extra large text</span>

<!-- Font weights -->
<span class="avitar-font-light">Light weight</span>
<span class="avitar-font-medium">Medium weight</span>
<span class="avitar-font-bold">Bold weight</span>

<!-- Text alignment -->
<div class="avitar-text-left">Left aligned</div>
<div class="avitar-text-center">Center aligned</div>
<div class="avitar-text-right">Right aligned</div>

<!-- Text colors -->
<span class="avitar-text-primary">Primary green</span>
<span class="avitar-text-secondary">Secondary blue</span>
<span class="avitar-text-success">Success green</span>
<span class="avitar-text-warning">Warning yellow</span>
<span class="avitar-text-danger">Danger red</span>
<span class="avitar-text-muted">Muted gray</span>
```

### Display Utilities
```html
<div class="avitar-block">Block display</div>
<div class="avitar-inline">Inline display</div>
<div class="avitar-inline-block">Inline-block display</div>
<div class="avitar-flex">Flex display</div>
<div class="avitar-grid">Grid display</div>
<div class="avitar-hidden">Hidden (display: none)</div>
```

### Border Utilities
```html
<!-- Border sides -->
<div class="avitar-border">All borders</div>
<div class="avitar-border-t">Top border</div>
<div class="avitar-border-b">Bottom border</div>
<div class="avitar-border-l">Left border</div>
<div class="avitar-border-r">Right border</div>

<!-- Border colors -->
<div class="avitar-border border-green">Green border</div>
<div class="avitar-border border-blue">Blue border</div>
<div class="avitar-border border-gray-300">Gray border</div>

<!-- Border radius -->
<div class="avitar-rounded">Base radius</div>
<div class="avitar-rounded-lg">Large radius</div>
<div class="avitar-rounded-full">Full radius (circle/pill)</div>
```

### Shadow Utilities
```html
<div class="avitar-shadow-sm">Small shadow</div>
<div class="avitar-shadow">Base shadow</div>
<div class="avitar-shadow-md">Medium shadow</div>
<div class="avitar-shadow-lg">Large shadow</div>
<div class="avitar-shadow-xl">Extra large shadow</div>
<div class="avitar-shadow-none">No shadow</div>
```

### Background Utilities
```html
<div class="avitar-bg-primary">Primary green background</div>
<div class="avitar-bg-secondary">Secondary blue background</div>
<div class="avitar-bg-white">White background</div>
<div class="avitar-bg-gray-50">Light gray background</div>
<div class="avitar-bg-gray-100">Lighter gray background</div>
```

### Width & Height Utilities
```html
<div class="avitar-w-full">100% width</div>
<div class="avitar-w-auto">Auto width</div>
<div class="avitar-h-full">100% height</div>
<div class="avitar-h-auto">Auto height</div>
```

### Responsive Utilities
```html
<!-- Mobile (≤640px) -->
<div class="avitar-sm-hidden">Hidden on mobile</div>
<div class="avitar-sm-block">Block on mobile</div>

<!-- Tablet (641-1024px) -->
<div class="avitar-md-hidden">Hidden on tablet</div>
<div class="avitar-md-flex">Flex on tablet</div>

<!-- Desktop (≥1025px) -->
<div class="avitar-lg-hidden">Hidden on desktop</div>
<div class="avitar-lg-grid">Grid on desktop</div>
```

---

## Common Patterns

### Page Header with Actions
```html
<div class="avitar-card">
  <div class="avitar-card__header avitar-card__header--colored">
    <h2 class="avitar-card__title">Page Title</h2>
    <div class="avitar-card__subtitle">Page description</div>
    <button class="avitar-btn avitar-btn--secondary avitar-btn--sm">
      <i class="fas fa-plus"></i> New Item
    </button>
  </div>
  <div class="avitar-card__body">
    <!-- Page content -->
  </div>
</div>
```

### Empty State
```html
<div class="empty-state">
  <div class="empty-state-icon">
    <i class="fas fa-inbox"></i>
  </div>
  <h3 class="empty-state-title">No Items Found</h3>
  <p class="empty-state-message">Get started by creating your first item.</p>
  <button class="avitar-btn avitar-btn--primary avitar-mt-4">
    <i class="fas fa-plus avitar-mr-2"></i> Create Item
  </button>
</div>
```

### Data Grid with Cards
```html
<div class="avitar-card-list avitar-card-list--cols-3">
  <div class="avitar-card avitar-card--interactive">
    <!-- Card content -->
  </div>
  <div class="avitar-card avitar-card--interactive">
    <!-- Card content -->
  </div>
  <div class="avitar-card avitar-card--interactive">
    <!-- Card content -->
  </div>
</div>
```

### Status Badge in Header
```html
<div class="avitar-flex avitar-items-center avitar-gap-2">
  <h3>Property Name</h3>
  <span class="avitar-badge avitar-badge--success">Active</span>
</div>
```

### Form with Two-Column Layout
```html
<form>
  <div class="avitar-form-row">
    <div class="avitar-form-group">
      <label class="avitar-label">First Name</label>
      <input type="text" class="avitar-input">
    </div>
    <div class="avitar-form-group">
      <label class="avitar-label">Last Name</label>
      <input type="text" class="avitar-input">
    </div>
  </div>

  <div class="avitar-form-group">
    <label class="avitar-label">Email Address</label>
    <input type="email" class="avitar-input">
  </div>

  <div class="avitar-flex avitar-justify-end avitar-gap-2 avitar-mt-6">
    <button type="button" class="avitar-btn avitar-btn--ghost">Cancel</button>
    <button type="submit" class="avitar-btn avitar-btn--primary">Save</button>
  </div>
</form>
```

---

## Best Practices

### 1. Use Design Tokens
Always use CSS custom properties instead of hardcoding values:
```css
/* Good */
color: var(--avitar-green);
padding: var(--space-4);

/* Avoid */
color: #2d5a27;
padding: 16px;
```

### 2. Leverage Utility Classes
Use utility classes for spacing, typography, and layout instead of custom CSS:
```html
<!-- Good -->
<div class="avitar-flex avitar-items-center avitar-gap-4 avitar-mt-6">

<!-- Avoid creating custom CSS for common patterns -->
```

### 3. Follow BEM-like Naming
When creating new components, follow the established naming convention:
```css
.component-name { }
.component-name__element { }
.component-name--modifier { }
```

### 4. Responsive Design
Mobile-first approach - use responsive utility classes:
```html
<div class="avitar-sm-hidden avitar-md-flex">
  Only visible on tablet and desktop
</div>
```

### 5. Semantic Colors
Use semantic color classes for meaningful states:
```html
<!-- Good -->
<button class="avitar-btn avitar-btn--danger">Delete</button>
<div class="avitar-alert avitar-alert--warning">Warning message</div>

<!-- Avoid generic colors for actions -->
<button class="avitar-btn avitar-btn--primary">Delete</button>
```

### 6. Accessibility
- Always include focus states (automatically handled by base styles)
- Use `.avitar-sr-only` for screen-reader-only text
- Ensure sufficient color contrast (follows WCAG AA standards)

### 7. Printable Reports
For printable documents (like DRA forms):
```css
@media print {
  /* Hide navigation and UI elements */
  .avitar-sidebar,
  .avitar-topbar,
  .no-print {
    display: none !important;
  }

  /* Optimize for print */
  .avitar-card {
    box-shadow: none;
    page-break-inside: avoid;
  }
}
```

---

## Quick Component Checklist

When building a new component:

- [ ] Use existing Avitar CSS classes where possible
- [ ] Apply semantic color variants (success, warning, danger, info)
- [ ] Include hover and focus states
- [ ] Make it responsive (test on mobile, tablet, desktop)
- [ ] Use design tokens for colors, spacing, shadows
- [ ] Add disabled states if interactive
- [ ] Ensure proper z-index layering
- [ ] Test with different content lengths
- [ ] Verify accessibility (keyboard navigation, screen readers)
- [ ] Add print styles if applicable

---

## Component Stylesheet Location

**Main Stylesheet**: `app/styles/app.css`

**Component-Specific Styles**: `app/styles/components/`
- `property-record-modal.css`
- `exemption-edit-modal.css`
- `step-progress.css`
- `modules.css`
- `progressive-loader.css`
- `loading-skeleton.css`

**Import in app.css**:
```css
@import url("./components/your-component.css");
```

---

## Support

For questions or clarifications about the design system, refer to:
- Main stylesheet: `app/styles/app.css`
- Existing components in `app/components/`
- This documentation file

When in doubt, look for similar existing components and follow their patterns.
