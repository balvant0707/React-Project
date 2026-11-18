---
routes: /tickets, /tickets/:id#ticket-page
---
# Tickets

A ticket reports an incident, a request or an inspection finding, with or without an asset. A task can be created from a ticket when needed.

## List and filters {#list}

Under **Tickets** you see the tickets of every queue you may see. The search box next to "Add filter" narrows by title, asset and reporter. The quick filter "My tickets" shows what you reported. More filters, columns and sorting work as with [tasks](help:tasks#list).

## Creating a ticket {#create}

**New ticket** opens the form. A ticket with priority **High** or **Urgent** notifies at once the members of the queue's teams who may edit it (and the asset's responsible person). Raising the priority later sends nothing; mention the team in a comment with @.

1. Choose the **queue** (service desk) if you may report in several. Typical queues are "Maintenance" and "IT Service Desk". The **type** depends on the queue (incident, request, inspection finding, change, service request).
2. Enter a title and a description. Paste screenshots with `Ctrl+V`.
3. Choose the affected **asset**. Leaving it empty means a general request.
4. Set the priority and save.

## The ticket page {#ticket-page}

As with tasks, the title and actions are at the top, then the field bar and the feed with comments, mentions and files. On a phone the chat button next to the status opens the feed under **Messages**.

**Status:** Open → In progress → Resolved → Closed. "Waiting for requester" means the team needs an answer from the reporter. If the reporter answers with a comment, the ticket reopens. A banner points the reporter to this.

**Rights:** Someone who may only "check" a ticket, such as the reporter, sees it read-only and can answer in the feed.

## Converting a ticket to a task {#convert}

**Create task** turns the ticket into a task and starts its route. You choose the task type and a team or a person. Afterwards the ticket shows "Open task #…" and its status changes to "Converted to task". Note on corrective work: tasks created from a ticket count as corrective maintenance in the [statistics](help:statistics).

## Reporting by QR code {#qr}

Every asset has a QR code. Anyone who scans it opens the report form **without signing in**: "What is wrong?", details, optionally a photo and contact data. Then the ticket number appears. The report lands in the "Maintenance" queue. Without reception the phone saves the report and sends it later. See [QR code and labels](help:assets#qr).
