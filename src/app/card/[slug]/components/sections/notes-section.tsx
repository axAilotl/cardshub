'use client';

import { useSettings } from '@/lib/settings';
import { cn } from '@/lib/utils/cn';
import { HtmlContent, renderTextWithImages } from '../utils';

interface NotesSectionProps {
  creatorNotes: string | null;
  isNsfw?: boolean;
}

// Convert markdown images to HTML img tags
function convertMarkdownImagesToHtml(text: string): string {
  return text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%;height:auto;border-radius:0.5rem;">');
}

export function NotesSection({ creatorNotes, isNsfw }: NotesSectionProps) {
  const { settings } = useSettings();
  const shouldBlur = settings.blurNsfwContent && isNsfw;

  const hasHtmlContent = creatorNotes && /<[^>]+>/.test(creatorNotes);
  const hasMarkdownImages = creatorNotes && /!\[[^\]]*\]\([^)]+\)/.test(creatorNotes);

  // Process content: if has HTML, convert any markdown images to HTML too
  let processedNotes = creatorNotes;
  if (hasHtmlContent && hasMarkdownImages && processedNotes) {
    processedNotes = convertMarkdownImagesToHtml(processedNotes);
  }

  const blurClasses = shouldBlur ? 'blur-md hover:blur-none select-none hover:select-auto transition-all duration-300' : '';

  return (
    <div className="group">
      <h2 className="text-xl font-semibold mb-4 gradient-text">Creator&apos;s Notes</h2>
      {creatorNotes ? (
        hasHtmlContent ? (
          <HtmlContent html={processedNotes!} className={cn('text-starlight/80', blurClasses)} />
        ) : hasMarkdownImages ? (
          <div className={cn('whitespace-pre-wrap text-starlight/80', blurClasses)}>
            {renderTextWithImages(creatorNotes)}
          </div>
        ) : (
          <p className={cn('whitespace-pre-wrap text-starlight/80', blurClasses)}>{creatorNotes}</p>
        )
      ) : (
        <p className="text-starlight/50 italic">No creator notes provided.</p>
      )}
    </div>
  );
}
