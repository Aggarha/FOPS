'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  Wrench,
  Monitor,
  Activity,
  Settings,
} from 'lucide-react';

const NAV_ITEMS = [
  { href: '/',                    label: 'Home',     icon: Home     },
  { href: '/tools',               label: 'Tools',    icon: Wrench   },
  { href: '/tv',                  label: 'TV Mode',  icon: Monitor  },
  { href: '/operations/live-logs',label: 'Logs',     icon: Activity },
  { href: '/settings',            label: 'Settings', icon: Settings },
];

export function MobileNav() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 no-select"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {/* Backdrop blur bar */}
      <div className="glass border-t border-gray-800/60 px-2 pt-2 pb-1">
        <div className="flex items-center justify-around">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all duration-200 touch-target ${
                  active
                    ? 'text-green-400'
                    : 'text-gray-500 active:text-gray-300'
                }`}
              >
                <div
                  className={`relative p-1.5 rounded-lg transition-all duration-200 ${
                    active
                      ? 'bg-green-400/10 shadow-[0_0_12px_rgba(57,255,20,0.25)]'
                      : ''
                  }`}
                >
                  <Icon className="w-5 h-5" strokeWidth={active ? 2.5 : 1.75} />
                  {active && (
                    <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-green-400 shadow-[0_0_6px_rgba(57,255,20,0.8)]" />
                  )}
                </div>
                <span
                  className={`text-[10px] font-medium leading-none ${
                    active ? 'text-green-400' : 'text-gray-600'
                  }`}
                >
                  {label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
