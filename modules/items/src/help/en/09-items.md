---
routes: /items, /items/:id#item-page, /items/locations/:id#stock, /items/locations/labels#stock
---
# Items

COMPASS keeps a catalogue of **items**: spare parts, consumables, protective equipment, lab supplies, office supplies, hygiene articles. Every machine has a spare parts list, a task the items it needs or used, and a purchase request the items it orders. Selected larger spare parts can be kept in stock (see [Stock](help:items#stock)); ordering and invoices run in the ERP.

## The catalogue {#catalogue}

Above the tabs a row of numbers shows what needs attention (swipe sideways on a phone): **Below minimum stock** and **Items kept in stock** (only with the stock right) and **Tasks waiting for material**. A tap opens the matching list.

**Items** shows all active items. Search by item number, manufacturer or ERP number, or name; filter by category or supplier or show critical items only. "Show inactive" also lists items that are no longer used.

Whoever holds "Keep the catalogue" (by default managers and purchasing) adds items with **New item**:

- **Item number:** our own number, unique.
- **Name** and **category** (the list is kept by the administration under phrases).
- **ERP item no.:** the item the ERP books it on, a real one or the dummy item used for such purchases.
- **Manufacturer, manufacturer part no.**
- **Supplier:** the preferred supplier. You can add a new name right in the field.
- **Unit:** piece, set, metre, pack …
- **Lead time:** days from order to delivery. It drives the reminder to [order in time](help:items#lead-time).
- **Unit price (net):** visible only with the right to see costs.
- **Critical:** the machine stops without this item. Critical items are marked red everywhere.

An item used on a task or a series cannot be deleted; set it to inactive instead.

## The item page {#item-page}

The item page shows the data with the **main photo**, the machines it is **installed in**, the **tasks** that needed or ordered it, and **documents** such as data sheets, drawings and photos.

## Photos {#photos}

People pick spare parts by their look, so give every item a photo: on the item page, tab **Documents**, **Add data sheet or photo** (on a phone you can take it with the camera). COMPASS shrinks the photo and keeps a small copy for lists. With several photos, **Make main photo** chooses the one shown everywhere; without a choice the first photo is shown. A click on a photo shows it large.

The photo shows in the catalogue, in the spare parts list of a machine, when adding an item to a task, in the lines of a task or purchase request and in the question [which items you used](help:items#usage).

## Suppliers {#suppliers}

The tab **Suppliers** lists the suppliers with our customer number, the **ERP supplier number**, email, phone and website. The same suppliers are offered for the external costs of a task. A supplier in use cannot be deleted; deactivate it.

## Spare parts list of a machine {#asset-parts}

On the asset page the tab **Spare parts** shows which items are installed in the machine, how many and where ("drive side left"). Switch between **List** and **Cards**: cards show each part with a large [photo](help:items#photos), handy on the phone in front of the machine. Your browser remembers the choice; without one phones show cards and PCs the list. "Including everything below" adds the lists of all assets below. **Copy from asset** copies the list of a machine of the same kind. Scan the QR code on the machine and you have the list in your hand.

## Items on a task {#task-items}

What a task does with items depends on its [task type](help:admin#task-types):

- **Need and use** (out of the box maintenance and inspection): the task lists what is missing, planned and used.
- **Order** (the purchase request): the task lists what it orders, see [below](help:items#purchase).
- **No items** (all others): no section.

A task type can be limited to some categories; the picker then offers only those.

**Add item** offers the machine's spare parts list first, as photo tiles: tap the part you mean. "Search the whole catalogue" searches all items, also with a small photo. What is not in the catalogue goes in as **free text**, described so that purchasing can order it. The quickest way is the **quick entry** field: "3 packs toilet paper" and Enter. The number becomes the quantity, a unit word the unit, the rest the text; an exact item number takes the catalogue item. Purchasing turns a free-text line into a catalogue item with one click.

The states:

- **Missing** (red): the item is needed but not there.
- **Ordered** (yellow): a purchase request for it is open.
- **Requested** (yellow): a line of the purchase request itself, not delivered yet.
- **Arrived** (turquoise): the order is completed.
- **Planned** (blue): the task's series plans the item.
- **Used** (green): the item went into the machine or was used up.

## Ordering missing items {#order}

**Order missing items** (or select some rows and order them) creates a **purchase request as a subtask** with the normal task form. It runs through its route: approval, purchasing, goods receipt. The lines stay on the maintenance task and are linked to the request, not copied.

While items are missing or on their way, the task shows "Waiting for items" on its page, in the task list and on the planning board. When the purchase request is completed, the assignee gets a notification and the items show as arrived. If it is cancelled, the items are missing again and can be ordered anew.

## The purchase request {#purchase}

A purchase request shows **Items ordered**: its own lines and the lines of the task it was started from (with "For task #…", read-only). So toilet paper or lab supplies need no maintenance task: start the purchase request directly and enter the items there, from the catalogue or as free text. Purchasing sees all lines, also without access to the maintenance task.

A [series](help:recurring#create) can be a purchase request too, for example the monthly order of hygiene articles: every request of the series orders the items it names.

## Copy for the ERP {#erp}

Ordering and invoices run in the ERP. So that purchasing types nothing twice, **Copy for ERP** puts all lines of the purchase request on the clipboard, tab-separated: ERP supplier number, supplier, ERP item number, item number, description with manufacturer and part number, quantity, unit, unit price, for which task, note. Paste it into the ERP or Excel. **CSV** downloads the same as a file.

## Which items did you use? {#usage}

When a task that needs and uses items is completed, COMPASS asks after the hours which items you installed or used. Planned and arrived items are already ticked, the machine's spare parts list is offered below them. You can skip the question and add items later.

## Planned items and lead time {#lead-time}

A [recurring task](help:recurring#create) can name the items every task of the series needs, such as the filter set of the annual service. Every new task gets them as planned. When a planned or missing item has a lead time and the due date minus the lead time is reached, COMPASS reminds the assignee (or the team) to order now. Switch it off under [Profile > Reminders](help:profile#reminders).

## Cost of items {#costs}

An item bought for the task counts through the invoice on its purchase request (external costs). A catalogue item taken from the shelf counts in the [statistics](help:statistics#costs) as "Material from stock" at its current unit price. So nothing is counted twice.

## Stock {#stock}

Only **relevant, larger spare parts** are kept in stock. Small parts and consumables are still reordered by kanban and stay out of COMPASS's stock.

- **Switch it on** in the item ("Keep in stock"): choose the **default location**, optionally a **minimum stock** (for the item as a whole, all locations together) and a reorder quantity. Needs the right to keep the catalogue.
- **Locations** are a tree: store, shelf, bin. Open the tab **Locations** under Items. Every location has a short **code**, can be assigned to a **responsible team** and has a page with its stock and a QR code. Print the labels with **QR labels** (or **Print label** on the location's page, which includes everything below it) and stick them on the shelf; scanning one with the phone camera opens the location.
- **Stock per item:** the tab **Stock** of the item page shows the quantity per location, the bookings (newest first, older ones load on demand) and the actions. The tab **Stock** under Items lists all items kept in stock, with the filter *Only below minimum*.
- **Development:** under the bookings, a chart shows the stock of the item over the last 3, 6 or 12 months, with the minimum stock as a dashed line. In the list under Items > Stock, a small line per item shows the last 12 weeks; hover or touch it for the value of a week.
- **Taking parts out happens in your work:** when you complete a task and say which items you used, the parts are booked out of the stock. With one location nothing is asked. If the parts come from several places, click **Change** under the item and split the quantity over the locations (the split must add up). Left alone, COMPASS takes from the default location first and then from wherever stock is.
- **Goods in:** when a purchase request is completed, its items kept in stock are booked into the default location of the item. Goods that arrive without a request are booked with **Book stock** (*Goods in*); the first stock when you start is booked as *First stock*.
- **Count, correct, move:** **Count** books the difference between what you counted and what is booked. **Move** takes stock from one location to another. A correction fixes a booking error. Allowed for the responsible team of the location (right "my teams") or everywhere (right "everywhere").
- **Below minimum:** the responsible team of the default location gets a message once when an item falls below its minimum, then weekly while it stays there; the start page shows the number.
- **Nothing is ever overwritten.** Every booking stays in the list of bookings. If you correct a task's used parts later, COMPASS books only the difference.

> A negative stock means more was taken than was booked in. Count that location; the difference is booked as a count.
