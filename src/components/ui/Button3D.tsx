'use client';

import React from 'react';
import { soundEngine } from '@/services/sound/soundEngine';

export interface Button3DProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  silentClick?: boolean;
}

export const Button3D: React.FC<Button3DProps> = ({
  variant = 'secondary',
  size = 'md',
  silentClick = false,
  className = '',
  children,
  onMouseEnter,
  onClick,
  disabled,
  ...props
}) => {
  const variantClass =
    variant === 'primary'
      ? 'btn-premium-primary'
      : variant === 'danger'
      ? 'btn-premium-danger'
      : variant === 'ghost'
      ? 'btn-premium-ghost'
      : 'btn-premium-secondary';

  const sizeClass =
    size === 'sm'
      ? 'px-3 py-1.5 text-xs'
      : size === 'lg'
      ? 'px-6 py-3 text-sm'
      : 'px-4 py-2 text-sm';

  const handleMouseEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!disabled) {
      soundEngine.play('hover');
    }
    onMouseEnter?.(e);
  };

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!disabled && !silentClick) {
      soundEngine.play('click');
    }
    onClick?.(e);
  };

  return (
    <button
      type="button"
      disabled={disabled}
      onMouseEnter={handleMouseEnter}
      onClick={handleClick}
      className={`btn-premium ${variantClass} ${sizeClass} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};
