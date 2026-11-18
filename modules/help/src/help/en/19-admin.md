---
routes: /admin/users, /admin/groups#teams, /admin/roles#roles, /admin/grants#grants, /admin/configuration#configuration, /admin/task-types#task-types, /admin/task-types/new#task-types, /admin/task-types/:id#task-types, /admin/asset-types#asset-types, /admin/asset-attributes#asset-attributes, /admin/ticket-queues#ticket-queues, /admin/absence-types#absence-types, /admin/phrases#phrases, /admin/email#email, /admin/settings#deadlines
---
# Administration

This chapter is for administrators. The "Settings" menu holds Users, Teams, Roles, Grants, Configuration, Worksheets and Task types side by side. Someone who may only maintain worksheet templates or their own task types sees just those entries.

## Users {#users}

Under **Users** is the list of all people with username, supervisors, deputies, roles, teams and sign-in method. A click on a row opens the dialog: name, username, position, supervisor, deputy, sign-in method, roles and teams.

- **Username:** everybody with a password signs in with it (not with the e-mail). It is given when the person is created and does not follow name changes; change it only in exceptional cases.
- **Give login, activation sheet, lock, revoke login:** as described on the [person page](help:people#manage). "Forgot password" sends the link to the stored e-mail address; the [e-mail settings](help:admin#email) including the app address must be filled in for that.
- **Sign-in method:** "Password + authenticator" or "Microsoft (SSO)". When you switch, all open sessions of the person end. With SSO the password is deleted.
- Supervisor and deputy determine who gives approvals.

Users and teams can also be managed by another role, **HR** by default: the right *Manage users* allows giving a login, activation sheets, locking and revoking logins, and changing username, name, position, supervisor and deputy; *Manage teams* allows creating, changing and deleting teams and maintaining their members and owners. Owners with the right *Maintain the members of the teams I own* (Manager by default) maintain the members of their own teams on the Messages page. **Roles**, the **sign-in method** and the e-mail of an account are changed by administration only, because whoever assigns roles can give themselves any right.

## Teams {#teams}

Teams are groups of people, the rows of the planning board and the groups of the Messages page. For each team you decide what it can be used for: tasks, training needs, positions, filters, leave, responsibility for assets. A person can be in several teams. A click on a team opens its dialog: name, description, **colour** (for the team's avatars and dots, for example in the task list; empty = gray), where it is offered, delete, and the settings for **Messages**: **who reads** (only the members or everybody), **who starts a post** (everybody who reads, or only the owners), **who may mention the whole team** (only the owners or every member) and the **owners** who keep the posts (they need not be members). A group only for announcements to everybody, such as "Unternehmen", has no members, readers "Everybody", "Only the owners" post, and every other use switched off. The right **messages.edit** (Manager and HR by default) makes someone a moderator of every group; the rights to read, comment and post are on the permission page.

## Roles and rights {#roles}

A **role** bundles rights (permissions such as "Edit tasks (team)"). You can copy and adjust roles; rename one with the pencil in its row (the English name of the Admin role stays fixed). In the "Task types" column you restrict which types a role may start (empty = all). Roles, task types, steps, asset types and ticket queues/types each have **two names**, English and German; everybody sees the one in their own language, so fill in both. Default roles are Admin, Manager, Workshop, Purchasing, Shopfloor, IT agent and HR.

For tasks and initiatives the scope of a right says **which** tasks it covers: *assigned to me* (the task is assigned to me, or its current step is with me or with somebody I stand in for), *created by me* and *of my teams* (the task belongs to one of my teams, or its current step is with one of my teams). The usual setup: whoever creates a task may **read** it; whoever has the task or its current step, as a person or as a team, may **edit** it. When the current step names somebody (a person, team or role), only the step counts for editing and deleting; the task's person and team still see and comment on it and edit it again with a step without a rule. When a step is with a role, its holders act in the step but edit the task only through their own rights. Whoever created a task never takes a decision step of it; when the rule names that person, the step goes to the fallback role. For tickets the scopes are *reported by me*, *assigned to me* and *of my teams*.

Administration manages the system (roles, rights, settings, routes, master data) but sees **no content** by itself: no assets, tickets, tasks, goals or series, and no personal data such as trainings, suitability reviews or leave. An administrator who works with them needs a role such as *Manager* or *HR*, like everybody else. Do your own work through such a second role. Other people's files and comments on a record are deleted only by people with the "edit all" right of that area.

Every change to a person's roles, to a role's rights and to team memberships is **logged**: who, when, what, for whom. Nobody can change or delete the log, not even an administrator; only HR may read it. This also applies when you give yourself a role.

## Responsibility for assets {#grants}

The role says **what** someone may do, the team says **where**. In the form of an asset you choose the responsible team; it holds for the whole subtree, including tickets, tasks, comments and files, and teams higher up stay responsible. A member may do there what their own roles allow with "… my team is responsible for". For each team you switch on under **Teams** ("Responsible for assets") whether it may be chosen for assets. Every change is logged.

## Configuration {#configuration}

The configuration is a grid of cards. Each card opens one of the following areas; task types have their own entry in the "Settings" menu.

## Task types {#task-types}

A task type defines the route: steps, who works each step, what a step asks for (items of this step), decisions (approve, reject …) and transitions. In the editor you also set: default team, default worksheet, owner, texts for the start page, the allowed subtask types (empty = the type takes no subtasks), what tasks of this type do with **items** (none, need and use, order) and which categories they offer and whether the type appears on "New request". Creating and deleting types is reserved for administrators, owners may edit their types. A type can carry a **special function** (field in the editor, administrators only), for example *Leave*: the route stays yours to design, but it has to contain the special functions the leave request needs; the editor warns you if it does not. There is one type per special function, and a type with a special function cannot be deleted. Under **Settings** you choose which type new tasks start with (without an asset and for work on an asset); those types cannot be deleted either.

**Icon and colour:** in the editor you pick an icon for the type; it stands in front of every task of this type in the lists and on "My work". The colour starts as gray. Give a type a colour only when it means something (for example breakdowns in orange), otherwise the screen gets busy.

**Who works a step** ("Worked by"): a role (empty = everybody who may edit the task), a fixed team, **the team of the task** (every member, also when a person is assigned; the step follows when the team changes; not for decision steps, because the requester picks the team), the task's assignee (without one, its team), the requester or the requester's supervisor (one or more levels up). A role can be narrowed under **Only members of** to a team: the task's team, a team of the requester (e.g. "Manager in my team"; with several teams the task's team first, else the first by name that has a holder of the role) or a fixed team. On a **decision step** the task's team is not offered (the requester chooses it) and teams created by users do not count. Then only the holders of the role in that team act and are notified; when the task moves to another team, the step follows. Do not put fixed names in: rules survive holidays and people moving on. When a rule finds nobody (no supervisor, a series without a requester), the step goes to the role under "If nobody is found", else to the default role under **Settings** (Manager at first); if that is empty too, whoever may edit the task acts.

Tasks refer to the route of their type, they do not copy it: a change applies to running tasks at once. That is why a step that open tasks stand in can be neither deleted nor renamed.

The editor starts with a **route overview**: every step in a row with its decisions and where they lead, so branches are visible at a glance. Each step is a folded card; open it to change who works it, its decisions, its items and special functions. Add the **items of this step** right in the card (tick, OK / defect, measurement, note, date), no separate worksheet needed: they go into the worksheet of every new task of this type, and a required one holds the step until it is answered; the action's dialog asks for it. Switch a step to **Decision step** when a person chooses between its decisions (approve or reject, variant A or B): the task then appears under *To decide* for whoever the step waits for. A decision step needs at least two decisions and has to name who decides (a role, a team, the supervisor, the requester or the task owner, not "anyone").

**Special functions** (per step, below the step's items): functions that run in the same moment as a step change, for example an absence route writes the decision back to the absence. You pick the function and when it runs (task arrives in the step, an action is taken in it, it leaves the step, is finished from it, or is cancelled in it). A failing function stops the action. The same list exists for the **whole task type** (runs for every step): there the ticket a task was made from is resolved when the task is done and given back (open again) when it is cancelled, and an ordering type books the arrival of its items. Which functions exist is fixed by the developers; a step without any only routes.

## Asset types and properties {#asset-types}

**Asset types** label the asset tree. Each type can get an **icon** (for example motor, forklift, tank); it stands in front of the asset in the tree and in the lists. Assets are told apart by the shape, not by a colour. "Grouping nodes" only structure the tree, the asset list hides them by default.

## Properties {#asset-attributes}

Properties are technical data per asset type: text, number, date, yes/no or choice list. Users maintain the values on the [asset](help:assets#attributes).

## Ticket queues {#ticket-queues}

A queue is a service desk with its own ticket types, for example "Maintenance" and "IT Service Desk". What a person may do with tickets comes from their roles and is the same for every queue. The **teams** of a queue say where the broad permissions ("all tickets", "assigned assets") and changing tickets count: members of one of its teams work the queue; a queue without a team is worked by everybody who holds the permission. Seeing your own tickets and those of your team works in every queue. **Open to everyone** lets any signed-in user report in the queue and follow their own tickets, as at the IT Service Desk. The **default team** receives new tickets when the reporter picks nobody. A new queue needs no developer: name, types, teams.

## Absence types {#absence-types}

**Configuration > Absence types** lists the kinds of absence people can report: vacation, special leave and whatever you add (for example sickness, business trip, working from home). Each type has a name in both languages, an icon and colour, and a **route**: a task type with the special function "Absence". Several types may share a route. **Counts as leave** adds a type to the leave days per year.

The route decides everything else. A decision step (for example the supervisor) needs the special function "Absence: write the decision back" on "An action is taken in this step (moves on or finishes)"; the editor warns when it is missing. Steps after the decision are ordinary steps, for example **booking in the time recording system**: a role step such as "Time recording", narrowed under **Only members of** to a team of the requester, so each department's booker gets its absences; the action "Booked" finishes the task. A route **without** a decision step makes the absence count at once (a sick note that only HR books, once the certificate is there). For a new route create a task type, choose the special function "Absence" and add two functions for the whole type: "Absence: mark as withdrawn" on "The task is cancelled in this step" and "Absence: write the decision back" on "The task is finished from this step" (an absence still waiting when the task ends, for example after it was sent back for rework, is rejected). The special function of a type that already has tasks cannot change; create a new type instead.

## Phrases {#phrases}

General lookup lists, such as document types, training categories and the categories and units of items, each in German and English.

## Email delivery {#email}

SMTP server, sender, time of the daily summary. "Send test mail" checks the connection, "Send now" triggers delivery immediately. The password is write-only and never shown.

## Public holidays {#holidays}

**Configuration > Public holidays** keeps the days that do not count as leave days. Set the **federal state of each site**, choose the years and press **Import holidays**: the holidays come from the open service Nager.Date, nationwide ones for everybody and regional ones for the sites in that state. An import replaces earlier imported entries of these years and keeps those you entered yourself. A holiday that only part of a state keeps is imported for the whole state: delete it in the list if it does not apply. Company holidays and bridge days are added with **Add holiday**.

## Deadlines {#deadlines}

The default deadline of new tasks.

Under **Operating instructions** you choose the languages the editor offers for every draft. German is always first, see [Operating instructions](help:operating-instructions#languages).

## Security {#security}

The second factor (authenticator or Microsoft sign-in) is normally mandatory for all accounts. The "Users" page shows who signs in how.
