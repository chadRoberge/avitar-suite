# Google Cloud Storage Setup for Vercel

This guide walks you through setting up Google Cloud Storage (GCS) for file uploads in your Vercel deployment.

## Why Google Cloud Storage?

Vercel serverless functions have **ephemeral storage** - files disappear after each function invocation. You need cloud storage to persist uploaded files (PDFs, images, documents, etc.).

Your app already has GCS support built in! You just need to configure it.

## Setup Steps

### 1. Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Click **Select a Project** → **New Project**
3. Project name: `avitar-suite` (or whatever you prefer)
4. Click **Create**

### 2. Enable Cloud Storage API

1. In your project, go to **APIs & Services** → **Library**
2. Search for **"Cloud Storage API"**
3. Click **Enable**

### 3. Create Storage Bucket

1. Go to **Cloud Storage** → **Buckets**
2. Click **Create Bucket**
3. Configure:
   - **Name**: `avitar-suite-uploads` (must be globally unique)
   - **Location type**: Region
   - **Location**: `us-east1` (choose nearest to Vercel region)
   - **Storage class**: Standard
   - **Access control**: Uniform
   - **Public access**: Do NOT allow public access
4. Click **Create**

### 4. Create Service Account

1. Go to **IAM & Admin** → **Service Accounts**
2. Click **Create Service Account**
3. Fill in:
   - **Name**: `vercel-file-uploads`
   - **Description**: Service account for Vercel serverless file uploads
4. Click **Create and Continue**
5. Grant role: **Storage Object Admin**
6. Click **Continue** → **Done**

### 5. Create Service Account Key

1. Click on the service account you just created
2. Go to **Keys** tab
3. Click **Add Key** → **Create new key**
4. Choose **JSON** format
5. Click **Create**
6. **Save the downloaded JSON file securely** (you'll need it next)

### 6. Convert Key to Base64

The service account key needs to be base64-encoded for Vercel environment variables.

**On Mac/Linux:**
```bash
base64 -i path/to/service-account-key.json | tr -d '\n'
```

**On Windows (PowerShell):**
```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("path\to\service-account-key.json"))
```

Copy the output - this is your `GCS_SERVICE_ACCOUNT_KEY_BASE64`.

### 7. Add Environment Variables to Vercel

Go to your Vercel project → **Settings** → **Environment Variables**

Add these variables for **both Production and Preview**:

```env
# Storage Type
STORAGE_TYPE=gcs

# Google Cloud Storage Configuration
GCS_PROJECT_ID=avitar-suite
GCS_BUCKET_NAME=avitar-suite-uploads
GCS_SERVICE_ACCOUNT_KEY_BASE64=<paste the base64 string from step 6>
```

**IMPORTANT**: Check **Production**, **Preview**, and **Development** when adding each variable!

### 8. Redeploy

After adding the environment variables:
1. Go to **Deployments**
2. Click **"..."** on the latest deployment
3. Click **Redeploy**

Or just push a new commit.

## Verification

After deployment, check your Vercel function logs for:
```
✅ Google Cloud Storage initialized: avitar-suite-uploads
```

If you see warnings about GCS configuration, double-check your environment variables.

## File Upload Paths

Files are organized automatically:
```
State/Municipality/Department/FileName
```

For example:
```
NH/Test_Township/building_permits/permit-123-floor-plan.pdf
NH/Test_Township/contractor_verification/license-456.pdf
```

## Cost Estimate

Google Cloud Storage pricing (as of 2024):
- **Storage**: $0.020/GB/month
- **Downloads**: $0.12/GB
- **Uploads**: Free

**Example**: 100 GB storage + 50 GB downloads/month = ~$8/month

First-time GCS users get **$300 free credits** for 90 days.

## Security Notes

- ✅ Service account has minimal permissions (only Storage Object Admin on this bucket)
- ✅ Bucket is NOT publicly accessible
- ✅ Files are accessed via signed URLs (expire after 7 days)
- ✅ Service account key is base64-encoded in environment variables

## Troubleshooting

### Error: "GCS configuration incomplete"

**Solution**: Verify all 3 environment variables are set correctly in Vercel:
- `GCS_PROJECT_ID`
- `GCS_BUCKET_NAME`
- `GCS_SERVICE_ACCOUNT_KEY_BASE64`

### Error: "Failed to initialize Google Cloud Storage"

**Solution**:
1. Check that Cloud Storage API is enabled
2. Verify service account has "Storage Object Admin" role
3. Confirm base64 encoding is correct (no line breaks)

### Files not persisting

**Solution**: Verify `STORAGE_TYPE=gcs` is set in Vercel environment variables

## Alternative: Vercel Blob Storage

If you prefer to use Vercel's built-in blob storage instead of GCS:

1. Enable Vercel Blob in your project settings
2. Copy the `BLOB_READ_WRITE_TOKEN`
3. Add to Vercel environment variables
4. Remove or don't set `STORAGE_TYPE` (it will auto-detect)

Your app already supports Vercel Blob - it will auto-detect and use it if configured!

---

**Need Help?** Check the [GCS Documentation](https://cloud.google.com/storage/docs) or [Vercel Blob Documentation](https://vercel.com/docs/storage/vercel-blob)

Last Updated: December 2024
