# Deploy to Railway

## Step 1: Prepare Service Account for Railway

### Convert service account to base64:

**On macOS:**
```bash
base64 -i firebase-service-account.json | tr -d '\n' | pbcopy
```

**On Linux:**
```bash
base64 firebase-service-account.json | tr -d '\n' | xclip -selection clipboard
```

**Or save to file:**
```bash
# macOS
base64 -i firebase-service-account.json | tr -d '\n' > service-account-base64.txt

# Linux
base64 firebase-service-account.json | tr -d '\n' > service-account-base64.txt
```

Copy the content (it's already in clipboard on macOS)

## Step 2: Deploy to Railway

### Option A: Using Railway CLI

1. **Install Railway CLI:**
   ```bash
   npm i -g @railway/cli
   ```

2. **Login:**
   ```bash
   railway login
   ```

3. **Initialize project:**
   ```bash
   railway init
   ```

4. **Set environment variables:**
   ```bash
   railway variables set FIREBASE_SERVICE_ACCOUNT_BASE64="<paste-base64-content>"
   railway variables set FIREBASE_STORAGE_BUCKET="walletdoc-1f052.firebasestorage.app"
   railway variables set FIREBASE_API_KEY="AIzaSyAs927yoJpUmMEa_e8eGhxNpE0G9KG6MI8"
   railway variables set NODE_ENV="production"
   ```

5. **Deploy:**
   ```bash
   railway up
   ```

### Option B: Using Railway Dashboard

1. **Go to [Railway.app](https://railway.app)**
2. **Create new project**
3. **Connect your GitHub repository** (or deploy from local)
4. **Add environment variables:**
   - `FIREBASE_SERVICE_ACCOUNT_BASE64` = (base64 encoded service account)
   - `FIREBASE_STORAGE_BUCKET` = `walletdoc-1f052.firebasestorage.app`
   - `FIREBASE_API_KEY` = `AIzaSyAs927yoJpUmMEa_e8eGhxNpE0G9KG6MI8`
   - `NODE_ENV` = `production`
   - `PORT` = (Railway sets this automatically)

5. **Deploy**

## Step 3: Get Your API URL

After deployment, Railway will provide a URL like:
```
https://your-app-name.up.railway.app
```

Use this URL in your Angular app instead of `localhost:3000`

## Environment Variables Needed:

- `FIREBASE_SERVICE_ACCOUNT_BASE64` - Base64 encoded service account JSON
- `FIREBASE_STORAGE_BUCKET` - Your storage bucket name
- `FIREBASE_API_KEY` - Your Firebase API key
- `NODE_ENV` - Set to "production"
- `PORT` - Railway sets this automatically

## Quick Deploy Command:

```bash
# Generate base64 (macOS - already copied to clipboard)
base64 -i firebase-service-account.json | tr -d '\n' | pbcopy

# Then paste in Railway dashboard or:
railway variables set FIREBASE_SERVICE_ACCOUNT_BASE64="<paste-from-clipboard>"
```

That's it! Your API will be live on Railway! 🚀

