# Deployment Checklist - Quick Start

## ✅ Completed Setup

- [x] Created `development` branch for testing
- [x] Updated `vercel.json` for production deployments
- [x] Created `vercel.development.json` for testing deployments
- [x] Configured CORS for both domains
- [x] Updated CSP for both domains
- [x] Optimized MongoDB connection for serverless
- [x] Fixed environment configuration for Vercel

## 🚀 Next Steps (Your Actions Required)

### 1. Create Two Vercel Projects

You need to create **two separate projects** in Vercel for the same GitHub repository:

#### Project 1: Production
- **Name**: `avitar-suite-production`
- **Branch**: `main`
- **Domain**: `nhbuildingpermits.com`
- **Build Command**: `npm run build`
- **Output Directory**: `dist`

#### Project 2: Testing
- **Name**: `avitar-suite-testing`
- **Branch**: `development`
- **Domain**: `ninjatesting.nhbuildingpermits.com`
- **Build Command**: `npm run build`
- **Output Directory**: `dist`

### 2. Configure Environment Variables

#### Production Project (`avitar-suite-production`)

Set these in Vercel Dashboard → Settings → Environment Variables:

```env
# Required
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/avitar-suite-prod
JWT_SECRET=your_production_secret_32_chars_minimum
STRIPE_SECRET_KEY=sk_live_xxxxx
STRIPE_PUBLISHABLE_KEY=pk_live_xxxxx
STRIPE_PUBLISHABLE_KEY_PROD=pk_live_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxx
NODE_ENV=production
VERCEL=1
CLIENT_URL=https://nhbuildingpermits.com
```

#### Testing Project (`avitar-suite-testing`)

Set these in Vercel Dashboard → Settings → Environment Variables:

**IMPORTANT**: When adding each variable, check **Preview** and **Development** scopes!

```env
# Required - Database
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/avitar-suite-test

# Required - Authentication
JWT_SECRET=your_testing_secret_different_from_prod

# Required - Stripe TEST Keys
STRIPE_SECRET_KEY=sk_test_xxxxx

STRIPE_PUBLISHABLE_KEY_DEV=pk_test_51Ry0pQPwDwYyKZRmjUN3pTiFmiXqJTDmzYMR1aOMRI3LFAsrdNPAkZematdPddSbISDYBMW8INyGj3PzSXeqx6l300MfWguBil

# Optional - Only needed if using webhooks
STRIPE_WEBHOOK_SECRET=whsec_test_xxxxx

# Required - Environment settings
NODE_ENV=development
EMBER_ENV=development
VERCEL=1
CLIENT_URL=https://ninjatesting.nhbuildingpermits.com
```

**CRITICAL**: Use separate MongoDB databases for testing and production!

**Minimum Required to Fix 500 Error:**
The preview deployment needs at least these 4 variables:
1. `MONGODB_URI` - Your MongoDB connection string
2. `JWT_SECRET` - Any random 32+ character string
3. `STRIPE_SECRET_KEY` - Your test key starting with `sk_test_`
4. `VERCEL=1` - Tells the app it's running on Vercel

### 3. Configure Custom Domains in Vercel

#### Production Project
- Add domain: `nhbuildingpermits.com`
- Add domain: `www.nhbuildingpermits.com` (optional)

#### Testing Project
- Add domain: `ninjatesting.nhbuildingpermits.com`

### 4. Update DNS Records

In your domain registrar (GoDaddy, Namecheap, etc.):

```
# For nhbuildingpermits.com
Type: CNAME
Name: @
Value: cname.vercel-dns.com

# For www.nhbuildingpermits.com (optional)
Type: CNAME
Name: www
Value: cname.vercel-dns.com

# For ninjatesting.nhbuildingpermits.com
Type: CNAME
Name: ninjatesting
Value: cname.vercel-dns.com
```

### 5. Configure Stripe Webhooks

#### Production Webhook (Live Mode)
1. Go to [Stripe Dashboard](https://dashboard.stripe.com) → Developers → Webhooks
2. Add endpoint: `https://nhbuildingpermits.com/api/webhooks/stripe`
3. Select events:
   - `customer.subscription.*` (all)
   - `customer.updated`
   - `product.updated`
   - `invoice.payment_*` (all)
4. Copy signing secret → Add to Production project env vars as `STRIPE_WEBHOOK_SECRET`

#### Testing Webhook (Test Mode)
1. Toggle Stripe to **Test Mode**
2. Add endpoint: `https://ninjatesting.nhbuildingpermits.com/api/webhooks/stripe`
3. Select same events as production
4. Copy signing secret → Add to Testing project env vars as `STRIPE_WEBHOOK_SECRET`

### 6. Verify MongoDB Atlas Network Access

Ensure MongoDB Atlas allows Vercel connections:
1. Go to MongoDB Atlas → Network Access
2. Add IP Address: `0.0.0.0/0` (Allow from anywhere)
   - Or use Vercel's IP ranges (more secure but complex)

### 7. Deploy Both Projects

After setting everything up, trigger deployments:

#### Manual Trigger
- Push to `main` → Auto-deploys to production
- Push to `development` → Auto-deploys to testing

#### Via Vercel Dashboard
- Go to each project → Deployments
- Click "Redeploy" on the latest deployment

## 🧪 Testing After Deployment

### Production (`nhbuildingpermits.com`)
- [ ] Visit `https://nhbuildingpermits.com/health` (should return 200 OK)
- [ ] Login to application
- [ ] Test Stripe payment with **live** card
- [ ] Verify webhook events appear in Stripe Dashboard (Live Mode)

### Testing (`ninjatesting.nhbuildingpermits.com`)
- [ ] Visit `https://ninjatesting.nhbuildingpermits.com/health` (should return 200 OK)
- [ ] Login to application
- [ ] Test Stripe payment with **test** card (4242 4242 4242 4242)
- [ ] Verify webhook events appear in Stripe Dashboard (Test Mode)

## 🔍 Troubleshooting

### API Returns 404
- Check environment variables are set in Vercel
- Verify MongoDB URI is correct and accessible
- Check function logs in Vercel → Deployments → Functions

### CORS Errors
- Verify domain is in `allowedOrigins` in `server/app.js`
- Check `CLIENT_URL` environment variable is set

### Webhook Failures
- Verify webhook signing secret matches Stripe Dashboard
- Check webhook URL is correct
- Review function logs for errors

## 📚 Documentation

- **Full Dual Deployment Guide**: `DUAL_DEPLOYMENT_GUIDE.md`
- **Vercel Deployment Guide**: `VERCEL_DEPLOYMENT.md`
- **Workflow**: See `DUAL_DEPLOYMENT_GUIDE.md` → Workflow section

## 🎯 Development Workflow

```bash
# Daily development
git checkout development
# Make changes
git push origin development  # Auto-deploys to ninjatesting.nhbuildingpermits.com

# When ready for production
git checkout main
git merge development
git push origin main  # Auto-deploys to nhbuildingpermits.com
```

## ✅ Final Checks

Before going live:
- [ ] All environment variables set in both projects
- [ ] DNS records configured and propagated
- [ ] Stripe webhooks configured for both environments
- [ ] MongoDB Atlas allows Vercel connections
- [ ] Health checks return 200 OK on both domains
- [ ] Test authentication on both domains
- [ ] Test Stripe payments on both domains
- [ ] No console errors in browser DevTools

---

**Need Help?** Check the full guides:
- `DUAL_DEPLOYMENT_GUIDE.md` - Complete dual deployment setup
- `VERCEL_DEPLOYMENT.md` - Vercel-specific configuration

Last Updated: December 2024
