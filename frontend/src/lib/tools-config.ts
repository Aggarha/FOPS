import {
  Music,
  Search,
  Database,
  LinkIcon,
  FileText,
  Tv,
  BarChart3,
  AlertCircle,
  Settings,
  LogOut,
  Users,
  Clock,
  Shield,
  Zap,
  Lock,
  LayoutTemplate,
  Globe,
} from 'lucide-react';

export type ToolCategory = 'publishing' | 'protection' | 'monitoring' | 'operations';
export type UserRole = 'admin' | 'analyst' | 'operator' | 'viewer';

export interface Tool {
  id: string;
  name: string;
  description: string;
  category: ToolCategory;
  href: string;
  icon: any;
  color: string;
  status?: 'active' | 'running' | 'error' | 'idle';
  requiredPermission?: string;
  requiredRoles?: UserRole[];
  priority?: number;
}

export interface ToolCategory_ {
  id: ToolCategory;
  name: string;
  icon: any;
  description: string;
  color: string;
  accentColor: string;
  tools: Tool[];
  allowedRoles?: UserRole[];
}

// All available tools
export const TOOLS: Tool[] = [
  // 🎵 Release Publishing
  {
    id: 'publishing-suite',
    name: 'Publishing Suite',
    description: 'Professional credits and metadata management tools',
    category: 'publishing',
    href: '/tools/publishing',
    icon: FileText,
    color: 'from-orange-500 to-yellow-500',
    status: 'active',
    priority: 1,
  },
  {
    id: 'source-library',
    name: 'Source Library',
    description: 'Register and manage tenant metadata source files with Excel import',
    category: 'publishing',
    href: '/tools/publishing/sources',
    icon: Database,
    color: 'from-green-600 to-emerald-700',
    status: 'active' as const,
    priority: 2,
  },
  {
    id: 'release-picker',
    name: 'Release Picker',
    description: 'Search imported metadata records and autofill the Publishing Suite',
    category: 'publishing',
    href: '/tools/publishing/release-picker',
    icon: Database,
    color: 'from-teal-500 to-cyan-600',
    status: 'active' as const,
    priority: 3,
  },
  {
    id: 'publishing-templates',
    name: 'Template Library',
    description: 'Create and manage title/description/tag templates for all release types',
    category: 'publishing',
    href: '/tools/publishing/templates',
    icon: LayoutTemplate,
    color: 'from-violet-500 to-purple-600',
    status: 'active' as const,
    priority: 4,
  },
  {
    id: 'channel-templates',
    name: 'Channel Templates',
    description: 'Manage per-channel intro text, social links, and footer blocks',
    category: 'publishing',
    href: '/tools/publishing/channel-templates',
    icon: Globe,
    color: 'from-sky-500 to-blue-600',
    status: 'active' as const,
    priority: 5,
  },
  {
    id: 'description-builder',
    name: 'Description Builder',
    description: 'Generate YouTube-ready descriptions from metadata',
    category: 'publishing',
    href: '/tools/publishing?tab=description',
    icon: FileText,
    color: 'from-amber-500 to-orange-500',
    status: 'active',
    priority: 6,
  },
  {
    id: 'credits-formatter',
    name: 'Credits Formatter',
    description: 'Smart Arabic/bilingual credits parser with role detection, transliteration & export',
    category: 'publishing',
    href: '/tools/credits',
    icon: FileText,
    color: 'from-yellow-500 to-amber-500',
    status: 'active',
    priority: 7,
  },
  {
    id: 'metadata-generator',
    name: 'Metadata Generator',
    description: 'Generate complete release metadata',
    category: 'publishing',
    href: '/tools/metadata',
    icon: FileText,
    color: 'from-rose-500 to-orange-500',
    status: 'idle',
    priority: 4,
  },
  {
    id: 'tags-generator',
    name: 'Tags Generator',
    description: 'Generate SEO tags and keywords',
    category: 'publishing',
    href: '/tools/tags',
    icon: Zap,
    color: 'from-pink-500 to-rose-500',
    status: 'idle',
    priority: 5,
  },

  // 🛡 Content Protection
  {
    id: 'audio-match',
    name: 'Audio Match',
    description: 'Advanced audio matching across platforms with fingerprinting',
    category: 'protection',
    href: '/tools/audio-match',
    icon: Music,
    color: 'from-green-500 to-emerald-500',
    status: 'active',
    requiredPermission: 'audio-match',
    priority: 1,
  },
  {
    id: 'youtube-search',
    name: 'YouTube Search',
    description: 'Comprehensive YouTube content search with variants and filters',
    category: 'protection',
    href: '/tools/youtube-search',
    icon: Search,
    color: 'from-red-500 to-pink-500',
    status: 'active',
    requiredPermission: 'youtube-search',
    priority: 2,
  },
  {
    id: 'fingerprint-db',
    name: 'Fingerprint DB',
    description: 'Query and manage audio fingerprint database',
    category: 'protection',
    href: '/tools/fingerprint-db',
    icon: Database,
    color: 'from-blue-500 to-cyan-500',
    status: 'active',
    requiredPermission: 'fingerprint-db',
    priority: 3,
  },
  {
    id: 'channel-scrape',
    name: 'Channel Scraper',
    description: 'Extract data from YouTube channels',
    category: 'protection',
    href: '/tools/channel-scrape',
    icon: LinkIcon,
    color: 'from-purple-500 to-pink-500',
    requiredPermission: 'channel-scrape',
    priority: 4,
  },
  {
    id: 'match-review',
    name: 'Match Review',
    description: 'Review and manage audio match results',
    category: 'protection',
    href: '/tools/match-review',
    icon: AlertCircle,
    color: 'from-indigo-500 to-purple-500',
    status: 'idle',
    priority: 5,
  },
  {
    id: 'claims-validation',
    name: 'Claims Validation',
    description: 'Validate and manage content ID claims',
    category: 'protection',
    href: '/tools/claims',
    icon: Shield,
    color: 'from-cyan-500 to-blue-500',
    status: 'idle',
    priority: 6,
  },

  // 📺 TV & Monitoring
  {
    id: 'tv-dashboard',
    name: 'TV Dashboard',
    description: 'Full-screen cinematic operations dashboard',
    category: 'monitoring',
    href: '/tv',
    icon: Tv,
    color: 'from-violet-500 to-purple-500',
    status: 'active',
    priority: 1,
  },
  {
    id: 'live-monitoring',
    name: 'Live Monitoring',
    description: 'Real-time system and job monitoring',
    category: 'monitoring',
    href: '/tools/monitoring',
    icon: BarChart3,
    color: 'from-fuchsia-500 to-pink-500',
    status: 'active',
    priority: 2,
  },
  {
    id: 'real-time-logs',
    name: 'Real-Time Logs',
    description: 'Stream system logs with filtering',
    category: 'monitoring',
    href: '/logs',
    icon: Clock,
    color: 'from-lime-500 to-green-500',
    status: 'active',
    priority: 3,
  },
  {
    id: 'release-timeline',
    name: 'Release Timeline',
    description: 'Track release progress and milestones',
    category: 'monitoring',
    href: '/tools/timeline',
    icon: BarChart3,
    color: 'from-sky-500 to-blue-500',
    status: 'active' as const,
    priority: 4,
  },

  // ⚙ Operations
  {
    id: 'control-panel',
    name: 'Control Panel',
    description: 'System control and operations hub',
    category: 'operations',
    href: '/control',
    icon: Settings,
    color: 'from-slate-500 to-gray-600',
    status: 'active',
    priority: 1,
  },
  {
    id: 'notifications',
    name: 'Notifications',
    description: 'Manage system notifications and alerts',
    category: 'operations',
    href: '/tools/notifications',
    icon: AlertCircle,
    color: 'from-orange-500 to-red-500',
    status: 'active' as const,
    priority: 2,
  },
  {
    id: 'settings',
    name: 'Settings',
    description: 'System configuration and preferences',
    category: 'operations',
    href: '/settings',
    icon: Settings,
    color: 'from-gray-500 to-slate-600',
    status: 'active',
    priority: 3,
  },
  {
    id: 'audit-logs',
    name: 'Audit Logs',
    description: 'View comprehensive audit trail',
    category: 'operations',
    href: '/tools/audit',
    icon: Clock,
    color: 'from-teal-500 to-cyan-600',
    status: 'active' as const,
    priority: 4,
  },
  {
    id: 'user-management',
    name: 'User Management',
    description: 'Manage users and permissions',
    category: 'operations',
    href: '/tools/users',
    icon: Users,
    color: 'from-emerald-500 to-teal-600',
    status: 'active' as const,
    requiredRoles: ['admin'],
    priority: 5,
  },
  {
    id: 'task-board',
    name: 'Task Board',
    description: 'Collaborative Kanban task management for operations workflows',
    category: 'operations',
    href: '/tools/tasks',
    icon: Zap,
    color: 'from-violet-500 to-blue-600',
    status: 'active' as const,
    priority: 6,
  },
  {
    id: 'permissions',
    name: 'Permissions',
    description: 'Granular role-based access control matrix',
    category: 'operations',
    href: '/tools/permissions',
    icon: Lock,
    color: 'from-red-600 to-rose-700',
    status: 'active' as const,
    requiredRoles: ['admin'],
    priority: 7,
  },
  {
    id: 'assets',
    name: 'Asset Manager',
    description: 'Upload and manage artwork, motion graphics, lyrics & release assets',
    category: 'operations',
    href: '/tools/assets',
    icon: Database,
    color: 'from-indigo-500 to-purple-600',
    status: 'active' as const,
    priority: 8,
  },
];

// Tool categories with metadata
export const CATEGORIES: Record<ToolCategory, ToolCategory_> = {
  publishing: {
    id: 'publishing',
    name: '🎵 Release Publishing',
    icon: FileText,
    description: 'Create and manage release metadata, credits, and descriptions',
    color: 'orange',
    accentColor: 'from-orange-500 to-yellow-500',
    tools: TOOLS.filter((t) => t.category === 'publishing').sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999)),
  },
  protection: {
    id: 'protection',
    name: '🛡 Content Protection',
    icon: Shield,
    description: 'Protect content with audio matching and fingerprinting',
    color: 'green',
    accentColor: 'from-green-500 to-emerald-500',
    tools: TOOLS.filter((t) => t.category === 'protection').sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999)),
  },
  monitoring: {
    id: 'monitoring',
    name: '📺 TV & Monitoring',
    icon: Tv,
    description: 'Monitor operations with live dashboards and logs',
    color: 'violet',
    accentColor: 'from-violet-500 to-purple-500',
    tools: TOOLS.filter((t) => t.category === 'monitoring').sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999)),
  },
  operations: {
    id: 'operations',
    name: '⚙ Operations',
    icon: Settings,
    description: 'System control, settings, and administrative functions',
    color: 'slate',
    accentColor: 'from-slate-500 to-gray-600',
    tools: TOOLS.filter((t) => t.category === 'operations').sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999)),
  },
};

// Role-based access control
export const ROLE_PERMISSIONS: Record<UserRole, { categories: ToolCategory[]; tools: string[] }> = {
  admin: {
    categories: ['publishing', 'protection', 'monitoring', 'operations'],
    tools: TOOLS.map((t) => t.id),
  },
  analyst: {
    categories: ['protection', 'monitoring', 'operations'],
    tools: TOOLS.filter((t) => !t.requiredRoles || t.requiredRoles.includes('analyst')).map((t) => t.id),
  },
  operator: {
    categories: ['protection', 'monitoring'],
    tools: TOOLS.filter((t) => t.category === 'protection' || t.category === 'monitoring').map((t) => t.id),
  },
  viewer: {
    categories: ['monitoring'],
    tools: TOOLS.filter((t) => t.category === 'monitoring').map((t) => t.id),
  },
};

// Get tools for a specific role
export function getToolsForRole(role: UserRole): Tool[] {
  const allowedToolIds = ROLE_PERMISSIONS[role].tools;
  return TOOLS.filter((t) => allowedToolIds.includes(t.id));
}

// Get categories for a specific role
export function getCategoriesForRole(role: UserRole): ToolCategory_[] {
  const allowedCategories = ROLE_PERMISSIONS[role].categories;
  return allowedCategories.map((cat) => ({
    ...CATEGORIES[cat],
    tools: CATEGORIES[cat].tools.filter((t) => ROLE_PERMISSIONS[role].tools.includes(t.id)),
  }));
}
