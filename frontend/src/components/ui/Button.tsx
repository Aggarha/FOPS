'use client';

import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  disabled,
  ...props
}: ButtonProps) {
  const variants = {
    primary: 'bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-600/30',
    secondary: 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/30',
    danger: 'bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-600/30',
    ghost: 'bg-transparent hover:bg-gray-800 text-gray-300 hover:text-white border border-gray-700',
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg',
  };

  const disabledClass = disabled ? 'opacity-50 cursor-not-allowed' : '';

  return (
    <button
      className={`
        ${variants[variant]}
        ${sizes[size]}
        rounded-lg font-semibold transition-all duration-200
        ${disabledClass}
        ${className}
      `}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
