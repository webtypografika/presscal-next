# Wizard Design System Rules

## Layout

- Every section uses **2-column layout**: left label column (w-32) + right content
- Left label has a **3px colored left border** (accent color varies per step category)
- Label column: bold uppercase title (0.85rem) + gray subtitle (0.65rem)
- Sections separated by `border-t` + `pt-5` spacing

## Section Accent Colors

| Category | Color Variable | Used in |
|----------|---------------|---------|
| Machine identity | `var(--violet)` | Welcome, AI Scan, Thickness |
| Dimensions | `var(--blue)` | Paper, Parts |
| Margins | `var(--teal)` | Margins, Maintenance |
| Machine config | `var(--accent)` | Towers, Inks, Contacts |
| Production/Cost | `var(--success)` | Setup, Depreciation |
| Chemicals | `var(--danger)` | Cleaning chemicals |

## Components (from wizard-ui.tsx)

| Component | Purpose |
|-----------|---------|
| `WizSection` | 2-column section with colored left border |
| `Field` | Label above input |
| `NumInput` | Number input with thousand separators |
| `Row` | Consistent row styling (bg-white/[0.03]) |
| `RowLabel` | Colored label pill inside a Row |
| `PillToggle` | Multi-option toggle |
| `Toggle` | On/Off pill button |
| `ColHeaders` | Column header labels |
| `AddButton` | Dashed "+" button |

## Wizard Shell Header

1. Compact header: title + step counter
2. Progress bar with visible steps only (skip hidden)
3. **Step number in orange**: "ΒΗΜΑ X" uppercase tracking
4. Large step title (text-xl bold)
5. Subtitle below (text-sm dim)

## Input Rules

- Always use `Field` wrapper (label above input)
- Number fields: `NumInput` with thousand separators (el-GR)
- Text inputs: `inputCls` base class
- Grid layouts: `grid-cols-2` or `grid-cols-3` with `gap-3`

## Toggle Rules

- Round pill style (`rounded-full`)
- Orange when active, glass border when inactive
- Always with text labels ("Ναι"/"Όχι" or descriptive)

## Row Rules

- Standard rows: `bg-white/[0.03]` rounded-lg p-3
- Special/extra items: `border-dashed border-accent/30 bg-white/[0.02]`
- No colored row backgrounds (no bg-cyan-500/10 etc.)
- Color only on the text label (RowLabel with cls)

## Spacing Rules

- Between sections: border-t + pt-5
- Between fields in grid: gap-3
- Between rows: space-y-3 (from WizSection)
- Section padding: px-6 in shell, internal via flex gap-5

## Typography

- Section title: 0.85rem font-black uppercase tracking-wide
- Section subtitle: 0.65rem text-muted
- Field labels: 0.6rem font-semibold text-muted
- Row labels: text-sm font-bold
- Input text: text-sm
- Info text: 0.6rem text-muted
