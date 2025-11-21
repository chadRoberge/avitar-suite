const { Storage } = require('@google-cloud/storage');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class StorageService {
  constructor() {
    this.storageType = process.env.STORAGE_TYPE || 'local';
    this.localStoragePath = path.join(__dirname, '../../uploads');

    // Initialize Google Cloud Storage if configured
    if (this.storageType === 'gcs') {
      this.initializeGCS();
    } else {
      this.ensureLocalStorage();
    }
  }

  initializeGCS() {
    try {
      const projectId = process.env.GCS_PROJECT_ID;
      const bucketName = process.env.GCS_BUCKET_NAME;
      const serviceAccountKey = process.env.GCS_SERVICE_ACCOUNT_KEY_BASE64;

      if (!projectId || !bucketName || !serviceAccountKey) {
        console.warn(
          'GCS configuration incomplete. Falling back to local storage.',
        );
        this.storageType = 'local';
        this.ensureLocalStorage();
        return;
      }

      // Decode base64 service account key
      const credentials = JSON.parse(
        Buffer.from(serviceAccountKey, 'base64').toString('utf-8'),
      );

      this.storage = new Storage({
        projectId,
        credentials,
      });

      this.bucket = this.storage.bucket(bucketName);
      console.log(`✅ Google Cloud Storage initialized: ${bucketName}`);
    } catch (error) {
      console.error('Failed to initialize Google Cloud Storage:', error);
      console.warn('Falling back to local storage');
      this.storageType = 'local';
      this.ensureLocalStorage();
    }
  }

  async ensureLocalStorage() {
    try {
      await fs.mkdir(this.localStoragePath, { recursive: true });
      console.log(`✅ Local storage initialized: ${this.localStoragePath}`);
    } catch (error) {
      console.error('Failed to create local storage directory:', error);
      throw error;
    }
  }

  /**
   * Sanitize path component
   * @param {string} str - String to sanitize
   * @returns {string} Sanitized string
   */
  sanitizePathComponent(str) {
    if (!str) return 'Unknown';
    return str
      .toString()
      .replace(/[^a-zA-Z0-9\s-]/g, '') // Remove special chars except spaces and hyphens
      .replace(/\s+/g, '_') // Replace spaces with underscores
      .replace(/-+/g, '_') // Replace hyphens with underscores
      .substring(0, 50); // Limit length
  }

  /**
   * Generate organized file path with state: State/Municipality/Department/filename
   * @param {string} filename - The file name
   * @param {Object} organizationData - Contains state, municipality, department info
   * @returns {string} - Organized file path
   */
  generateOrganizedPath(filename, organizationData = {}) {
    const { state, municipality, municipalityId, propertyId, department } = organizationData;

    const stateFolder = this.sanitizePathComponent(state || 'Unknown_State');
    const municipalityFolder = this.sanitizePathComponent(municipality || municipalityId || 'Unknown_Municipality');
    const departmentFolder = this.sanitizePathComponent(department || 'general');

    // Build path: State/Municipality/Department/[PropertyId]/filename
    let pathParts = [stateFolder, municipalityFolder, departmentFolder];

    if (propertyId) {
      pathParts.push(this.sanitizePathComponent(propertyId));
    }

    pathParts.push(filename);

    return pathParts.join('/');
  }

  /**
   * Upload a file to storage
   * @param {Buffer} fileBuffer - File data
   * @param {string} storagePath - Path in storage (e.g., State/Municipality/department/fileName)
   * @param {Object} metadata - File metadata (should include state, municipality, department)
   * @returns {Promise<Object>} Upload result with URL and metadata
   */
  async uploadFile(fileBuffer, storagePath, metadata = {}) {
    // Calculate file hashes
    const md5Hash = crypto.createHash('md5').update(fileBuffer).digest('hex');
    const sha256Hash = crypto
      .createHash('sha256')
      .update(fileBuffer)
      .digest('hex');

    const result = {
      storageType: this.storageType,
      storagePath,
      fileSize: fileBuffer.length,
      md5Hash,
      sha256Hash,
    };

    if (this.storageType === 'gcs') {
      return this.uploadToGCS(fileBuffer, storagePath, metadata, result);
    } else {
      return this.uploadToLocal(fileBuffer, storagePath, metadata, result);
    }
  }

  async uploadToGCS(fileBuffer, storagePath, metadata, result) {
    try {
      const file = this.bucket.file(storagePath);

      // Upload file
      await file.save(fileBuffer, {
        metadata: {
          contentType: metadata.contentType || 'application/octet-stream',
          metadata: {
            ...metadata,
            uploadedAt: new Date().toISOString(),
          },
        },
      });

      // Set appropriate ACL based on visibility
      if (metadata.visibility === 'public') {
        await file.makePublic();
        result.gcsUrl = `https://storage.googleapis.com/${this.bucket.name}/${storagePath}`;
      } else {
        // Generate a signed URL that expires in 1 hour
        const [signedUrl] = await file.getSignedUrl({
          action: 'read',
          expires: Date.now() + 60 * 60 * 1000, // 1 hour
        });
        result.gcsUrl = signedUrl;
      }

      console.log(`✅ File uploaded to GCS: ${storagePath}`);
      return result;
    } catch (error) {
      console.error('GCS upload error:', error);
      throw new Error(`Failed to upload file to Google Cloud Storage: ${error.message}`);
    }
  }

  async uploadToLocal(fileBuffer, storagePath, metadata, result) {
    try {
      const fullPath = path.join(this.localStoragePath, storagePath);
      const directory = path.dirname(fullPath);

      // Ensure directory exists
      await fs.mkdir(directory, { recursive: true });

      // Write file
      await fs.writeFile(fullPath, fileBuffer);

      result.localPath = storagePath;
      console.log(`✅ File uploaded to local storage: ${storagePath}`);
      return result;
    } catch (error) {
      console.error('Local upload error:', error);
      throw new Error(`Failed to upload file to local storage: ${error.message}`);
    }
  }

  /**
   * Download a file from storage
   * @param {string} storagePath - Path in storage
   * @returns {Promise<Buffer>} File buffer
   */
  async downloadFile(storagePath) {
    if (this.storageType === 'gcs') {
      return this.downloadFromGCS(storagePath);
    } else {
      return this.downloadFromLocal(storagePath);
    }
  }

  async downloadFromGCS(storagePath) {
    try {
      const file = this.bucket.file(storagePath);
      const [buffer] = await file.download();
      return buffer;
    } catch (error) {
      console.error('GCS download error:', error);
      throw new Error(`Failed to download file from Google Cloud Storage: ${error.message}`);
    }
  }

  async downloadFromLocal(storagePath) {
    try {
      const fullPath = path.join(this.localStoragePath, storagePath);
      return await fs.readFile(fullPath);
    } catch (error) {
      console.error('Local download error:', error);
      throw new Error(`Failed to download file from local storage: ${error.message}`);
    }
  }

  /**
   * Delete a file from storage
   * @param {string} storagePath - Path in storage
   * @returns {Promise<void>}
   */
  async deleteFile(storagePath) {
    if (this.storageType === 'gcs') {
      return this.deleteFromGCS(storagePath);
    } else {
      return this.deleteFromLocal(storagePath);
    }
  }

  async deleteFromGCS(storagePath) {
    try {
      const file = this.bucket.file(storagePath);
      await file.delete();
      console.log(`✅ File deleted from GCS: ${storagePath}`);
    } catch (error) {
      console.error('GCS delete error:', error);
      throw new Error(`Failed to delete file from Google Cloud Storage: ${error.message}`);
    }
  }

  async deleteFromLocal(storagePath) {
    try {
      const fullPath = path.join(this.localStoragePath, storagePath);
      await fs.unlink(fullPath);
      console.log(`✅ File deleted from local storage: ${storagePath}`);
    } catch (error) {
      console.error('Local delete error:', error);
      throw new Error(`Failed to delete file from local storage: ${error.message}`);
    }
  }

  /**
   * Get a signed URL for a file (GCS only)
   * @param {string} storagePath - Path in storage
   * @param {number} expiresIn - Expiration time in milliseconds (default: 1 hour)
   * @returns {Promise<string>} Signed URL
   */
  async getSignedUrl(storagePath, expiresIn = 60 * 60 * 1000) {
    if (this.storageType !== 'gcs') {
      throw new Error('Signed URLs are only available for Google Cloud Storage');
    }

    try {
      const file = this.bucket.file(storagePath);
      const [signedUrl] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + expiresIn,
      });
      return signedUrl;
    } catch (error) {
      console.error('Failed to generate signed URL:', error);
      throw new Error(`Failed to generate signed URL: ${error.message}`);
    }
  }

  /**
   * Check if a file exists in storage
   * @param {string} storagePath - Path in storage
   * @returns {Promise<boolean>}
   */
  async fileExists(storagePath) {
    if (this.storageType === 'gcs') {
      const file = this.bucket.file(storagePath);
      const [exists] = await file.exists();
      return exists;
    } else {
      const fullPath = path.join(this.localStoragePath, storagePath);
      try {
        await fs.access(fullPath);
        return true;
      } catch {
        return false;
      }
    }
  }
}

// Export singleton instance
module.exports = new StorageService();
