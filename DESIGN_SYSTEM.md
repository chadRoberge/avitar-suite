# Avitar Municipal Web Application Design System

A comprehensive, modern CSS design system for municipal web applications featuring Avitar's brand colors (green, yellow, and blue) and built specifically for government services including assessing, building permits, town clerk, tax collection, motor vehicle, and finance departments.

## 🎨 Brand Colors

### Primary Colors
- **Avitar Green**: `#2d5a27` - Primary brand color for main actions
- **Avitar Yellow**: `#f4c430` - Accent color for highlights and warnings  
- **Avitar Blue**: `#1e4d59` - Secondary color for information and navigation

### Color Variations
Each brand color includes light, dark, and pale variants:
- `--avitar-green-light`: `#4a8c3a`
- `--avitar-green-dark`: `#1e3d1b`
- `--avitar-green-pale`: `#e8f4e6`

## 🧱 Core Components

### Navigation System

#### Top Navigation Bar
```html
<nav class="avitar-topbar">
  <a href="#" class="avitar-topbar__brand">
    <div class="avitar-topbar__brand-logo">A</div>
    Municipality Portal
  </a>
  <ul class="avitar-topbar__nav">
    <li class="avitar-topbar__nav-item">
      <a href="#" class="avitar-topbar__nav-link avitar-topbar__nav-link--active">Dashboard</a>
    </li>
  </ul>
  <div class="avitar-topbar__user">
    <div class="avitar-topbar__user-avatar">JD</div>
  </div>
</nav>
```

#### Left Sidebar Navigation
```html
<aside class="avitar-sidebar avitar-sidebar--with-topbar">
  <div class="avitar-sidebar__header">
    <h2 class="avitar-sidebar__title">Municipal Services</h2>
    <p class="avitar-sidebar__subtitle">City of Springfield</p>
  </div>
  <nav class="avitar-sidebar__nav">
    <div class="avitar-sidebar__section">
      <h3 class="avitar-sidebar__section-title">Services</h3>
      <ul class="avitar-sidebar__nav-list">
        <li class="avitar-sidebar__nav-item">
          <a href="#" class="avitar-sidebar__nav-link avitar-sidebar__nav-link--active">
            <span class="avitar-sidebar__nav-icon">🏠</span>
            Assessing
          </a>
        </li>
        <li class="avitar-sidebar__nav-item">
          <a href="#" class="avitar-sidebar__nav-link">
            <span class="avitar-sidebar__nav-icon">🏗️</span>
            Building Permits
            <span class="avitar-sidebar__nav-badge">3</span>
          </a>
        </li>
      </ul>
    </div>
  </nav>
</aside>
```

### Card Components

#### Basic Card
```html
<div class="avitar-card">
  <div class="avitar-card__header">
    <h3 class="avitar-card__title">Property Assessment</h3>
    <p class="avitar-card__subtitle">Review and manage property assessments</p>
  </div>
  <div class="avitar-card__body">
    <p>Card content goes here...</p>
  </div>
  <div class="avitar-card__footer">
    <div class="avitar-card__actions">
      <button class="avitar-btn avitar-btn--primary">View Details</button>
      <button class="avitar-btn avitar-btn--outline avitar-btn--secondary">Edit</button>
    </div>
  </div>
</div>
```

#### Status Cards
```html
<!-- Success Card -->
<div class="avitar-card avitar-card--success">
  <div class="avitar-card__body">
    <h3 class="avitar-card__title">Permit Approved</h3>
    <p>Your building permit has been approved and is ready for pickup.</p>
  </div>
</div>

<!-- Dashboard Card -->
<div class="avitar-card avitar-card--dashboard">
  <div class="avitar-card__icon">📋</div>
  <h3 class="avitar-card__title">1,247</h3>
  <p class="avitar-card__subtitle">Active Permits</p>
</div>
```

### Button System

#### Button Variants
```html
<!-- Primary Actions -->
<button class="avitar-btn avitar-btn--primary">Submit Application</button>
<button class="avitar-btn avitar-btn--secondary">View Records</button>
<button class="avitar-btn avitar-btn--warning">Requires Attention</button>

<!-- Outline Buttons -->
<button class="avitar-btn avitar-btn--outline avitar-btn--primary">Cancel</button>

<!-- Button Sizes -->
<button class="avitar-btn avitar-btn--primary avitar-btn--xs">Small</button>
<button class="avitar-btn avitar-btn--primary avitar-btn--sm">Small</button>
<button class="avitar-btn avitar-btn--primary">Default</button>
<button class="avitar-btn avitar-btn--primary avitar-btn--lg">Large</button>

<!-- Button with Icon -->
<button class="avitar-btn avitar-btn--primary">
  <span class="avitar-btn__icon">📄</span>
  Download PDF
</button>

<!-- Loading State -->
<button class="avitar-btn avitar-btn--primary avitar-btn--loading">
  Processing...
</button>
```

#### Button Groups
```html
<div class="avitar-btn-group">
  <button class="avitar-btn avitar-btn--outline avitar-btn--secondary">Previous</button>
  <button class="avitar-btn avitar-btn--outline avitar-btn--secondary">Current</button>
  <button class="avitar-btn avitar-btn--outline avitar-btn--secondary">Next</button>
</div>
```

### Modal System

#### Basic Modal
```html
<div class="avitar-modal-overlay avitar-modal-overlay--visible">
  <div class="avitar-modal avitar-modal--md">
    <div class="avitar-modal__header">
      <div>
        <h2 class="avitar-modal__title">Update Property Information</h2>
        <p class="avitar-modal__subtitle">Parcel ID: 123-456-789</p>
      </div>
      <button class="avitar-modal__close" type="button">
        <span class="avitar-modal__close-icon">✕</span>
      </button>
    </div>
    <div class="avitar-modal__body">
      <p>Modal content goes here...</p>
    </div>
    <div class="avitar-modal__footer">
      <button class="avitar-btn avitar-btn--outline avitar-btn--secondary">Cancel</button>
      <button class="avitar-btn avitar-btn--primary">Save Changes</button>
    </div>
  </div>
</div>
```

#### Confirmation Modal
```html
<div class="avitar-modal-overlay avitar-modal-overlay--visible">
  <div class="avitar-modal avitar-modal--confirm avitar-modal--danger">
    <div class="avitar-modal__body">
      <div class="avitar-modal__icon">⚠️</div>
      <h2 class="avitar-modal__title">Delete Application</h2>
      <p class="avitar-modal__message">
        Are you sure you want to delete this permit application? This action cannot be undone.
      </p>
      <div class="avitar-modal__footer avitar-modal__footer--center">
        <button class="avitar-btn avitar-btn--outline avitar-btn--secondary">Cancel</button>
        <button class="avitar-btn avitar-btn--danger">Delete Application</button>
      </div>
    </div>
  </div>
</div>
```

## 🎯 Municipal Use Cases

### Department-Specific Examples

#### Assessing Department
```html
<div class="avitar-card-list avitar-card-list--cols-3">
  <div class="avitar-card avitar-card--interactive">
    <div class="avitar-card__header avitar-card__header--colored">
      <h3 class="avitar-card__title">Property Search</h3>
    </div>
    <div class="avitar-card__body">
      <p>Search and view property assessments by address, owner, or parcel ID.</p>
    </div>
  </div>
  
  <div class="avitar-card avitar-card--dashboard">
    <div class="avitar-card__icon">🏘️</div>
    <h3 class="avitar-card__title">15,420</h3>
    <p class="avitar-card__subtitle">Total Properties</p>
  </div>
</div>
```

#### Building Permits
```html
<div class="avitar-alert avitar-alert--warning">
  <div class="avitar-alert__icon">⚠️</div>
  <div class="avitar-alert__content">
    <h4 class="avitar-alert__title">Permit Review Required</h4>
    <p class="avitar-alert__message">3 permits are pending your review and approval.</p>
  </div>
</div>

<table class="avitar-table">
  <thead>
    <tr>
      <th>Permit #</th>
      <th>Property Address</th>
      <th>Type</th>
      <th>Status</th>
      <th>Actions</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>BP-2024-001</td>
      <td>123 Main Street</td>
      <td>Residential Addition</td>
      <td><span class="avitar-text-warning">Under Review</span></td>
      <td>
        <button class="avitar-btn avitar-btn--xs avitar-btn--primary">View</button>
      </td>
    </tr>
  </tbody>
</table>
```

## 🛠 Layout Structure

### Basic Application Layout
```html
<div class="avitar-layout avitar-layout--with-sidebar">
  <!-- Top Navigation -->
  <nav class="avitar-topbar">
    <!-- Navigation content -->
  </nav>
  
  <!-- Sidebar Navigation -->
  <aside class="avitar-sidebar avitar-sidebar--with-topbar">
    <!-- Sidebar content -->
  </aside>
  
  <!-- Main Content -->
  <main class="avitar-main avitar-main--with-sidebar avitar-main--with-topbar">
    <div class="avitar-content">
      <!-- Page content -->
    </div>
  </main>
</div>
```

## 🎨 Utility Classes

### Common Utilities
```html
<!-- Spacing -->
<div class="avitar-m-4 avitar-p-6">Margin and padding</div>

<!-- Typography -->
<h1 class="avitar-text-3xl avitar-font-bold avitar-text-primary">Large green title</h1>
<p class="avitar-text-muted">Muted text content</p>

<!-- Flexbox -->
<div class="avitar-flex avitar-items-center avitar-justify-between avitar-gap-4">
  <span>Left content</span>
  <span>Right content</span>
</div>

<!-- Backgrounds -->
<div class="avitar-bg-primary avitar-text-white avitar-p-4 avitar-rounded-lg">
  Primary background with white text
</div>

<!-- Responsive -->
<div class="avitar-block avitar-md-hidden">Hidden on medium screens and up</div>
```

## 📱 Responsive Design

The design system is mobile-first and includes responsive breakpoints:
- **Small (Mobile)**: `max-width: 640px`
- **Medium (Tablet)**: `641px - 1024px`  
- **Large (Desktop)**: `min-width: 1025px`

### Mobile Navigation
On mobile devices, the sidebar automatically becomes a slide-out menu with overlay, and the top navigation adapts for smaller screens.

## 🎭 Form Elements

```html
<div class="avitar-form-group">
  <label class="avitar-label avitar-label--required" for="property-address">
    Property Address
  </label>
  <input 
    type="text" 
    id="property-address" 
    class="avitar-input"
    placeholder="Enter property address"
  />
  <div class="avitar-form-help">
    Enter the complete street address including city and state
  </div>
</div>

<div class="avitar-form-group">
  <label class="avitar-label" for="description">Description</label>
  <textarea 
    id="description" 
    class="avitar-textarea"
    placeholder="Provide additional details..."
  ></textarea>
</div>
```

## 🏗 Getting Started

1. Include the CSS file in your HTML:
   ```html
   <link rel="stylesheet" href="path/to/avitar-design-system.css">
   ```

2. Use the layout structure:
   ```html
   <div class="avitar-layout">
     <!-- Your application content -->
   </div>
   ```

3. Apply component classes to your elements following the examples above.

4. Customize using CSS custom properties for your specific municipal needs.

## 🎨 Customization

All colors, spacing, and typography use CSS custom properties that can be easily customized:

```css
:root {
  --avitar-green: #your-custom-green;
  --avitar-yellow: #your-custom-yellow;
  --avitar-blue: #your-custom-blue;
  --space-4: 1.5rem; /* Adjust spacing */
}
```

This design system provides a solid foundation for building consistent, accessible, and professional municipal web applications while maintaining the Avitar brand identity.