Create a Building Permits Module for the existing Avitar Suite Ember.js application with MongoDB backend. This module should integrate into our existing app structure while maintaining separation of concerns and user-type-based routing.

## EXISTING PROJECT CONTEXT
- Frontend: Ember.js (existing app structure)
- Backend: Node.js/Express with MongoDB
- Database: MongoDB with Mongoose ODM
- Authentication: Already implemented with user roles stored in MongoDB
- Existing Modules: Property Assessment CAMA
- File Structure: Standard Ember conventions already in place

## EMBER.JS FILE STRUCTURE REQUIREMENTS

Organize the permits module within the existing Ember app structure:
```
app/
├── components/
│   └── permits/
│       ├── permit-list/
│       │   ├── component.js
│       │   └── template.hbs
│       ├── permit-detail/
│       │   ├── component.js
│       │   └── template.hbs
│       ├── permit-search/
│       │   ├── residential/
│       │   │   ├── component.js
│       │   │   └── template.hbs
│       │   ├── commercial/
│       │   │   ├── component.js
│       │   │   └── template.hbs
│       │   └── municipal/
│       │       ├── component.js
│       │       └── template.hbs
│       ├── permit-form/
│       │   ├── component.js
│       │   └── template.hbs
│       ├── permit-status-badge/
│       │   ├── component.js
│       │   └── template.hbs
│       ├── inspection-scheduler/
│       │   ├── component.js
│       │   └── template.hbs
│       ├── permit-analytics-dashboard/
│       │   ├── component.js
│       │   └── template.hbs
│       └── permit-document-viewer/
│           ├── component.js
│           └── template.hbs
├── controllers/
│   └── permits/
│       ├── residential.js
│       ├── commercial.js
│       ├── municipal.js
│       └── admin.js
├── routes/
│   └── permits/
│       ├── index.js
│       ├── residential/
│       │   ├── index.js
│       │   ├── my-permits.js
│       │   └── permit.js
│       ├── commercial/
│       │   ├── index.js
│       │   ├── search.js
│       │   ├── analytics.js
│       │   ├── export.js
│       │   └── permit.js
│       ├── municipal/
│       │   ├── index.js
│       │   ├── queue.js
│       │   ├── create.js
│       │   ├── edit.js
│       │   ├── inspections.js
│       │   └── reports.js
│       └── admin/
│           ├── index.js
│           ├── settings.js
│           └── audit.js
├── templates/
│   └── permits/
│       ├── index.hbs
│       ├── residential/
│       │   ├── index.hbs
│       │   ├── my-permits.hbs
│       │   └── permit.hbs
│       ├── commercial/
│       │   ├── index.hbs
│       │   ├── search.hbs
│       │   ├── analytics.hbs
│       │   ├── export.hbs
│       │   └── permit.hbs
│       ├── municipal/
│       │   ├── index.hbs
│       │   ├── queue.hbs
│       │   ├── create.hbs
│       │   ├── edit.hbs
│       │   ├── inspections.hbs
│       │   └── reports.hbs
│       └── admin/
│           ├── index.hbs
│           ├── settings.hbs
│           └── audit.hbs
├── models/
│   ├── permit.js
│   ├── permit-inspection.js
│   ├── permit-document.js
│   ├── permit-fee.js
│   └── permit-contractor.js
├── adapters/
│   └── permit.js
├── serializers/
│   └── permit.js
├── services/
│   ├── permit-manager.js
│   ├── permit-notifications.js
│   └── permit-analytics.js
├── helpers/
│   ├── permit-status-color.js
│   ├── format-permit-number.js
│   └── days-until-expiration.js
├── mixins/
│   ├── permit-searchable.js
│   └── permit-exportable.js
└── utils/
    └── permits/
        ├── fee-calculator.js
        └── permit-validator.js
```

## MONGODB SCHEMA DESIGN

### Main Collections:
```javascript
// permits collection
const PermitSchema = new mongoose.Schema({
  permitNumber: { 
    type: String, 
    unique: true, 
    index: true 
  },
  propertyId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Property',
    index: true 
  },
  type: {
    type: String,
    enum: ['building', 'electrical', 'plumbing', 'mechanical', 'demolition', 'zoning'],
    required: true,
    index: true
  },
  subtype: String,
  status: {
    type: String,
    enum: ['draft', 'submitted', 'under_review', 'approved', 'denied', 'expired', 'closed'],
    default: 'draft',
    index: true
  },
  applicant: {
    name: String,
    email: String,
    phone: String,
    address: String
  },
  contractor: {
    companyName: String,
    licenseNumber: String,
    contactName: String,
    email: String,
    phone: String
  },
  description: String,
  scopeOfWork: String,
  estimatedValue: Number,
  squareFootage: Number,
  
  // Dates
  applicationDate: { type: Date, index: true },
  approvalDate: Date,
  expirationDate: Date,
  completionDate: Date,
  
  // Fees
  fees: [{
    type: { type: String },
    amount: Number,
    paid: Boolean,
    paidDate: Date,
    receiptNumber: String
  }],
  
  // Location data for GIS integration
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: [Number] // [longitude, latitude]
  },
  
  // Access control
  visibility: {
    public: { type: Boolean, default: false },
    commercial: { type: Boolean, default: true },
    owner: { type: Boolean, default: true }
  },
  
  // Internal fields (municipal only)
  internalNotes: [{
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    note: String,
    timestamp: Date
  }],
  assignedInspector: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  priorityLevel: { type: Number, default: 0 },
  
  // Metadata
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  
  // Soft delete
  deletedAt: Date
}, {
  timestamps: true,
  collection: 'permits'
});

// Add compound indexes for common queries
PermitSchema.index({ propertyId: 1, status: 1 });
PermitSchema.index({ contractorLicenseNumber: 1, applicationDate: -1 });
PermitSchema.index({ type: 1, status: 1, applicationDate: -1 });
PermitSchema.index({ 'location': '2dsphere' }); // For geo queries

// permit_inspections collection
const InspectionSchema = new mongoose.Schema({
  permitId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Permit',
    required: true,
    index: true 
  },
  type: {
    type: String,
    enum: ['foundation', 'framing', 'electrical', 'plumbing', 'insulation', 'final'],
    required: true
  },
  scheduledDate: Date,
  completedDate: Date,
  inspector: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  result: {
    type: String,
    enum: ['pending', 'passed', 'failed', 'partial', 'cancelled']
  },
  comments: String,
  violations: [String],
  photos: [String], // S3 URLs
  requiresReinspection: Boolean,
  nextInspectionDate: Date
}, {
  timestamps: true,
  collection: 'permit_inspections'
});

// permit_documents collection
const DocumentSchema = new mongoose.Schema({
  permitId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Permit',
    required: true,
    index: true 
  },
  type: {
    type: String,
    enum: ['application', 'plan', 'approval', 'inspection', 'certificate', 'other']
  },
  filename: String,
  url: String, // S3 URL
  size: Number,
  mimeType: String,
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  visibility: {
    public: Boolean,
    commercial: Boolean,
    owner: Boolean
  }
}, {
  timestamps: true,
  collection: 'permit_documents'
});

// Create text index for search
PermitSchema.index({
  permitNumber: 'text',
  'applicant.name': 'text',
  'contractor.companyName': 'text',
  description: 'text',
  scopeOfWork: 'text'
});
```

## EMBER ROUTER CONFIGURATION
```javascript
// app/router.js
Router.map(function() {
  // ... existing routes
  
  this.route('permits', function() {
    // Public route (redirects based on user type)
    this.route('index');
    
    // Residential users
    this.route('residential', function() {
      this.route('my-permits');
      this.route('permit', { path: '/:permit_id' });
    });
    
    // Commercial users
    this.route('commercial', function() {
      this.route('search');
      this.route('analytics');
      this.route('export');
      this.route('portfolio');
      this.route('permit', { path: '/:permit_id' });
      this.route('alerts');
    });
    
    // Municipal staff
    this.route('municipal', function() {
      this.route('queue');
      this.route('create');
      this.route('edit', { path: '/edit/:permit_id' });
      this.route('inspections', function() {
        this.route('schedule');
        this.route('record', { path: '/:inspection_id' });
      });
      this.route('reports');
      this.route('batch');
    });
    
    // Admin
    this.route('admin', function() {
      this.route('settings', function() {
        this.route('types');
        this.route('fees');
        this.route('workflows');
        this.route('templates');
      });
      this.route('audit');
    });
  });
});
```

## KEY EMBER COMPONENTS TO CREATE

### 1. Base Permit Route with User Type Detection
```javascript
// app/routes/permits/index.js
import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class PermitsIndexRoute extends Route {
  @service session;
  @service router;
  
  beforeModel() {
    const userType = this.session.currentUser.type;
    
    // Redirect to appropriate sub-route based on user type
    switch(userType) {
      case 'residential':
        this.router.transitionTo('permits.residential.my-permits');
        break;
      case 'commercial':
        this.router.transitionTo('permits.commercial.search');
        break;
      case 'municipal':
        this.router.transitionTo('permits.municipal.queue');
        break;
      case 'admin':
        this.router.transitionTo('permits.admin.settings');
        break;
      default:
        this.router.transitionTo('login');
    }
  }
}
```

### 2. Permit Search Component (Commercial)
```javascript
// app/components/permits/permit-search/commercial/component.js
import Component from '@glimmer/component';
import { action } from '@ember/object';
import { tracked } from '@glimmer/tracking';
import { inject as service } from '@ember/service';

export default class PermitSearchCommercialComponent extends Component {
  @service store;
  @service permitAnalytics;
  @tracked permits = [];
  @tracked filters = {
    type: 'all',
    status: 'all',
    dateRange: 'last30days',
    contractor: '',
    minValue: null,
    maxValue: null,
    neighborhood: 'all'
  };
  @tracked isExporting = false;
  
  @action
  async search() {
    const query = this.buildQuery();
    this.permits = await this.store.query('permit', query);
    
    // Track search for analytics
    this.permitAnalytics.trackSearch(query);
  }
  
  @action
  async exportResults(format) {
    this.isExporting = true;
    try {
      const response = await fetch('/api/permits/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.session.token}`
        },
        body: JSON.stringify({
          filters: this.filters,
          format: format // 'csv' or 'excel'
        })
      });
      
      const blob = await response.blob();
      this.downloadBlob(blob, `permits-export.${format}`);
    } finally {
      this.isExporting = false;
    }
  }
  
  buildQuery() {
    const query = {};
    
    if (this.filters.type !== 'all') {
      query.type = this.filters.type;
    }
    
    if (this.filters.status !== 'all') {
      query.status = this.filters.status;
    }
    
    if (this.filters.contractor) {
      query['contractor.companyName'] = {
        $regex: this.filters.contractor,
        $options: 'i'
      };
    }
    
    // Add date range logic
    if (this.filters.dateRange !== 'all') {
      query.applicationDate = this.getDateRange(this.filters.dateRange);
    }
    
    return query;
  }
}
```

### 3. Municipal Queue Component
```javascript
// app/components/permits/municipal-queue/component.js
import Component from '@glimmer/component';
import { action } from '@ember/object';
import { tracked } from '@glimmer/tracking';
import { inject as service } from '@ember/service';

export default class PermitsMunicipalQueueComponent extends Component {
  @service store;
  @service session;
  @service notifications;
  
  @tracked queue = [];
  @tracked selectedPermits = [];
  @tracked currentView = 'pending'; // pending, review, inspections
  
  constructor() {
    super(...arguments);
    this.loadQueue();
  }
  
  @action
  async loadQueue() {
    this.queue = await this.store.query('permit', {
      status: 'under_review',
      assignedTo: this.session.currentUser.id,
      sort: '-priority,applicationDate'
    });
  }
  
  @action
  async approvePermit(permit) {
    permit.status = 'approved';
    permit.approvalDate = new Date();
    permit.approvedBy = this.session.currentUser.id;
    
    await permit.save();
    
    // Send notification
    await this.notifications.sendPermitApproval(permit);
    
    // Remove from queue
    this.queue.removeObject(permit);
  }
  
  @action
  async batchAssignInspector(permits, inspector) {
    const updates = permits.map(permit => {
      permit.assignedInspector = inspector;
      return permit.save();
    });
    
    await Promise.all(updates);
    this.notifications.success(`${permits.length} permits assigned to ${inspector.name}`);
  }
  
  @action
  dragPermitStart(permit, event) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('permitId', permit.id);
  }
  
  @action
  dropOnInspector(inspector, event) {
    event.preventDefault();
    const permitId = event.dataTransfer.getData('permitId');
    const permit = this.queue.findBy('id', permitId);
    
    if (permit) {
      this.assignInspector(permit, inspector);
    }
  }
}
```

### 4. Permit Model
```javascript
// app/models/permit.js
import Model, { attr, belongsTo, hasMany } from '@ember-data/model';

export default class PermitModel extends Model {
  @attr('string') permitNumber;
  @attr('string') type;
  @attr('string') subtype;
  @attr('string') status;
  @attr('string') description;
  @attr('string') scopeOfWork;
  @attr('number') estimatedValue;
  @attr('number') squareFootage;
  
  @attr('date') applicationDate;
  @attr('date') approvalDate;
  @attr('date') expirationDate;
  @attr('date') completionDate;
  
  @attr() applicant;
  @attr() contractor;
  @attr() fees;
  @attr() location;
  @attr() visibility;
  @attr() internalNotes;
  
  @belongsTo('property') property;
  @belongsTo('user') assignedInspector;
  @belongsTo('user') createdBy;
  @belongsTo('user') updatedBy;
  
  @hasMany('permit-inspection') inspections;
  @hasMany('permit-document') documents;
  
  get isExpired() {
    return this.expirationDate && new Date() > this.expirationDate;
  }
  
  get daysUntilExpiration() {
    if (!this.expirationDate) return null;
    const days = Math.floor((this.expirationDate - new Date()) / (1000 * 60 * 60 * 24));
    return days;
  }
  
  get totalFees() {
    return this.fees?.reduce((sum, fee) => sum + fee.amount, 0) || 0;
  }
  
  get unpaidFees() {
    return this.fees?.filter(fee => !fee.paid) || [];
  }
  
  get canEdit() {
    const userType = this.session.currentUser.type;
    return userType === 'municipal' || userType === 'admin';
  }
}
```

### 5. Permit Service for Business Logic
```javascript
// app/services/permit-manager.js
import Service from '@ember/service';
import { inject as service } from '@ember/service';

export default class PermitManagerService extends Service {
  @service store;
  @service session;
  @service notifications;
  
  async createPermit(permitData) {
    // Validate based on user type
    if (!this.canCreatePermit()) {
      throw new Error('Insufficient permissions to create permits');
    }
    
    // Generate permit number
    permitData.permitNumber = await this.generatePermitNumber(permitData.type);
    
    // Calculate fees
    permitData.fees = this.calculateFees(permitData);
    
    // Set visibility based on type
    permitData.visibility = this.determineVisibility(permitData);
    
    // Create permit
    const permit = this.store.createRecord('permit', permitData);
    await permit.save();
    
    // Send notifications
    await this.notifications.sendNewPermitNotification(permit);
    
    return permit;
  }
  
  async generatePermitNumber(type) {
    const year = new Date().getFullYear();
    const prefix = this.getTypePrefix(type);
    
    // Get count from MongoDB aggregation
    const response = await fetch(`/api/permits/next-number/${year}/${type}`);
    const { nextNumber } = await response.json();
    
    return `${year}-${prefix}-${String(nextNumber).padStart(6, '0')}`;
  }
  
  calculateFees(permitData) {
    const fees = [];
    
    // Base permit fee
    const baseFee = this.getBaseFee(permitData.type);
    fees.push({
      type: 'base',
      amount: baseFee,
      paid: false
    });
    
    // Value-based fee (1.5% of construction value)
    if (permitData.estimatedValue > 0) {
      fees.push({
        type: 'valuation',
        amount: permitData.estimatedValue * 0.015,
        paid: false
      });
    }
    
    // Plan review fee
    if (permitData.squareFootage > 500) {
      fees.push({
        type: 'planReview',
        amount: permitData.squareFootage * 0.25,
        paid: false
      });
    }
    
    return fees;
  }
  
  canCreatePermit() {
    const userType = this.session.currentUser.type;
    return userType === 'municipal' || userType === 'admin';
  }
  
  canViewPermit(permit) {
    const user = this.session.currentUser;
    
    if (user.type === 'admin' || user.type === 'municipal') {
      return true;
    }
    
    if (user.type === 'commercial' && permit.visibility.commercial) {
      return true;
    }
    
    if (user.type === 'residential' && permit.visibility.owner) {
      // Check if user owns the property
      return user.propertyIds?.includes(permit.property.id);
    }
    
    return false;
  }
  
  getPermitAccessLevel(permit) {
    const user = this.session.currentUser;
    
    if (user.type === 'admin' || user.type === 'municipal') {
      return 'full';
    }
    
    if (user.type === 'commercial') {
      return 'commercial';
    }
    
    if (user.type === 'residential' && this.canViewPermit(permit)) {
      return 'basic';
    }
    
    return 'none';
  }
}
```

## API BACKEND ROUTES (Express/MongoDB)
```javascript
// server/routes/permits.js
const express = require('express');
const router = express.Router();
const Permit = require('../models/Permit');
const { authenticate, authorize } = require('../middleware/auth');

// Middleware to check user type
const requireCommercial = authorize(['commercial', 'municipal', 'admin']);
const requireMunicipal = authorize(['municipal', 'admin']);

// GET /api/permits - List permits (filtered by user type)
router.get('/', authenticate, async (req, res) => {
  const user = req.user;
  let query = {};
  
  // Apply user-type based filtering
  if (user.type === 'residential') {
    query.propertyId = { $in: user.propertyIds };
  } else if (user.type === 'commercial') {
    query['visibility.commercial'] = true;
  }
  // Municipal and admin see everything
  
  // Apply additional filters from query params
  if (req.query.type) query.type = req.query.type;
  if (req.query.status) query.status = req.query.status;
  if (req.query.contractor) {
    query['contractor.companyName'] = new RegExp(req.query.contractor, 'i');
  }
  
  // Date range filtering
  if (req.query.startDate || req.query.endDate) {
    query.applicationDate = {};
    if (req.query.startDate) query.applicationDate.$gte = new Date(req.query.startDate);
    if (req.query.endDate) query.applicationDate.$lte = new Date(req.query.endDate);
  }
  
  // Geo-spatial query for commercial users
  if (user.type === 'commercial' && req.query.lat && req.query.lng && req.query.radius) {
    query.location = {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [parseFloat(req.query.lng), parseFloat(req.query.lat)]
        },
        $maxDistance: parseInt(req.query.radius) // in meters
      }
    };
  }
  
  const permits = await Permit.find(query)
    .populate('property')
    .populate('assignedInspector', 'name email')
    .sort(req.query.sort || '-applicationDate')
    .limit(parseInt(req.query.limit) || 100)
    .skip(parseInt(req.query.offset) || 0);
  
  // Remove internal notes for non-municipal users
  if (user.type !== 'municipal' && user.type !== 'admin') {
    permits.forEach(permit => {
      permit.internalNotes = undefined;
    });
  }
  
  res.json(permits);
});

// GET /api/permits/analytics - Analytics endpoint (commercial only)
router.get('/analytics', requireCommercial, async (req, res) => {
  const pipeline = [
    {
      $match: {
        applicationDate: {
          $gte: new Date(req.query.startDate || new Date().setFullYear(new Date().getFullYear() - 1)),
          $lte: new Date(req.query.endDate || new Date())
        }
      }
    },
    {
      $facet: {
        byType: [
          {
            $group: {
              _id: '$type',
              count: { $sum: 1 },
              totalValue: { $sum: '$estimatedValue' }
            }
          }
        ],
        byStatus: [
          {
            $group: {
              _id: '$status',
              count: { $sum: 1 }
            }
          }
        ],
        byMonth: [
          {
            $group: {
              _id: {
                year: { $year: '$applicationDate' },
                month: { $month: '$applicationDate' }
              },
              count: { $sum: 1 },
              totalValue: { $sum: '$estimatedValue' }
            }
          },
          { $sort: { '_id.year': 1, '_id.month': 1 } }
        ],
        topContractors: [
          {
            $group: {
              _id: '$contractor.companyName',
              count: { $sum: 1 },
              totalValue: { $sum: '$estimatedValue' }
            }
          },
          { $sort: { count: -1 } },
          { $limit: 10 }
        ],
        avgProcessingTime: [
          {
            $match: {
              approvalDate: { $exists: true }
            }
          },
          {
            $project: {
              processingTime: {
                $divide: [
                  { $subtract: ['$approvalDate', '$applicationDate'] },
                  1000 * 60 * 60 * 24 // Convert to days
                ]
              }
            }
          },
          {
            $group: {
              _id: null,
              avgDays: { $avg: '$processingTime' }
            }
          }
        ]
      }
    }
  ];
  
  const results = await Permit.aggregate(pipeline);
  res.json(results[0]);
});

// POST /api/permits/export - Bulk export (commercial only)
router.post('/export', requireCommercial, async (req, res) => {
  const { filters, format } = req.body;
  
  // Log the export for billing/tracking
  await ExportLog.create({
    userId: req.user._id,
    type: 'permits',
    filters,
    format,
    timestamp: new Date()
  });
  
  // Build query from filters
  const query = buildQueryFromFilters(filters);
  
  const permits = await Permit.find(query)
    .populate('property')
    .lean();
  
  if (format === 'csv') {
    const csv = await generateCSV(permits);
    res.header('Content-Type', 'text/csv');
    res.attachment('permits-export.csv');
    res.send(csv);
  } else if (format === 'excel') {
    const excel = await generateExcel(permits);
    res.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.attachment('permits-export.xlsx');
    res.send(excel);
  } else {
    res.json(permits);
  }
});

// POST /api/permits/:id/inspection - Schedule inspection (municipal only)
router.post('/:id/inspection', requireMunicipal, async (req, res) => {
  const permit = await Permit.findById(req.params.id);
  
  if (!permit) {
    return res.status(404).json({ error: 'Permit not found' });
  }
  
  const inspection = new Inspection({
    permitId: permit._id,
    type: req.body.type,
    scheduledDate: req.body.scheduledDate,
    inspector: req.body.inspectorId || req.user._id
  });
  
  await inspection.save();
  
  // Update permit
  permit.inspections.push(inspection._id);
  await permit.save();
  
  // Send notification to property owner
  await sendInspectionScheduledNotification(permit, inspection);
  
  res.json(inspection);
});
```

## TESTING STRUCTURE
```javascript
// tests/integration/components/permits/permit-search-test.js
import { module, test } from 'qunit';
import { setupRenderingTest } from 'ember-qunit';
import { render, fillIn, click } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';

module('Integration | Component | permits/permit-search', function(hooks) {
  setupRenderingTest(hooks);

  test('commercial user can see all search filters', async function(assert) {
    this.owner.lookup('service:session').currentUser = {
      type: 'commercial'
    };

    await render(hbs`<Permits::PermitSearch::Commercial />`);
    
    assert.dom('[data-test-filter-type]').exists();
    assert.dom('[data-test-filter-status]').exists();
    assert.dom('[data-test-filter-contractor]').exists();
    assert.dom('[data-test-filter-date-range]').exists();
    assert.dom('[data-test-export-button]').exists();
  });

  test('residential user sees limited filters', async function(assert) {
    this.owner.lookup('service:session').currentUser = {
      type: 'residential'
    };

    await render(hbs`<Permits::PermitSearch::Residential />`);
    
    assert.dom('[data-test-filter-type]').doesNotExist();
    assert.dom('[data-test-filter-contractor]').doesNotExist();
    assert.dom('[data-test-export-button]').doesNotExist();
  });
});
```

## IMPLEMENTATION PRIORITIES
Use Avitar created CSS styles from app.css please done make your own css before consulting the app.css to see what already exists.

Phase 1 (MVP):
- Basic permit viewing for all user types
- Permit creation for municipal users
- Simple search functionality
- Document uploads

Phase 2:
- Advanced search for commercial users
- Analytics dashboard
- Inspection scheduling
- Email notifications

Phase 3:
- Bulk operations
- API access
- GIS integration
- Mobile optimization

Phase 4:
- Automated workflows
- Payment processing integration
- Advanced reporting
- White-label options

Please implement this module following Ember.js best practices, with proper separation of concerns, comprehensive error handling, and full test coverage. The module should integrate seamlessly with the existing Avitar Suite application structure.