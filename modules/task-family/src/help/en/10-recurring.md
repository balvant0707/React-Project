---
routes: /recurring
---
# Recurring tasks

A series creates tasks on a schedule or by operating hours: inspections, maintenance, checks. Every task it creates is an ordinary task.

## The list {#list}

Under **Recurring tasks** you see all rules with schedule, next due date and open tasks. A switch activates or pauses a rule, an error tag shows that the last generation failed. Administrators can use **Generate now** to create what is due today right away. Otherwise this runs automatically every day.

## Creating a rule {#create}

**New recurring task** opens the form.

- **Name:** becomes the title of every generated task.
- **Repeats:** daily, weekly, monthly, yearly or by operating hours. Plus "Every …" (interval), start and optionally end.
- **Next date:** "Follows the calendar" or "Next task is created when the previous one is done".
- **Create in advance (days):** the task appears this many days before it is due.
- **Wait until the previous task is done:** no new task while the last one is open.
- **Who:** the whole team, one person or rotating through the team members.
- Optionally asset, task type and worksheet. Every task of the series gets the current version of the worksheet.
- **Items:** what every task of the series needs; they arrive as planned and remind you to [order in time](help:items#lead-time). On a purchase request series every request orders these items.

Operating hours need an asset. You maintain the hours on the asset, and the first task appears after one full interval.

## From a task or an asset {#from-task}

In the task menu **Repeat regularly …** turns an existing task into a series. The task then shows "Repeats …" with "Edit" and "Stop series". On the asset page the "Series" tab creates rules for that asset.

## Punctuality {#punctuality}

For a series a dot strip shows the last runs: on time, rescheduled or late. See [Statistics](help:statistics#punctuality).
