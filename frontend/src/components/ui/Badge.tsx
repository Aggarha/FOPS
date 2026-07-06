'use client';

import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  className?: string;
}

export function Badge({ children, variant = 'default', className = '' }: BadgeProps) {
  const variants = {
    default: 'bg-gray-800 text-gray-300 border border-gray-700',
    success: 'bg-green-900/30 text-green-300 border border-green-700/50',
    warning: 'bg-yellow-900/30 text-yellow-300 border border-yellow-700/50',
    danger: 'bg-red-900/30 text-red-300 border border-red-700/50',
    info: 'bg-blue-900/30 text-blue-300 border border-blue-700/50',
  };

  return (
    <span
      className={`
        inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
        ${variants[variant]}
        ${className}
      `}
    >
      {children}
    </span>
  );
}
