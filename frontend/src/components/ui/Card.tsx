'use client';

import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  interactive?: boolean;
}

export function Card({ children, className = '', onClick, interactive = false }: CardProps) {
  const interactiveClass = interactive ? 'cursor-pointer hover:shadow-lg hover:shadow-blue-500/20 hover:-translate-y-0.5 transition-all' : '';
  
  return (
    <div
      className={`
        bg-gradient-to-br from-gray-900 to-black border border-gray-800 
        rounded-lg p-6 shadow-lg
        ${interactiveClass}
        ${className}
      `}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`mb-4 ${className}`}>{children}</div>;
}

export function CardContent({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={className}>{children}</div>;
}

export function CardTitle({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <h3 className={`text-lg font-semibold text-white ${className}`}>{children}</h3>;
}

export function CardDescription({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <p className={`text-sm text-gray-400 ${className}`}>{children}</p>;
}
