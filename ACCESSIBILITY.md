# Accessibility report

**Target:** WCAG 2.2 Level AA. The ADA itself has no certification or checklist. The U.S. Department of Justice and courts point to WCAG 2.1 Level AA, and WCAG 2.2 AA includes everything in 2.1 AA.

**Automated result:** 0 failures across 82 screen states, tested November 22, 2026 in headless Chromium at iPhone size (390 × 844), small-phone size (320 × 640), with 200% text, extra text spacing, and reduced motion.

- `tools/a11y_check.py` covers 66 states of the main app, including the drawing screen on iPad (portrait and landscape) and on a phone turned sideways, including the Blend tool, the bigger canvas text and colors option, the black and white style, the new Home links, favorites, and an idea's blank canvas.
- `tools/friends_check.py` covers 16 states of the real Friends tab, the grown-up area, owner tools, the privacy notice, and the permission form. It runs against a stand-in server and walks through 27 steps, from signing in to deleting a family.

**Status:** The automated checks pass. The hands-on checks below still need a person with an iPhone or iPad before you can call the app fully conformant.

## What was checked

| WCAG criterion | What the app does | Result |
| --- | --- | --- |
| 1.1.1 Non-text content | Every picture has alt text (the art's name). Decorative icons are hidden from screen readers. The drawing area has a label. | Pass |
| 1.3.1 Info and relationships | One heading per screen, headings in order, lists marked as lists, form fields with labels, color choices grouped and named. | Pass |
| 1.3.4 Orientation | Works in portrait and landscape. | Pass |
| 1.4.1 Use of color | Selected tools, colors, sizes, and tabs show a ring, border, or fill change, and screen readers announce whether each one is on. Likes fill in when on. | Pass |
| 1.4.3 Contrast (text) | Every piece of text is at least 4.5:1, including gray hint text and placeholder text. | Pass |
| 1.4.4 Resize text | Works at 200% text size with no sideways scrolling. Pinch zoom is allowed. | Pass |
| 1.4.10 Reflow | Every screen fits 320 px wide with no sideways scrolling. | Pass |
| 1.4.11 Non-text contrast | Each color swatch and shade has an outline of at least 3:1 against the page, so pale colors like white and yellow stay visible. Field and switch borders meet 3:1. | Pass |
| 1.4.12 Text spacing | Extra line, letter, and word spacing doesn't break the layout. | Pass |
| 2.1.1 Keyboard | Every button, link, field, color, shade, and size can be reached and used with a keyboard or Switch Control. The drawing screen's side panels are labeled, move focus to their title when they open, close with the X button or the Escape key, and return focus to the button that opened them. Tools and sizes are always shown in the panel, so nothing needs a long press. | Pass (see exception) |
| 2.1.2 No keyboard trap | Dialogs close with Escape and return focus. | Pass |
| 2.3.3 Animation from interactions | The color slide and button press effects turn off when Reduce Motion is on. | Pass |
| 2.4.2 Page titled | Each screen updates the page title. | Pass |
| 2.4.3 Focus order | Focus moves to the new screen's heading, into dialogs when they open, and back to the button that opened them. | Pass |
| 2.4.7 Focus visible | Every focusable item shows a dark blue outline. | Pass |
| 2.4.11 Focus not obscured | The page scrolls so focused items stay above the tab bar. | Pass |
| 2.5.3 Label in name | Buttons with hidden labels include their visible words (for example, "Try it: Draw your cat somewhere new"). | Pass |
| 2.5.1 Pointer gestures | Pinching is never the only way to zoom. Every picture viewer has − and + buttons and a Fit button, and the drawing screen has the same in its Tools panel. In the viewer, + and − on a keyboard zoom, and the arrow keys move around. | Pass |
| 2.5.7 Dragging movements | Only drawing needs dragging, which is essential to drawing. Everything else is a single tap. | Pass (see exception) |
| 2.5.8 Target size | Every target is at least 24 × 24 px. Almost all are 44 × 44 px or larger, which matches Apple's guidance. Color swatches are 42 × 44 px on an iPhone and larger on an iPad. | Pass |
| 3.1.1 Language of page | Set to English. | Pass |
| 3.2.3 Consistent navigation | The same six tabs (Home, Snap, Museum, Blank, Ideas, Friends) appear in the same order on every main screen. | Pass |
| 3.3.1 Error identification | A blocked comment, wrong sign-in code, wrong PIN, or bad invite code shows a message next to the field that says what happened and what to try. | Pass |
| 3.3.2 Labels or instructions | Every field has a visible label. | Pass |
| 4.1.2 Name, role, value | Every control has a name. Toggles report on or off, the comments switch is a switch, and the current tab is marked. | Pass |
| 4.1.3 Status messages | Messages like "Saved to your museum" are announced without moving focus. Blocked-comment messages are announced right away. | Pass |

## Exceptions

**Moving around a zoomed-in drawing needs two fingers (or the mouse wheel).** Zooming in and out and Fit are single taps, but panning a zoomed drawing has no single-tap alternative yet. In the picture viewer the arrow keys pan.

**Freehand drawing and blending need a finger, Apple Pencil, or mouse.** Drawing and smudging follow the path of your hand, which WCAG treats as an essential exception for keyboard-only use (2.1.1) and dragging (2.5.7). Every control around the canvas still works with a keyboard, VoiceOver, and Switch Control.

## Checks to do by hand

Automated tests can't hear a screen reader or feel a real touch screen. Before calling the app fully conformant, check these on an iPhone or iPad:

1. **VoiceOver** (Settings, then Accessibility, then VoiceOver): swipe through each screen. Every item should be read with a clear name, and colors and tools should announce whether they are on.
2. **Switch Control or a keyboard** on an iPad: reach every button, including color shades and sizes.
3. **Larger text** (Safari's "aA" menu, then a bigger size): every screen should still be readable.
4. **Reduce Motion** (Settings, then Accessibility, then Motion): the color slide should stop.
5. **A real photo shoot**: try a dim room and a bright room to check that feedback still reads well.
6. **A child tester**: watch a 12-year-old use it without help. The most important check is whether they can find everything.
