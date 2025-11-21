const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema(
  {
    // Municipality reference
    municipalityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Municipality',
      required: true,
      index: true,
    },
    municipalityName: String, // Denormalized for path generation
    state: String, // State abbreviation (e.g., 'NH', 'VT')

    // Property reference (optional - some files may be municipality-wide)
    propertyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PropertyTreeNode',
      index: true,
    },

    // Department/module that owns this file
    department: {
      type: String,
      enum: [
        'assessing',
        'building-permits',
        'code-enforcement',
        'tax-collection',
        'general',
        'other',
      ],
      required: true,
      index: true,
    },

    // File information
    fileName: {
      type: String,
      required: true,
    },
    displayName: String, // User-friendly name
    originalName: String, // Original uploaded filename
    fileType: String, // MIME type (e.g., 'application/pdf', 'image/jpeg')
    fileExtension: String, // e.g., 'pdf', 'jpg'
    fileSize: {
      type: Number, // Size in bytes
      required: true,
    },

    // Storage information
    storageType: {
      type: String,
      enum: ['gcs', 'local'],
      default: 'gcs',
      required: true,
    },
    storagePath: {
      type: String, // Full path in storage: municipalityId/propertyId/department/fileName
      required: true,
      unique: true,
    },
    gcsUrl: String, // Google Cloud Storage URL
    localPath: String, // Local file system path (if using local storage)

    // Folder/organization
    folder: {
      type: String,
      default: '/', // Root folder
      index: true,
    },
    tags: [String], // Searchable tags

    // Access control
    visibility: {
      type: String,
      enum: ['public', 'private', 'restricted'],
      default: 'private',
      required: true,
      index: true,
    },
    allowedRoles: [String], // Roles that can access this file (if restricted)

    // File metadata
    description: String,
    category: String, // e.g., 'deed', 'permit', 'photo', 'plan', 'document'
    version: {
      type: Number,
      default: 1,
    },
    isLatestVersion: {
      type: Boolean,
      default: true,
      index: true,
    },
    previousVersionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'File',
    },

    // Related entities
    relatedPermitId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Permit',
    },
    relatedInspectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PermitInspection',
    },

    // Project/Permit organization (for building-permits department)
    permitId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Permit',
      index: true,
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Permit',
      index: true,
    }, // References parent project permit if part of a project
    isProjectFile: {
      type: Boolean,
      default: false,
    }, // True if file belongs to project folder, not specific permit
    projectName: String, // Denormalized project name for display
    permitNumber: String, // Denormalized permit number for display

    // Upload/modification tracking
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    uploadedByName: String,
    uploadedAt: {
      type: Date,
      default: Date.now,
      required: true,
      index: true,
    },
    modifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    modifiedAt: Date,

    // Soft delete
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    deletedAt: Date,
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    // File checksums for integrity
    md5Hash: String,
    sha256Hash: String,
  },
  {
    timestamps: true,
  },
);

// Indexes for common queries
fileSchema.index({ municipalityId: 1, propertyId: 1, department: 1 });
fileSchema.index({ municipalityId: 1, department: 1, folder: 1 });
fileSchema.index({ municipalityId: 1, propertyId: 1, isActive: 1 });
// Note: storagePath already has unique: true in schema, so no need to create another index here
fileSchema.index({ uploadedAt: -1 });

// Virtual for full URL
fileSchema.virtual('url').get(function () {
  if (this.storageType === 'gcs' && this.gcsUrl) {
    return this.gcsUrl;
  }
  if (this.storageType === 'local' && this.localPath) {
    return `/api/files/${this._id}/download`;
  }
  return null;
});

// Method to generate storage path
fileSchema.statics.generateStoragePath = function (
  municipalityId,
  propertyId,
  department,
  fileName,
) {
  const parts = [municipalityId];

  if (propertyId) {
    parts.push(propertyId);
  }

  parts.push(department, fileName);

  return parts.join('/');
};

// Method to get all files in a folder
fileSchema.statics.getFilesInFolder = function (
  municipalityId,
  propertyId,
  department,
  folder = '/',
) {
  const query = {
    municipalityId,
    department,
    folder,
    isActive: true,
  };

  if (propertyId) {
    query.propertyId = propertyId;
  }

  return this.find(query).sort({ uploadedAt: -1 });
};

// Method to get folder structure
fileSchema.statics.getFolderStructure = async function (
  municipalityId,
  propertyId,
  department,
) {
  const query = {
    municipalityId,
    department,
    isActive: true,
  };

  if (propertyId) {
    query.propertyId = propertyId;
  }

  const files = await this.find(query, 'folder fileName fileSize uploadedAt')
    .sort({ folder: 1, fileName: 1 })
    .lean();

  // Build folder tree
  const folders = {};

  files.forEach((file) => {
    const folder = file.folder || '/';
    if (!folders[folder]) {
      folders[folder] = {
        path: folder,
        files: [],
        size: 0,
      };
    }
    folders[folder].files.push(file);
    folders[folder].size += file.fileSize || 0;
  });

  return folders;
};

// Method to create new version
fileSchema.methods.createNewVersion = async function (
  newFileData,
  uploadedBy,
) {
  // Mark current version as not latest
  this.isLatestVersion = false;
  await this.save();

  // Create new version
  const newVersion = new this.constructor({
    ...this.toObject(),
    _id: undefined,
    ...newFileData,
    version: this.version + 1,
    isLatestVersion: true,
    previousVersionId: this._id,
    uploadedBy,
    uploadedAt: new Date(),
  });

  await newVersion.save();
  return newVersion;
};

// Method to soft delete
fileSchema.methods.softDelete = function (userId) {
  this.isActive = false;
  this.deletedAt = new Date();
  this.deletedBy = userId;
  return this.save();
};

// Ensure virtuals are included in JSON
fileSchema.set('toJSON', { virtuals: true });
fileSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('File', fileSchema);
