import EmberRouter from '@ember/routing/router';
import config from 'avitar-suite/config/environment';

export default class Router extends EmberRouter {
  location = config.locationType;
  rootURL = config.rootURL;
}

Router.map(function () {
  // Authentication routes
  this.route('login');
  this.route('register');
  this.route('logout');

  // Municipality selection
  this.route('municipality-select');

  // Municipality-specific routes using slug
  this.route('municipality', { path: '/m/:municipality_slug' }, function () {
    // Dashboard - main landing page for municipality
    this.route('dashboard');

    // Assessing Module
    this.route('assessing', function () {
      this.route('properties');
      this.route('property', { path: '/property/:property_id' });
      // Assessment sections with implicit index routes
      this.route('general', function () {
        this.route('property', { path: '/:property_id' });
      });
      this.route('land', function () {
        this.route('property', { path: '/:property_id' });
      });
      this.route('building', function () {
        this.route('property', { path: '/:property_id' });
      });
      this.route('features', function () {
        this.route('property', { path: '/:property_id' });
      });
      this.route('sketch', function () {
        this.route('property', { path: '/:property_id' });
      });
      this.route('ai-review'); // Enterprise feature
      this.route('reports'); // Professional+ feature
      this.route('gis'); // Enterprise feature
      this.route('revaluation');
      this.route('settings', function () {
        this.route('general');
        this.route('current-use');
        this.route('neighborhoods');
        this.route('land-details');
        this.route('building-details');
        this.route('feature-details');
        this.route('view');
        this.route('waterfront');
        this.route('exemptions-credits');
      });
    });

    // Tax Collection Module
    this.route('tax-collection', function () {
      this.route('bills');
      this.route('bill', { path: '/bill/:bill_id' });
      this.route('payments');
      this.route('payment-plans'); // Professional+ feature
      this.route('liens'); // Enterprise feature
      this.route('reminders'); // Professional+ feature
      this.route('collections');
    });

    // Building Permits Module
    this.route('building-permits', function () {
      this.route('permits');
      this.route('permit', { path: '/permit/:permit_id' });
      this.route('property', { path: '/property/:property_id' });
      this.route('applications');
      this.route('inspections');
      this.route('plan-review'); // Professional+ feature
      this.route('workflow'); // Enterprise feature
      this.route('certificates');
    });

    // Town Clerk Module
    this.route('town-clerk', function () {
      this.route('records');
      this.route('record', { path: '/record/:record_id' });
      this.route('licenses');
      this.route('license', { path: '/license/:license_id' });
      this.route('meetings'); // Professional+ feature
      this.route('documents'); // Professional+ feature
      this.route('vital-records');
    });

    // Motor Vehicle Module
    this.route('motor-vehicle', function () {
      this.route('registrations');
      this.route('registration', { path: '/registration/:registration_id' });
      this.route('renewals');
      this.route('plate-tracking'); // Professional+ feature
      this.route('titles'); // Enterprise feature
      this.route('inspections');
    });

    // Utility Billing Module
    this.route('utility-billing', function () {
      this.route('bills');
      this.route('bill', { path: '/bill/:bill_id' });
      this.route('customers');
      this.route('customer', { path: '/customer/:customer_id' });
      this.route('smart-meters'); // Professional+ feature
      this.route('analytics'); // Enterprise feature
      this.route('rates');
    });

    // System administration (for system users)
    this.route('admin', function () {
      this.route('modules');
      this.route('users');
      this.route('settings');
      this.route('billing');
    });

    // Municipal Settings
    this.route('settings', function () {
      this.route('municipal-info');
      this.route('users');
      this.route('system');
      this.route('modules');
      this.route('features');
    });

    // User settings
    this.route('profile');
  });

  // Global admin routes (system-wide administration)
  this.route('system-admin', function () {
    this.route('municipalities');
    this.route('municipality', { path: '/municipality/:municipality_id' });
    this.route('users');
    this.route('billing');
    this.route('reports');
  });
});
