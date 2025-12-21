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

  // User's permits dashboard (for contractors and citizens)
  this.route('my-permits', function () {
    this.route('active'); // Active permits
    this.route('history'); // Past permits
    this.route('permit', { path: '/:permit_id' }); // Permit detail
    this.route('project', { path: '/project/:project_id' }); // Project detail
    this.route('create'); // Create new permit (multi-step wizard)
  });

  // Contractor management (team, subscription, payment methods)
  this.route('contractor-management', function () {
    this.route('general'); // General company info
    this.route('team'); // Team member management
    this.route('payment-methods'); // Stored payment methods
    this.route('subscription'); // Subscription & billing
    this.route('notifications'); // Notification preferences
    this.route('verification'); // Platform verification application
    this.route('documents'); // Document library management
  });

  // Citizen/Contractor account settings
  this.route('citizen-settings', function () {
    this.route('profile'); // Profile information
    this.route('subscription'); // Subscription & billing
    this.route('payment-methods'); // Payment methods
    this.route('notifications'); // Notification preferences
  });

  // Municipality-specific routes using slug (for all user types)
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
      this.route('exemptions', function () {
        this.route('property', { path: '/:property_id' });
      });
      this.route('sketch', function () {
        this.route('property', { path: '/:property_id' });
      });
      this.route('ai-review'); // Enterprise feature
      this.route('reports'); // Professional+ feature
      this.route('gis'); // Enterprise feature
      this.route('revaluation', function () {
        this.route('sheet', { path: '/sheet/:sheet_id' });
      });
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
        this.route('import');
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
      // Non-property routes (queue/list views)
      this.route('find'); // Find properties with PID tree
      this.route('queue'); // Work queue for municipal staff
      this.route('permits'); // All permits list
      this.route('applications'); // All applications list
      this.route('projects'); // All projects list
      this.route('project', { path: '/project/:project_id' }); // Project detail

      // Property-specific routes with implicit index
      this.route('property-permits', function () {
        this.route('property', { path: '/:property_id' });
      });
      this.route('inspections', function () {
        this.route('property', { path: '/:property_id' });
      });

      // Action routes
      this.route('create'); // Create new permit
      this.route('edit', { path: '/edit/:permit_id' }); // Edit permit
      this.route('permit', { path: '/permit/:permit_id' }); // Permit detail
      this.route('review', { path: '/review/:permit_id/:department_name' }); // Department review

      // Advanced features
      this.route('plan-review'); // Professional+ feature
      this.route('workflow'); // Enterprise feature
      this.route('reports'); // Reports dashboard
      this.route('analytics'); // Analytics (Professional+)

      // Settings (municipal staff) / Account (residential users)
      this.route('settings', function () {
        // Municipal staff settings
        this.route('permit-types'); // Permit types configuration
        this.route('project-types'); // Project types configuration
        this.route('inspections', function () {
          this.route('print-batch', { path: '/print-batch/:batch_id' }); // Print QR code batch
        }); // Inspection types and workflows
        this.route('inspection-checklists'); // Inspection checklist templates
        this.route('users'); // Users and inspectors management
        this.route('documents'); // Document library management

        // Residential user account settings
        this.route('account'); // Profile/personal info
        this.route('my-permits'); // View their permits
        this.route('company'); // Contractor company settings
        this.route('team'); // Team management (contractors)
        this.route('subscription'); // Subscription management (contractors)
        this.route('payment-methods'); // Payment methods (contractors)
        this.route('notifications'); // Notification preferences for building permits
      });
      this.route('inspection', { path: '/inspection/:inspection_id' });
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
      this.route('user', { path: '/user/:user_id' }); // User detail page - standalone
      this.route('system');
      this.route('modules');
      this.route('features');
      this.route('email-templates');
      this.route('documents'); // General municipal documents
      this.route('payment-setup'); // Stripe Connect onboarding
      this.route('payment-info'); // Payment dashboard and information
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

  // Standalone print routes (outside municipality to avoid auth issues in new windows)
  this.route('print-inspection-batch', {
    path: '/print/inspection-batch/:municipality_slug/:batch_id',
  });
});
