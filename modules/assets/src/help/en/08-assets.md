---
routes: /assets#list, /assets/labels#qr, /assets/:id#asset-page
---
# Assets

Assets are machines, plants and places, arranged in a tree (site → hall → line → machine …). Every asset has documents, a QR code, tasks, tickets and a feed.

## Tree and list {#list}

Above the table the number **Assets with overdue tasks** shows how many assets have an overdue next task; a tap opens the flat list filtered to them.

**Assets** shows a table that folds open like a tree. When a team is responsible for a node, that holds for everything below it. Open a row with its arrow and its sub-assets are loaded. A click on the row opens the asset. The numbers (blue: open tasks, orange: open tickets) and the next due date open the matching tab or the task right away.

Search and filters work on every level: the table then shows the matches in their place in the tree, with the assets above them in grey. A click on a column header sorts within each level. On a phone you see one level at a time: "N sub-assets" goes one level down, the line at the top goes back. There you sort with **Sort**.

The **list** (switch "Tree / List") shows all assets flat, sorted by the next due date. The filter "Below" limits it to a subtree. "Equipment only" hides pure grouping nodes such as sites and categories and is on when the list opens. Technical properties can be shown as columns and filters in both views.

## Creating and editing an asset {#edit}

**New asset** (or "New child asset" on a node) opens the form: name, type, parent, responsible team, manufacturer, serial number, location. The type adds further technical properties. The **icon** also holds for everything below the asset until a node has its own: give the category "Forklifts" the forklift icon and every forklift below shows it. Empty takes the icon from above, else the asset type's. An asset with child assets, tickets or tasks cannot be deleted.

## The asset page {#asset-page}

Tabs:

- **Activity:** feed and comments (on a computer; on a phone the chat button at the top opens the feed under **Messages**).
- **Tasks** and **Tickets:** open or closed, including everything below.
- **Series:** recurring tasks of this asset, with a button to create one.
- **Spare parts:** the spare parts list of the machine. See [Items](help:items#asset-parts).
- **Operating instructions:** the instructions of the asset, of its asset type and of the assets above it. See [Operating instructions](help:operating-instructions#page).
- **Statistics:** punctuality, tickets per month, maintenance effort. See [Statistics](help:statistics).
- **Documents:** manuals and files.
- **Details:** technical data.

Next to it are the **QR code** and the **responsible team**. The **Access** field in the field bar names the teams, people and roles that can see or edit the asset; a click shows the whole list with the level and the reason. Tasks and tickets have the same field.

## Technical data {#attributes}

For each asset type an administrator defines properties (text, number, date, yes/no, choice). You maintain the values in the "Details" tab. Choice lists learn from what has been entered so far.

## Documents {#documents}

Drop files into the "Documents" area or click to upload. PDFs open in a preview with paging, zoom and download. Other files are downloaded.

## Available offline {#offline}

"Make available offline" stores the asset's documents and the photos of its spare parts list on your device, so you have manuals with you in the hall without reception.

## QR code and labels {#qr}

The QR code opens the public report form for this asset. "Copy link" copies the address, "Print label" prints a sticker. If the asset has sub-assets, **Print labels** offers "Only this asset" or "This one and everything below". On the labels page you tick which labels are printed. Reports arrive as [tickets](help:tickets#qr).

## Access to assets {#access}

In the asset form you choose the **responsible team**. It is responsible for the asset and everything below it, including tickets, tasks, comments and files. Teams higher up the tree stay responsible when another team is named further down; the card "Responsible team" lists them all. What the members may do there comes from their own roles (the rights "… my team is responsible for"). Whoever may edit the asset may change the team; only teams released for this by HR or the administrator are offered (Admin > Teams, "Responsible for assets"). See [Administration](help:admin#grants).
