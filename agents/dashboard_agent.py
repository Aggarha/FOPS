"""
DASHBOARD_AGENT — Next.js frontend management.

Responsibilities:
  - Manage the TV dashboard at /var/www/fops-dashboard
  - Check build status and process health
  - Provide dashboard configuration
  - Manage API integration settings
"""

import logging
import subprocess
import os

logger = logging.getLogger("agents.dashboard")

DASHBOARD_DIR = "/var/www/fops-dashboard"
DASHBOARD_PORT = 3001
API_BASE_URL = "https://api.fops.aggarha.com"


class DashboardAgent:
    """Manages the Next.js dashboard frontend."""

    name = "DASHBOARD_AGENT"

    # ---- status ----------------------------------------------------------

    def check_build(self) -> dict:
        """Check if a production build exists."""
        next_dir = os.path.join(DASHBOARD_DIR, ".next")
        built = os.path.isdir(next_dir)
        logger.info("[%s] Build exists: %s", self.name, built)
        return {"built": built, "path": next_dir}

    def check_process(self) -> dict:
        """Check if the dashboard process is running on its port."""
        logger.info("[%s] Checking dashboard process on port %d …", self.name, DASHBOARD_PORT)
        try:
            result = subprocess.run(
                ["ss", "-tlnp", f"sport = :{DASHBOARD_PORT}"],
                capture_output=True,
                text=True,
                timeout=5,
            )
            listening = str(DASHBOARD_PORT) in result.stdout
        except Exception as exc:
            logger.warning("[%s] Process check failed: %s", self.name, exc)
            listening = False

        return {"port": DASHBOARD_PORT, "running": listening}

    # ---- build / deploy --------------------------------------------------

    def build(self) -> dict:
        """Run npm run build inside the dashboard directory."""
        logger.info("[%s] Starting Next.js build …", self.name)
        try:
            proc = subprocess.run(
                ["npm", "run", "build"],
                cwd=DASHBOARD_DIR,
                capture_output=True,
                text=True,
                timeout=120,
            )
            success = proc.returncode == 0
            logger.info("[%s] Build %s", self.name, "succeeded" if success else "FAILED")
            return {
                "success": success,
                "stdout": proc.stdout[-500:] if proc.stdout else "",
                "stderr": proc.stderr[-500:] if proc.stderr else "",
            }
        except Exception as exc:
            logger.exception("[%s] Build error", self.name)
            return {"success": False, "error": str(exc)}

    def restart(self) -> dict:
        """Restart the dashboard (systemd or pm2)."""
        logger.info("[%s] Restarting dashboard …", self.name)
        for cmd in [
            ["systemctl", "restart", "fops-dashboard"],
            ["pm2", "restart", "fops-dashboard"],
        ]:
            try:
                proc = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
                if proc.returncode == 0:
                    return {"restarted": True, "method": cmd[0]}
            except FileNotFoundError:
                continue
        return {"restarted": False, "detail": "No service manager found"}

    # ---- configuration ---------------------------------------------------

    def get_config(self) -> dict:
        """Return current dashboard configuration."""
        return {
            "directory": DASHBOARD_DIR,
            "port": DASHBOARD_PORT,
            "api_base_url": API_BASE_URL,
            "routes": ["/", "/tv"],
        }

    # ---- entry point -----------------------------------------------------

    def run(self) -> dict:
        """Full dashboard status check."""
        logger.info("[%s] ▶ Running status check …", self.name)
        build = self.check_build()
        process = self.check_process()
        config = self.get_config()

        result = {"build": build, "process": process, "config": config}
        logger.info("[%s] ✔ Status: %s", self.name, result)
        return result
