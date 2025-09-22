const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Municipality = require('../models/Municipality');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.NODE_ENV === 'development' ? '7d' : '24h',
  });
};

// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public
router.post('/register', async (req, res) => {
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

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists',
      });
    }

    // Validate required fields for commercial users
    if (userType === 'commercial') {
      if (!businessName || !businessType) {
        return res.status(400).json({
          success: false,
          message:
            'Business name and type are required for commercial accounts',
        });
      }
    }

    // Create new user
    const userData = {
      firstName,
      lastName,
      email,
      password,
      userType,
    };

    // Add commercial-specific fields
    if (userType === 'commercial') {
      userData.businessName = businessName;
      userData.businessType = businessType;
    }

    // Add optional fields
    if (address) userData.address = address;
    if (phone) userData.phone = phone;

    const user = new User(userData);
    await user.save();

    // Update last login
    await user.updateLastLogin();

    // Generate token
    const token = generateToken(user._id);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      token,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: user.fullName,
        email: user.email,
        userType: user.userType,
        businessName: user.businessName,
        businessType: user.businessType,
        isActive: user.isActive,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Registration failed',
    });
  }
});

// @route   POST /api/auth/login
// @desc    Authenticate user and get token
// @access  Public
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required',
      });
    }

    // Find user and include password field
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid credentials',
      });
    }

    // Check if user is active
    if (!user.is_active) {
      return res.status(400).json({
        success: false,
        message: 'Account is deactivated. Please contact support.',
      });
    }

    // Compare password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Invalid credentials',
      });
    }

    // Update last login
    await user.updateLastLogin();

    // Generate token
    const token = generateToken(user._id);

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        phone: user.phone,
        global_role: user.global_role,
        municipal_permissions: user.municipal_permissions,
        preferences: user.preferences,
        last_login: user.last_login,
        is_active: user.is_active,
        // Legacy compatibility
        name: user.fullName,
        fullName: user.fullName,
        firstName: user.first_name,
        lastName: user.last_name,
        userType: user.userType,
        permissionLevel: user.permissionLevel,
        isActive: user.is_active,
        lastLogin: user.last_login,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
    });
  }
});

// @route   GET /api/auth/me
// @desc    Get current user profile with new permission structure
// @access  Private
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate(
      'municipal_permissions.municipality_id',
      'name slug code',
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    res.json({
      success: true,
      user: {
        id: user._id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        phone: user.phone,
        global_role: user.global_role,
        municipal_permissions: user.municipal_permissions,
        preferences: user.preferences,
        last_login: user.last_login,
        is_active: user.is_active,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        // Legacy compatibility
        name: user.fullName,
        fullName: user.fullName,
        firstName: user.first_name,
        lastName: user.last_name,
        userType: user.userType,
        permissionLevel: user.permissionLevel,
        isActive: user.is_active,
        lastLogin: user.last_login,
      },
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve profile',
    });
  }
});

// @route   PUT /api/auth/profile
// @desc    Update user profile
// @access  Private
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      phone,
      address,
      businessName,
      businessType,
      preferences,
    } = req.body;

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Update allowed fields
    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (phone) user.phone = phone;
    if (address) user.address = address;
    if (preferences) user.preferences = { ...user.preferences, ...preferences };

    // Commercial user specific fields
    if (user.userType === 'commercial') {
      if (businessName) user.businessName = businessName;
      if (businessType) user.businessType = businessType;
    }

    await user.save();

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: user.fullName,
        email: user.email,
        userType: user.userType,
        businessName: user.businessName,
        businessType: user.businessType,
        address: user.address,
        phone: user.phone,
        preferences: user.preferences,
        updatedAt: user.updatedAt,
      },
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Profile update failed',
    });
  }
});

// @route   POST /api/auth/logout
// @desc    Logout user (client-side token removal)
// @access  Private
router.post('/logout', authenticateToken, (req, res) => {
  res.json({
    success: true,
    message: 'Logged out successfully',
  });
});

// @route   GET /api/auth/verify-token
// @desc    Verify if token is valid
// @access  Private
router.get('/verify-token', authenticateToken, (req, res) => {
  res.json({
    success: true,
    message: 'Token is valid',
    user: {
      id: req.user._id,
      firstName: req.user.firstName,
      lastName: req.user.lastName,
      email: req.user.email,
      userType: req.user.userType,
    },
  });
});

// @route   GET /api/auth/modules
// @desc    Get user's available modules and navigation
// @access  Private
router.get('/modules', authenticateToken, async (req, res) => {
  try {
    const availableModules = await req.user.getAvailableModules();
    const { ModuleHelpers } = require('../config/modules');
    const navigation = ModuleHelpers.getNavigationForModules(availableModules);

    res.json({
      success: true,
      data: {
        modules: availableModules,
        navigation,
        userType: req.user.userType,
        department: req.user.department,
        permissionLevel: req.user.permissionLevel,
      },
    });
  } catch (error) {
    console.error('Error fetching user modules:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user modules',
    });
  }
});

module.exports = router;
