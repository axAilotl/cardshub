import DOMPurify from 'isomorphic-dompurify';

export interface CssSanitizeOptions {
  /** Scope CSS to a specific selector (e.g., '[data-profile]') */
  scope?: string;
  /** Allow @keyframes animations */
  allowAnimations?: boolean;
  /** Allow @media queries */
  allowMediaQueries?: boolean;
  /** Maximum allowed selectors (DoS protection) */
  maxSelectors?: number;
  /** Maximum nesting depth */
  maxNestingDepth?: number;
}

/**
 * Sanitize CSS string using regex-based whitelist/blacklist approach
 * Returns sanitized CSS or null if invalid
 */
export async function sanitizeCss(css: string, options: CssSanitizeOptions = {}): Promise<string | null> {
  // Preserve existing behavior for empty input
  if (css === '') return '';

  // Preserve whitespace-only CSS (treat as valid, but no-op)
  if (css.trim() === '') return css;

  return sanitizeCssImpl(css, options);
}

/**
 * CSS sanitizer using regex-based whitelist/blacklist (works everywhere)
 */
function sanitizeCssImpl(css: string, options: CssSanitizeOptions = {}): string | null {
  const { scope, maxNestingDepth = 10 } = options;

  /** Dangerous properties - NEVER allow these */
  const BLOCKED_PROPERTIES = new Set([
    'behavior', '-moz-binding', 'expression', '-ms-filter',
    'binding', 'script', 'javascript', 'vbscript', 'import',
    'content', // Can be used for data exfiltration
  ]);

  try {
    // Step 0: Cheap nesting-depth check (DoS protection + blocks nested CSS syntax)
    // Depth counts brace nesting outside strings/comments.
    let braceDepth = 0;
    let maxBraceDepth = 0;
    let inString: '"' | "'" | null = null;
    let inComment = false;
    for (let i = 0; i < css.length; i++) {
      const ch = css[i];
      const next = css[i + 1];

      if (inComment) {
        if (ch === '*' && next === '/') {
          inComment = false;
          i++;
        }
        continue;
      }

      if (inString) {
        if (ch === '\\') {
          i++;
          continue;
        }
        if (ch === inString) {
          inString = null;
        }
        continue;
      }

      if (ch === '/' && next === '*') {
        inComment = true;
        i++;
        continue;
      }

      if (ch === '"' || ch === "'") {
        inString = ch;
        continue;
      }

      if (ch === '{') {
        braceDepth++;
        if (braceDepth > maxBraceDepth) maxBraceDepth = braceDepth;
        if (maxBraceDepth > maxNestingDepth) {
          throw new Error('Nesting too deep');
        }
      } else if (ch === '}') {
        braceDepth = Math.max(0, braceDepth - 1);
      }
    }

    // Remove dangerous patterns
    let sanitized = css;

    // Block @import and @font-face
    sanitized = sanitized.replace(/@import\s+[^;]+;/gi, '');
    sanitized = sanitized.replace(/@font-face\s*\{[^}]*\}/gi, '');

    // Block dangerous properties
    for (const prop of BLOCKED_PROPERTIES) {
      const regex = new RegExp(`\\b${prop}\\s*:`, 'gi');
      sanitized = sanitized.replace(regex, 'invalid-prop:');
    }

    // Block dangerous protocols in url()
    sanitized = sanitized.replace(/url\s*\(\s*['"]?([^'")]+)['"]?\s*\)/gi, (match, url) => {
      const trimmed = url.trim();
      if (/^(javascript|vbscript|file|about):/i.test(trimmed)) {
        return '';
      }
      if (/^data:/i.test(trimmed) && !/^data:image\//i.test(trimmed)) {
        return '';
      }
      return match;
    });

    // Block :visited pseudo-class
    sanitized = sanitized.replace(/:visited\b/gi, '');

    // Apply scoping if requested
    if (scope) {
      sanitized = sanitized.replace(/([^{}]+)\{/g, (match, selector) => {
        const trimmed = selector.trim();
        if (trimmed.startsWith('@')) return match; // Skip at-rules
        return `${scope} ${trimmed} {`;
      });
    }

    // DOMPurify second pass if available
    if (typeof (DOMPurify as any).sanitizeCSS === 'function') {
      sanitized = (DOMPurify as any).sanitizeCSS(sanitized);
    }

    return sanitized || ' ';
  } catch (error) {
    // Invalid CSS or security violation
    console.error('CSS sanitization failed:', error);
    return null;
  }
}

/**
 * Validate that CSS doesn't try to hide/break critical UI elements
 */
export function validateNoUiBreaking(css: string): { valid: boolean; reason?: string } {
  // Check for attempts to hide navigation, buttons, etc.
  const dangerousPatterns = [
    /display:\s*none\s*!important/i,
    /visibility:\s*hidden\s*!important/i,
    /opacity:\s*0\s*!important/i,
    /position:\s*fixed[\s\S]*z-index:\s*9999/i, // Overlay attacks
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(css)) {
      return { valid: false, reason: 'CSS attempts to hide or overlay UI elements' };
    }
  }

  return { valid: true };
}
