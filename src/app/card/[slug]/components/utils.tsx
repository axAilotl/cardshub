'use client';

import { cn } from '@/lib/utils/cn';

// Type guards for extensions
export interface WyvernExtensions {
  depth_prompt?: {
    prompt: string;
    depth: number;
  };
  visual_description?: string;
}

export interface ChubExtensions {
  id?: string;
  full_path?: string;
  custom_css?: string;
}

export type CardExtensions = WyvernExtensions & ChubExtensions;

// Render embedded images in text (base64 and http URLs)
// Options: centered = center images, halfSize = 50% width/height
export function renderTextWithImages(
  text: string,
  options?: { centered?: boolean; halfSize?: boolean }
): React.ReactNode {
  const { centered = false, halfSize = false } = options || {};

  // Match markdown images ![alt](url) and HTML <img> tags with any src (data:, http://, https://)
  const imgRegex = /!\[([^\]]*)\]\(([^)]+)\)|<img[^>]+src=["']?([^"'\s>]+)["']?[^>]*>/g;

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  while ((match = imgRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(
        <span key={lastIndex}>{text.slice(lastIndex, match.index)}</span>
      );
    }

    const src = match[2] || match[3];
    const imageClasses = cn(
      'h-auto rounded-lg',
      halfSize ? 'max-w-[50%] max-h-[50vh]' : 'max-w-full'
    );
    const wrapperClasses = cn(
      'block my-4',
      centered && 'flex justify-center'
    );

    parts.push(
      <span key={match.index} className={wrapperClasses}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={match[1] || 'Embedded image'}
          className={imageClasses}
        />
      </span>
    );

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(<span key={lastIndex}>{text.slice(lastIndex)}</span>);
  }

  return parts.length > 0 ? parts : text;
}

// Safely render HTML content
export function HtmlContent({ html, className }: { html: string; className?: string }) {
  return (
    <div
      className={cn('prose prose-invert max-w-none', className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
