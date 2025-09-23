const jwt = require('jsonwebtoken');
const User = require('../../server/models/User');
const mongoose = require('mongoose');

// Connect to MongoDB if not already connected
if (!mongoose.connections[0].readyState) {
  mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/avitar-suite');
}

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET || 'your-secret-key', {
    expiresIn: process.env.NODE_ENV === 'development' ? '7d' : '24h',
  });
};

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const {
      firstName,
      lastName,
      email,
      password,
      userType,
      businessName,
      businessType,
      address,
      phone,
    } = req.body;

    // Validation
    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({
        message: 'First name, last name, email, and password are required'
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists with this email' });
    }

    // Create new user
    const userData = {
      firstName,
      lastName,
      email,
      password,
      userType: userType || 'user',
    };

    // Add business fields if provided
    if (businessName) userData.businessName = businessName;
    if (businessType) userData.businessType = businessType;
    if (address) userData.address = address;
    if (phone) userData.phone = phone;

    const user = new User(userData);
    await user.save();

    // Generate token
    const token = generateToken(user._id);

    // Return success response
    res.status(201).json({
      message: 'User created successfully',
      token,
      user: {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        userType: user.userType,
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    if (error.code === 11000) {
      return res.status(400).json({ message: 'User already exists with this email' });
    }
    res.status(500).json({ message: 'Internal server error' });
  }
}