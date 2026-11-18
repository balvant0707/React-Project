---
routes: /maintenance/statistics
---
# Statistics

The statistics show how much maintenance is done, what it costs and how punctual it is.

## Maintenance statistics {#maintenance}

Under **Statistics** you choose the period (last 12 months or this year) and the area (an asset and everything below it). You see:

- tasks done, of which corrective work (tasks from tickets),
- work hours and downtime in hours,
- external costs net.

Breakdowns show **by asset**, **by supplier** and **by month**. **Export CSV** saves the data for Excel.

> Hours and downtime count tasks completed or started in the period.

You see the same figures for a single asset in the "Statistics" tab of the [asset page](help:assets#asset-page).

## Punctuality {#punctuality}

COMPASS rates completed tasks that have a due date:

- **On time:** completed by the original due date.
- **Rescheduled:** the due date was moved and the new date was met.
- **Late:** completed after the due date.

The original due date is always kept, even if the date is changed later. That is why COMPASS asks for a reason when you move it. Punctuality appears for series (dot strip), for initiatives and tasks with subtasks, and in the asset statistics.

## Costs {#costs}

You record external costs on the task: date, net amount in EUR, supplier, invoice file. Who may see or record costs depends on the rights of the role.

The column **Material from stock** adds the used catalogue items that were not ordered for the task, at their current unit price. Ordered items count through their invoice, see [Items](help:items#costs).
