---
routes: /trainings, /trainings/sessions/:id#sessions
---
# Trainings

COMPASS records who completed which training, when it expires and what is missing. Proof files are stored with the training.

## Matrix {#matrix}

The **Matrix** tab shows people against trainings. Every cell shows the valid-until date, coloured:

- **Green (Valid)**
- **Orange (Due soon)**
- **Gold (Reinstruction due)**: still valid, but an [operating instruction](help:operating-instructions#trainings) of the training was changed significantly or newly added.
- **Red (Expired)**
- **Missing** (required but not present) and **Exempt** (with a reason).

Filters for team, category and search. "Only what needs action" hides everything valid. A click on a cell opens the person's trainings.

## Due soon {#due}

The **Due soon** tab lists expired, missing and soon-to-expire entries.

## Catalogue {#catalogue}

In the **Catalogue** HR defines the training types: category, validity in months or one-off, reminder lead time, whether a certificate is required, who is responsible (the participant's supervisor, a specific person or an external named as text) and how long data is kept after exit. It also decides **for which teams, roles and positions** a training is required. A person's requirements are the union of all three and the requirements set for that person alone. Under **Operating instructions taught** you choose the operating instructions the training teaches, e.g. all instructions of a department's yearly instruction. See [Operating instructions](help:operating-instructions#trainings).

## Recording and renewing {#record}

In a person's trainings (person page or matrix) there are **Add record** and **Renew**. You enter date, trainer and note and add proof (certificates, photos). A certificate is never required to save: it can be added any time later. For several people or several trainings at once, plan a [session](help:trainings#sessions).

Supervisors (and the deputies of a supervisor) edit the trainings of the people below them, at any level, if their role allows it; HR edits everyone's. Sharing a team is not enough. Someone without a supervisor entered is only visible to HR, so ask HR to fill in the supervisor. You can only pick people you may edit. Records are never deleted, so the history is kept.

## Sessions {#sessions}

A **session** bundles one instruction for several people and several trainings, for example fire safety and hazardous substances on the same date.

1. **Plan a training** (top of the page): choose the trainings, date, trainer, place and the people invited, a whole team too. **Additional content** holds points of this session only.
2. **Print attendance sheet**: the form lists the content of every training from the catalogue, the additional points and everybody invited with a field to sign below the confirmation ("I have understood the content of the instruction above …"). If a training teaches operating instructions, they are listed below it with number and version. Three blank lines for latecomers.
3. After the training, untick on the session who did **not** attend, add people or take them off the list.
4. **Confirm**: only now the records are created, one per participant and training, dated on the session. Afterwards date, trainings and list are fixed; somebody forgotten can still be added and gets the records at once.

Upload the signed sheet or a certificate under **Proof** of the session, weeks later too. It counts for every participant and shows on their records. HR keeps the content of a training in the catalogue (field **Content**). The **Sessions** tab shows the planned ones first, then the confirmed ones.

## Require a training for one person {#require-person}

If only one person needs a training and there is no record yet, open their trainings (person page) and choose **Require a training**. The training then shows as **Missing** in the matrix and in the reminders until a record is added. **Remove requirement** takes it back. Supervisors do this for the people below them, HR for everybody. For whole groups use team, role or position in the catalogue.

## Reminders {#reminders}

Anyone with a required training that is about to expire, has expired, is missing or needs a reinstruction gets a bell message (once per expiry date; for expired, missing and reinstruction at once, then weekly). Supervisors who may act get one summary line per day. Switch it off in the [profile](help:profile#reminders).
