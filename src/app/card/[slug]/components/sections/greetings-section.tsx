'use client';

import { Badge } from '@/components/ui';
import { renderTextWithImages } from '../utils';

interface GreetingsSectionProps {
  firstMessage: string;
  alternateGreetings?: string[];
  firstMessageTokens: number;
}

export function GreetingsSection({ firstMessage, alternateGreetings, firstMessageTokens }: GreetingsSectionProps) {
  const totalGreetings = 1 + (alternateGreetings?.length || 0);

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4 gradient-text flex items-center gap-2">
        Greetings
        <span className="text-sm font-normal text-starlight/50">
          ({totalGreetings} total, {firstMessageTokens.toLocaleString()} tokens in default)
        </span>
      </h2>
      <div className="space-y-4">
        <div className="bg-cosmic-teal/30 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="success" size="sm">Default</Badge>
          </div>
          <div className="whitespace-pre-wrap text-sm text-starlight/70">
            {renderTextWithImages(firstMessage, { centered: true, halfSize: true })}
          </div>
        </div>

        {alternateGreetings?.map((greeting, index) => (
          <div key={index} className="bg-cosmic-teal/30 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="info" size="sm">Greeting {index + 2}</Badge>
            </div>
            <div className="whitespace-pre-wrap text-sm text-starlight/70">
              {renderTextWithImages(greeting, { centered: true, halfSize: true })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
