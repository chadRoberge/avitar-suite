# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an Ember.js application built with Ember CLI v6.1.0 using the Octane edition. The project is called `avitar-suite` and follows modern Ember conventions with ES6 modules, Glimmer components, and tracking.

## Development Commands

### Setup
```bash
npm install
```

### Development Server
```bash
npm run start
# Serves at http://localhost:4200
# Tests at http://localhost:4200/tests
```

### Testing
```bash
npm run test                    # Run all tests and linting
npm run test:ember              # Run only Ember tests
npm run test:ember -- --server  # Run tests in watch mode
```

### Linting and Code Quality
```bash
npm run lint           # Run all linters (JS, CSS, HBS)
npm run lint:fix       # Auto-fix all linting issues
npm run lint:js        # ESLint only
npm run lint:js:fix    # Auto-fix JS/ESLint issues
npm run lint:css       # Stylelint only
npm run lint:hbs       # Template linting only
```

### Building
```bash
npm exec ember build   # Development build
npm run build          # Production build
```

### Code Generation
```bash
ember generate <type> <name>
# Use ember help generate for available generators
```

## Architecture and Structure

### Framework Configuration
- **Ember Version**: 6.1.0 (Octane Edition)
- **Node Requirement**: >= 18
- **Module Prefix**: `avitar-suite`
- **Location Type**: `history` (HTML5 History API)
- **Root URL**: `/`

### Key Features Enabled
- Template-only Glimmer components
- No jQuery integration
- No application template wrapper
- Default async observers enabled
- No implicit route model

### File Organization
- **App Code**: `app/` - Main application code following Ember's pod-less structure
- **Components**: `app/components/` - Glimmer components
- **Routes**: `app/routes/` - Route handlers
- **Templates**: `app/templates/` - Handlebars templates
- **Models**: `app/models/` - Ember Data models
- **Controllers**: `app/controllers/` - Controllers (when needed)
- **Helpers**: `app/helpers/` - Template helpers
- **Styles**: `app/styles/` - CSS/SCSS files
- **Config**: `config/` - Environment and build configuration
- **Tests**: `tests/` - Test files (unit, integration)
- **Public**: `public/` - Static assets

### Technology Stack
- **Frontend Framework**: Ember.js with Glimmer components
- **Data Layer**: Ember Data
- **Build Tool**: Ember CLI with Webpack
- **Testing**: QUnit with ember-qunit and qunit-dom
- **Linting**: ESLint, Stylelint, ember-template-lint
- **Code Formatting**: Prettier
- **CSS Processing**: CleanCSS
- **Asset Processing**: Broccoli

### Development Patterns
- Modern ES6+ JavaScript with decorators support
- Glimmer components with tracked properties
- Template-only components where appropriate
- Standard Ember routing and data flow
- QUnit testing with modern assertions

### Build Configuration
- Standard Ember CLI build pipeline in `ember-cli-build.js`
- Environment-specific configuration in `config/environment.js`
- ESLint configuration using flat config format in `eslint.config.mjs`
- Testem configuration for browser testing in `testem.js`

### Currently Minimal Setup
This is a fresh Ember application with the default welcome page. The router has no defined routes yet, and there are no custom components, models, or routes implemented.