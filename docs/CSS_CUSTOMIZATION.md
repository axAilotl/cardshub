# CSS Customization Guide

This guide documents the CSS selectors and variables available for customizing your profile page and character card pages on CardsHub.

## Table of Contents

- [Profile Page Customization](#profile-page-customization)
- [Card Page Customization (Creator Notes)](#card-page-customization)
- [Available CSS Variables](#available-css-variables)
- [Utility Classes](#utility-classes)
- [Examples](#examples)
- [Security Notes](#security-notes)

---

## Profile Page Customization

You can add custom CSS to your profile via **Settings > Profile > Custom Profile CSS**.

### Available Selectors

| Selector | Description |
|----------|-------------|
| `[data-profile]` | Main profile container |
| `[data-username="yourname"]` | Target your specific profile |
| `[data-profile-header]` | Header section with avatar and info |
| `[data-profile-avatar]` | Avatar container |
| `[data-profile-info]` | Info section (name, bio, stats) |
| `[data-profile-displayname]` | Display name heading |
| `[data-profile-username]` | @username text |
| `[data-profile-joined]` | "Joined" date text |
| `[data-profile-bio]` | Bio paragraph |
| `[data-profile-badge="admin"]` | Admin badge (if applicable) |
| `[data-profile-stats]` | Stats container |
| `[data-stat="followers"]` | Followers stat |
| `[data-stat="following"]` | Following stat |
| `[data-stat="cards"]` | Cards count stat |
| `[data-stat="downloads"]` | Downloads stat |
| `[data-stat="upvotes"]` | Upvotes stat |
| `[data-stat-value]` | Stat number value |
| `[data-stat-label]` | Stat label text |
| `[data-profile-actions]` | Action buttons (Edit/Follow) |
| `[data-profile-tabs]` | Tab navigation |
| `[data-tab="cards"]` | Cards tab button |
| `[data-tab="favorites"]` | Favorites tab button |
| `[data-tab][data-active="true"]` | Currently active tab |
| `[data-profile-content]` | Main content area |
| `[data-tab-content="cards"]` | Content when cards tab active |
| `[data-tab-content="favorites"]` | Content when favorites tab active |

### Profile CSS Example

```css
/* Custom gradient background for header */
[data-profile-header] {
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%) !important;
}

/* Make avatar circular with glow */
[data-profile-avatar] {
  border: 3px solid var(--bi-pink) !important;
  box-shadow: 0 0 20px rgba(217, 70, 239, 0.5);
}

/* Custom stat styling */
[data-stat-value] {
  color: var(--bi-pink) !important;
  font-size: 1.5rem !important;
}

/* Highlight active tab */
[data-tab][data-active="true"] {
  background: linear-gradient(135deg, var(--bi-pink), var(--bi-purple));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
```

---

## Card Page Customization

Card creators can add custom CSS via `<style>` tags in the **Creator Notes** field. This CSS is extracted and applied to the card detail page.

### Available Selectors

| Selector | Description |
|----------|-------------|
| `[data-card-page]` | Main card page container |
| `[data-card-slug="card-slug"]` | Target specific card by slug |
| `[data-card-format="png\|charx\|voxta\|json"]` | Target by source format |
| `[data-card-hero]` | Hero section container |
| `[data-card-hero-overlay]` | Gradient overlay |
| `[data-card-hero-bg]` | Background image |
| `[data-card-hero-content]` | Hero content wrapper |
| `[data-card-image-container]` | Card image wrapper |
| `[data-card-image]` | Card thumbnail image |
| `[data-card-info]` | Info section |
| `[data-card-name]` | Character name heading |
| `[data-card-creator]` | Creator byline |
| `[data-card-description]` | Description text |
| `[data-card-tags]` | Tags container |
| `[data-card-stats]` | Stats row (votes, favorites, downloads) |
| `[data-card-actions]` | Action buttons (download, share) |
| `[data-card-tokens-container]` | Token breakdown wrapper |
| `[data-card-tokens]` | Token breakdown box |
| `[data-card-content]` | Main content area |
| `[data-card-section="notes\|general\|greetings\|..."]` | Active section |
| `[data-section="notes"]` | Notes section container |
| `[data-section-title]` | Section title heading |
| `[data-notes-content]` | Creator notes content |

### Card CSS Example (in Creator Notes)

```html
<style>
/* Custom hero gradient */
[data-card-hero-overlay] {
  background: linear-gradient(135deg,
    rgba(217, 70, 239, 0.3) 0%,
    rgba(59, 130, 246, 0.3) 100%) !important;
}

/* Glow effect on card image */
[data-card-image] {
  box-shadow: 0 0 30px rgba(217, 70, 239, 0.5) !important;
  border-color: var(--bi-pink) !important;
}

/* Custom name styling */
[data-card-name] {
  text-shadow: 0 0 20px rgba(217, 70, 239, 0.8);
}

/* Style the token breakdown box */
[data-card-tokens] {
  background: linear-gradient(135deg, #1a1a2e, #252542) !important;
  border-color: var(--bi-purple) !important;
}
</style>

<!-- Your regular creator notes content here -->
Welcome to my character! Here's what you need to know...
```

---

## Available CSS Variables

These CSS custom properties are available globally and can be used in your custom CSS:

### Color System

```css
/* Background colors */
--deep-space: #0d0d1a;       /* Primary background */
--cosmic-teal: #151528;      /* Secondary background */
--void: #08080f;             /* Deepest black */

/* Text colors */
--starlight: #f0f0ff;        /* Primary text */
--text-muted: #a0a0c0;       /* Muted text */

/* Accent colors (Bisexual flag inspired) */
--bi-pink: #d946ef;          /* Primary pink/magenta */
--bi-purple: #8b5cf6;        /* Bridge purple */
--bi-blue: #3b82f6;          /* Secondary blue */

/* Lighter shades */
--pink-light: #f0abfc;
--blue-light: #93c5fd;
--purple-light: #c4b5fd;

/* Semantic aliases */
--nebula: var(--bi-pink);    /* Primary accent */
--aurora: var(--bi-blue);    /* Secondary accent */
--solar: #f59e0b;            /* Warning/highlight */

/* Surface colors (elevated elements) */
--surface-1: #1a1a2e;        /* Card backgrounds */
--surface-2: #252542;        /* Elevated surfaces */
--surface-3: #2f2f52;        /* Highest elevation */

/* Status colors */
--success: #22c55e;
--error: #ef4444;
--warning: var(--solar);
```

### Usage Example

```css
[data-profile-header] {
  background: var(--surface-2);
  border-color: var(--bi-purple);
}

[data-stat-value] {
  color: var(--bi-pink);
}
```

---

## Utility Classes

These utility classes are available globally:

| Class | Description |
|-------|-------------|
| `.cosmic-gradient` | Pink-purple-blue gradient background |
| `.gradient-text` | Gradient text (pink to purple to blue) |
| `.nebula-glow` | Pink glow box shadow |
| `.aurora-glow` | Blue glow box shadow |
| `.bi-glow` | Dual pink/blue glow (left/right) |
| `.glass` | Glassmorphism effect |
| `.glass-card` | Card with glass effect + hover animation |
| `.btn-primary` | Primary button style |
| `.btn-secondary` | Secondary button style |
| `.text-gradient-bi` | Horizontal bi-flag gradient text |
| `.filter-tag` | Tag/chip styling |
| `.filter-tag.active` | Active tag state |

---

## Examples

### Cyberpunk Profile Theme

```css
/* Neon cyberpunk theme */
[data-profile] {
  --accent: #00ff88;
}

[data-profile-header] {
  background: linear-gradient(180deg, #0a0a0a 0%, #1a1a2e 100%) !important;
  border-bottom: 2px solid #00ff88 !important;
}

[data-profile-avatar] {
  border: 3px solid #00ff88 !important;
  box-shadow:
    0 0 10px #00ff88,
    0 0 20px #00ff88,
    inset 0 0 10px rgba(0, 255, 136, 0.3) !important;
}

[data-profile-displayname] {
  color: #00ff88 !important;
  text-shadow: 0 0 10px #00ff88;
}

[data-stat-value] {
  color: #00ff88 !important;
}
```

### Elegant Card Theme (in Creator Notes)

```html
<style>
/* Elegant gold theme for this character */
[data-card-hero] {
  --card-accent: #ffd700;
}

[data-card-image] {
  border: 2px solid #ffd700 !important;
  box-shadow: 0 0 30px rgba(255, 215, 0, 0.3) !important;
}

[data-card-name] {
  background: linear-gradient(90deg, #ffd700, #ffed4a, #ffd700);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

[data-card-tags] a {
  background: rgba(255, 215, 0, 0.2) !important;
  color: #ffd700 !important;
}

[data-card-tokens] {
  border: 1px solid rgba(255, 215, 0, 0.3) !important;
}
</style>

Welcome to my elegant character...
```

### Animated Background

```css
@keyframes gradientShift {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}

[data-profile-header] {
  background: linear-gradient(270deg, #d946ef, #8b5cf6, #3b82f6, #8b5cf6, #d946ef) !important;
  background-size: 400% 400% !important;
  animation: gradientShift 15s ease infinite !important;
}
```

---

## Security Notes

1. **CSS Only**: Only CSS is allowed. JavaScript will not be executed.

2. **Scoped Styles**: Your custom CSS is scoped to your profile or card page. You cannot affect other users' profiles or the global site layout.

3. **No External Resources**: `@import` and `url()` pointing to external domains are blocked. Use only the built-in variables and local assets.

4. **Max Length**: Profile CSS is limited to 10,000 characters.

5. **Use `!important` sparingly**: Many styles may need `!important` to override defaults, but use it only when necessary.

6. **Test your CSS**: Use your browser's developer tools to test changes before saving.

---

## Tips

1. **Inspect the page**: Use your browser's DevTools (F12) to inspect elements and find the exact selectors you need.

2. **Use CSS variables**: Leverage the built-in color variables for consistency with the site theme.

3. **Mobile responsiveness**: Test your custom CSS on mobile devices. Use media queries if needed:
   ```css
   @media (max-width: 768px) {
     [data-profile-avatar] {
       width: 80px !important;
       height: 80px !important;
     }
   }
   ```

4. **Transitions**: Add smooth transitions for a polished feel:
   ```css
   [data-profile-avatar] {
     transition: all 0.3s ease;
   }
   [data-profile-avatar]:hover {
     transform: scale(1.1);
   }
   ```

5. **Accessibility**: Ensure sufficient color contrast for readability. Don't hide important information.
