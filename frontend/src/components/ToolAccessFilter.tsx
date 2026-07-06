'use client';

import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';

interface ToolAccessFilterProps {
  tool: string;
  href: string;
  label: string;
  icon?: React.ReactNode;
  description?: string;
}

export default function ToolAccessFilter({
  tool,
  href,
  label,
  icon,
  description,
}: ToolAccessFilterProps) {
  const { canAccess, permissions } = useAuth();

  const hasAccess = canAccess(tool);

  if (!hasAccess) {
    return (
      <div className="p-4 bg-gray-800 rounded border border-gray-700 opacity-50 cursor-not-allowed">
        <div className="flex items-center gap-2">
          {icon && <span className="text-xl">{icon}</span>}
          <div>
            <div className="font-semibold text-gray-400">{label}</div>
            {description && <div className="text-sm text-gray-500">{description}</div>}
          </div>
        </div>
        <div className="mt-2 text-xs text-gray-500">
          ⚠ Access denied for your role ({permissions?.can_run_tools ? 'limited tools' : 'no tools'})
        </div>
      </div>
    );
  }

  return (
    <Link href={href}>
      <div className="p-4 bg-green-900/20 rounded border border-green-700/50 hover:border-green-500 hover:bg-green-900/30 transition cursor-pointer">
        <div className="flex items-center gap-2">
          {icon && <span className="text-xl">{icon}</span>}
          <div>
            <div className="font-semibold text-green-400">{label}</div>
            {description && <div className="text-sm text-green-300/70">{description}</div>}
          </div>
        </div>
      </div>
    </Link>
  );
}
