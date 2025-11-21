const mongoose = require('mongoose');
const User = require('../models/User');
const Municipality = require('../models/Municipality');
const path = require('path');

// Try to load .env from multiple locations
require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
require('dotenv').config();

async function createTestUser() {
  try {
    const mongoUri =
      process.env.MONGODB_URI ||
      process.env.DATABASE_URL ||
      process.env.MONGO_URL;
    if (!mongoUri) {
      throw new Error(
        'MongoDB URI not found. Please set MONGODB_URI, DATABASE_URL, or MONGO_URL environment variable.',
      );
    }

    // Connect to MongoDB
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    // Find the test municipality
    const municipality = await Municipality.findOne({
      $or: [
        { code: 'TEST_TOWNSHIP' },
        { name: /test/i },
        { slug: 'test-township' },
      ],
    });

    if (!municipality) {
      throw new Error(
        'Test municipality not found. Please run the update-test-municipality script first.',
      );
    }

    console.log(
      `Found test municipality: ${municipality.name} (${municipality._id})`,
    );

    // Check if test user already exists
    let user = await User.findOne({ email: 'admin@test.com' });

    if (user) {
      console.log('Test user already exists, updating...');
    } else {
      console.log('Creating new test user...');
      user = new User({
        email: 'admin@test.com',
        password: 'password123!',
        first_name: 'Admin',
        last_name: 'User',
        phone: '16035550123',
        global_role: 'municipal_user',
      });
    }

    // Add municipality permissions
    user.municipal_permissions = [
      {
        municipality_id: municipality._id,
        municipality_name: municipality.name,
        role: 'admin',
        module_permissions: new Map([
          [
            'assessing',
            {
              enabled: true,
              role: 'admin',
              permissions: [
                'create',
                'read',
                'update',
                'delete',
                'approve',
                'export',
              ],
              restrictions: new Map(),
            },
          ],
          [
            'buildingPermits',
            {
              enabled: true,
              role: 'admin',
              permissions: [
                'create',
                'read',
                'update',
                'delete',
                'approve',
                'export',
              ],
              restrictions: new Map(),
            },
          ],
          [
            'townClerk',
            {
              enabled: true,
              role: 'staff',
              permissions: ['create', 'read', 'update', 'export'],
              restrictions: new Map(),
            },
          ],
          [
            'taxCollection',
            {
              enabled: true,
              role: 'supervisor',
              permissions: ['create', 'read', 'update', 'delete', 'export'],
              restrictions: new Map(),
            },
          ],
        ]),
      },
    ];

    // Set preferences
    user.preferences = {
      default_municipality: municipality.slug,
      theme: 'light',
      notifications: {
        email: true,
        browser: true,
      },
    };

    await user.save();

    console.log('✅ Successfully created/updated test user:');
    console.log(`   Email: ${user.email}`);
    console.log(`   Password: testPassword123!`);
    console.log(`   Global Role: ${user.global_role}`);
    console.log(`   Municipality: ${municipality.name}`);
    console.log(`   Municipal Role: ${user.municipal_permissions[0].role}`);

    console.log('\nModule Permissions:');
    const modulePerms = user.municipal_permissions[0].module_permissions;
    for (const [moduleName, permissions] of modulePerms) {
      console.log(`   ${moduleName}:`);
      console.log(`     Role: ${permissions.role}`);
      console.log(`     Permissions: ${permissions.permissions.join(', ')}`);
    }

    // Also create an Avitar staff user
    let avitarUser = await User.findOne({ email: 'staff@avitar.com' });


    if (!avitarUser) {
      console.log('\nCreating Avitar staff user...');
      avitarUser = new User({
        email: 'staff@avitar.com',
        password: 'avitarStaff123!',
        first_name: 'Avitar',
        last_name: 'Staff',
        global_role: 'avitar_staff',
        preferences: {
          theme: 'dark',
          notifications: {
            email: true,
            browser: true,
          },
        },
      });

      await avitarUser.save();

      console.log('✅ Successfully created Avitar staff user:');
      console.log(`   Email: ${avitarUser.email}`);
      console.log(`   Password: avitarStaff123!`);
      console.log(`   Global Role: ${avitarUser.global_role}`);
    } else {
      console.log('Avitar staff user already exists');
    }
  } catch (error) {
    console.error('Error creating test user:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\nMongoDB connection closed');
  }
}

//comm user
//chad.roberge@gmail.com
//avitarStaff123!

// Run the script
createTestUser();
