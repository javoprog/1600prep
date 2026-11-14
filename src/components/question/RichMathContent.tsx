'use client';

import React, { useMemo } from 'react';
import { renderRichHtmlWithKatex } from '@/utils/mathRenderer';

interface RichMathContentProps {
  html?: string;
  className?: string;
  variant?: 'passage' | 'stem' | 'option' | 'explanation';
}

export const RichMathContent: React.FC<RichMathContentProps> = React.memo(
  ({ html, className = '', variant = 'stem' }) => {
    const renderedHtml = useMemo(() => {
      if (!html) return '';
      return renderRichHtmlWithKatex(html);
    }, [html]);

    if (!renderedHtml) return null;

    return (
      <div
        className={`sat-rich-content sat-rich-${variant} ${className}`}
        dangerouslySetInnerHTML={{ __html: renderedHtml }}
      />
    );
  }
);

RichMathContent.displayName = 'RichMathContent';
