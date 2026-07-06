"""
ORCHESTRATOR — Master controller for all FOPS agents.

Responsibilities:
  - Coordinate and trigger individual agents
  - Run full system diagnostics
  - Manage execution pipelines
  - Aggregate cross-agent reports
"""

import logging
from datetime import datetime

from sqlalchemy.orm import Session

from agents.data_agent import DataAgent
from agents.backend_agent import BackendAgent
from agents.dashboard_agent import DashboardAgent
from agents.alerts_agent import AlertsAgent
from agents.ai_clone_agent import AICloneAgent
from agents.devops_agent import DevOpsAgent
from agents.tools.video_formatter_agent import VideoFormatterAgent

logger = logging.getLogger("agents.orchestrator")


class Orchestrator:
    """Central controller that coordinates all FOPS agents."""

    name = "ORCHESTRATOR"

    def __init__(self):
        self.data = DataAgent()
        self.backend = BackendAgent()
        self.dashboard = DashboardAgent()
        self.alerts = AlertsAgent()
        self.ai_clone = AICloneAgent()
        self.devops = DevOpsAgent()
        self.video_formatter = VideoFormatterAgent()

        self._agents = {
            "data": self.data,
            "backend": self.backend,
            "dashboard": self.dashboard,
            "alerts": self.alerts,
            "ai_clone": self.ai_clone,
            "devops": self.devops,
            "video_formatter": self.video_formatter,
        }

    # ---- individual triggers ---------------------------------------------

    def run_agent(self, name: str, **kwargs) -> dict:
        """Run a single agent by name."""
        agent = self._agents.get(name)
        if not agent:
            return {"error": f"Unknown agent: {name}"}
        logger.info("[%s] Triggering %s …", self.name, agent.name)
        return agent.run(**kwargs)

    # ---- pipelines -------------------------------------------------------

    def run_data_pipeline(self, db: Session | None = None) -> dict:
        """Data fetch → clean → detect missing → sync."""
        logger.info("[%s] ▶ Data pipeline …", self.name)
        return self.data.run(db=db)

    def run_alert_pipeline(self) -> dict:
        """Fetch data → scan for issues → generate notifications."""
        logger.info("[%s] ▶ Alert pipeline …", self.name)
        rows = self.data.fetch_raw()
        rows = self.data.clean(rows)
        alerts = self.alerts.scan(rows)
        summary = self.alerts.summary(alerts)
        critical = self.alerts.get_critical(alerts)
        notifications = self.alerts.build_notifications(critical)
        return {
            **summary,
            "notifications_queued": len(notifications),
        }

    def run_ai_pipeline(self) -> dict:
        """Analyse performance → generate suggestions."""
        logger.info("[%s] ▶ AI pipeline …", self.name)
        rows = self.data.fetch_raw()
        analysis = self.ai_clone.analyse_performance(rows)
        suggestions = self.ai_clone.suggest_actions(rows)
        return {
            "analysis": analysis,
            "suggestions": len(suggestions),
        }

    def run_pipeline(self) -> dict:
        """Main autonomous pipeline: fetch → analyse → alert → AI message."""
        started = datetime.utcnow()
        logger.info("[%s] ▶▶ run_pipeline started", self.name)

        # 1. Fetch and clean data
        try:
            raw_rows = self.data.fetch_raw()
            rows = self.data.clean(raw_rows)
            data_summary = {
                "total_rows": len(rows),
                "status": "ok",
            }
            logger.info("[%s] Step 1 — fetched %d rows", self.name, len(rows))
        except Exception as exc:
            logger.exception("[%s] Data fetch failed", self.name)
            return {"error": f"Data fetch failed: {exc}", "stage": "data"}

        # 2. Analyse with AlertsAgent
        try:
            alerts = self.alerts.scan(rows)
            alert_summary = self.alerts.summary(alerts)
            critical = self.alerts.get_critical(alerts)
            logger.info("[%s] Step 2 — %d alerts, %d critical", self.name, len(alerts), len(critical))
        except Exception as exc:
            logger.exception("[%s] Alert scan failed", self.name)
            return {"error": f"Alert scan failed: {exc}", "stage": "alerts", "data": data_summary}

        # 3. Generate AI messages for critical issues
        try:
            ai_messages = self.ai_clone.generate_alert_messages(critical)
            logger.info("[%s] Step 3 — generated %d AI messages", self.name, len(ai_messages))
        except Exception as exc:
            logger.exception("[%s] AI message generation failed", self.name)
            ai_messages = [{"error": str(exc)}]

        # 4. Build result
        elapsed = (datetime.utcnow() - started).total_seconds()
        result = {
            "pipeline": "run_pipeline",
            "data_summary": data_summary,
            "alerts": alert_summary,
            "critical_issues": len(critical),
            "ai_messages": ai_messages,
            "elapsed_seconds": round(elapsed, 2),
            "timestamp": started.isoformat(),
        }
        logger.info("[%s] ✔ run_pipeline completed in %.1fs", self.name, elapsed)
        return result

    def run_infra_check(self) -> dict:
        """Full infrastructure diagnostics."""
        logger.info("[%s] ▶ Infra check …", self.name)
        return self.devops.run()

    # ---- full system run ------------------------------------------------

    def run_all(self, db: Session | None = None) -> dict:
        """Execute all agents and return an aggregated report."""
        logger.info("[%s] ▶▶ Running ALL agents …", self.name)
        started = datetime.utcnow()

        report: dict = {}

        # 1. Infrastructure
        try:
            report["infra"] = self.devops.run()
        except Exception as exc:
            logger.exception("[%s] DevOps agent failed", self.name)
            report["infra"] = {"error": str(exc)}

        # 2. Backend health
        try:
            report["backend"] = self.backend.run()
        except Exception as exc:
            logger.exception("[%s] Backend agent failed", self.name)
            report["backend"] = {"error": str(exc)}

        # 3. Data pipeline
        try:
            report["data"] = self.data.run(db=db)
        except Exception as exc:
            logger.exception("[%s] Data agent failed", self.name)
            report["data"] = {"error": str(exc)}

        # 4. Alerts
        try:
            report["alerts"] = self.alerts.run()
        except Exception as exc:
            logger.exception("[%s] Alerts agent failed", self.name)
            report["alerts"] = {"error": str(exc)}

        # 5. AI analysis
        try:
            report["ai"] = self.ai_clone.run()
        except Exception as exc:
            logger.exception("[%s] AI Clone agent failed", self.name)
            report["ai"] = {"error": str(exc)}

        # 6. Dashboard
        try:
            report["dashboard"] = self.dashboard.run()
        except Exception as exc:
            logger.exception("[%s] Dashboard agent failed", self.name)
            report["dashboard"] = {"error": str(exc)}

        elapsed = (datetime.utcnow() - started).total_seconds()
        report["_meta"] = {
            "orchestrator": self.name,
            "agents_run": len(self._agents),
            "elapsed_seconds": round(elapsed, 2),
            "timestamp": started.isoformat(),
        }

        logger.info("[%s] ✔✔ All agents finished in %.1fs", self.name, elapsed)
        return report

    # ---- status ----------------------------------------------------------

    def status(self) -> dict:
        """Quick summary of registered agents."""
        return {
            "agents": [
                {"name": a.name, "key": k}
                for k, a in self._agents.items()
            ],
            "total": len(self._agents),
        }
