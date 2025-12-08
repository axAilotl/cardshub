import { notFound } from 'next/navigation';
import { getCollectionBySlug } from '@/lib/db/collections';
import { CollectionDetailClient } from './client';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function CollectionDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const collection = await getCollectionBySlug(slug);

  if (!collection) {
    notFound();
  }

  // Blocked collections should 404 for non-admins
  if (collection.visibility === 'blocked') {
    notFound();
  }

  return <CollectionDetailClient collection={collection} />;
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const collection = await getCollectionBySlug(slug);

  if (!collection) {
    return { title: 'Collection Not Found' };
  }

  return {
    title: `${collection.name} - CardsHub`,
    description: collection.description || `View ${collection.name} collection with ${collection.itemsCount} characters`,
  };
}
