Read spec/spec.md first when present for the **Design Direction** details. Then read the project's OpenSpec design doc at $spec_dir/changes/*/design.md, the proposal at $spec_dir/changes/*/proposal.md, and capability specs in $spec_dir/changes/*/specs/ for acceptance criteria. Then review and fix the implementation in $app_dir/ for the specific issues below. Keep changes minimal — fix gaps, don't redesign.

## 1. Match the spec's design direction

- Use the specified color palette, font pairing, and layout style from the spec
- If a reference design system is named (e.g., "Linear-inspired", "Stripe-inspired"), align with that aesthetic
- Do not use default framework colors (Tailwind blue-500, Bootstrap primary) unless the spec calls for them
- Tint neutrals toward the brand hue — never use pure gray (#808080) or pure black (#000000)

## 2. Interaction states

Every interactive element (buttons, links, inputs, cards) must have:
- Default, hover, and focus states
- Disabled state where applicable
- Loading state for async actions (spinner or skeleton, not frozen UI)

## 3. Loading, empty, and error states

- **Loading**: Every async operation must show a visible indicator (spinner, skeleton screen, or progress bar). No frozen/blank screens during data fetch.
- **Empty**: When no data exists yet, show a helpful message explaining what will appear and how to get started. Never show a blank white page.
- **Error**: Show what went wrong in plain language and what the user can try. Never show raw error objects, stack traces, or "Something went wrong" with no guidance.

## 4. Responsive layout

- Layout must not break at 320px, 768px, or 1024px widths
- Touch targets: 44x44px minimum on mobile
- No horizontal scrolling at any viewport
- Text remains readable at mobile sizes (minimum 14px body)
- Navigation collapses appropriately on small screens

## 5. Typography

- Maximum two font families (one heading, one body)
- Clear size hierarchy: hero > section heading > body > caption
- Body line-height: 1.5-1.6 for readability
- Line length: 45-75 characters for body text (use max-width on text containers)
- No font-loading flash — use font-display: swap or preload

## 6. Color and contrast

- Body text contrast ratio: minimum 4.5:1 against background (WCAG AA)
- Large text (18px+): minimum 3:1
- Never put gray text on colored backgrounds — use a tinted shade or transparency
- Never rely on color alone to convey information (add icons or text labels)
- Apply the 60-30-10 rule: 60% neutral, 30% secondary, 10% accent

## 7. Spacing and layout rhythm

- Use a consistent spacing scale (4px/8px base recommended)
- Vary spacing intentionally: tight between related items, generous between sections
- Do not wrap everything in cards — use whitespace and typography to create hierarchy
- Break up identical card grids with varied sizes or mixed content types

## 8. Anti-generic-AI checklist

Fix these common AI-generated design patterns if present:
- Default gray (#f3f4f6 / #e5e7eb) backgrounds with no personality
- Identical card grids with no visual variety
- Unstyled or barely-styled form inputs
- Generic gradient hero sections
- Overuse of rounded-full pill shapes everywhere
- Blue-500 as the only accent color
- Bounce or elastic easing curves (use ease-out or cubic-bezier instead)
- Cards nested inside cards nested inside cards

## 9. Micro-interactions

- Button press: subtle scale or color shift (150-200ms, ease-out)
- Page transitions: fade or slide (200-300ms)
- Respect `prefers-reduced-motion` — disable animations when set
- No animation should exceed 500ms

## 10. Code cleanup

- Remove console.log statements
- Remove commented-out code blocks
- Remove unused imports
- Ensure all images have alt text

After making changes, verify nothing is broken by checking that the app still builds and renders correctly.
