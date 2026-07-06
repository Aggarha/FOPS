#!/usr/bin/env python3
"""
Cron job runner for background pipeline execution
Runs the main pipeline batch every X minutes
"""
import os
import sys
import logging
from datetime import datetime

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler("/var/log/fops/pipeline_cron.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

sys.path.insert(0, '/var/www/fops')

def run_pipeline_batch():
    """Run the main pipeline batch"""
    logger.info("🔄 Starting pipeline batch job...")
    
    try:
        from core_orchestrator import run_main_pipeline_batch
        
        result = run_main_pipeline_batch(max_rows=50)
        
        logger.info("✅ Pipeline batch completed")
        logger.info(f"Result: {result}")
        
        return True
    except Exception as e:
        logger.error(f"❌ Pipeline batch failed: {e}", exc_info=True)
        return False


def run_notifications_cleanup():
    """Clean up old notifications (optional)"""
    logger.info("🧹 Cleaning up notifications...")
    # In-memory notifications are auto-cleared on restart
    # This would clean database notifications if we had them
    logger.info("✅ Notifications cleanup done")


def run_sheet_sync():
    """Sync with Google Sheets"""
    logger.info("📊 Starting Google Sheets sync...")
    
    try:
        from google_sheets import sync_from_google_sheets
        
        result = sync_from_google_sheets()
        logger.info(f"✅ Sheet sync completed: {result}")
        return True
    except Exception as e:
        logger.error(f"❌ Sheet sync failed: {e}", exc_info=True)
        return False


if __name__ == "__main__":
    logger.info("=" * 60)
    logger.info(f"FOPS Cron Pipeline Started: {datetime.now()}")
    logger.info("=" * 60)
    
    # Run pipeline
    run_pipeline_batch()
    
    # Run sheet sync if configured
    if os.getenv("ENABLE_SHEET_SYNC", "1") == "1":
        run_sheet_sync()
    
    # Clean up notifications
    run_notifications_cleanup()
    
    logger.info("=" * 60)
    logger.info(f"FOPS Cron Pipeline Completed: {datetime.now()}")
    logger.info("=" * 60)
