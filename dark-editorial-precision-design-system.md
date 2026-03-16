# Dark Editorial Precision — Design System

A sophisticated, nearly-monochromatic dark palette with a single vivid emerald accent.
Unexpected serif typography for headings creates a premium, authoritative feel.
Generous whitespace, subtle grain texture, scroll-triggered animations, and editorial section numbering.

---

## 1. Color Palette

| Token | Hex | Usage |
|-------|-----|-------|
| `dark-bg` | `#08080a` | Page background |
| `dark-raised` | `#0f0f12` | Elevated sections, chat header |
| `dark-surface` | `#161619` | Cards, panels, inputs |
| `dark-surface-light` | `#1c1c20` | Hover states on surfaces |
| `dark-border` | `#232328` | Default borders |
| `dark-border-subtle` | `#1a1a1e` | Subtle dividers |
| `accent` | `#00e5a0` | Primary action color (vivid emerald) |
| `accent-dim` | `#00cc8e` | Hover state for accent |
| `text-primary` | `#f4f4f5` | Primary text |
| `text-secondary` | `#a1a1aa` | Secondary/body text |
| `text-muted` | `#52525b` | Muted labels, captions |

**Key principle:** Single accent color only. No secondary colors. Hierarchy comes from opacity variations of accent (`accent/8`, `accent/15`, `accent/30`, `accent/50`).

**Selection color:** Accent background with dark-bg text.

---

## 2. Typography

| Role | Font | Source | Weight(s) |
|------|------|--------|-----------|
| Display / Headings | **Instrument Serif** | Google Fonts | 400 regular, 400 italic |
| Body / UI | **Outfit** | Google Fonts | 300–700 |
| Code / Mono | **JetBrains Mono** | Google Fonts | 400 |

### Google Fonts URL

```
https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400&family=Outfit:wght@300;400;500;600;700&display=swap
```

### Scale

| Element | Size | Font |
|---------|------|------|
| Hero heading | `text-4xl` → `text-7xl` (responsive) | Instrument Serif |
| Section heading | `text-3xl` → `text-5xl` | Instrument Serif |
| Section number | `text-5xl` → `text-6xl` | Instrument Serif, accent/30 |
| Category heading | `text-xl` | Instrument Serif |
| Card title | `text-base` or `text-lg` | Outfit, semibold |
| Body text | `text-sm` or `text-base` | Outfit |
| Label / Caption | `text-[11px]` uppercase tracking-wider | Outfit |
| Code | `text-sm` | JetBrains Mono |
| Nav links | `text-[13px]` uppercase tracking-wide | Outfit, medium |

### Signature Move
The word or phrase you want to emphasize in headings gets `text-accent italic` (Instrument Serif italic in emerald).

```html
<h1 class="font-serif text-7xl text-text-primary">
  Secure Remote Access,<br />
  <span class="text-accent italic">From Your Browser</span>
</h1>
```

---

## 3. Tailwind CSS 4 Theme

Drop this into your `global.css` (or equivalent):

```css
@import "tailwindcss";

@theme {
  /* Background scale */
  --color-dark-bg: #08080a;
  --color-dark-raised: #0f0f12;
  --color-dark-surface: #161619;
  --color-dark-surface-light: #1c1c20;

  /* Borders */
  --color-dark-border: #232328;
  --color-dark-border-subtle: #1a1a1e;

  /* Accent */
  --color-accent: #00e5a0;
  --color-accent-dim: #00cc8e;

  /* Text */
  --color-text-primary: #f4f4f5;
  --color-text-secondary: #a1a1aa;
  --color-text-muted: #52525b;

  /* Fonts */
  --font-sans: 'Outfit', system-ui, sans-serif;
  --font-serif: 'Instrument Serif', Georgia, serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
}

html { scroll-behavior: smooth; }

body {
  font-family: var(--font-sans);
  background-color: var(--color-dark-bg);
  color: var(--color-text-primary);
}

::selection {
  background-color: var(--color-accent);
  color: var(--color-dark-bg);
}
```

This generates Tailwind utilities like `bg-dark-bg`, `text-accent`, `border-dark-border`, `font-serif`, `font-mono`, etc.

---

## 4. Grain Texture Overlay

A barely-visible SVG noise texture pinned over the entire viewport for depth:

```css
body::after {
  content: '';
  position: fixed;
  inset: 0;
  z-index: 9999;
  pointer-events: none;
  opacity: 0.028;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.7' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}
```

---

## 5. Scroll-Triggered Animations

### CSS

```css
[data-animate] {
  opacity: 0;
  transform: translateY(20px);
  transition:
    opacity 0.7s cubic-bezier(0.16, 1, 0.3, 1),
    transform 0.7s cubic-bezier(0.16, 1, 0.3, 1);
}

[data-animate].is-visible {
  opacity: 1;
  transform: translateY(0);
}

[data-animate][data-delay="1"] { transition-delay: 0.1s; }
[data-animate][data-delay="2"] { transition-delay: 0.2s; }
[data-animate][data-delay="3"] { transition-delay: 0.3s; }
[data-animate][data-delay="4"] { transition-delay: 0.4s; }
[data-animate][data-delay="5"] { transition-delay: 0.5s; }
[data-animate][data-delay="6"] { transition-delay: 0.6s; }
```

### JavaScript (place before `</body>`)

```html
<script>
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.08, rootMargin: '0px 0px -40px 0px' }
  );
  document.querySelectorAll('[data-animate]').forEach((el) => observer.observe(el));
</script>
```

### Usage

```html
<!-- Single element -->
<div data-animate>Content fades in</div>

<!-- Staggered group -->
<div data-animate data-delay="1">First</div>
<div data-animate data-delay="2">Second</div>
<div data-animate data-delay="3">Third</div>
```

---

## 6. Background Animations

### Floating Gradient Orb (Hero)

```css
@keyframes float {
  0%, 100% { transform: translate(0, 0) scale(1); }
  33% { transform: translate(30px, -25px) scale(1.02); }
  66% { transform: translate(-20px, 15px) scale(0.98); }
}
```

```html
<!-- Primary orb -->
<div
  class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full bg-accent/[0.04] blur-[150px] pointer-events-none"
  style="animation: float 25s ease-in-out infinite;"
  aria-hidden="true"
></div>

<!-- Secondary orb (reversed) -->
<div
  class="absolute top-1/4 right-1/4 w-[400px] h-[400px] rounded-full bg-accent/[0.03] blur-[100px] pointer-events-none"
  style="animation: float 20s ease-in-out infinite reverse;"
  aria-hidden="true"
></div>
```

### Grid Dot Pattern (Hero background)

```html
<div
  class="absolute inset-0 pointer-events-none opacity-[0.04]"
  style="background-image: radial-gradient(circle, #a1a1aa 1px, transparent 1px); background-size: 40px 40px;"
  aria-hidden="true"
></div>
```

---

## 7. Component Patterns

### Editorial Section Header (with number)

```html
<span class="block font-serif text-accent/30 text-5xl sm:text-6xl mb-2 select-none" aria-hidden="true">
  01
</span>
<h2 class="text-3xl sm:text-4xl lg:text-5xl font-serif text-text-primary mb-4 leading-tight">
  Section Title
</h2>
<p class="text-base sm:text-lg text-text-secondary max-w-2xl mx-auto leading-relaxed">
  Subtitle text goes here.
</p>
```

### Category Header (with line)

```html
<div class="flex items-center gap-4 mb-8">
  <span class="font-serif text-xl text-accent/30 select-none">01</span>
  <h3 class="text-xl font-serif text-text-primary">Category Name</h3>
  <div class="flex-1 h-px bg-dark-border/60"></div>
</div>
```

### Feature Card (with accent left bar)

```html
<div class="group relative bg-dark-surface/60 border border-dark-border/60 rounded-xl p-6 hover:border-accent/25 transition-all duration-500">
  <!-- Accent left bar (appears on hover) -->
  <div class="absolute left-0 top-4 bottom-4 w-[2px] bg-accent/0 group-hover:bg-accent/60 transition-all duration-500 rounded-full"></div>

  <div class="w-10 h-10 rounded-lg bg-accent/8 flex items-center justify-center mb-4 text-accent group-hover:bg-accent/12 transition-colors duration-500">
    <!-- icon SVG here -->
  </div>
  <h3 class="text-base font-semibold text-text-primary mb-2">Title</h3>
  <p class="text-sm text-text-secondary leading-relaxed">Description</p>
</div>
```

### Terminal-Style Credentials Block

```html
<div class="bg-dark-bg border border-dark-border/60 rounded-xl p-6 font-mono text-sm">
  <!-- Window dots -->
  <div class="flex items-center gap-2 mb-4 pb-3 border-b border-dark-border/40">
    <span class="w-2.5 h-2.5 rounded-full bg-accent/40"></span>
    <span class="w-2.5 h-2.5 rounded-full bg-text-muted/30"></span>
    <span class="w-2.5 h-2.5 rounded-full bg-text-muted/30"></span>
    <span class="text-[11px] text-text-muted ml-2">title</span>
  </div>
  <!-- Rows -->
  <div class="space-y-2.5">
    <div class="flex items-center gap-3">
      <span class="text-accent">$</span>
      <span class="text-text-muted w-20">Label</span>
      <span class="text-text-primary flex-1 text-right">value</span>
    </div>
  </div>
</div>
```

### Section Dot Divider

```css
.section-dot-divider {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0 2rem;
}
.section-dot-divider::before,
.section-dot-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--color-dark-border);
}
```

```html
<div class="section-dot-divider max-w-xs mx-auto">
  <span class="w-1.5 h-1.5 rounded-full bg-accent/40"></span>
</div>
```

### Accent Underline Link

```css
.accent-link {
  position: relative;
  text-decoration: none;
}
.accent-link::after {
  content: '';
  position: absolute;
  bottom: -2px;
  left: 0;
  width: 0;
  height: 1px;
  background: var(--color-accent);
  transition: width 0.3s ease;
}
.accent-link:hover::after {
  width: 100%;
}
```

### Bullet Point

Use small emerald dots instead of traditional bullets:

```html
<div class="flex items-start gap-3">
  <span class="w-1.5 h-1.5 rounded-full bg-accent/50 mt-2 shrink-0"></span>
  <p class="text-text-secondary text-sm">Item text</p>
</div>
```

### Value Props (numbered columns with dividers)

```html
<div class="grid grid-cols-1 md:grid-cols-3">
  <div class="relative p-8 sm:p-10 md:border-r md:border-dark-border/60">
    <div class="flex items-center gap-4 mb-5">
      <span class="font-serif text-2xl text-accent/25 select-none">01</span>
      <div class="w-10 h-10 rounded-lg bg-accent/8 flex items-center justify-center text-accent">
        <!-- icon -->
      </div>
    </div>
    <h3 class="text-lg font-serif text-text-primary mb-3">Title</h3>
    <p class="text-sm text-text-secondary leading-relaxed">Description</p>
  </div>
  <!-- repeat for 02, 03 -->
</div>
```

---

## 8. Button Styles

### Primary (accent)

```html
<a class="inline-flex items-center gap-2.5 px-8 py-3.5 text-[15px] font-semibold text-dark-bg bg-accent hover:bg-accent-dim rounded-lg transition-colors duration-300">
  Button Text
</a>
```

### Secondary (surface + border)

```html
<a class="inline-flex items-center gap-2.5 px-8 py-3.5 text-[15px] font-semibold text-text-secondary bg-dark-surface border border-dark-border hover:border-accent/30 hover:text-text-primary rounded-lg transition-all duration-300">
  Button Text
</a>
```

### Ghost (text only)

```html
<a class="inline-flex items-center gap-2.5 px-6 py-3 text-[15px] font-semibold text-text-secondary hover:text-accent transition-colors duration-300">
  Button Text
</a>
```

---

## 9. Badge / Pill

```html
<span class="inline-flex items-center gap-2 px-4 py-1.5 text-[11px] font-medium text-accent uppercase tracking-[0.15em] bg-accent/[0.06] border border-accent/15 rounded-full">
  Badge Text
</span>
```

---

## 10. Header (Navigation)

- Fixed, backdrop-blur-xl, bg-dark-bg/80
- Logo in `font-serif`
- Nav links: `text-[13px]` uppercase, tracking-wide, `.accent-link` for animated underline
- Active link: `text-accent`
- Inactive: `text-text-secondary` → `hover:text-text-primary`
- GitHub CTA: secondary button style
- Border: `border-dark-border/60`

---

## 11. Footer

- Two or three columns using `grid-cols-12`
- Section headers: `text-[11px] uppercase tracking-[0.15em] text-text-muted`
- Links: `text-sm text-text-secondary hover:text-accent`
- Bottom bar with copyright: `text-xs text-text-muted`
- Top border: `border-dark-border/60`

---

## 12. Key Design Principles

1. **Single accent color.** All visual emphasis comes from emerald (#00e5a0) at varying opacities. No secondary colors.

2. **Serif for authority.** Display headings use Instrument Serif — unexpected for tech/security, which makes it memorable. Italic variant for emphasis phrases.

3. **Opacity as a tool.** Borders use `/60`, backgrounds use `/8` or `/[0.06]`, numbers use `/30`. This creates hierarchy without introducing new colors.

4. **Generous spacing.** Sections use `py-24 sm:py-32`. Cards use `p-6` or `p-8`. Let the content breathe.

5. **Editorial numbering.** Major sections get two-digit numbers (01, 02, 03) in large serif at `accent/30` opacity. This creates visual rhythm and scannability.

6. **Subtle animation.** Scroll-triggered fade-in-up with 0.7s duration and staggered delays. Never flashy — just enough to feel alive.

7. **Grain texture.** The full-viewport noise overlay at 2.8% opacity adds analog depth to the digital surface.

8. **Terminal aesthetic.** Code blocks and credential displays use the "window dots" pattern (green dot + 2 gray dots) and `$` prompts in accent color.

9. **Transition duration: 300ms or 500ms.** Fast enough to feel responsive, slow enough to feel refined. Use `duration-300` for color changes, `duration-500` for structural changes (borders, backgrounds).

10. **Icon stroke width: 1.5.** Thinner than the default 2 — matches the refined, editorial feel.
