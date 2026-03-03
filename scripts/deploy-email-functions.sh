#!/bin/bash
# Deploy Cloud Functions that use SMTP Relay (require VPC Egress).
# Firebase CLI resets VPC egress on each deploy, so we re-apply it.
#
# Usage:
#   ./scripts/deploy-email-functions.sh          # deploy both
#   ./scripts/deploy-email-functions.sh invoice   # deploy invoice only
#   ./scripts/deploy-email-functions.sh cmr       # deploy CMR only

set -euo pipefail

PROJECT="bgw-mrp-system"
REGION="europe-central2"
NETWORK="projects/${PROJECT}/global/networks/default"
SUBNET="projects/${PROJECT}/regions/${REGION}/subnetworks/default"

deploy_invoice() {
  echo "=== Deploying onInvoiceStatusChange ==="
  firebase deploy --only functions:bgw-mrp:onInvoiceStatusChange --force

  echo "=== Applying VPC Egress to oninvoicestatuschange ==="
  gcloud beta run services update oninvoicestatuschange \
    --region="$REGION" --project="$PROJECT" \
    --network="$NETWORK" --subnet="$SUBNET" \
    --vpc-egress=all-traffic

  echo "=== onInvoiceStatusChange deployed with VPC Egress ==="
}

deploy_cmr() {
  echo "=== Deploying onCmrStatusUpdate ==="
  firebase deploy --only functions:bgw-mrp:onCmrStatusUpdate --force

  echo "=== Applying VPC Egress to oncmrstatusupdate ==="
  gcloud beta run services update oncmrstatusupdate \
    --region="$REGION" --project="$PROJECT" \
    --network="$NETWORK" --subnet="$SUBNET" \
    --vpc-egress=all-traffic

  echo "=== onCmrStatusUpdate deployed with VPC Egress ==="
}

TARGET="${1:-all}"

case "$TARGET" in
  invoice) deploy_invoice ;;
  cmr)     deploy_cmr ;;
  all)
    deploy_invoice
    deploy_cmr
    ;;
  *)
    echo "Usage: $0 [invoice|cmr|all]"
    exit 1
    ;;
esac

echo ""
echo "Done! All email functions deployed with VPC Egress."
