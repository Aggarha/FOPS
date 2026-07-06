"use client";

import { useEffect, useState, useCallback } from "react";
import { fetchSettings as fetchSettingsRequest, saveSettings as saveSettingsRequest } from '@/lib/api';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { AlertCircle, CheckCircle } from "lucide-react";

const ALL_PLATFORMS = ["youtube", "spotify", "anghami"];

interface Settings {
  content_id_enabled: boolean;
  fingerprint_enabled: boolean;
  auto_pipeline_enabled: boolean;
  pipeline_interval_minutes: number;
  default_platforms: string[];
}

const DEFAULTS: Settings = {
  content_id_enabled: false,
  fingerprint_enabled: true,
  auto_pipeline_enabled: true,
  pipeline_interval_minutes: 5,
  default_platforms: ["youtube"],
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [original, setOriginal] = useState<Settings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSettingsRequest();
      setSettings(data);
      setOriginal(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load settings");
    }
    setLoading(false);
  }, []);

  const saveSettings = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const data = await saveSettingsRequest(settings);
      setSettings(data.settings);
      setOriginal(data.settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save settings");
    }
    setSaving(false);
  };

  const togglePlatform = (p: string) => {
    setSettings((prev) => {
      const current = prev.default_platforms;
      if (current.includes(p)) {
        if (current.length <= 1) return prev;
        return { ...prev, default_platforms: current.filter((x) => x !== p) };
      }
      return { ...prev, default_platforms: [...current, p] };
    });
  };

  const hasChanges = JSON.stringify(settings) !== JSON.stringify(original);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  return (
    <div className="max-w-3xl space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-4xl font-bold text-white mb-2">Settings</h1>
          <p className="text-gray-400">Configure system behavior and defaults</p>
        </div>

        {/* Error Alert */}
        {error && (
          <Card className="border-l-4 border-l-red-500">
            <CardContent className="p-6 flex items-start gap-4">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-red-400 font-semibold">Error</h3>
                <p className="text-red-300/80 text-sm mt-1">{error}</p>
              </div>
              <button
                onClick={() => setError(null)}
                className="text-red-400 hover:text-red-300 text-xl leading-none"
              >
                ✕
              </button>
            </CardContent>
          </Card>
        )}

        {/* Success Alert */}
        {saved && (
          <Card className="border-l-4 border-l-green-500">
            <CardContent className="p-6 flex items-center gap-4">
              <CheckCircle className="w-5 h-5 text-green-400" />
              <span className="text-green-400 font-medium">Settings saved successfully</span>
            </CardContent>
          </Card>
        )}

        {/* Content */}
        {loading ? (
          <Card>
            <CardContent className="p-12 flex items-center justify-center">
              <div className="text-center">
                <div className="w-8 h-8 border-4 border-gray-700 border-t-green-600 rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-gray-400">Loading settings...</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Content ID Toggle */}
            <Card>
              <CardHeader>
                <CardTitle>Content ID Verification</CardTitle>
                <CardDescription>Enable Content ID checks during pipeline operations</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <ToggleSwitch
                    checked={settings.content_id_enabled}
                    onChange={(v) => setSettings((s) => ({ ...s, content_id_enabled: v }))}
                  />
                  <p className="text-sm text-gray-400">
                    {settings.content_id_enabled ? "Enabled" : "Disabled"}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Fingerprint Toggle */}
            <Card>
              <CardHeader>
                <CardTitle>Audio Fingerprint</CardTitle>
                <CardDescription>Run fingerprint verification on uncertain matches</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <ToggleSwitch
                    checked={settings.fingerprint_enabled}
                    onChange={(v) => setSettings((s) => ({ ...s, fingerprint_enabled: v }))}
                  />
                  <p className="text-sm text-gray-400">
                    {settings.fingerprint_enabled ? "Enabled" : "Disabled"}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Auto Pipeline Toggle */}
            <Card>
              <CardHeader>
                <CardTitle>Auto Pipeline (Cron)</CardTitle>
                <CardDescription>Automatically run batch pipeline on schedule</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <ToggleSwitch
                    checked={settings.auto_pipeline_enabled}
                    onChange={(v) => setSettings((s) => ({ ...s, auto_pipeline_enabled: v }))}
                  />
                  <p className="text-sm text-gray-400">
                    {settings.auto_pipeline_enabled ? "Enabled" : "Disabled"}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Pipeline Interval */}
            <Card>
              <CardHeader>
                <CardTitle>Pipeline Interval</CardTitle>
                <CardDescription>Minutes between auto-pipeline runs (1–1440)</CardDescription>
              </CardHeader>
              <CardContent>
                <input
                  type="number"
                  min={1}
                  max={1440}
                  value={settings.pipeline_interval_minutes}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (!isNaN(v) && v >= 1 && v <= 1440)
                      setSettings((s) => ({ ...s, pipeline_interval_minutes: v }));
                  }}
                  className="w-24 px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-green-600 focus:ring-2 focus:ring-green-600/20"
                />
              </CardContent>
            </Card>

            {/* Default Platforms */}
            <Card>
              <CardHeader>
                <CardTitle>Default Platforms</CardTitle>
                <CardDescription>Platforms used in audio matching by default</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-3 flex-wrap">
                  {ALL_PLATFORMS.map((p) => {
                    const active = settings.default_platforms.includes(p);
                    return (
                      <button
                        key={p}
                        onClick={() => togglePlatform(p)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all ${
                          active
                            ? "bg-green-600/20 text-green-400 border-green-600/50 shadow-lg shadow-green-600/20"
                            : "bg-transparent text-gray-400 border-gray-700 hover:border-gray-600 hover:text-gray-300"
                        }`}
                      >
                        {p.charAt(0).toUpperCase() + p.slice(1)}
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Save Button */}
            <div className="flex items-center gap-4">
              <Button
                onClick={saveSettings}
                disabled={saving || !hasChanges}
                variant={hasChanges ? "primary" : "secondary"}
              >
                {saving ? "Saving..." : "Save Settings"}
              </Button>
              {hasChanges && !saved && (
                <Badge variant="warning">Unsaved changes</Badge>
              )}
            </div>
          </div>
        )}
      </div>
  );
}

/* ─── Toggle Switch Component ─── */
function ToggleSwitch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative w-12 h-6 rounded-full transition-all duration-200 ${
        checked ? "bg-green-600 shadow-lg shadow-green-600/30" : "bg-gray-700"
      }`}
    >
      <span
        className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform duration-200 ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}
