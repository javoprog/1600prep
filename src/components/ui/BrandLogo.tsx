'use client';

import React from 'react';
import Image from 'next/image';

interface BrandLogoProps {
  className?: string;
}

/** Shared brand mark + editorial wordmark used in workspace and exam headers. */
export const BrandLogo: React.FC<BrandLogoProps> = ({ className = '' }) => {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <Image
        src="/logo.png"
        alt="1600prep logo"
        width={28}
        height={28}
        priority
        className="h-7 w-7 shrink-0 object-contain transition-transform duration-150 group-hover:scale-105"
      />
      <span className="font-editorial text-2xl leading-none tracking-tight text-[#F5F5F5] transition-opacity group-hover:opacity-90">
        1600prep
      </span>
    </span>
  );
};
