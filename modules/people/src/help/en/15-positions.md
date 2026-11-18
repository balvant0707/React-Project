---
routes: /positions, /positions/:id#position-page, /positions/:id/versions/:versionId#versions, /people/:id/fit-review#fit-review
---
# Positions and job descriptions

Here you maintain job descriptions, their versions, who holds which position and who is appointed to what (e.g. first aider).

## Position list {#list}

Under **Positions** you see all positions you may see. **New position** creates one: name, code and teams. A position can be assigned to people **directly** or **through teams**: all members of the team then hold the position. The filter **Kind** shows only positions or only appointments.

## Position page {#position-page}

Tabs:

- **Description:** the valid job description.
- **Versions:** all versions with status.
- **Holders:** who holds the position today, the direct assignments with their period (**From** and **Until**) and the history. You can also look up who held it on an earlier date. You end an assignment by setting **Until**. It then stays as history. **Delete** is only meant for mistakes.
- **Trainings:** which trainings are required for the position.

## Appointments {#appointments}

First aiders, fire wardens and similar duties are positions of the kind **Appointment** (**New position**, kind "Appointment"). For an appointment:

- It is always given to **one person directly**, never through a team.
- In the **Holders** tab choose **Appoint a person**. There you enter **from** when it applies (also in the past), optionally **until** when, and who **appointed** the person. You upload the signed **appointment letter** in the row. The person themselves and HR may read it.
- An assignment with an appointment letter cannot be deleted. End it with an **Until** date.
- You add **required trainings** (e.g. first aid) in the **Trainings** tab as for any position. Whoever is appointed gets them in the training overview and is reminded.
- An appointment is not part of the **suitability review**.

On the person page the appointments are listed below the positions, with their start date and appointment letter. Everybody can see who is appointed.

## Versions and approval {#versions}

A job description goes through: **Draft → Submitted → Published → Archived**.

1. In the "Versions" tab you create a **new draft** and edit it in the editor. The **requirements** are a list: type a requirement and press Enter. Texts already in use are suggested, a new text is learned.
2. **Submit** sends it for review.
3. Whoever may "edit all" can **return** the draft or **publish** it. The previous version is archived.

Those involved get a notification each time.

## Suitability review {#fit-review}

The suitability review regularly answers: **does the person meet the requirements of their position(s)?** COMPASS stores only the result of your review, not the person's skills.

1. Open the person and choose **Review suitability** in the **Suitability review** card. (An overview of everybody is under Positions in the tab **Suitability reviews**.)
2. COMPASS combines the requirements of **all positions** the person holds. A requirement several positions have appears once. Beside it stands the finding of the **last review**.
3. Rate every requirement by hand as **Fulfilled** or **Deviation** and add a comment where needed. The overall result follows: one deviation is enough.
4. Enter a note and, for deviations, a **measure** with a date and status.
5. The date of the **next review** is set to one year after the review. You can change it.

The status per person: **Never reviewed**, **Overdue**, **Due soon** (30 days) or **Up to date**. Whoever may review gets a message on Mondays when cases are due. Every review records which **version** of the job description it was checked against. Reviews are never deleted; **Correct** changes an existing review, the **print view** on the person card collects all reviews for the audit. A separate right (Suitability reviews, independent of job descriptions) decides who may review: leads review their team and the people below them, HR everybody. The reviewed person sees their reviews only if that right was granted explicitly.

A position without a published job description is not part of the review; COMPASS points this out.

## Printing {#print}

**Print view** creates a print-ready page of the published version with fields for date and signature of supervisor and position holder. An unpublished version is marked "Not valid".

## Rights {#rights}

Everyone sees their own position. Managers see and edit the positions of their team, HR all of them. Only HR deletes archived versions and log entries, solely to correct mistakes.
