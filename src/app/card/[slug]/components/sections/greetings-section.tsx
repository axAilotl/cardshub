'use client';

import { Badge } from '@/components/ui';
import { useSettings } from '@/lib/settings';
import { cn } from '@/lib/utils/cn';
import { renderTextWithImages } from '../utils';

interface GreetingsSectionProps {
  firstMessage: string;
  alternateGreetings?: string[];
  firstMessageTokens: number;
  isNsfw?: boolean;
}

export function GreetingsSection({ firstMessage, alternateGreetings, firstMessageTokens, isNsfw }: GreetingsSectionProps) {
  const { settings } = useSettings();
  const shouldBlur = settings.blurNsfwContent && isNsfw;
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
        <div className={cn(
          'bg-cosmic-teal/30 rounded-lg p-4 group',
          shouldBlur && 'relative'
        )}>
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="success" size="sm">Default</Badge>
          </div>
          <div className={cn(
            'whitespace-pre-wrap text-sm text-starlight/70 transition-all duration-300',
            shouldBlur && 'blur-md select-none'
          )}>
            {renderTextWithImages(firstMessage, { centered: true, halfSize: true })}
          </div>
        </div>

        {alternateGreetings?.map((greeting, index) => (
          <div key={index} className={cn(
            'bg-cosmic-teal/30 rounded-lg p-4 group',
            shouldBlur && 'relative'
          )}>
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="info" size="sm">Greeting {index + 2}</Badge>
            </div>
            <div className={cn(
              'whitespace-pre-wrap text-sm text-starlight/70 transition-all duration-300',
              shouldBlur && 'blur-md select-none'
            )}>
              {renderTextWithImages(greeting, { centered: true, halfSize: true })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
