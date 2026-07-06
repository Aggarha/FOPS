'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Music, Search, Database, LinkIcon, FileText } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

interface Tool {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  href: string;
  color: string;
  requiredPermission?: string;
}

const tools: Tool[] = [
  {
    id: 'audio-match',
    name: 'Audio Match',
    description: 'Match audio files across platforms and score similarity',
    icon: <Music className="w-8 h-8" />,
    href: '/tools/audio-match',
    color: 'from-green-500 to-emerald-500',
    requiredPermission: 'audio-match',
  },
  {
    id: 'youtube-search',
    name: 'YouTube Search',
    description: 'Search and analyze YouTube content for releases',
    icon: <Search className="w-8 h-8" />,
    href: '/tools/youtube-search',
    color: 'from-red-500 to-pink-500',
    requiredPermission: 'youtube-search',
  },
  {
    id: 'fingerprint-db',
    name: 'Fingerprint DB',
    description: 'Query and manage audio fingerprint database',
    icon: <Database className="w-8 h-8" />,
    href: '/tools/fingerprint-db',
    color: 'from-blue-500 to-cyan-500',
    requiredPermission: 'fingerprint-check',
  },
  {
    id: 'channel-scrape',
    name: 'Channel Scrape',
    description: 'Extract data from YouTube channels',
    icon: <LinkIcon className="w-8 h-8" />,
    href: '/tools/channel-scrape',
    color: 'from-purple-500 to-pink-500',
    requiredPermission: 'channel-scrape',
  },
  {
    id: 'publishing',
    name: 'Publishing Suite',
    description: 'Professional credits and metadata management tools',
    icon: <FileText className="w-8 h-8" />,
    href: '/tools/publishing',
    color: 'from-orange-500 to-yellow-500',
  },
];

export default function ToolsPage() {
  const router = useRouter();
  const { canAccess, loading } = useAuth();

  if (loading) {
    return null;
  }

  const availableTools = tools.filter((tool) =>
    tool.requiredPermission ? canAccess(tool.requiredPermission) : true
  );

  return (
    <div className="max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-white mb-2">Tools</h1>
        <p className="text-gray-400">Access all available tools and operations</p>
      </div>

      {/* Tools Grid */}
      {availableTools.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
          {availableTools.map((tool) => (
            <Card
              key={tool.id}
              interactive
              onClick={() => router.push(tool.href)}
              className="group relative overflow-hidden"
            >
              {/* Gradient Background */}
              <div
                className={`absolute inset-0 opacity-0 group-hover:opacity-10 bg-gradient-to-br ${tool.color} transition-opacity duration-300`}
              />

              <CardHeader>
                <div className="flex items-start justify-between">
                  <div
                    className={`p-3 rounded-lg bg-gradient-to-br ${tool.color} text-white shadow-lg group-hover:scale-110 transition-transform`}
                  >
                    {tool.icon}
                  </div>
                </div>
                <CardTitle className="mt-4 group-hover:text-green-400 transition-colors">
                  {tool.name}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>{tool.description}</CardDescription>
                <div className="mt-4 flex items-center gap-2 text-sm text-green-400 group-hover:gap-3 transition-all">
                  Launch Tool →
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent>
            <div className="text-center py-12">
              <p className="text-gray-400">No tools available for your role</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
