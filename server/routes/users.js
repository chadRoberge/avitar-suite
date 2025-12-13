const express = require('express');
const User = require('../models/User');
const Municipality = require('../models/Municipality');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/municipalities/:municipalityId/users
// @desc    Get all users for a municipality
// @access  Private (requires municipal admin permissions)
router.get(
  '/municipalities/:municipalityId/users',
  authenticateToken,
  async (req, res) => {
    try {
      const { municipalityId } = req.params;

      // Check if user has permission to view users in this municipality
      // Avitar staff/admin always have access, or users with admin/supervisor role
      const isAvitarStaff =
        req.user.global_role === 'avitar_staff' ||
        req.user.global_role === 'avitar_admin';
      const municipalPermission =
        req.user.getMunicipalityPermission(municipalityId);
      const isAdmin =
        municipalPermission?.role === 'admin' ||
        municipalPermission?.role === 'supervisor';

      if (!isAvitarStaff && !isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to view users',
        });
      }

      // Find all users with permissions for this municipality
      const users = await User.find({
        'municipal_permissions.municipality_id': municipalityId,
        is_active: true,
      }).select('-password -two_factor_secret');

      // Filter to only return municipal permission for this specific municipality
      const filteredUsers = users.map((user) => {
        const userObj = user.toJSON();
        userObj.municipal_permissions = user.municipal_permissions.filter(
          (perm) =>
            perm.municipality_id.toString() === municipalityId.toString(),
        );
        return userObj;
      });

      res.json({
        success: true,
        users: filteredUsers,
      });
    } catch (error) {
      console.error('Error fetching users:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch users',
        error: error.message,
      });
    }
  },
);

// @route   GET /api/municipalities/:municipalityId/users/:userId
// @desc    Get detailed user information including login history and permission changes
// @access  Private (requires municipal admin permissions)
router.get(
  '/municipalities/:municipalityId/users/:userId',
  authenticateToken,
  async (req, res) => {
    try {
      const { municipalityId, userId } = req.params;

      // Check if user has permission to view user details in this municipality
      const isAvitarStaff =
        req.user.global_role === 'avitar_staff' ||
        req.user.global_role === 'avitar_admin';
      const requestorPermission =
        req.user.getMunicipalityPermission(municipalityId);
      const isAdmin =
        requestorPermission?.role === 'admin' ||
        requestorPermission?.role === 'supervisor';

      if (!isAvitarStaff && !isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to view user details',
        });
      }

      // Find the user
      const user = await User.findById(userId).select(
        '-password -two_factor_secret',
      );

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
        });
      }

      // Get the municipal permission for this specific municipality
      const municipalPermission = user.municipal_permissions.find(
        (perm) => perm.municipality_id.toString() === municipalityId.toString(),
      );

      if (!municipalPermission) {
        return res.status(404).json({
          success: false,
          message: 'User does not have access to this municipality',
        });
      }

      // Get login sessions (last 50 sessions)
      const loginSessions = user.loginSessions
        .sort((a, b) => b.loginDate - a.loginDate)
        .slice(0, 50);

      // Get permission change history for this municipality (last 100 changes)
      const permissionHistory = user.permissionChangeHistory
        .filter(
          (change) =>
            !change.municipalityId ||
            change.municipalityId.toString() === municipalityId.toString(),
        )
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 100);

      res.json({
        success: true,
        user: {
          _id: user._id,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          fullName: user.fullName,
          phone: user.phone,
          global_role: user.global_role,
          is_active: user.is_active,
          last_login: user.last_login,
          login_attempts: user.login_attempts,
          account_locked_until: user.account_locked_until,
          two_factor_enabled: user.two_factor_enabled,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          municipal_permission: municipalPermission,
          loginSessions,
          permissionHistory,
        },
      });
    } catch (error) {
      console.error('Error fetching user details:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch user details',
        error: error.message,
      });
    }
  },
);

// @route   PUT /api/municipalities/:municipalityId/users/:userId/permissions
// @desc    Update user's municipal permissions and log the change
// @access  Private (requires municipal admin permissions)
router.put(
  '/municipalities/:municipalityId/users/:userId/permissions',
  authenticateToken,
  async (req, res) => {
    try {
      const { municipalityId, userId } = req.params;
      const { role, department, module_permissions } = req.body;

      // Check if user has permission to update permissions
      const isAvitarStaff =
        req.user.global_role === 'avitar_staff' ||
        req.user.global_role === 'avitar_admin';
      const municipalPermission =
        req.user.getMunicipalityPermission(municipalityId);
      const isAdmin =
        municipalPermission?.role === 'admin' ||
        municipalPermission?.role === 'supervisor';

      if (!isAvitarStaff && !isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to update user permissions',
        });
      }

      // Find the user to update
      const user = await User.findById(userId);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
        });
      }

      // Get municipality name for audit log
      const municipality = await Municipality.findById(municipalityId);

      // Find existing municipal permission
      const permIndex = user.municipal_permissions.findIndex(
        (perm) => perm.municipality_id.toString() === municipalityId.toString(),
      );

      if (permIndex === -1) {
        return res.status(404).json({
          success: false,
          message: 'User does not have access to this municipality',
        });
      }

      const oldPermission = user.municipal_permissions[permIndex];

      // Track changes for audit log
      const changes = [];

      // Check for role change
      if (role && role !== oldPermission.role) {
        changes.push({
          timestamp: new Date(),
          changedBy: req.user._id,
          changedByName: req.user.fullName || req.user.email,
          changeType: 'role_changed',
          municipalityId,
          municipalityName: municipality?.name,
          field: 'role',
          oldValue: oldPermission.role,
          newValue: role,
          description: `Role changed from ${oldPermission.role} to ${role}`,
        });
        user.municipal_permissions[permIndex].role = role;
      }

      // Check for department change
      if (department !== undefined && department !== oldPermission.department) {
        changes.push({
          timestamp: new Date(),
          changedBy: req.user._id,
          changedByName: req.user.fullName || req.user.email,
          changeType: 'department_changed',
          municipalityId,
          municipalityName: municipality?.name,
          field: 'department',
          oldValue: oldPermission.department,
          newValue: department,
          description: `Department changed from ${oldPermission.department || 'none'} to ${department || 'none'}`,
        });
        user.municipal_permissions[permIndex].department = department;
      }

      // Check for module permission changes
      if (module_permissions) {
        for (const [moduleName, moduleData] of Object.entries(
          module_permissions,
        )) {
          const oldModuleData =
            oldPermission.module_permissions?.get(moduleName);

          // Module was added
          if (!oldModuleData && moduleData.enabled) {
            changes.push({
              timestamp: new Date(),
              changedBy: req.user._id,
              changedByName: req.user.fullName || req.user.email,
              changeType: 'module_added',
              municipalityId,
              municipalityName: municipality?.name,
              moduleName,
              description: `Module "${moduleName}" was enabled`,
            });
          }
          // Module was removed
          else if (oldModuleData && !moduleData.enabled) {
            changes.push({
              timestamp: new Date(),
              changedBy: req.user._id,
              changedByName: req.user.fullName || req.user.email,
              changeType: 'module_removed',
              municipalityId,
              municipalityName: municipality?.name,
              moduleName,
              description: `Module "${moduleName}" was disabled`,
            });
          }
          // Module permissions changed
          else if (
            oldModuleData &&
            JSON.stringify(oldModuleData.permissions) !==
              JSON.stringify(moduleData.permissions)
          ) {
            changes.push({
              timestamp: new Date(),
              changedBy: req.user._id,
              changedByName: req.user.fullName || req.user.email,
              changeType: 'module_updated',
              municipalityId,
              municipalityName: municipality?.name,
              moduleName,
              oldValue: oldModuleData.permissions,
              newValue: moduleData.permissions,
              description: `Permissions updated for module "${moduleName}"`,
            });
          }

          user.municipal_permissions[permIndex].module_permissions.set(
            moduleName,
            moduleData,
          );
        }
      }

      // Add all changes to permission history
      user.permissionChangeHistory.push(...changes);

      await user.save();

      res.json({
        success: true,
        message: 'User permissions updated successfully',
        user: {
          _id: user._id,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          municipal_permission: user.municipal_permissions[permIndex],
        },
        changes,
      });
    } catch (error) {
      console.error('Error updating user permissions:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update user permissions',
        error: error.message,
      });
    }
  },
);

module.exports = router;
