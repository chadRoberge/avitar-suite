# Dual Deployment Setup Guide

This guide explains how to maintain two separate Vercel deployments:
- **Production**: `nhbuildingpermits.com` (main branch, production keys)
- **Testing**: `ninjatesting.nhbuildingpermits.com` (development branch, test keys)

## Architecture Overview

Both deployments use the same codebase but different:
- Git branches (`main` vs `development`)
- Environment variables (production vs test Stripe keys)
- Vercel configuration files
- Build environments (production vs development)

## Branch Strategy

### Main Branch (Production)
- **Branch**: `main`
- **Domain**: `nhbuildingpermits.com`
- **Environment**: `production`
- **Stripe Keys**: Live keys (`pk_live_...`, `sk_live_...`)
- **Config**: `vercel.json`

### Development Branch (Testing)
- **Branch**: `development`
- **Domain**: `ninjatesting.nhbuildingpermits.com`
- **Environment**: `development`
- **Stripe Keys**: Test keys (`pk_test_...`, `sk_test_...`)
- **Config**: `vercel.development.json` (renamed to `vercel.json` on deployment)

## Initial Setup

### 1. Create Development Branch

```bash
# From main branch
git checkout -b development
git push -u origin development
```

### 2. Create Two Vercel Projects

You need to create **two separate projects** in Vercel:

#### Production Project
1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click **"Add New"** → **"Project"**
3. Import your GitHub repository
4. Configure:
   - **Project Name**: `avitar-suite-production`
   - **Framework Preset**: Other
   - **Root Directory**: `./`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Git Branch**: `main`

#### Testing Project
1. Create a second project for the same repository
2. Configure:
   - **Project Name**: `avitar-suite-testing`
   - **Framework Preset**: Other
   - **Root Directory**: `./`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Git Branch**: `development`

### 3. Configure Environment Variables

#### Production Project Environment Variables

In Vercel Dashboard → `avitar-suite-production` → Settings → Environment Variables:

```
# Database
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/avitar-suite-prod

# Authentication
JWT_SECRET=your_production_jwt_secret_minimum_32_characters

# Stripe (PRODUCTION KEYS)
STRIPE_SECRET_KEY=sk_live_xxxxxxxxxxxxxxxxxxxxx
STRIPE_PUBLISHABLE_KEY=pk_live_xxxxxxxxxxxxxxxxxxxxx
STRIPE_PUBLISHABLE_KEY_PROD=pk_live_xxxxxxxxxxxxxxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxx

# Environment
NODE_ENV=production
VERCEL=1
CLIENT_URL=https://nhbuildingpermits.com

# Email (optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=noreply@nhbuildingpermits.com
SMTP_PASS=your_smtp_password
SMTP_FROM=NH Building Permits <noreply@nhbuildingpermits.com>
```

#### Testing Project Environment Variables

In Vercel Dashboard → `avitar-suite-testing` → Settings → Environment Variables:

```
# Database (use separate test database!)
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/avitar-suite-test

# Authentication (different secret for testing)
JWT_SECRET=your_testing_jwt_secret_minimum_32_characters

# Stripe (TEST KEYS)
STRIPE_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxxxxxxx
STRIPE_PUBLISHABLE_KEY_DEV=pk_test_51Ry0pQPwDwYyKZRmjUN3pTiFmiXqJTDmzYMR1aOMRI3LFAsrdNPAkZematdPddSbISDYBMW8INyGj3PzSXeqx6l300MfWguBil
STRIPE_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxxxxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_test_xxxxxxxxxxxxxxxxxxxxx

# Environment
NODE_ENV=development
EMBER_ENV=development
VERCEL=1
CLIENT_URL=https://ninjatesting.nhbuildingpermits.com

# Email (optional - can use same or test SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=noreply@nhbuildingpermits.com
SMTP_PASS=your_smtp_password
SMTP_FROM=NH Building Permits Testing <noreply@nhbuildingpermits.com>
```

**IMPORTANT**: Use a separate test database for the testing environment to avoid mixing test and production data!

### 4. Configure Custom Domains

#### Production Domain

In Vercel Dashboard → `avitar-suite-production` → Settings → Domains:

1. Add `nhbuildingpermits.com`
2. Add `www.nhbuildingpermits.com` (redirects to main domain)
3. Configure DNS:
   - Type: `CNAME`
   - Name: `@` (or `nhbuildingpermits.com`)
   - Value: `cname.vercel-dns.com`

#### Testing Domain

In Vercel Dashboard → `avitar-suite-testing` → Settings → Domains:

1. Add `ninjatesting.nhbuildingpermits.com`
2. Configure DNS:
   - Type: `CNAME`
   - Name: `ninjatesting`
   - Value: `cname.vercel-dns.com`

### 5. Configure Stripe Webhooks

You need **two separate webhooks** in Stripe:

#### Production Webhook

1. Go to [Stripe Dashboard](https://dashboard.stripe.com) → Developers → Webhooks
2. Click **"Add endpoint"**
3. Configure:
   - **Endpoint URL**: `https://nhbuildingpermits.com/api/webhooks/stripe`
   - **Listen to**: Events on your account
   - **Select events**:
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `customer.subscription.paused`
     - `customer.subscription.resumed`
     - `customer.updated`
     - `product.updated`
     - `invoice.payment_succeeded`
     - `invoice.payment_failed`
4. Copy **Signing secret** (`whsec_...`) and add to Production project env vars

#### Testing Webhook (Test Mode)

1. In Stripe Dashboard, toggle to **Test Mode**
2. Go to Developers → Webhooks → **"Add endpoint"**
3. Configure:
   - **Endpoint URL**: `https://ninjatesting.nhbuildingpermits.com/api/webhooks/stripe`
   - **Listen to**: Events on your account
   - **Select events**: (same as production)
4. Copy **Signing secret** and add to Testing project env vars

## Workflow

### Development Workflow

1. **Work locally**:
   ```bash
   git checkout development
   # Make changes
   npm start  # Test locally
   ```

2. **Push to development branch**:
   ```bash
   git add .
   git commit -m "feat: new feature"
   git push origin development
   ```
   - Auto-deploys to `ninjatesting.nhbuildingpermits.com`
   - Uses test Stripe keys
   - Uses test database

3. **Test on staging**:
   - Visit `https://ninjatesting.nhbuildingpermits.com`
   - Test with Stripe test cards
   - Verify functionality

4. **Merge to production**:
   ```bash
   git checkout main
   git merge development
   git push origin main
   ```
   - Auto-deploys to `nhbuildingpermits.com`
   - Uses live Stripe keys
   - Uses production database

### Hotfix Workflow

For urgent production fixes:

```bash
# Create hotfix from main
git checkout main
git checkout -b hotfix/urgent-fix

# Make fix
# Test locally

# Merge to main
git checkout main
git merge hotfix/urgent-fix
git push origin main

# Merge back to development
git checkout development
git merge main
git push origin development

# Delete hotfix branch
git branch -d hotfix/urgent-fix
```

## Configuration Files

### vercel.json (Production - main branch)
```json
{
  "version": 2,
  "builds": [...],
  "routes": [...],
  "env": {
    "NODE_ENV": "production"
  }
}
```

### vercel.development.json (Testing - development branch)
```json
{
  "version": 2,
  "builds": [...],
  "routes": [...],
  "build": {
    "env": {
      "NODE_ENV": "development",
      "EMBER_ENV": "development"
    }
  },
  "env": {
    "NODE_ENV": "development"
  }
}
```

**Note**: On the development branch, rename `vercel.development.json` to `vercel.json` (or Vercel will use the production config).

## Testing Checklist

Before merging to production:

- [ ] All tests pass on `ninjatesting.nhbuildingpermits.com`
- [ ] Stripe test payments work correctly
- [ ] No console errors in browser
- [ ] API endpoints respond correctly
- [ ] Webhooks are received and processed
- [ ] Database migrations applied (if any)
- [ ] Email notifications work (if enabled)
- [ ] Mobile responsive design looks good
- [ ] Performance is acceptable

## Monitoring

### Production Monitoring
- Check Vercel logs: `avitar-suite-production` → Deployments → Functions
- Monitor Stripe Dashboard → Events (Live Mode)
- Check MongoDB Atlas → Metrics (production cluster)

### Testing Monitoring
- Check Vercel logs: `avitar-suite-testing` → Deployments → Functions
- Monitor Stripe Dashboard → Events (Test Mode)
- Check MongoDB Atlas → Metrics (test cluster)

## Troubleshooting

### Different Behavior Between Environments

**Problem**: Feature works in testing but fails in production
**Solution**:
1. Verify environment variables match expectations
2. Check Stripe mode (test vs live)
3. Review function logs in Vercel dashboard
4. Ensure database has correct data/indexes

### Webhook Not Received

**Problem**: Stripe webhook events not triggering
**Solution**:
1. Verify webhook URL is correct in Stripe Dashboard
2. Check webhook signing secret matches env var
3. Review Vercel function logs for errors
4. Test webhook delivery in Stripe Dashboard

### CORS Errors on One Environment

**Problem**: CORS works on one domain but not the other
**Solution**:
1. Verify domain is in `allowedOrigins` in `server/app.js`
2. Check CSP in `app/initializers/security-hardening.js`
3. Ensure `CLIENT_URL` env var is set correctly

## Security Best Practices

- ✅ Use separate databases for testing and production
- ✅ Never use production Stripe keys in testing
- ✅ Never use test Stripe keys in production
- ✅ Use different JWT secrets for each environment
- ✅ Monitor both environments separately
- ✅ Restrict production database access
- ✅ Enable 2FA on Vercel, GitHub, and Stripe accounts

## Useful Commands

```bash
# Switch to development
git checkout development

# Switch to production
git checkout main

# View differences
git diff main development

# Check which branch you're on
git branch

# Deploy specific branch manually
vercel --prod  # deploys current branch

# View deployment logs
vercel logs <deployment-url>
```

## Support

- Vercel Docs: https://vercel.com/docs
- Stripe Webhooks: https://stripe.com/docs/webhooks
- MongoDB Atlas: https://docs.atlas.mongodb.com

---

Last Updated: December 2024
