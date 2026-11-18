---
routes: /tasks, /tasks/:id#task-page
---
# Tasks

A task is work that runs through a defined route and is done by a team or a person. Everything that happens is recorded in the task's activity feed.

## The task list {#list}

Under **Tasks** you see every task you may see.

- **Name filter:** the search box at the top left, next to "Add filter", narrows the list by title (and asset) as you type. Title, buttons, search and filters, and the table header stay in place while you scroll.
- **Big numbers** above the list (the trend lines of open, overdue and done tasks, tickets, decisions, leave); on a phone you swipe them sideways. A tap opens the matching list.
- **Tabs** All | Open | Today | Important | Later | Done: shortcuts that set the filters below (Today = open and due today, Important = open with high or urgent priority, Later = open and planned for a later day). One tab replaces the other; you can still change the filters afterwards. The list starts on **Open**: done and cancelled tasks show only under **All** and **Done**.
- **Quick filters:** "My tasks", "Open in my team", "Overdue", "Blocked", "Date conflict".
- **Sorting:** on a computer, click a column header. On a phone, where the list shows as cards, quick filters, sorting and all other filters sit behind the **Filter** button next to the search box; the main orders are: newest first, by due date, by planned date, recently changed, title A–Z.
- **Add filter** opens more filters, such as task type, step, team, asset or initiative.
- **Manage columns** shows or hides columns. Your browser remembers the choice.
- **Quick actions:** a task due today or overdue has a **Tomorrow** button that moves the due date to the next day (COMPASS asks for a reason, as always). The **⋯** menu on the row (on a phone: top right of the card) forwards or assigns the task. On a phone you can also **swipe a card to the left**: **Tomorrow** and **Forward** appear behind it; a tap on the card closes it again. You see these only for tasks you may change.
- **On a phone** the big numbers are small tiles you swipe, the cards are compact (a coloured edge marks overdue and blocked tasks, small icons stand for blocked, date conflict and missing material) and the list loads more cards as you scroll down.
- A click on a row opens the task. With "#" and the number you can also find it through the [search](help:getting-started#search).

## Creating a task {#create}

The button **New task** (on a phone the round **+** button at the bottom right) opens a choice of task types (tiles with search and description, as on New request), then the form, a large dialog (the whole screen on a phone). For task types that use or order items (a purchase request, for example) the form has a section for the items: pick them from the catalogue or type a line such as "3 packs of toilet paper" and press Enter. They become item lines of the task, not text in the description. Required are a title, a task type and either a **team** or a **person**. If you give neither, COMPASS uses the type's default team, otherwise you.

Optional are asset, priority, due date, description and worksheet. If you pick an asset, everyone with rights on that asset can see the task. For tasks with an asset, "Maintenance task" is preselected.

Often it is easier through [New request](help:my-work#start).

## The task page {#task-page}

At the top are the title with actions. Below it, one column holds the card **Details** (fields in a grid that fills the width, the description beneath), directly followed by the **worksheet**, the subtasks, material and costs. On a wide screen the **activity feed** sits in a panel at the right that stays in view while you scroll (newest message at the bottom, message field at the foot, drag its left edge to change the width); **Hide** closes it (the button "Activity/Chat" at the title brings it back). On a narrower screen it follows below the page.

- **Route (steps):** A bar shows where the task stands. Typical steps are planning, work, approval, purchasing, goods receipt.
- **Action buttons:** The current step offers buttons such as "Send for approval", "Approve", "Reject" or "Complete task" (with a tick). If the step is meant for another role they are greyed out and a line says who is up ("Waiting for: …"). The line "Next:" shows what a click triggers.
- **Team and person, planned date, due date and priority** can be changed directly in the field bar. Every change appears in the feed afterwards.
- **Description:** add or edit, `Ctrl+Enter` saves. You can format it (headings, lists, bold).
- **There is no Save:** every change on the page counts at once. "Complete task" marks the task as done and is no save button. On a phone, **Back** at the bottom left leaves the task.
- **On a phone** everything stands below each other in one column, without tabs. The chat button in the bar at the bottom opens the task's conversation under **Messages**; the arrow at the top left leads back to the task. The number on the button counts unread messages. Rarely needed fields sit behind "More details" and open below the others; the asset stands on top only when the task has one, otherwise it can be set there. The bar at the bottom shows up to two decisions; everything else (forward, repeat, cancel) is behind **⋯**. Completing a task asks one question at most: the hours or parts dialog already serves as confirmation.

> If you move the **due date**, COMPASS asks for a reason. It appears as a comment in the feed, and the original date is kept for the [punctuality statistics](help:statistics#punctuality).

## Comments, mentions and files {#feed}

Below the task you write comments. With `@` and a name you mention someone who may see the task. They get a notification. With `@` and the name of the task's team you reach [the whole team](help:messages#team-mention). Drop files into the box, paste them with `Ctrl+V` or use **+** > "Attach" (up to 25 MB). `Ctrl+Enter` sends.

The filter above the feed shows "All", only "Comments" or only the "History" of system events. You can edit your own comments for 15 minutes after writing them. Deleting is the exception and needs the right *Delete messages* (Manager and HR by default); a deleted comment leaves the note "Message deleted". The arrow icon next to a comment **replies** to it; the reply shows the original as a quote. PDFs open in a preview right away.

The bell button above the feed **follows** the task: it then shows under [Messages](help:messages#follow) with a number for what is unread. Whoever created the task, works on it or writes in it follows automatically.

## Reopening a finished task {#reopen}

Clicked *Done* or *Cancel* by mistake? On a finished task, **Reopen** puts it back into the step it was finished from; the person of that step is determined again, and the activity shows who reopened it and why. Anyone who may edit the task can do this. It is not possible for tasks with a special function (such as leave requests), tasks that belong to a ticket, tasks of a series and ordering tasks, because finishing them has already had effects elsewhere.

## Routes and approvals {#routes}

The steps a task goes through depend on its **task type**. For example:

- **General task:** Planning → Running → Done.
- **Purchase request:** Request → Approval by the manager → Purchasing → Goods receipt.
- **Maintenance task, Recurring inspection:** Planning and work, or perform inspection.

For every step the task type defines who works it: a role, a fixed team, the team of the task, the task's assignee, the requester or the requester's supervisor (the deputy when they are away). COMPASS works this out when the task enters the step. Who has to act now is shown in the field **With**, and that person (or the team, the role) gets a notification.

> **Accountable and up next are two things.** "Assignee" and "Team" say whom the task belongs to; that rarely changes. "With" says who has to act in the current step; that changes along the route.

## Taking over a task {#claim}

A task that belongs to your team but has no person yet is open for the whole team. In the task list the chip **Open for my team** shows exactly these tasks, and each row has the button **I take it** (on a phone the dashed circle where the assignee's photo would be). One click makes you the assignee, and the activity shows "took over the task". If a colleague was faster, you get a short note and the list refreshes. You need the right to edit the task.

## Forwarding {#forward}

**Forward** hands a task to another person, with a comment on what it is about. They get a notification, and the activity shows who forwarded to whom.

- **Step with a rule** (e.g. purchasing, approval): the current step goes to the person, it is their turn now. The task's assignee stays accountable. Choose yourself to **take the step over**, for example from the purchasing role.
- **Step without a rule** (e.g. the general task): the task gets a new assignee. If the person is not in the task's team, the team is removed.

Whoever is up or may edit the task can forward it. A **decision** (an approval, for example) is passed on only by whoever may take it (or their deputy), and never to the requester. You never decide on your own task, not even when the step is with your role or your team.

Forwarding does not change the route, only the hand. If something separate has to be done alongside, with its own due date and result, use a [subtask](help:tasks#subtasks).

With the task menu you can **cancel** a task. A cancelled task cannot be continued.

## Subtasks {#subtasks}

Break large tasks into subtasks (**Add subtask** in the **⋯** menu of the task). The section Subtasks appears as soon as there is one (on an initiative it is always there, with a button for the first task) and shows them as a tree with progress, foldable with the arrow, plus "+" for more subtasks. When you complete a task, COMPASS warns if subtasks are still open. For the Gantt view and the board see [Initiatives](help:initiatives).

On a phone the subtasks are a list of cards, indented by level: the arrow on the left folds, "+" on the right adds a subtask below that one.

The task type decides which task types can be created as a subtask (type editor, **Allowed subtask types**). With an empty list the task has no "Add subtask". When you add one you choose the type on tiles with search and description (with only one allowed type there is nothing to choose); with up to four allowed types the task also shows them as one-click buttons.

## Waiting for a prerequisite {#blocked}

Some subtasks must be done before the main task can go on, for example the purchase request for a spare part. Such a subtask is a **prerequisite**. As long as one is open, the main task shows the orange label **Blocked** and a note on its page with a link to the prerequisite.

- **Blocked is a label, not a status.** The task keeps its status and step. It also stays *overdue* when its due date passes: the date still counts, and the delay is visible in the numbers.
- **What is a prerequisite:** the task type decides (a switch in the type editor; purchase requests are prerequisites by default). When you create a subtask, a checkbox ("This subtask must be done before the main task can go on") is preset by the type and can be changed; on an existing subtask the field **Prerequisite for parent task** does the same.
- **Finding them:** the task list has the chip **Blocked**, and the start page the number **Waiting for a prerequisite**.
- Once the prerequisite is done or cancelled, the label disappears by itself.

## Date conflicts {#date-conflicts}

An open subtask must not be due later than its open parent task. COMPASS marks it with a yellow warning sign at the due date (tree, Gantt, task list), and in the Gantt a dashed line shows the day the parent is due. Two cases count:

- **Ends later:** the due date lies after the parent's.
- **Overdue:** the subtask is overdue already, so it can finish today at the earliest, but the parent is due earlier. An overdue task is not finished in time any more.

The parent task shows a yellow notice with the affected subtasks and two ways to fix it: **Move this task** (to the latest date of the subtasks) or **Pull the subtasks in** (to the parent's due date; overdue ones cannot be pulled in). Both ask for a reason, which appears as a comment in the feed of every task that is changed. The subtask itself has a **Pull in** button. In the task list the chip "Date conflict" filters. The check is against the direct parent only and only when both have a due date.

## Worksheets {#checklists}

You fill in the "Worksheet" section of the task: **OK**, **Defect** or **n/a** per point, a number for measurements, optionally notes and photos. Details: [Worksheets](help:checklists).

## Hours, downtime and costs {#effort}

When you complete a task COMPASS asks how many hours the work took. An estimate is enough, you can also skip and add it later. It is not asked for types that hide the field (task type editor, "Hide fields on the task"; asset, worksheet and costs can be hidden there too, then the new-task form does not offer them either; costs that exist stay visible) or that have a special function such as leave. For assets you can also record downtime. External costs (supplier invoices, net in EUR, with the invoice file) go in the **External costs** section, if you have the right for it. The numbers flow into the [statistics](help:statistics).

## Items {#items}

Depending on the task type the section **Items** lists what the task needs or used (maintenance, inspection), or what it orders (purchase request). Missing items are ordered with a purchase request as a subtask; while they are on their way the task shows "Waiting for items". What is not in the catalogue goes in as free text, quickest with the quick entry field. Details: [Items](help:items#task-items).

## Repeating a task {#repeat}

In the task menu **Repeat regularly …** turns the task into a series: when it is done, the next one is created. See [Recurring tasks](help:recurring).

## Reminders {#reminders}

Open tasks report through the bell: when planned for today, due soon or overdue. Settings in the [profile](help:profile#reminders).
