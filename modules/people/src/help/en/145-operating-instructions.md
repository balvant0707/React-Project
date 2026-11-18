---
routes: /operating-instructions#mine, /operating-instructions/:id#page, /operating-instructions/:id/versions/:versionId#editor
---
# Operating instructions

Operating instructions for **hazardous substances** and **machines**: versioned, approved by occupational safety and printed as one A4 page. Everybody may read them. Their owners write them, and the role **Occupational safety** approves them.

## List {#list}

The tab **All** under **Operating instructions** lists every instruction with its number (**BA-0001**, consecutive), title, kind, pictograms, version, next review and languages. The search finds the number, the old number, the title, the substance and the work area. The filter **Review overdue** shows what needs looking at.

**New operating instruction** (occupational safety) creates an instruction with its first draft. The **kind** decides the sections and the colour, and it cannot be changed later:

| Kind | Colour | Sections |
|---|---|---|
| Hazardous substance | orange | Scope, hazards to people and the environment, protective measures and rules of conduct, behaviour in case of danger, first aid, proper disposal |
| Machine | blue | Scope, hazards to people and the environment, protective measures and rules of conduct, behaviour in case of faults, first aid, maintenance |

## The page of an operating instruction {#page}

On the left you see the instruction as it is printed. Above it you pick the **version** and the **language**. On the right:

- **Details:** number, old number, owner, valid from, next review, languages.
- **Applies to:** assets (the instruction then also applies to everything below them) and asset types (every asset of that type). On the asset page it appears in the tab **Operating instructions**.
- **Versions** and **History** (submitted, returned, published, reviewed, translations).

**Reviewed, no change** (occupational safety) confirms the yearly review. Only the date of the next review moves; no new version is created. An instruction that was never published can be deleted. Every other one is **deactivated**.

## Editing a draft {#editor}

A published version never changes. **New version** creates a copy with all languages. In a draft:

- **Signal word** (substances only), **Valid from** and **What changed**.
- Tick **People must be instructed again** for an important change. See [Instructions in trainings](help:operating-instructions#trainings).
- For each section: click the **pictograms** (GHS, warning, mandatory, prohibition, emergency and fire signs) and write the text. The pictograms apply to every language.
- **Preview** shows the page with every section, including empty ones.

> The owner submits an instruction with **Submit for approval**. Occupational safety checks it and either **returns** it with a note or **approves** it. Approval archives the old version, and the next review is due one year after "valid from".

## Languages and translations {#languages}

**German is the master language.** Other languages are translations of the same version. The language switch changes the language you are editing. Under each field you see the German text for comparison. You add another language by its two-letter code, e.g. `pl` or `tr`.

- If you change the German text in a draft, the translations are marked **check** until they are saved again.
- Occupational safety may also add or correct translations on a **published** version. The German text stays as approved. Every such change is listed in the history.

## My operating instructions {#mine}

The tab **Mine** shows the operating instructions you must know. They come through your required trainings (position, team, role or set for you alone). On the left is the list with the state (with a search by number, title, substance and work area): **Instructed** (date and version), **Reinstruction due** or **Not instructed yet**. On the right you see the instruction as a page, in your language when there is a translation. On a phone a tap opens the instruction. Every instruction is in the tab **All**.

## Instructions in trainings {#trainings}

Operating instructions are taught through **trainings**. In the [training catalogue](help:trainings#catalogue) you choose for each training the instructions it teaches. A yearly instruction can cover many of them. Everybody who needs the training must know these instructions.

- Every training record remembers which **version** of each instruction was valid on the day of the training.
- When a version is published with **People must be instructed again**, or an instruction is newly added to a training, the training shows **Reinstruction due** for everybody instructed on an older version. They are reminded too.
- **Editorial changes** (typos, wording, layout) trigger no reinstruction. When approving version 2 or later, occupational safety explicitly chooses **Editorial change** or **Significant change**. The version list shows the classification as a tag. **Change classification** corrects it afterwards; the status of everybody concerned follows at once, and the change is listed in the history.
- The attendance sheet of a [session](help:trainings#sessions) lists the instructions with number and version.
- The instruction's page shows under **Taught in** which trainings teach it. The person page and the position's **Trainings** tab show the instructions that apply there.

## Excel export and import {#excel}

With **Excel** on the tab **All** you edit many instructions at once or have them translated.

- **Export** writes the instructions of the current filters into a file, one row per language. If there is an open draft, the file holds the draft, else the published version. You choose the languages; a language without a translation gets empty rows to fill in.
- **Empty template** is the same file without instructions, for new ones.
- The sheet **Guide** in the file explains the columns, the sheet **Signs** lists every pictogram code.

The main rules:

- Kind, signal word, pictograms, assets, asset types and trainings count only on the **German row**.
- **New instruction:** leave the number empty. Translation rows without a number right below it belong to it.
- **Text:** every line a paragraph, `- ` at the start a bullet, `1. ` a numbered list, `**bold**`. A paragraph that should start like that without becoming a list gets a backslash in front (`\1. Help`). A line break inside a cell is Alt+Enter. Changing a cell replaces the whole section; italics or links are lost, the preview warns about it.
- **Pictograms:** codes separated by commas, e.g. `GHS02, GHS07`.
- **Links:** names separated by semicolons. Assets are written with their path (`Plant / Line 2 / Pump`); the name alone is enough when it is unique. An empty cell leaves everything as it is; `-` removes all.
- **checksum:** do not change. If an instruction changed in COMPASS since the export, the import refuses it instead of overwriting the change. Export again then.

**Import** compares the file with the current state and shows a preview: what changes for each instruction and what is not possible. Only **Apply** writes. Rows with errors are left out.

> The import **never publishes**. Changes go into the open draft or a new version, which you submit and approve as usual. A submitted draft is not changed. Translations alone of a published version go straight onto it when occupational safety imports them.

## Printing {#print}

**Print** opens the print view of the chosen version in the chosen language. An instruction normally fits on one A4 page. At the bottom you find the approval, the next review and a QR code that leads to the current version in the app, so an outdated notice is easy to spot. Drafts are marked **Not valid**.
