import { notFound } from 'next/navigation';
import { getCardBySlug } from '@/lib/db/cards';
import { CardDetailClient } from './client';
import { sanitizeCss } from '@/lib/security/css-sanitizer';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function CardDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const card = await getCardBySlug(slug);

  if (!card) {
    notFound();
  }

  // Sanitize creator notes CSS server-side
  const creatorNotes = card.cardData.data.creator_notes || card.creatorNotes;
  if (creatorNotes) {
    const styleMatch = creatorNotes.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
    if (styleMatch) {
      const sanitized = await sanitizeCss(styleMatch[1], {
        scope: '[data-card-page]',
        maxSelectors: 300,
      });

      // Store sanitized CSS in card data for client
      if (sanitized) {
        (card as any).sanitizedCss = sanitized;
      }
    }
  }

  return <CardDetailClient card={card} />;
}

// Generate metadata for the page
export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const card = await getCardBySlug(slug);

  if (!card) {
    return { title: 'Card Not Found' };
  }

  return {
    title: `${card.name} - CardsHub`,
    description: card.description || `View ${card.name} character card`,
  };
}
