# Wild Center Voter

Automated voter for The Wild Center - USA TODAY 10BEST "Best Science Museum" 2026.

**Voting ends:** Monday, February 9 at noon ET

## Quick Start (Local)

```bash
npm install
PLAYWRIGHT_BROWSERS_PATH=0 npx playwright install chromium

# Test once
npm run vote-once

# Run continuously (~100 votes/day)
npm start
```

## Deploy to Google Cloud

Uses **Cloud Run + Cloud Scheduler** (~$0-1/month).

### Prerequisites

```bash
# Install gcloud CLI: https://cloud.google.com/sdk/docs/install
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
```

### Deploy

```bash
./deploy.sh
```

This creates:
- Cloud Run service (runs the voter)
- Cloud Scheduler job (triggers every 15 minutes)

### Manage

```bash
# Trigger a vote now
curl -X POST https://YOUR_SERVICE_URL/vote

# View logs
gcloud run logs read wild-center-voter --region us-central1

# Delete everything
gcloud run services delete wild-center-voter --region us-central1
gcloud scheduler jobs delete vote-job --location us-central1
```

### Cost

| What | Cost |
|------|------|
| Cloud Run | ~$0 (free tier covers ~2M requests) |
| Cloud Scheduler | ~$0.10/month |
| **Total** | **~$0-1/month** |

## Configuration

Edit `vote.js`:

```javascript
const VOTES_PER_DAY = 100;        // Target votes per day
const RANDOMIZE_INTERVALS = true; // Randomize wait times (local only)
```

Or via command line (local):
```bash
node vote.js --votes=50    # 50 votes/day
node vote.js --once        # Single vote
```

## Files

```
vote.js      - Main voting logic
server.js    - HTTP server for Cloud Run
Dockerfile   - Container config
deploy.sh    - GCP deployment script
```
