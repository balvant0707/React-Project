---
routes: /checklists
---
# Worksheets

Worksheets are points to work through inside a task. There are official templates and own lists per task.

## Managing templates {#templates}

Under **Worksheets** you maintain the template library. **New template** opens the editor.

- **Kinds of points:** heading, tick, OK / defect, measurement (with unit and min and max), note, date.
- **Required:** required points must be answered before the task can be completed. Points a task type sets right on a step ([items of this step](help:admin#task-types)) come first on every new task and stay when the template changes. A required point assigned to a step already holds that step: it can only move on once the point is answered. Rejecting, sending back and cancelling stay possible. This makes a required point on a step a checkpoint ("Quote attached").
- With `Enter` you add the next point, Backspace in an empty point deletes it. You can paste a list with one point per line.
- A **task type** on the template attaches it as the default. Points can be assigned to steps of the route.
- **Duplicate** copies a template.

Changes to a template apply to lists added from now on. Existing lists keep their points.

## Filling in on a task {#fill}

On a task you add a worksheet with **Choose template** or create own points ("Add own steps"). While filling in:

- **OK**, **Defect** or **n/a** per point, a number for measurements. If it is outside the limits a warning sign appears.
- For each point you can take **photos** and write a note.
- The list menu offers "Save as template" and "Remove worksheet".

When completing, COMPASS warns: "Worksheet incomplete: … required item(s) still open." Moving a step on while its own required points are open shows the same warning for the step. Progress appears as a tag in the task list and on planning board cards.

## Reporting a defect {#defect}

For a defect (or a measurement outside the limits) COMPASS offers **Create ticket** or **Follow-up task**. With a ticket the photos are copied, and the point shows a link "Ticket #…".

## Without a network {#offline}

Entries and photos stay on the device and are sent once reception is back. The number of waiting entries is shown.

## In series {#series}

If you attach a worksheet to a [series](help:recurring), every generated task gets the current version. There are also own points per series.
