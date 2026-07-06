"""
CREDITS_AGENT — Generates music credits block for video descriptions.
"""

import logging

logger = logging.getLogger("agents.tools.credits")


class CreditsAgent:
    name = "CREDITS_AGENT"

    def generate(self, release: dict) -> str:
        """Build the credits section from songwriter, composer, arranger."""
        logger.info("[%s] Generating credits", self.name)

        lines = []

        sw_en = release.get("songwriter_en", "").strip()
        sw_ar = release.get("songwriter_ar", "").strip()
        if sw_en or sw_ar:
            lines.append(f"✶ Lyrics : {sw_en} | {sw_ar}")

        comp_en = release.get("composer_en", "").strip()
        comp_ar = release.get("composer_ar", "").strip()
        if comp_en or comp_ar:
            lines.append(f"✶ Composition : {comp_en} | {comp_ar}")

        arr_en = release.get("arranger_en", "").strip()
        arr_ar = release.get("arranger_ar", "").strip()
        if arr_en or arr_ar:
            lines.append(f"✶ Arrangement : {arr_en} | {arr_ar}")

        result = "\n".join(lines)
        logger.info("[%s] Credits: %d lines", self.name, len(lines))
        return result

    def run(self, release: dict) -> dict:
        return {"credits": self.generate(release)}
