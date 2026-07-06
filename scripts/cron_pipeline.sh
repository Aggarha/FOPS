#!/bin/bash
# FOPS auto-pipeline cron — runs batch pipeline every 5 minutes
curl -s -X POST http://localhost:8001/api/run-pipeline/batch \
  -H "Content-Type: application/json" \
  -H "x-api-key: CHANGE_ME_SECRET" \
  -d '{"max_rows": 10}' \
  >> /var/log/fops-cron.log 2>&1
echo "" >> /var/log/fops-cron.log
