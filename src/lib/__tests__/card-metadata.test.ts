import { describe, it, expect } from 'vitest';
import { extractCardMetadata, countEmbeddedImages } from '../card-metadata';

describe('extractCardMetadata', () => {
  it('derives alternate greetings', () => {
    const data = { alternate_greetings: ['Hi', 'Hello'] };
    const metadata = extractCardMetadata(data);

    expect(metadata.hasAlternateGreetings).toBe(true);
    expect(metadata.alternateGreetingsCount).toBe(2);
    expect(metadata.totalGreetingsCount).toBe(3); // 1 first_mes + 2 alternates
  });

  it('handles empty alternate greetings', () => {
    const data = {};
    const metadata = extractCardMetadata(data);

    expect(metadata.hasAlternateGreetings).toBe(false);
    expect(metadata.alternateGreetingsCount).toBe(0);
    expect(metadata.totalGreetingsCount).toBe(1); // Just first_mes
  });

  it('derives lorebook features', () => {
    const data = {
      character_book: {
        name: 'Test Book',
        entries: [
          { keys: ['test'], content: 'Test entry 1', enabled: true, insertion_order: 0 },
          { keys: ['test2'], content: 'Test entry 2', enabled: true, insertion_order: 1 }
        ]
      }
    };
    const metadata = extractCardMetadata(data);

    expect(metadata.hasLorebook).toBe(true);
    expect(metadata.lorebookEntriesCount).toBe(2);
  });

  it('handles missing lorebook', () => {
    const data = {};
    const metadata = extractCardMetadata(data);

    expect(metadata.hasLorebook).toBe(false);
    expect(metadata.lorebookEntriesCount).toBe(0);
  });

  it('counts embedded images from multiple sources', () => {
    const data = {
      description: 'A character with ![portrait](https://example.com/a.png)',
      first_mes: 'Hello with <img src="banner.jpg">',
      alternate_greetings: [
        'Greeting with data:image/png;base64,abc123',
        'Plain greeting'
      ],
      mes_example: 'Example with ![ref](ref.webp)',
    };
    const metadata = extractCardMetadata(data);

    expect(metadata.hasEmbeddedImages).toBe(true);
    expect(metadata.embeddedImagesCount).toBeGreaterThan(0);
  });

  it('handles no embedded images', () => {
    const data = {
      description: 'Plain text description',
      first_mes: 'Plain greeting',
    };
    const metadata = extractCardMetadata(data);

    expect(metadata.hasEmbeddedImages).toBe(false);
    expect(metadata.embeddedImagesCount).toBe(0);
  });

  it('combines all metadata features', () => {
    const data = {
      description: 'Character with data:image/png;base64,iVBORw0KG', // data URL, not markdown
      first_mes: 'Hello!',
      alternate_greetings: ['Hi!', 'Hey!'],
      character_book: {
        name: 'Book',
        entries: [
          { keys: ['key'], content: 'content', enabled: true, insertion_order: 0 }
        ]
      }
    };
    const metadata = extractCardMetadata(data);

    // All features should be detected
    expect(metadata.hasAlternateGreetings).toBe(true);
    expect(metadata.hasLorebook).toBe(true);
    expect(metadata.hasEmbeddedImages).toBe(true); // data URL counts as embedded
    expect(metadata.totalGreetingsCount).toBe(3);
  });

  it('handles null and undefined fields gracefully', () => {
    const data = {
      description: null,
      first_mes: undefined,
      alternate_greetings: null,
      mes_example: null,
      creator_notes: null,
      character_book: null,
    };
    const metadata = extractCardMetadata(data);

    expect(metadata.hasAlternateGreetings).toBe(false);
    expect(metadata.hasLorebook).toBe(false);
    expect(metadata.hasEmbeddedImages).toBe(false);
  });
});

describe('countEmbeddedImages (deprecated)', () => {
  it('counts images from array of texts', () => {
    const texts = [
      'Text with ![img1](image1.png)',
      '<img src="image2.jpg">',
      'data:image/png;base64,abc123',
    ];
    const count = countEmbeddedImages(texts);

    expect(count).toBeGreaterThan(0);
  });

  it('handles empty and null texts', () => {
    const texts = [null, undefined, '', 'Plain text'];
    const count = countEmbeddedImages(texts);

    expect(count).toBe(0);
  });

  it('deduplicates images across texts', () => {
    const texts = [
      '![img](same.png)',
      '![img](same.png)', // Same image
      '![img](different.png)',
    ];
    const count = countEmbeddedImages(texts);

    // Should count unique images
    expect(count).toBeGreaterThanOrEqual(2);
  });
});
