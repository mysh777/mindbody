# UI Rules

## Language

All user-facing text in the app must be in English. Mindbody names (services, tariffs, clients) stay as in Mindbody.

This covers page titles, labels, "what this page is for" lines, hints, error and empty-state messages, generated summaries, and Excel/PDF exports (sheet names, column headers). Dates and numbers are formatted with English locales (`en-GB`), never `ru-RU`.

Check before finishing any change: no Cyrillic characters in `src/` (`/[\u0400-\u04FF]/`).
