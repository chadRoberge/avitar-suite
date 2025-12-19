const { put, del, head } = require('@vercel/blob');
const crypto = require('crypto');

class VercelBlobStorageService {
  constructor() {
    this.storageType = 'vercel-blob';

    // Verify Vercel Blob is configured
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      console.warn(
        '⚠️  BLOB_READ_WRITE_TOKEN not configured. Vercel Blob storage will not work.',
      );
    } else {
      console.log('✅ Vercel Blob Storage initialized');
    }
  }

  /**
   * Sanitize path component
   */
  sanitizePathComponent(str) {
    if (!str) return 'Unknown';
    return str
      .toString()
      .replace(/[^a-zA-Z0-9\s-]/g, '')
      .replace(/\s+/g, '_')
      .replace(/-+/g, '_')
      .substring(0, 50);
  }

  /**
   * Generate organized file path
   */
  generateOrganizedPath(filename, organizationData = {}) {
    const {
      state,
      municipality,
      municipalityId,
      propertyId,
      department,
      folder,
    } = organizationData;

    const stateFolder = this.sanitizePathComponent(state || 'Unknown_State');
    const municipalityFolder = this.sanitizePathComponent(
      municipality || municipalityId || 'Unknown_Municipality',
    );
    const departmentFolder = this.sanitizePathComponent(
      department || 'general',
    );

    let pathParts = [stateFolder, municipalityFolder, departmentFolder];

    if (folder && folder !== '/') {
      const folderPath = folder.replace(/^\/+|\/+$/g, '');
      const folderParts = folderPath.split('/').filter((p) => p);
      pathParts.push(...folderParts.map((p) => this.sanitizePathComponent(p)));
    }

    if (propertyId) {
      pathParts.push(this.sanitizePathComponent(propertyId));
    }

    pathParts.push(filename);

    return pathParts.join('/');
  }

  /**
   * Upload file to Vercel Blob
   */
  async uploadFile(fileBuffer, storagePath, metadata = {}) {
    try {
      if (!process.env.BLOB_READ_WRITE_TOKEN) {
        throw new Error(
          'BLOB_READ_WRITE_TOKEN not configured. Cannot upload to Vercel Blob.',
        );
      }

      // Calculate file hashes
      const md5Hash = crypto.createHash('md5').update(fileBuffer).digest('hex');
      const sha256Hash = crypto
        .createHash('sha256')
        .update(fileBuffer)
        .digest('hex');

      // Upload to Vercel Blob
      const blob = await put(storagePath, fileBuffer, {
        access: metadata.visibility === 'public' ? 'public' : 'public', // Vercel Blob URLs are always public but unguessable
        contentType: metadata.contentType || 'application/octet-stream',
        addRandomSuffix: false, // Keep our organized path structure
      });

      console.log(`✅ File uploaded to Vercel Blob: ${storagePath}`);

      return {
        storageType: this.storageType,
        storagePath,
        blobUrl: blob.url,
        fileSize: fileBuffer.length,
        md5Hash,
        sha256Hash,
      };
    } catch (error) {
      console.error('Vercel Blob upload error:', error);
      throw new Error(`Failed to upload file to Vercel Blob: ${error.message}`);
    }
  }

  /**
   * Download file from Vercel Blob
   */
  async downloadFile(storagePath) {
    try {
      // For Vercel Blob, we need the full URL to download
      // If storagePath is already a URL, use it directly
      let url;
      if (storagePath.startsWith('http')) {
        url = storagePath;
      } else {
        // Get blob metadata to get the URL
        const blobInfo = await head(storagePath);
        url = blobInfo.url;
      }

      // Fetch the file
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      console.error('Vercel Blob download error:', error);
      throw new Error(
        `Failed to download file from Vercel Blob: ${error.message}`,
      );
    }
  }

  /**
   * Delete file from Vercel Blob
   */
  async deleteFile(storagePath) {
    try {
      await del(storagePath);
      console.log(`✅ File deleted from Vercel Blob: ${storagePath}`);
    } catch (error) {
      console.error('Vercel Blob delete error:', error);
      throw new Error(
        `Failed to delete file from Vercel Blob: ${error.message}`,
      );
    }
  }

  /**
   * Check if file exists
   */
  async fileExists(storagePath) {
    try {
      await head(storagePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get signed URL (not needed for Vercel Blob - URLs are already secure)
   */
  async getSignedUrl(storagePath, expiresIn = 60 * 60 * 1000) {
    // Vercel Blob URLs are already secure (unguessable)
    // Just return the blob URL
    const blobInfo = await head(storagePath);
    return blobInfo.url;
  }
}

module.exports = VercelBlobStorageService;
