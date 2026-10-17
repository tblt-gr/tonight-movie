---
name: Tonight’s Movie
description: A calm cinema inspired interface for choosing what to watch tonight.
colors:
  background: "#0d1724"
  panel: "#152333"
  line: "#304456"
  text: "#f6f2e9"
  muted: "#b3c0c5"
  owned: "#72de9a"
  other: "#7eb8d6"
  unavailable: "#e5c68a"
  focus: "#b0e9c2"
typography:
  display:
    fontFamily: "Georgia, Times New Roman, serif"
    fontSize: "clamp(44px, 5.6vw, 78px)"
    fontWeight: 400
    lineHeight: 1.04
    letterSpacing: "-0.055em"
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.6
rounded:
  small: "4px"
  control: "6px"
  dialog: "10px"
spacing:
  small: "8px"
  medium: "16px"
  large: "28px"
components:
  primary-button:
    backgroundColor: "{colors.owned}"
    textColor: "#102919"
    rounded: "{rounded.control}"
    padding: "11px 16px"
---

## Direction

Tonight’s Movie has its own visual identity. The midnight blue background keeps posters vivid; cream softens long reading; fresh green marks actions and films included in selected subscriptions. Blue and pale gold are reserved for other offers and unavailable status. The green is intentionally a new shade rather than a copied brand mark.

An editorial serif introduces the evening’s choice. Utility text and data use a compact sans serif. A small `T·M` monogram replaces the three colored dots associated with Letterboxd. Rounded category pills, quiet panels and restrained borders separate actions without wrapping every film in a card.

The username entry comes before the catalogue. The current collection and collection date remain visible. Filters stay at the left on wide screens and move above the films on narrow screens. The platform picker uses a Radix dialog for keyboard focus and accessible naming; each provider has an icon when the source supplies one, with a letter fallback.

The random draw is a prominent single action, with criteria in an accordion. Reduced motion preferences disable its dice animation. Text accompanies status color and icons, and all controls receive a visible keyboard focus ring.
