# Academy source documents

Drop coaching PDFs here one at a time. Film Room treats them as **private reference material** only.

## How to add a document

1. Copy a PDF into this folder.
2. From the repo root, run:

```bash
npm run academy:sources:all
```

Or step by step:

```bash
npm run academy:sources:register
npm run academy:sources:extract
npm run academy:sources:index
npm run academy:sources:queue
npm run academy:validate
```

3. Review the reports under `reports/academy/`.

You can repeat those commands after each upload. The pipeline is idempotent and processes every PDF currently in this directory.

Extracted page text and source registry JSON stay local under `data/academy/` and are gitignored. Never commit them.

## Rules

- Do **not** commit PDFs to git (they are gitignored).
- Do **not** expose these files publicly in the app.
- Do **not** copy diagrams or long passages into Academy content.
- Generated Film Room lessons must be original wording and original board layouts.
- All generated content starts as editorial `draft` and requires human review before approval.
- Do not claim affiliation with US Soccer, FAI, FIFA, UEFA, FA, Guardiola, or other brands unless licensing and attribution are explicitly documented.

## Expected examples

Any PDF name works. Examples you may upload:

- `300-soccer-drills-practice-plans.pdf`
- `51Shooting_Drills.pdf`
- `Canning-City-Curriculum-2017-U14-to-U18.pdf`
- `PDP-1-Booklet.pdf`
- `Pep-Guardiola-soccer-drills-PDF.pdf`
- `Warm-up-exercises-with-ball.pdf`
