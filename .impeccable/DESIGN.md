---
name: Tonight’s Movie
description: A dark screening room with New Wave title cards, where one film is drawn per evening.
colors:
  ground: "#0b0b0d"
  panel: "#151518"
  line: "#2a2a2e"
  ink: "#f4f1ea"
  ink-muted: "#b7b3aa"
  live: "#f2c230"
  live-ink: "#0b0b0d"
  velvet-fill: "#8d1a28"
  velvet-text: "#f04a5e"
typography:
  display:
    fontFamily: "Familjen Grotesk, Helvetica Neue, Arial, sans-serif"
    fontSize: "clamp(28px, 4.2vw, 72px)"
    fontWeight: 700
    lineHeight: 1.02
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Familjen Grotesk, Helvetica Neue, Arial, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.2
  body:
    fontFamily: "Familjen Grotesk, Helvetica Neue, Arial, sans-serif"
    fontSize: "17px"
    fontWeight: 500
    lineHeight: 1.5
  figure:
    fontFamily: "Familjen Grotesk, Helvetica Neue, Arial, sans-serif"
    fontSize: "clamp(28px, 3vw, 48px)"
    fontWeight: 400
    lineHeight: 1
    fontFeature: "tnum"
  label:
    fontFamily: "Familjen Grotesk, Helvetica Neue, Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 700
    letterSpacing: "0.1em"
  button:
    fontFamily: "Familjen Grotesk, Helvetica Neue, Arial, sans-serif"
    fontSize: "17px"
    fontWeight: 700
    letterSpacing: "0.06em"
rounded:
  none: "0px"
spacing:
  s1: "4px"
  s2: "8px"
  s3: "12px"
  s4: "16px"
  s5: "24px"
  s6: "32px"
  s7: "48px"
  s8: "64px"
components:
  button-primary:
    backgroundColor: "{colors.live}"
    textColor: "{colors.live-ink}"
    typography: "{typography.button}"
    rounded: "{rounded.none}"
    padding: "16px 28px"
    height: "48px"
  button-primary-hover:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.live-ink}"
  button-ghost:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.none}"
    padding: "16px 28px"
    height: "48px"
  field:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "12px 14px"
    height: "48px"
  tag-offer:
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "2px 10px"
  platform-tile:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "12px 16px"
    height: "56px"
  summary-cell:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "12px 16px"
---

# Design System: Tonight’s Movie

## Overview

**Creative North Star: "The Title Card in a Dark Room"**

The product is a screening room that picks one film. New Wave title cards translated to a dark screen: near-black ground, warm off-white type in heavy uppercase, a single yellow carton for the thing to press, and velvet red for structure. Everything is flat and ruled. There are no rounded cards, no shadows, no gradients. The film poster is the only image and it is the only thing allowed to be tall and loud.

Rank is made by weight and case at one body size, like a timetable. Each screen carries one message. Durations and ratings are set light and tabular so they read like a cassette j-card. The room is a state, not a theme: during a draw the lights dim, and in screening mode they go out entirely.

The system holds across four surfaces: the presentation page (Persuade), the draw (Operate), settings (Operate) and the film browser (Operate). All share one header, one rule vocabulary and one motion grammar.

**Key Characteristics:**

- Near-black ground, off-white ink, yellow for action, red for structure.
- Familjen Grotesk only. Uppercase 700 for titles, light tabular figures for numbers.
- Zero radius. Hard 1 to 2px rules. No shadows, no gradients, no blur.
- Spacing on a fixed 4/8/12/16/24/32/48/64 scale.
- Motion that behaves like film: wipes, cuts, a slide, a dimmed room.
- Uncertainty is drawn, not colored: a dashed outline.

## Colors

A monochrome room with one lit sign. Neutrals carry 90% of any screen; yellow and red each appear sparingly and never swap roles.

### Primary

- **Carton Yellow** (`live`): the primary action and exactly one accent word per title (the year, the last line). Also the selection highlight, the keyboard focus ring, the "Rien à voir" frame and the frame that holds the landed poster during a draw. Text on it is `live-ink`.

### Secondary

- **Velvet Red, text** (`velvet-text`): structure that is read: the rule above duration and rating, their labels, the watchlist heading, the current-page underline in the header. It is lightened for legibility on the ground.
- **Velvet Red, fill** (`velvet-fill`): structure that is filled: the stripes of the popcorn bucket. Never a button, never a background for text.

### Neutral

- **Screen Black** (`ground`): page background, the draw room, the ghost button and field fill. Posters sit on slightly lifted greys (#131316 to #2f2f33 placeholders) with a 1px #3a3a3f edge.
- **Ticket Panel** (`panel`): unselected platform tiles and the import summary cells. The only raised-looking surface, and it stays flat.
- **Projector Line** (`line`): 1px dividers: header, footer, filter bar, player bar, unselected tile borders.
- **Warm Off-White** (`ink`): text, 2px outlines of fields, ghost buttons, tags and checkboxes; hover fill of the primary button.
- **Faded Ink** (`ink-muted`): labels, hints, footers, secondary lines.

### Platform brand colors (selected tiles only)

A selected platform tile takes the platform's own color as background and border, with a text color chosen for contrast. The table is hand-made and approximate, not checked against brand guidelines: Prime Video #00A8E1 (dark text), Max #2a47ff, Netflix #E50914, Disney Plus #113CCF, Canal+ #ffffff (dark text), France TV #6c3fd6, M6+ #ffc400 (dark text), Arte #fa5014 (dark text). These colors exist nowhere else in the system. An unlisted platform falls back to Carton Yellow.

### Named Rules

**The One Lit Sign Rule.** Yellow marks what to press and one word to read. If two yellow things compete on a screen, one of them is wrong.

**The Red Is Structure Rule.** Red draws rules, labels and headings that organize. It never signals an error, a warning or a call to action.

**The Dashed Doubt Rule.** An uncertain offer (À vérifier) is a dashed 2px off-white outline with its words. Color alone never carries status.

## Typography

**Display Font:** Familjen Grotesk (Google Fonts, variable 400 to 700, with Helvetica Neue, Arial, sans-serif)
**Body Font:** Familjen Grotesk (same family)
**Label/Mono Font:** none

**Character:** One grotesk, two voices. Heavy uppercase for anything that announces; medium sentence case for anything that explains. Numbers are the quiet voice: weight 400, tabular.

### Hierarchy

- **Display** (700, uppercase, clamp(28px, 4.2vw, 72px) on the draw, clamp(34px, 5.4vw, 78px) on the home hero, 1.02, -0.01em): film titles and the home question, set as stacked lines. Page titles use clamp(30px, 4.4vw, 56px).
- **Headline** (700, uppercase, 20 to 22px): section headings in settings and the three home steps.
- **Title** (700, 16px, sentence case, 1.2): film name under a poster in the grid.
- **Body** (500, 17px, 1.5): default text. Synopsis is 19px at max 56ch; home lead is 20px at max 44ch.
- **Figure** (400, clamp(28px, 3vw, 48px), tabular): duration, rating; 36px for counts in settings and the film browser.
- **Label** (700, 12px, 0.1em, uppercase, `ink-muted` or `velvet-text` over figures): field names and figure captions.
- **Button** (700, 17px, 0.06em, uppercase).

### Named Rules

**The Last Word Rule.** In a stacked title, lines are off-white and the final line (the year, or the closing words) may be yellow. One accent per title.

**The Light Figures Rule.** Durations, ratings and counts are weight 400 with tabular figures. Never bold, never proportional.

**The One Family Rule.** No second typeface, no display serif, no system fallback as a design choice.

## Layout

A full-bleed dark page with generous horizontal padding (48px on content pages, 64px on the draw room, 16px on mobile below 720 to 900px). Content pages cap at 1040px (settings) and run full width for the grid (films). The header is 64px tall with a 1px bottom line: wordmark, two uppercase nav links (Tirage, Films), and a 44px square gear button on the right.

The draw page is a three-row viewport: 64px header, a flexible room, a 72px transparent control bar with a top line. The room holds a full-height 2:3 poster (max 38vw) on the left and the info column on the right, 64px apart. Idle and "nothing found" states collapse to one centered column. Below 900px the room stacks and scrolls, the poster is 62vw, and the bar wraps with the action at full width.

Spacing is the fixed scale 4/8/12/16/24/32/48/64 (`s1` to `s8`). Section rhythm: 48px between settings sections, each opened by a 2px off-white rule. Tile grids use 8px gaps (180px min tiles in settings, 168px min posters in films, two columns on mobile). The home hero is a 1.25fr/1fr split with three posters, the middle lifted 32px; the poster reel is hidden on mobile. Tap targets are at least 44px; buttons and fields 48px.

### Named Rules

**The Scale Only Rule.** Every gap and padding is one of the eight steps. Intermediate values (6px label gaps, 14px field padding, 28px button padding) are observed drift, not precedent.

## Elevation & Depth

Flat. There are no shadows, no gradients and no blur. Depth is expressed by three means only: the 1px line, the slightly lighter panel, and the room itself. During a draw a black layer at 88% opacity dims the whole page except the poster, which is raised above it. Screening mode covers the page with pure black.

### Named Rules

**The Dark Room Rule.** Depth is light, not elevation. To make something matter, dim everything else or frame it in yellow. Never lift it with a shadow.

## Shapes

Square. Radius is 0 on every control, tile, tag, poster, field and checkbox. Outlines are hard: 1px for dividers, 2px for controls, section rules and tags, 3px for the keyboard focus ring (offset 3px) and for the landed-poster frame (offset 8px) and the "nothing found" frame. Icons are drawn SVG at one stroke weight (1.8 to 2.2 on a 16 or 20px box, square or round caps), 16px inline and 20px for the gear. The one decorative object is a popcorn bucket (off-white kernels with yellow flecks, velvet stripes) beside the home call to action. It appears nowhere else.

## Components

### Buttons

- **Shape:** square, 48px minimum height, uppercase 700 17px with 0.06em tracking.
- **Primary:** Carton Yellow fill, `live-ink` text, padding 16px 28px. Hover swaps the fill to off-white in 90ms. Active shifts down 2px. One per view.
- **Ghost:** transparent, 2px off-white border and text. On the draw page the "Relancer" button becomes ghost once a draw has begun, and hover inverts it to off-white fill with ground text.
- **Gear:** 44px square, 2px off-white border, drawn sliders icon.

### Fields and checkboxes

- **Style:** 2px off-white outline, transparent fill, 48px high, bold 16px text, a square-cap chevron on selects.
- **Focus:** 3px yellow outline, 3px offset.
- **Checkbox:** 24px square, 2px off-white border; checked fills off-white with a ground-colored drawn tick. Row height 44px.

### Offer tags

2px off-white outline, uppercase 700 14px, padding 2px 10px, 8px spacing. **À vérifier** uses the same tag with a dashed border and the words "À vérifier".

### Platform tiles

Unselected: `panel` fill, 2px `line` border, bold name, 56px high; hover brightens the border to off-white. Selected: the platform's brand color fills the tile and border, text switches to the paired contrast color, and a drawn tick appears at the right. State changes by a 90ms stepped cut, with the live count beneath updated in words.

### Import drop zone

2px dashed `ink-muted` border, centered bold line, ghost button. Imported counts are four `panel` cells with a label and a 36px light figure.

### Header and navigation

Wordmark uppercase 700 18px; links uppercase 700 14px with 0.06em tracking; current page carries a 3px velvet-red underline. Gear is the settings entry and has no label text.

### Poster

2:3, 1px #3a3a3f edge, no radius. Missing artwork falls back to a flat dark grey with the title in uppercase 700 at the bottom left. In the grid it is followed by title, a light tabular line (year · duration · rating) and a tag.

### Title block (signature)

Stacked uppercase lines that wipe in left to right; off-white lines, the last in yellow. Under it: a credit line, then a 2px velvet-red rule over two light figures (Durée, Note TMDB) with red labels, offer tags, synopsis, and the primary action.

### Draw machine and screening mode (signature)

A four-phase state machine (idle, draw, result, none). Room light is derived from the phase, dark only during a draw, so it cannot stick. See Motion below.

### Motion

Every animation is subordinate to film grammar.

- **Wipe:** titles reveal by clip-path from the left, 520ms, expo-out (0.16, 1, 0.3, 1), lines staggered by 110ms.
- **Rise:** blocks reveal from the bottom, 560 to 620ms, same easing, staggered by 70ms (grids, home posters at 450/620/790ms).
- **Cut:** state changes are 90ms stepped transitions (`steps(2)`) on background, color and border. No tweening.
- **Slide:** during a draw the poster travels to center and back to the left over 0.7s, and the info column fades out and offsets 48px left.
- **Draw sequence:** the room dims (240ms), the poster swaps starting at 70ms between swaps, slowing by 13% each time until it passes 330ms; the winner holds for 1s inside a 3px yellow frame (offset 8px); then the lights return and the title wipes in with the details.
- **Reduced motion:** all animation and transition are off. The hidden start state of reveal blocks exists only under `prefers-reduced-motion: no-preference`; the draw resolves instantly.

## Do's and Don'ts

### Do:

- **Do** use Carton Yellow for the single primary action per view and for one accent word in a title.
- **Do** draw rules with 1px `line` or 2px off-white; use 2px velvet red only over figures.
- **Do** show every uncertain offer as a dashed off-white outline labeled "À vérifier".
- **Do** set durations, ratings and counts at weight 400 with tabular figures.
- **Do** draw icons in SVG with one stroke weight and square or round caps, and label icon-only buttons with `aria-label`.
- **Do** keep a visible 3px yellow focus ring and honor `prefers-reduced-motion` on every animation.
- **Do** place state on the room: dim, frame, black out.

### Don't:

- **Don't** use border-radius, box-shadow, gradients or backdrop blur anywhere.
- **Don't** use red for buttons, errors or warnings.
- **Don't** convey availability by color alone.
- **Don't** introduce a second typeface, a bold weight above 700 or proportional figures in numbers.
- **Don't** use platform brand colors outside selected platform tiles.
- **Don't** add decorative objects beyond the single popcorn bucket on the home page.
- **Don't** add emoji or glyph characters as icons.
