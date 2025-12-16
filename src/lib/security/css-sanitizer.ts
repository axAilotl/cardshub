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
  const {
    scope,
    maxNestingDepth = 10,
    maxSelectors = 500,
    allowAnimations = true,
    allowMediaQueries = true,
  } = options;

  /** Dangerous properties - NEVER allow these */
  const BLOCKED_PROPERTIES = new Set([
    'behavior', '-moz-binding', 'expression', '-ms-filter',
    'binding', 'script', 'javascript', 'vbscript', 'import',
    'content', // Can be used for data exfiltration
    '-webkit-user-modify', // Can be used to make elements editable
  ]);

  try {
    // Step 0: Check for unbalanced braces (invalid CSS)
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
        braceDepth--;
        if (braceDepth < 0) {
          // Unbalanced braces
          throw new Error('Invalid CSS: unbalanced braces');
        }
      }
    }

    // Check final brace balance
    if (braceDepth !== 0) {
      throw new Error('Invalid CSS: unbalanced braces');
    }

    // Count selectors (approximate - count { outside of @-rules)
    const selectorCount = (css.match(/[^@{}][^{}]*\{/g) || []).length;
    if (selectorCount > maxSelectors) {
      throw new Error('Too many selectors');
    }

    // Remove dangerous patterns
    let sanitized = css;

    // Block @import and @font-face (always)
    sanitized = sanitized.replace(/@import\s+[^;]+;/gi, '');
    sanitized = sanitized.replace(/@font-face\s*\{[^}]*\}/gi, '');

    // Handle @keyframes based on option
    if (!allowAnimations) {
      sanitized = sanitized.replace(/@keyframes\s+[^{]+\{[^}]*\}/gi, '');
    }

    // Handle @media based on option
    if (!allowMediaQueries) {
      sanitized = sanitized.replace(/@media\s+[^{]+\{[^}]*\}/gi, '');
    }

    // Block dangerous properties
    for (const prop of BLOCKED_PROPERTIES) {
      // Use negative lookbehind to ensure property name doesn't have a hyphen or alphanumeric before it
      // This prevents matching "justify-content" when blocking "content"
      const regex = new RegExp(`(?<![-\\w])${prop}\\s*:`, 'gi');
      sanitized = sanitized.replace(regex, 'invalid-prop:');
    }

    // Block expression() function (IE-specific XSS vector)
    sanitized = sanitized.replace(/expression\s*\([^)]*\)/gi, '');

    // Block dangerous protocols in url() - decode URL encoding first
    sanitized = sanitized.replace(/url\s*\(\s*['"]?([^'")]+)['"]?\s*\)/gi, (match, url) => {
      let trimmed = url.trim();

      // Decode URL encoding to catch bypass attempts
      if (/%[0-9a-f]{2}/i.test(trimmed)) {
        try {
          trimmed = decodeURIComponent(trimmed);
        } catch {
          // Invalid encoding - block it
          return '';
        }
      }

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
      sanitized = sanitized.replace(/([^{}@]+)\{/g, (match, selector) => {
        const trimmed = selector.trim();
        // Skip at-rules (@keyframes, @media, etc.)
        if (trimmed.startsWith('@') || match.includes('@')) return match;

        // Handle comma-separated selectors
        const selectors = trimmed.split(',').map((s: string) => s.trim());
        const scoped = selectors.map((s: string) => `${scope} ${s}`).join(', ');
        return `${scoped} {`;
      });
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
