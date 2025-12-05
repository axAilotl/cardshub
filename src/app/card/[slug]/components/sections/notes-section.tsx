'use client';

import { HtmlContent, renderTextWithImages } from '../utils';

interface NotesSectionProps {
  creatorNotes: string | null;
}

// Convert markdown images to HTML img tags
function convertMarkdownImagesToHtml(text: string): string {
  return text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%;height:auto;border-radius:0.5rem;">');
}

export function NotesSection({ creatorNotes }: NotesSectionProps) {
  const hasHtmlContent = creatorNotes && /<[^>]+>/.test(creatorNotes);
  const hasMarkdownImages = creatorNotes && /!\[[^\]]*\]\([^)]+\)/.test(creatorNotes);

  // Process content: if has HTML, convert any markdown images to HTML too
  let processedNotes = creatorNotes;
  if (hasHtmlContent && hasMarkdownImages && processedNotes) {
    processedNotes = convertMarkdownImagesToHtml(processedNotes);
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4 gradient-text">Creator&apos;s Notes</h2>
      {creatorNotes ? (
        hasHtmlContent ? (
          <HtmlContent html={processedNotes!} className="text-starlight/80" />
        ) : hasMarkdownImages ? (
          <div className="whitespace-pre-wrap text-starlight/80">
            {renderTextWithImages(creatorNotes)}
          </div>
        ) : (
          <p className="whitespace-pre-wrap text-starlight/80">{creatorNotes}</p>
        )
      ) : (
        <p className="text-starlight/50 italic">No creator notes provided.</p>
      )}
    </div>
  );
}
