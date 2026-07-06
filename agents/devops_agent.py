"""
DEVOPS_AGENT — Server and infrastructure management.

Responsibilities:
  - Check service health (systemd units)
  - Manage ports and firewall
  - Inspect Nginx configuration
  - SSL certificate status
  - Deployment automation helpers
"""

import logging
import subprocess
import os
from datetime import datetime

logger = logging.getLogger("agents.devops")

SERVICES = {
    "fops": {"port": 8001, "type": "fastapi"},
    "fops-dashboard": {"port": 3001, "type": "nextjs"},
}

NGINX_SITES_DIR = "/etc/nginx/sites-enabled"


class DevOpsAgent:
    """Manages server infrastructure, ports, and deployments."""

    name = "DEVOPS_AGENT"

    # ---- services --------------------------------------------------------

    def check_service(self, service_name: str) -> dict:
        """Check systemd service status."""
        logger.info("[%s] Checking service: %s", self.name, service_name)
        try:
            proc = subprocess.run(
                ["systemctl", "is-active", service_name],
                capture_output=True,
                text=True,
                timeout=5,
            )
            active = proc.stdout.strip() == "active"
        except Exception:
            active = False

        return {"service": service_name, "active": active}

    def check_all_services(self) -> list[dict]:
        """Check all known FOPS services."""
        results = []
        for name in SERVICES:
            status = self.check_service(name)
            status["port"] = SERVICES[name]["port"]
            status["type"] = SERVICES[name]["type"]
            results.append(status)
        return results

    def restart_service(self, service_name: str) -> dict:
        """Restart a systemd service."""
        logger.info("[%s] Restarting %s …", self.name, service_name)
        try:
            subprocess.run(
                ["systemctl", "restart", service_name],
                capture_output=True,
                text=True,
                timeout=30,
            )
            return self.check_service(service_name)
        except Exception as exc:
            return {"service": service_name, "active": False, "error": str(exc)}

    # ---- ports -----------------------------------------------------------

    def check_port(self, port: int) -> dict:
        """Check if a port is being listened on."""
        try:
            proc = subprocess.run(
                ["ss", "-tlnp", f"sport = :{port}"],
                capture_output=True,
                text=True,
                timeout=5,
            )
            listening = str(port) in proc.stdout
        except Exception:
            listening = False
        return {"port": port, "listening": listening}

    def check_all_ports(self) -> list[dict]:
        """Check all configured ports."""
        return [
            self.check_port(svc["port"])
            for svc in SERVICES.values()
        ]

    # ---- firewall --------------------------------------------------------

    def check_firewall(self) -> dict:
        """Return UFW status summary."""
        logger.info("[%s] Checking firewall …", self.name)
        try:
            proc = subprocess.run(
                ["ufw", "status", "verbose"],
                capture_output=True,
                text=True,
                timeout=5,
            )
            return {"status": "ok", "output": proc.stdout[:1000]}
        except Exception as exc:
            return {"status": "error", "detail": str(exc)}

    # ---- nginx -----------------------------------------------------------

    def check_nginx(self) -> dict:
        """Check Nginx configuration and list enabled sites."""
        logger.info("[%s] Checking Nginx …", self.name)
        sites: list[str] = []
        if os.path.isdir(NGINX_SITES_DIR):
            sites = os.listdir(NGINX_SITES_DIR)

        # Test config
        try:
            proc = subprocess.run(
                ["nginx", "-t"],
                capture_output=True,
                text=True,
                timeout=5,
            )
            config_ok = proc.returncode == 0
        except Exception:
            config_ok = False

        return {"config_valid": config_ok, "enabled_sites": sites}

    # ---- SSL -------------------------------------------------------------

    def check_ssl(self, domain: str = "api.fops.aggarha.com") -> dict:
        """Check SSL certificate expiry for a domain."""
        logger.info("[%s] Checking SSL for %s …", self.name, domain)
        try:
            proc = subprocess.run(
                [
                    "openssl", "s_client", "-connect", f"{domain}:443",
                    "-servername", domain,
                ],
                input="",
                capture_output=True,
                text=True,
                timeout=10,
            )
            has_cert = "BEGIN CERTIFICATE" in proc.stdout
            return {"domain": domain, "ssl_active": has_cert}
        except Exception as exc:
            return {"domain": domain, "ssl_active": False, "error": str(exc)}

    # ---- deployment ------------------------------------------------------

    def deploy_backend(self) -> dict:
        """Restart the backend service."""
        return self.restart_service("fops")

    def deploy_dashboard(self) -> dict:
        """Rebuild and restart the dashboard."""
        logger.info("[%s] Deploying dashboard …", self.name)
        from agents.dashboard_agent import DashboardAgent
        dash = DashboardAgent()
        build = dash.build()
        if not build.get("success"):
            return {"deployed": False, "reason": "build_failed", "build": build}
        restart = dash.restart()
        return {"deployed": restart.get("restarted", False), "build": build, "restart": restart}

    # ---- entry point -----------------------------------------------------

    def run(self) -> dict:
        """Full infrastructure health check."""
        logger.info("[%s] ▶ Running infra check …", self.name)
        services = self.check_all_services()
        ports = self.check_all_ports()
        nginx = self.check_nginx()

        result = {
            "services": services,
            "ports": ports,
            "nginx": nginx,
            "checked_at": datetime.utcnow().isoformat(),
        }
        logger.info("[%s] ✔ Infra check complete", self.name)
        return result
