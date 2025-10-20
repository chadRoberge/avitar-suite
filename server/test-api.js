const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

async function getUserAndToken() {
  // Connect to MongoDB
  await mongoose.connect(
    process.env.MONGODB_URI || 'mongodb://localhost:27017/avitar-dev',
  );

  // Find the first user
  const user = await User.findOne({}).lean();
  if (!user) {
    console.log('No users found in database');
    return null;
  }

  console.log('Found user:', {
    id: user._id,
    email: user.email,
    global_role: user.global_role,
  });

  // Create a token for this user
  const token = jwt.sign(
    {
      userId: user._id.toString(),
      global_role: user.global_role || 'avitar_admin',
    },
    process.env.JWT_SECRET || 'fallback-secret',
    { expiresIn: '1h' },
  );

  console.log('Test Token:', token);
  return token;
}

// Test the API endpoint
const fetch = require('node-fetch');

async function testAPI() {
  try {
    const token = await getUserAndToken();
    if (!token) {
      console.log('Could not get valid token');
      return;
    }

    const response = await fetch(
      'http://localhost:3000/api/municipalities/68b1ee91e6f6ded2c46824f9/properties',
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      },
    );

    console.log('Response status:', response.status);

    if (response.ok) {
      const data = await response.json();
      console.log('Properties returned:', data.properties.length);
      console.log('Total:', data.total);
      if (data.properties.length > 0) {
        console.log('First property PID:', data.properties[0].pid_formatted);
        console.log(
          'First property address:',
          data.properties[0].location?.address,
        );
      }
    } else {
      const error = await response.text();
      console.log('Error response:', error);
    }
  } catch (error) {
    console.error('Fetch error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

testAPI();
