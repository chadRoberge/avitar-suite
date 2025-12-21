const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const User = require('../models/User');
const Municipality = require('../models/Municipality');

async function createSystemAdmin() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // First, create a temporary municipality for the system admin
    // (System admins need to be associated with a municipality in the schema)
    let systemMunicipality = await Municipality.findOne({ code: 'SYSTEM' });

    if (!systemMunicipality) {
      systemMunicipality = new Municipality({
        name: 'System Administration',
        code: 'SYSTEM',
        state: 'NY',
        county: 'System',
        type: 'city',
        address: {
          street: '123 System Admin St',
          city: 'Admin City',
          zipCode: '00000',
        },
        is_active: true,
        setup_completed: true,
      });

      await systemMunicipality.save();
      console.log('Created system municipality');
    }

    // Check if admin user already exists
    const existingAdmin = await User.findOne({ email: 'admin@test.com' });
    if (existingAdmin) {
      console.log('System admin user already exists');
      console.log('Email:', existingAdmin.email);
      console.log('Permission Level:', existingAdmin.permissionLevel);
      console.log('User Type:', existingAdmin.userType);
      return;
    }

    // Create system admin user
    const adminUser = new User({
      firstName: 'System',
      lastName: 'Administrator',
      email: 'admin@test.com',
      password: 'password123!',
      userType: 'system',
      municipality: systemMunicipality._id,
      permissionLevel: 999, // SUPER_ADMIN - highest level
      jobTitle: 'System Administrator',
      department: 'it',
      isActive: true,
      isEmailVerified: true,
      preferences: {
        notifications: {
          email: true,
          permitUpdates: false,
          taxReminders: false,
          generalUpdates: true,
        },
        language: 'en',
        defaultDashboard: 'admin',
        darkMode: false,
      },
    });

    await adminUser.save();

    console.log('✅ System admin user created successfully!');
    console.log('📧 Email: admin@test.com');
    console.log('🔑 Password: password123!');
    console.log('🔒 Permission Level: 999 (SUPER_ADMIN)');
    console.log('👤 User Type: system');
    console.log('🏛️ Municipality: System Administration');
    console.log('');
    console.log('🚀 You can now log in with these credentials');
  } catch (error) {
    console.error('❌ Error creating system admin:', error.message);

    if (error.code === 11000) {
      console.log('User with this email already exists');
    } else {
      console.error('Full error:', error);
    }
  } finally {
    // Close the database connection
    await mongoose.connection.close();
    console.log('Database connection closed');
  }
}

// Run the script
createSystemAdmin();
