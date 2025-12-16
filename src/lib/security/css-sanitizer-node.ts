/**
 * Node.js-only CSS sanitizer using css-tree
 * This file should NEVER be imported on Cloudflare Workers
 */
import * as cssTree from 'css-tree';

export async function sanitizeCssWithTree(
  css: string,
  options: {
    scope?: string;
    allowAnimations?: boolean;
    allowMediaQueries?: boolean;
    maxSelectors?: number;
    maxNestingDepth?: number;
  } = {}
): Promise<string | null> {
  const {
    scope,
    allowAnimations = true,
    allowMediaQueries = true,
    maxSelectors = 500,
  } = options;

  try {
    // Parse CSS into AST
    const ast = cssTree.parse(css, {
      parseCustomProperty: true,
      positions: false,
      parseRulePrelude: false, // Be more lenient with parsing
      parseAtrulePrelude: false,
      onParseError(error) {
        // Ignore parse errors and continue with partial AST
        console.warn('CSS parse warning:', error.message);
      }
    });

    let selectorCount = 0;

    // Remove dangerous declarations
    cssTree.walk(ast, {
      visit: 'Declaration',
      enter(node, item, list) {
        const prop = node.property.toLowerCase();

        // Block dangerous properties
        const BLOCKED = new Set(['behavior', '-moz-binding', 'expression', '-ms-filter', 'binding', 'script', 'javascript', 'vbscript', 'import', 'content']);
        if (BLOCKED.has(prop)) {
          list.remove(item);
          return;
        }

        // Whitelist check
        const ALLOWED = new Set(['display', 'position', 'top', 'right', 'bottom', 'left', 'width', 'height', 'max-width', 'max-height', 'min-width', 'min-height', 'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'box-sizing', 'overflow', 'overflow-x', 'overflow-y', 'overflow-wrap', 'flex', 'flex-direction', 'flex-wrap', 'flex-grow', 'flex-shrink', 'flex-basis', 'justify-content', 'align-items', 'align-content', 'align-self', 'order', 'grid', 'grid-template-columns', 'grid-template-rows', 'grid-template-areas', 'grid-column', 'grid-row', 'grid-area', 'gap', 'row-gap', 'column-gap', 'float', 'clear', 'vertical-align', 'font-family', 'font-size', 'font-weight', 'font-style', 'font-variant', 'line-height', 'text-align', 'text-decoration', 'text-decoration-line', 'text-decoration-color', 'text-decoration-style', 'text-transform', 'letter-spacing', 'word-spacing', 'white-space', 'word-break', 'word-wrap', 'color', 'text-shadow', 'text-indent', 'text-overflow', 'background', 'background-color', 'background-image', 'background-position', 'background-size', 'background-repeat', 'background-attachment', 'background-clip', 'background-origin', 'background-blend-mode', 'border', 'border-width', 'border-style', 'border-color', 'border-radius', 'border-top', 'border-right', 'border-bottom', 'border-left', 'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width', 'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color', 'border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius', 'border-image', 'border-collapse', 'border-spacing', 'outline', 'outline-width', 'outline-style', 'outline-color', 'outline-offset', 'opacity', 'visibility', 'box-shadow', 'filter', 'backdrop-filter', 'transform', 'transform-origin', 'transform-style', 'perspective', 'perspective-origin', 'transition', 'transition-property', 'transition-duration', 'transition-timing-function', 'transition-delay', 'animation', 'animation-name', 'animation-duration', 'animation-timing-function', 'animation-delay', 'animation-iteration-count', 'animation-direction', 'animation-fill-mode', 'animation-play-state', 'cursor', 'pointer-events', 'user-select', 'z-index', 'clip-path', 'list-style', 'list-style-type', 'list-style-position', 'list-style-image', 'table-layout', 'caption-side', 'empty-cells', 'resize', 'object-fit', 'object-position']);
        if (!ALLOWED.has(prop) && !prop.startsWith('--')) {
          list.remove(item);
          return;
        }

        // Block expression()
        let shouldRemove = false;
        cssTree.walk(node, {
          visit: 'Function',
          enter(fnNode) {
            if (typeof (fnNode as any).name === 'string' && (fnNode as any).name.toLowerCase() === 'expression') {
              shouldRemove = true;
            }
          }
        });

        // Block dangerous URLs
        cssTree.walk(node, {
          visit: 'Url',
          enter(urlNode) {
            const rawValue = typeof (urlNode as any).value === 'string' ? (urlNode as any).value : (urlNode as any).value?.value;
            if (typeof rawValue === 'string' && rawValue.trim()) {
              let checkValue = rawValue;

              // Decode URL-encoded strings
              if (/%[0-9a-f]{2}/i.test(rawValue)) {
                try {
                  checkValue = decodeURIComponent(rawValue);
                } catch {
                  // Invalid encoding - block it
                  shouldRemove = true;
                  return;
                }
              }

              if (/^(javascript|vbscript|file|about):/i.test(checkValue)) shouldRemove = true;
              if (/^data:/i.test(checkValue) && !/^data:image\//i.test(checkValue)) shouldRemove = true;
            }
          }
        });

        if (shouldRemove) list.remove(item);
      }
    });

    // Block @import, @font-face
    cssTree.walk(ast, {
      visit: 'Atrule',
      enter(node, item, list) {
        const ruleName = node.name.toLowerCase();
        if (ruleName === 'import' || ruleName === 'font-face') {
          list.remove(item);
          return;
        }
        if (ruleName === 'keyframes' && !allowAnimations) {
          list.remove(item);
          return;
        }
        if (ruleName === 'media' && !allowMediaQueries) {
          list.remove(item);
          return;
        }
        const ALLOWED_RULES = new Set(['keyframes', 'media']);
        if (!ALLOWED_RULES.has(ruleName)) {
          list.remove(item);
        }
      }
    });

    // Block :visited
    cssTree.walk(ast, {
      visit: 'PseudoClassSelector',
      enter(node, item, list) {
        if (node.name.toLowerCase() === 'visited') {
          list.remove(item);
        }
      }
    });

    // Count selectors
    cssTree.walk(ast, {
      visit: 'Selector',
      enter() {
        selectorCount++;
        if (selectorCount > maxSelectors) {
          throw new Error('Too many selectors');
        }
      }
    });

    // Apply scoping if requested
    if (scope) {
      cssTree.walk(ast, {
        visit: 'Rule',
        enter(node) {
          if (node.prelude && node.prelude.type === 'SelectorList') {
            const selectorList = node.prelude;
            const newSelectors: any[] = [];

            selectorList.children.forEach((selector: any) => {
              if (selector.type === 'Selector') {
                const scopeAst = cssTree.parse(scope, { context: 'selector' }) as any;
                const newSelector: any = {
                  type: 'Selector',
                  children: new cssTree.List<any>(),
                };

                // Add scope selector nodes
                scopeAst.children.forEach((child: any) => {
                  newSelector.children.appendData(child);
                });

                // Add descendant combinator
                newSelector.children.appendData({
                  type: 'WhiteSpace',
                  value: ' ',
                } as any);

                // Add original selector nodes
                selector.children.forEach((child: any) => {
                  newSelector.children.appendData(child);
                });

                newSelectors.push(newSelector);
              }
            });

            selectorList.children = new cssTree.List<any>();
            newSelectors.forEach((sel) => selectorList.children.appendData(sel));
          }
        }
      });
    }

    return cssTree.generate(ast);
  } catch (error) {
    console.error('CSS sanitization failed:', error);
    return null;
  }
}
