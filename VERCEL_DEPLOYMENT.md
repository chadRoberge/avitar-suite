# Vercel Deployment Guide

This application is configured for deployment on Vercel with a serverless backend and static frontend.

## Architecture

- **Frontend**: Static Ember.js app served from `/dist`
- **Backend**: Serverless function at `/api/index.js` wrapping Express.js app
- **Database**: MongoDB Atlas (cloud-hosted)

## Deployment Configuration

The `vercel.json` file configures:
- All `/api/*` requests route to the serverless function
- All other requests serve the static frontend from `index.html`
- Node.js runtime version for the serverless function

## Required Environment Variables

You MUST configure these environment variables in your Vercel project settings:

### MongoDB Configuration
```
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/avitar-suite?retryWrites=true&w=majority
```

### Authentication
```
JWT_SECRET=your_super_secure_jwt_secret_key_here_minimum_32_characters
```

### Stripe Configuration
```
STRIPE_SECRET_KEY=sk_live_xxxxx (or sk_test_xxxxx for testing)
STRIPE_PUBLISHABLE_KEY_PROD=pk_live_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxx
```

### Application Settings
```
NODE_ENV=production
VERCEL=1
CLIENT_URL=https://your-frontend-domain.vercel.app
```

### Optional: Email Configuration (if using email features)
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@yourdomain.com
```

## Setting Environment Variables in Vercel

### Via Vercel Dashboard:
1. Go to your project in Vercel
2. Click **Settings** → **Environment Variables**
3. Add each variable with appropriate scope:
   - **Production**: Required for production deployments
   - **Preview**: Optional for preview deployments
   - **Development**: Optional for local development

### Via Vercel CLI:
```bash
vercel env add MONGODB_URI
vercel env add JWT_SECRET
vercel env add STRIPE_SECRET_KEY
# ... add all required variables
```

## Deployment Process

### Automatic Deployment (Recommended)

1. **Connect GitHub Repository**:
   - Link your GitHub repo to Vercel
   - Vercel will auto-deploy on every push to `main`

2. **Configure Build Settings**:
   - **Framework Preset**: Other
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Install Command**: `npm install`

### Manual Deployment

```bash
# Install Vercel CLI
npm install -g vercel

# Login to Vercel
vercel login

# Deploy to preview
vercel

# Deploy to production
vercel --prod
```

## Post-Deployment Checklist

- [ ] Verify all environment variables are set in Vercel dashboard
- [ ] Confirm MongoDB Atlas allows connections from Vercel IPs (0.0.0.0/0 or specific IPs)
- [ ] Test API endpoints: `https://your-domain.vercel.app/api/health`
- [ ] Configure Stripe webhook URL: `https://your-domain.vercel.app/api/webhooks/stripe`
- [ ] Update CORS origins in `server/app.js` to include your production domain
- [ ] Update `config/environment.js` with production API host

## Troubleshooting

### 404 Errors on API Routes

**Problem**: API requests return 404
**Solution**:
- Verify environment variables are set (especially `MONGODB_URI`)
- Check Vercel function logs for errors
- Ensure MongoDB Atlas allows Vercel connections

### CORS Errors

**Problem**: CORS preflight failures
**Solution**:
- Add your production domain to `allowedOrigins` in `server/app.js`
- Verify `CLIENT_URL` environment variable is set

### Database Connection Timeout

**Problem**: `serverSelectionTimeoutMS` errors
**Solution**:
- Verify `MONGODB_URI` is correct
- Check MongoDB Atlas network access settings
- Ensure database user has correct permissions

### Webhook Signature Verification Failed

**Problem**: Stripe webhook events fail signature verification
**Solution**:
- Update `STRIPE_WEBHOOK_SECRET` with the webhook signing secret from Stripe Dashboard
- Configure webhook URL in Stripe: `https://your-domain.vercel.app/api/webhooks/stripe`

## Serverless Limitations

### What Works:
✅ REST API endpoints
✅ MongoDB database queries
✅ Stripe API calls
✅ JWT authentication
✅ Webhook handling

### What Doesn't Work:
❌ MongoDB Change Streams (requires persistent connection)
❌ WebSocket connections
❌ Long-running background jobs
❌ Server-side caching across requests

**Note**: Change streams are automatically disabled in serverless mode.

## Custom Domain Configuration

1. **Add Domain in Vercel**:
   - Go to **Settings** → **Domains**
   - Add your custom domain (e.g., `nhbuildingpermits.com`)

2. **Update DNS Records**:
   - Add CNAME record pointing to `cname.vercel-dns.com`
   - Or A record pointing to Vercel's IP

3. **Update Environment Variables**:
   ```
   CLIENT_URL=https://nhbuildingpermits.com
   ```

4. **Update CORS Configuration**:
   - Add domain to `allowedOrigins` in `server/app.js`
   - Add domain to CSP in `app/initializers/security-hardening.js`

## Monitoring

### Vercel Dashboard
- View function logs in **Deployments** → **Functions**
- Monitor performance metrics
- Check error rates

### Recommended External Monitoring
- **Sentry**: Error tracking
- **LogRocket**: Session replay and monitoring
- **MongoDB Atlas**: Database performance monitoring

## Security Checklist

- [ ] All environment variables use production values (not test/dev)
- [ ] JWT_SECRET is strong (minimum 32 characters)
- [ ] MongoDB user has least-privilege permissions
- [ ] Stripe uses live keys (not test keys)
- [ ] CORS restricted to known domains only
- [ ] CSP headers configured correctly
- [ ] HTTPS enforced (automatic with Vercel)

## Support

For deployment issues:
- Check [Vercel Documentation](https://vercel.com/docs)
- Review function logs in Vercel dashboard
- Contact: chadroberge@example.com (update with real contact)

---

Last Updated: December 2024
