#!/bin/bash
set -e

# ============================================================
# Deploy Wild Center Voter to Cloud Run with Cloud Scheduler
# ============================================================

PROJECT_ID=$(gcloud config get-value project)
REGION="us-central1"
SERVICE_NAME="wild-center-voter"

echo "=============================================="
echo "Deploying to Cloud Run"
echo "Project: $PROJECT_ID"
echo "Region: $REGION"
echo "=============================================="

# Enable required APIs
echo "Enabling APIs..."
gcloud services enable \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  cloudscheduler.googleapis.com \
  --quiet

# Deploy to Cloud Run
echo ""
echo "Building and deploying to Cloud Run..."
gcloud run deploy $SERVICE_NAME \
  --source . \
  --region $REGION \
  --platform managed \
  --allow-unauthenticated \
  --memory 1Gi \
  --timeout 300 \
  --min-instances 0 \
  --max-instances 1 \
  --quiet

# Get the service URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --region $REGION --format 'value(status.url)')
echo "Service URL: $SERVICE_URL"

# Create Cloud Scheduler job (runs every 15 minutes)
echo ""
echo "Creating Cloud Scheduler job..."
gcloud scheduler jobs delete vote-job --location $REGION --quiet 2>/dev/null || true
gcloud scheduler jobs create http vote-job \
  --location $REGION \
  --schedule "*/15 * * * *" \
  --uri "${SERVICE_URL}/vote" \
  --http-method POST \
  --attempt-deadline 5m \
  --quiet

echo ""
echo "=============================================="
echo "✅ Deployment complete!"
echo "=============================================="
echo ""
echo "Service URL: $SERVICE_URL"
echo "Schedule: Every 15 minutes"
echo ""
echo "Commands:"
echo "  Trigger now:   curl -X POST ${SERVICE_URL}/vote"
echo "  View logs:     gcloud run logs read $SERVICE_NAME --region $REGION"
echo "  Delete all:    gcloud run services delete $SERVICE_NAME --region $REGION && gcloud scheduler jobs delete vote-job --location $REGION"
echo ""
echo "Cost: ~\$0-1/month (only pay when running)"
