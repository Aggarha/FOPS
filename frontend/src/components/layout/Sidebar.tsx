'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  Settings,
  FileText,
  Music,
  Zap,
  Gauge,
  Monitor,
} from 'lucide-react';

interface NavItem {
  name: string;
  href: string;
  icon: React.ReactNode;
  badge?: string;
  submenu?: NavItem[];
}

const navItems: NavItem[] = [
  { name: 'Dashboard', href: '/', icon: <Home className="w-5 h-5" /> },
  { name: 'Control', href: '/control', icon: <Gauge className="w-5 h-5" /> },
  {
    name: 'Tools',
    href: '/tools',
    icon: <Zap className="w-5 h-5" />,
    submenu: [
      { name: 'Audio Match', href: '/tools/audio-match', icon: <Music className="w-5 h-5" /> },
      { name: 'YouTube Search', href: '/tools/youtube-search', icon: <Music className="w-5 h-5" /> },
      { name: 'Fingerprint DB', href: '/tools/fingerprint-db', icon: <Music className="w-5 h-5" /> },
      { name: 'Channel Scrape', href: '/tools/channel-scrape', icon: <Music className="w-5 h-5" /> },
      { name: 'Publishing Suite', href: '/tools/publishing', icon: <FileText className="w-5 h-5" /> },
    ],
  },
  { name: 'Settings', href: '/settings', icon: <Settings className="w-5 h-5" /> },
  { name: 'Logs', href: '/logs', icon: <FileText className="w-5 h-5" /> },
  { name: 'TV Mode', href: '/tv', icon: <Monitor className="w-5 h-5" /> },
];

export function Sidebar() {
  const pathname = usePathname();
  const [openSubmenu, setOpenSubmenu] = React.useState<string | null>(null);

  const isActive = (href: string): boolean => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <div className="fixed left-0 top-0 h-full w-64 bg-gradient-to-b from-gray-950 to-black border-r border-gray-800 pt-8">
      {/* Logo */}
      <div className="px-6 mb-8">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-green-400 to-blue-500 flex items-center justify-center font-bold text-black group-hover:shadow-lg group-hover:shadow-green-500/50 transition-all">
            F
          </div>
          <span className="text-xl font-bold text-white group-hover:text-green-400 transition-colors">FOPS</span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="space-y-1 px-4">
        {navItems.map((item) => (
          <div key={item.href}>
            <Link
              href={item.href}
              onClick={() =>
                item.submenu && setOpenSubmenu(openSubmenu === item.href ? null : item.href)
              }
              className={`
                flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200
                ${
                  isActive(item.href)
                    ? 'bg-green-600/20 text-green-400 border border-green-600/50 shadow-lg shadow-green-600/20'
                    : 'text-gray-400 hover:text-gray-300 hover:bg-gray-800/50'
                }
              `}
            >
              {item.icon}
              <span className="font-medium flex-1">{item.name}</span>
              {item.badge && (
                <span className="px-2 py-1 text-xs bg-green-600 text-white rounded-full">
                  {item.badge}
                </span>
              )}
              {item.submenu && (
                <span className={`transition-transform ${openSubmenu === item.href ? 'rotate-180' : ''}`}>
                  ▾
                </span>
              )}
            </Link>

            {/* Submenu */}
            {item.submenu && openSubmenu === item.href && (
              <div className="ml-2 mt-1 space-y-1 border-l border-gray-700 pl-4 py-2">
                {item.submenu.map((subitem) => (
                  <Link
                    key={subitem.href}
                    href={subitem.href}
                    className={`
                      flex items-center gap-3 px-4 py-2 rounded-lg text-sm transition-all duration-200
                      ${
                        isActive(subitem.href)
                          ? 'bg-blue-600/20 text-blue-400'
                          : 'text-gray-500 hover:text-gray-400 hover:bg-gray-800/30'
                      }
                    `}
                  >
                    {subitem.icon}
                    <span className="font-medium">{subitem.name}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-800 bg-gradient-to-t from-black to-transparent">
        <div className="text-xs text-gray-500 text-center">
          <p>FOPS Dashboard</p>
          <p className="mt-1 text-gray-600">v1.0.0</p>
        </div>
      </div>
    </div>
  );
}
