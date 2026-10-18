---
version: 1
slug: "app-tirage-page-tsx"
primary_target: "app/tirage/page.tsx"
related_targets: ["app/page.tsx", "app/reglages/page.tsx", "app/films/page.tsx"]
---

# Draw surface (/tirage) and product charter

Mode: Operate. The visitor decides what to watch tonight. The presentation page (`/`) is a Persuade surface inside the same world; settings (`/reglages`) and browse (`/films`) are Operate.

Audience and job: French film watchers, evening, on a sofa, phone or laptop, tired of choosing. Action: draw one film they can watch now. Proof: real poster, duration, TMDB rating, French streaming services. Constraints: no account, data in the browser, French UI copy, WCAG 2.2 AA, reduced motion respected, an uncertain offer is shown as À vérifier (dashed outline, never a color alone).

## Direction contract

THESIS: The drawn film arrives like a title card in a dark room: the lights go down, one poster cuts by, it lands, then the room comes back with the film's details. Refuses the rounded-card streaming grid.

OWN-WORLD: New Wave title cards translated to a dark screen. Near-black `#0b0b0d`, warm off-white `#f4f1ea`, yellow carton `#f2c230` for the primary action and one accent word per title, velvet red (`#8d1a28` fill, `#f04a5e` for text) for structure such as rules, labels and the watchlist heading. Familjen Grotesk, uppercase titles, bare off-white with the accent on the last word or the year; no bands, gradients, rounded cards or shadows. Selected platform tiles take the platform's own brand color.

STORY: The visitor understands in a second that one film will be picked from what they own, presses once, watches the room go dark and posters cut by, sees the chosen poster hold for a moment, then reads everything needed to press play, or starts the screening where the lights go out.

FIRST VIEWPORT: Result state. Poster at full height on the left; right column: title in large uppercase off-white with the year in yellow, a red rule, red labels over light-weight duration and rating, offer links with logo and brand color, short synopsis. A transparent bottom control bar holds source, max duration, the seen checkbox and a yellow "Relancer". Start state: no film, one prompt and one yellow button. Draw state: the room dims, the poster sits centered.

FORM: Title-card world (assigned direction, position 5 of the grounded list), owner's palette and type replacing the first blue, white and red. seed: 9e35093fa4787856. Raises kept: rank by weight and case with one body size (timetable), one message per screen (airport signage), light tabular figures for durations (cassette j-card).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved decisions

Animation timing is final in the mockups (swap 70 ms slowing past 330 ms, 1 s hold, 0.7 s slide). Display face is self-hosted from the Google Fonts file when built. Platform brand colors come from a hand-made table, approximate until checked against each brand.
