'use client';

import React, { useState, useEffect } from 'react';
import { Download, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Don't show if already installed or dismissed this session
    if (
      window.matchMedia('(display-mode: standalone)').matches ||
      sessionStorage.getItem('pwa-prompt-dismissed')
    ) {
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      // Show after a short delay
      setTimeout(() => setVisible(true), 3000);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setVisible(false);
    setDeferredPrompt(null);
    if (outcome === 'dismissed') {
      sessionStorage.setItem('pwa-prompt-dismissed', '1');
    }
  };

  const handleDismiss = () => {
    setVisible(false);
    sessionStorage.setItem('pwa-prompt-dismissed', '1');
  };

  if (!visible || dismissed) return null;

  return (
    <div
      className="fixed bottom-20 left-4 right-4 z-50 animate-slide-up"
      style={{ bottom: 'calc(72px + env(safe-area-inset-bottom, 0px))' }}
    >
      <div className="glass-green rounded-2xl p-4 flex items-center gap-4 shadow-[0_0_30px_rgba(57,255,20,0.15)]">
        {/* Icon */}
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center flex-shrink-0">
          <span className="text-xl font-bold text-black">F</span>
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white">Install FOPS App</p>
          <p className="text-xs text-gray-400">Add to home screen for best experience</p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleInstall}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500 hover:bg-green-400 text-black text-xs font-bold transition-colors active:scale-95"
          >
            <Download className="w-3.5 h-3.5" />
            Install
          </button>
          <button
            onClick={handleDismiss}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
