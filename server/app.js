// Suppress punycode deprecation warning (used by mongoose/mongodb dependencies)
// This will be fixed in future versions of mongoose
process.removeAllListeners('warning');
process.on('warning', (warning) => {
  if (
    warning.name === 'DeprecationWarning' &&
    warning.message.includes('punycode')
  ) {
    return; // Suppress punycode deprecation warnings
  }
  console.warn(warning.name, warning.message);
});

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const connectDB = require('./config/database');

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const municipalityRoutes = require('./routes/municipalities');
const municipalitySubscriptionRoutes = require('./routes/municipalitySubscriptions');
const municipalityConnectedAccountsRoutes = require('./routes/municipalityConnectedAccounts');
const webhookRoutes = require('./routes/webhooks');
const moduleRoutes = require('./routes/modules');
const propertyRoutes = require('./routes/properties');
const pidFormatRoutes = require('./routes/pid-formats');
const zoneRoutes = require('./routes/zones');
const neighborhoodCodeRoutes = require('./routes/neighborhoodCodes');
const propertyAttributeRoutes = require('./routes/propertyAttributes');
const buildingCodeRoutes = require('./routes/buildingCodes');
const buildingFeatureCodeRoutes = require('./routes/buildingFeatureCodes');
const buildingMiscellaneousPointsRoutes = require('./routes/buildingMiscellaneousPoints');
const sketchSubAreaFactorRoutes = require('./routes/sketchSubAreaFactors');
const featureCodeRoutes = require('./routes/featureCodes');
const landUseDetailRoutes = require('./routes/landUseDetails');
const currentUseRoutes = require('./routes/currentUse');
const acreageDiscountSettingsRoutes = require('./routes/acreageDiscountSettings');
const viewAttributeRoutes = require('./routes/viewAttributes');
const propertyViewRoutes = require('./routes/propertyViews');
const waterBodyRoutes = require('./routes/waterBodies');
const waterfrontAttributeRoutes = require('./routes/waterfrontAttributes');
const propertyWaterfrontRoutes = require('./routes/propertyWaterfront');
const exemptionsCreditsSettingsRoutes = require('./routes/exemptionsCreditsSettings');
const exemptionTypesRoutes = require('./routes/exemptionTypes');
const assessingReportsRoutes = require('./routes/assessingReports');
const landTaxationCategoryRoutes = require('./routes/landTaxationCategories');
const landAssessmentCalculationRoutes = require('./routes/landAssessmentCalculations');
const listingHistoryRoutes = require('./routes/listingHistory');
const salesHistoryRoutes = require('./routes/salesHistory');
const revaluationRoutes = require('./routes/revaluation');
const ownerRoutes = require('./routes/owners');
const importRoutes = require('./routes/import');
const permitRoutes = require('./routes/permits');
const permitTypeRoutes = require('./routes/permitTypes');
const projectTypeRoutes = require('./routes/projectTypes');
const contractorRoutes = require('./routes/contractors');
const contractorVerificationRoutes = require('./routes/contractorVerification');
const subscriptionRoutes = require('./routes/subscriptions');
const fileRoutes = require('./routes/files');
const emailTemplateRoutes = require('./routes/emailTemplates');
const notificationPreferencesRoutes = require('./routes/notificationPreferences');
const {
  router: changeStreamRoutes,
  initializeChangeStreams,
  shutdown: changeStreamShutdown,
} = require('./routes/change-stream');

const app = express();
const PORT = process.env.PORT || 3000;

// Connect to MongoDB
connectDB();

// Security middleware with custom configuration
app.use(
  helmet({
    frameguard: false, // Disable frameguard to allow cross-origin iframes from our frontend
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        frameSrc: [
          "'self'",
          'http://localhost:4200',
          'https://avitar-suite.vercel.app',
        ], // Allow iframes from frontend
        frameAncestors: [
          "'self'",
          'http://localhost:4200',
          'https://avitar-suite.vercel.app',
        ], // Allow being embedded in frontend
        imgSrc: ["'self'", 'data:', 'https:'],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
      },
    },
  }),
);

// CORS configuration
app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:4202',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);

// Logging middleware
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Stripe webhook route (MUST be registered before express.json() for signature verification)
// Uses express.raw() to preserve raw body for signature verification
app.use(
  '/api/webhooks',
  express.raw({ type: 'application/json' }),
  webhookRoutes,
);

// Body parsing middleware (for all other routes)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Avitar Municipal API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api', userRoutes);
app.use('/api', waterfrontAttributeRoutes); // Move before municipalities to avoid conflicts
app.use('/api', waterBodyRoutes);
app.use('/api/municipalities', municipalityRoutes);
app.use('/api/municipalities', municipalitySubscriptionRoutes); // Module subscription management
app.use('/api/municipalities', municipalityConnectedAccountsRoutes); // Stripe Connect account management
app.use('/api/modules', moduleRoutes);
app.use('/api', propertyRoutes);
app.use('/api', pidFormatRoutes);
app.use('/api', zoneRoutes);
app.use('/api', neighborhoodCodeRoutes);
app.use('/api', viewAttributeRoutes); // Move before propertyAttributeRoutes to avoid route conflicts
app.use('/api', propertyViewRoutes);
app.use('/api', propertyWaterfrontRoutes);
app.use('/api', propertyAttributeRoutes);
app.use('/api', buildingCodeRoutes);
app.use('/api', buildingFeatureCodeRoutes);
app.use('/api', buildingMiscellaneousPointsRoutes);
app.use('/api', sketchSubAreaFactorRoutes);
app.use('/api', featureCodeRoutes);
app.use('/api', landUseDetailRoutes);
app.use('/api', currentUseRoutes);
app.use('/api', acreageDiscountSettingsRoutes);
app.use('/api', exemptionsCreditsSettingsRoutes);
app.use('/api', exemptionTypesRoutes);
app.use('/api', assessingReportsRoutes);
app.use('/api', landTaxationCategoryRoutes);
app.use('/api', landAssessmentCalculationRoutes);
app.use('/api', listingHistoryRoutes);
app.use('/api', salesHistoryRoutes);
app.use('/api', revaluationRoutes);
app.use('/api', ownerRoutes);
app.use('/api', importRoutes);
app.use('/api', permitRoutes);
app.use('/api', permitTypeRoutes);
app.use('/api', projectTypeRoutes);
app.use('/api/contractors', contractorRoutes);
app.use('/api/contractor-verification', contractorVerificationRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api', fileRoutes);
app.use('/api', emailTemplateRoutes);
app.use('/api', notificationPreferencesRoutes);
app.use('/api', changeStreamRoutes);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'API endpoint not found',
    path: req.originalUrl,
  });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error('Server Error:', error);

  // Mongoose validation errors
  if (error.name === 'ValidationError') {
    const errors = Object.values(error.errors).map((e) => e.message);
    return res.status(400).json({
      success: false,
      message: 'Validation Error',
      errors,
    });
  }

  // Mongoose duplicate key errors
  if (error.code === 11000) {
    const field = Object.keys(error.keyValue)[0];
    return res.status(400).json({
      success: false,
      message: `${field} already exists`,
      field,
    });
  }

  // JWT errors
  if (error.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: 'Invalid token',
    });
  }

  if (error.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      message: 'Token expired',
    });
  }

  // Generic server error
  res.status(500).json({
    success: false,
    message:
      process.env.NODE_ENV === 'production'
        ? 'Internal server error'
        : error.message,
    ...(process.env.NODE_ENV !== 'production' && { stack: error.stack }),
  });
});

// Start server (only in non-serverless environments)
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  app.listen(PORT, async () => {
    console.log(`🚀 Avitar Municipal API Server running on port ${PORT}`);
    console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`📡 API Base URL: http://localhost:${PORT}/api`);
    console.log(
      `🔗 Client URL: ${process.env.CLIENT_URL || 'http://localhost:4202'}`,
    );

    // Initialize change streams for real-time sync
    try {
      await initializeChangeStreams(process.env.MONGODB_URI, 'avitar-suite');
      console.log('🔄 MongoDB Change Streams initialized');
    } catch (error) {
      console.error('❌ Failed to initialize change streams:', error);
    }
  });
}

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  console.log(`\n🔄 Received ${signal}. Starting graceful shutdown...`);

  try {
    await changeStreamShutdown();
    console.log('✅ Change streams shut down successfully');
  } catch (error) {
    console.error('❌ Error during change stream shutdown:', error);
  }

  process.exit(0);
};

// Listen for shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = app;
