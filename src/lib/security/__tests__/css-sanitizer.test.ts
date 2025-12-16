import { describe, it, expect } from 'vitest';
import { sanitizeCss, validateNoUiBreaking } from '../css-sanitizer';

describe('CSS Sanitizer', () => {
  describe('sanitizeCss', () => {
    it('should allow safe CSS', () => {
      const css = `
        .card {
          background: linear-gradient(135deg, #d946ef, #3b82f6);
          border-radius: 8px;
          padding: 16px;
        }
      `;
      const result = sanitizeCss(css);
      expect(result).toBeTruthy();
      expect(result).toContain('background');
      expect(result).toContain('border-radius');
    });

    it('should block javascript: URLs', () => {
      const css = `
        .card {
          background-image: url('javascript:alert(1)');
        }
      `;
      const result = sanitizeCss(css);
      expect(result).toBeTruthy(); // CSS is valid, just URL removed
      expect(result).not.toContain('javascript:');
    });

    it('should block data: URLs (non-image)', () => {
      const css = `
        .card {
          background-image: url('data:text/html,<script>alert(1)</script>');
        }
      `;
      const result = sanitizeCss(css);
      expect(result).toBeTruthy();
      expect(result).not.toContain('data:text/html');
    });

    it('should allow data:image/ URLs', () => {
      const css = `
        .card {
          background-image: url('data:image/png;base64,iVBORw0KGgo=');
        }
      `;
      const result = sanitizeCss(css);
      expect(result).toContain('data:image/png');
    });

    it('should allow https:// URLs', () => {
      const css = `
        .card {
          background-image: url('https://example.com/image.png');
        }
      `;
      const result = sanitizeCss(css);
      expect(result).toContain('https://example.com/image.png');
    });

    it('should block @import rules', () => {
      const css = `
        @import url('https://evil.com/steal.css');
        .card { color: red; }
      `;
      const result = sanitizeCss(css);
      expect(result).not.toContain('@import');
      expect(result).toContain('color');
    });

    it('should block @font-face rules', () => {
      const css = `
        @font-face {
          font-family: 'Tracker';
          src: url('https://evil.com/track.woff');
        }
      `;
      const result = sanitizeCss(css);
      expect(result).toBeTruthy();
      expect(result).not.toContain('@font-face');
      expect(result).not.toContain('evil.com');
    });

    it('should block :visited pseudo-class', () => {
      const css = `
        a:visited {
          background: url('https://track.com/?visited=1');
        }
      `;
      const result = sanitizeCss(css);
      expect(result).toBeTruthy();
      expect(result).not.toContain(':visited');
    });

    it('should block IE behavior property', () => {
      const css = `
        .card {
          behavior: url(xss.htc);
        }
      `;
      const result = sanitizeCss(css);
      expect(result).toBeTruthy();
      expect(result).not.toContain('behavior');
    });

    it('should block expression() values', () => {
      const css = `
        .card {
          width: expression(alert('XSS'));
        }
      `;
      const result = sanitizeCss(css);
      expect(result).toBeTruthy();
      expect(result).not.toContain('expression');
    });

    it('should handle URL encoding bypass attempts', () => {
      const css = `
        .card {
          background: url('%6A%61%76%61%73%63%72%69%70%74:alert(1)');
        }
      `;
      const result = sanitizeCss(css);
      // Should decode and block
      expect(result).toBeTruthy();
      expect(result).not.toContain('%6A');
      expect(result).not.toContain('javascript');
    });

    it('should apply scoping when requested', () => {
      const css = `
        .header {
          background: red;
        }
      `;
      const result = sanitizeCss(css, { scope: '[data-profile]' });
      expect(result).toContain('[data-profile]');
      expect(result).toContain('.header');
    });

    it('should enforce selector limit', () => {
      const css = Array.from({ length: 600 }, (_, i) => `.class${i} { color: red; }`).join('\n');
      const result = sanitizeCss(css, { maxSelectors: 500 });
      expect(result).toBeNull();
    });

    it('should enforce nesting depth limit', () => {
      // Create deeply nested CSS
      let css = '.a { color: red; }';
      for (let i = 0; i < 15; i++) {
        css = `.level${i} { ${css} }`;
      }
      const result = sanitizeCss(css, { maxNestingDepth: 5 });
      expect(result).toBeNull();
    });

    it('should allow custom properties (CSS variables)', () => {
      const css = `
        :root {
          --primary-color: #d946ef;
        }
        .card {
          background: var(--primary-color);
        }
      `;
      const result = sanitizeCss(css);
      expect(result).toContain('--primary-color');
      expect(result).toContain('var(--primary-color)');
    });

    it('should block non-whitelisted properties', () => {
      const css = `
        .card {
          -webkit-user-modify: read-write;
          -moz-binding: url(xss.xml#xss);
        }
      `;
      const result = sanitizeCss(css);
      expect(result).toBeTruthy();
      expect(result).not.toContain('-webkit-user-modify');
      expect(result).not.toContain('-moz-binding');
    });

    it('should allow @keyframes when allowAnimations is true', () => {
      const css = `
        @keyframes slideIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `;
      const result = sanitizeCss(css, { allowAnimations: true });
      expect(result).toContain('@keyframes');
      expect(result).toContain('slideIn');
    });

    it('should block @keyframes when allowAnimations is false', () => {
      const css = `
        @keyframes slideIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `;
      const result = sanitizeCss(css, { allowAnimations: false });
      expect(result).toBeTruthy();
      expect(result).not.toContain('@keyframes');
    });

    it('should allow @media when allowMediaQueries is true', () => {
      const css = `
        @media (max-width: 768px) {
          .card { display: block; }
        }
      `;
      const result = sanitizeCss(css, { allowMediaQueries: true });
      expect(result).toContain('@media');
      expect(result).toContain('max-width');
    });

    it('should block @media when allowMediaQueries is false', () => {
      const css = `
        @media (max-width: 768px) {
          .card { display: block; }
        }
      `;
      const result = sanitizeCss(css, { allowMediaQueries: false });
      expect(result).toBeTruthy();
      expect(result).not.toContain('@media');
    });

    it('should handle invalid CSS gracefully', () => {
      const css = `
        .card { { { invalid css
      `;
      const result = sanitizeCss(css);
      expect(result).toBeNull();
    });

    it('should block file: protocol URLs', () => {
      const css = `
        .card {
          background: url('file:///etc/passwd');
        }
      `;
      const result = sanitizeCss(css);
      expect(result).toBeTruthy();
      expect(result).not.toContain('file:');
    });

    it('should block vbscript: protocol URLs', () => {
      const css = `
        .card {
          background: url('vbscript:msgbox("XSS")');
        }
      `;
      const result = sanitizeCss(css);
      expect(result).toBeTruthy();
      expect(result).not.toContain('vbscript:');
    });

    it('should block about: protocol URLs', () => {
      const css = `
        .card {
          background: url('about:blank');
        }
      `;
      const result = sanitizeCss(css);
      expect(result).toBeTruthy();
      expect(result).not.toContain('about:');
    });

    it('should block content property (data exfiltration risk)', () => {
      const css = `
        .card::before {
          content: attr(data-secret);
        }
      `;
      const result = sanitizeCss(css);
      expect(result).toBeTruthy();
      expect(result).not.toContain('content');
    });

    it('should allow safe layout properties', () => {
      const css = `
        .card {
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          gap: 16px;
        }
      `;
      const result = sanitizeCss(css);
      expect(result).toContain('display');
      expect(result).toContain('flex-direction');
      expect(result).toContain('justify-content');
      expect(result).toContain('align-items');
      expect(result).toContain('gap');
    });

    it('should allow safe visual effects', () => {
      const css = `
        .card {
          opacity: 0.8;
          filter: blur(4px);
          transform: rotate(45deg);
          transition: all 0.3s ease;
        }
      `;
      const result = sanitizeCss(css);
      expect(result).toContain('opacity');
      expect(result).toContain('filter');
      expect(result).toContain('transform');
      expect(result).toContain('transition');
    });

    it('should scope multiple selectors', () => {
      const css = `
        .card, .item {
          color: red;
        }
      `;
      const result = sanitizeCss(css, { scope: '[data-profile]' });
      expect(result).toContain('[data-profile]');
      // Both selectors should be scoped
      const scopeCount = (result?.match(/\[data-profile\]/g) || []).length;
      expect(scopeCount).toBeGreaterThanOrEqual(2);
    });

    it('should handle empty CSS', () => {
      const css = '';
      const result = sanitizeCss(css);
      expect(result).toBe('');
    });

    it('should handle whitespace-only CSS', () => {
      const css = '   \n\n  \t  ';
      const result = sanitizeCss(css);
      expect(result).toBeTruthy();
    });

    it('should preserve valid CSS structure', () => {
      const css = `
        .container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 20px;
        }
        .header {
          font-size: 24px;
          font-weight: bold;
        }
      `;
      const result = sanitizeCss(css);
      expect(result).toContain('max-width');
      expect(result).toContain('margin');
      expect(result).toContain('padding');
      expect(result).toContain('font-size');
      expect(result).toContain('font-weight');
    });
  });

  describe('validateNoUiBreaking', () => {
    it('should reject display:none !important', () => {
      const result = validateNoUiBreaking('button { display: none !important; }');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('hide');
    });

    it('should reject visibility:hidden !important', () => {
      const result = validateNoUiBreaking('.header { visibility: hidden !important; }');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('hide');
    });

    it('should reject opacity:0 !important', () => {
      const result = validateNoUiBreaking('.content { opacity: 0 !important; }');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('hide');
    });

    it('should reject overlay attacks', () => {
      const result = validateNoUiBreaking('.overlay { position: fixed; z-index: 9999; }');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('overlay');
    });

    it('should allow safe CSS', () => {
      const result = validateNoUiBreaking('.card { background: red; }');
      expect(result.valid).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should allow normal display:none (without !important)', () => {
      const result = validateNoUiBreaking('.hidden { display: none; }');
      expect(result.valid).toBe(true);
    });

    it('should allow normal visibility:hidden (without !important)', () => {
      const result = validateNoUiBreaking('.invisible { visibility: hidden; }');
      expect(result.valid).toBe(true);
    });

    it('should allow position:fixed with low z-index', () => {
      const result = validateNoUiBreaking('.sticky { position: fixed; z-index: 10; }');
      expect(result.valid).toBe(true);
    });
  });
});
