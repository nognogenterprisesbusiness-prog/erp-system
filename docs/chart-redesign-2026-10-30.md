# Existing chart redesign — 30 October 2026

Reference: the custom SVG charts in the user-provided `D:/Client-Project/handoff` prototype. The ERP retains its existing line chart for monthly expenses, area chart for material consumption and donut for posted project costs. No prototype backend, global styling, mock data or chart dependency was copied.

Trend charts now have subtle area gradients, a selected-month crosshair, exact values in an HTML legend, keyboard/touch month buttons and series highlighting. The latest month is selected initially. Units remain separate; the existing unit picker stays available. Axis labels retain readable HTML font sizing at narrow widths, while theme-specific colors support the existing blue and charcoal themes. Scale geometry preserves zero, small fractional values and negative net values; a single month is centered.

The project donut preserves the posted-cost denominator and category amounts. Segments and legend entries highlight together, with percentage and amount labels. Null categories remain “Not posted.” The legend stacks below the ring in narrow cards through a container query rather than relying on viewport width. Reduced-motion preferences are respected.

No queries, cost postings, permissions, financial calculations, migrations or mobile code changed. New chart interaction state affects presentation only.

Verification: 120 web/domain tests pass, including scale/position regressions; lint, TypeScript and production build pass. Read-only authenticated browser checks verified both dashboard charts, exact September values, project cost percentages, keyboard focus, 390px layout without horizontal overflow and blue-dark contrast. Original light appearance and default viewport were restored. Browser error log was empty. Screenshots are saved outside the repository under `D:/Client-Project/output/chart-redesign-20261030/`.
