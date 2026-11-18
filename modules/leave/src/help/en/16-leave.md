---
routes: /leave
---
# Leave

Apply for leave, see its state and how many days you have taken. Your supervisor approves.

## Request leave {#request}

Press **Request leave**, pick the period and send. A half day at the start or the end is possible: tick "starts at midday" or "ends at midday". Weekends and public holidays of your site are not counted. A period can run over New Year.

Choose the **kind** (vacation, special leave and whatever your company has set up). Each kind has its own route: most need approval, some count at once. After the approval a step such as **booking in the time recording system** may follow; the absence counts as approved from the approval on, the task stays open until it is booked.

The request goes to your supervisor (or the deputy). Without a supervisor it goes to HR. It appears as a task in the supervisor's list; the decision and an optional comment are written to the activity feed of that task.

> You cannot request leave for a period in which you already have leave. Two periods may touch on one day if the first ends at midday and the second starts at midday.

## Planner {#planner}

The **Planner** tab shows one row per person. Choose "My team members", "Only me" or a team. Without people reporting to you the planner starts on "Only me"; that view is a year calendar: the twelve months below each other, the days aligned by weekday so all weekends line up, the year is chosen in the date field. Scroll to the right and the planner loads further weeks; "Today" and the date field jump elsewhere. Switch between **Day** and **Week**:

- **Day**: one column per day. Green = approved, amber = waiting, a half day fills half of the cell. Weekends and public holidays are grey.

**Request leave in the planner:** click the first day in your own row, then the last day, like choosing travel dates: the range lights up while you move the mouse, Escape cancels. The request dialog opens with the period, where you can still change it. In the week view you pick whole weeks (Monday to Friday). **Enter leave for your people:** as a supervisor, deputy or in HR (there for everybody) you click the same way in the row of a person whose leave you approve. The dialog is then called "Enter leave for ..."; the leave is approved at once, the person is the requester and sees it in the planner; the detail says "Entered by ...". This does not work in any other row.

**Click a coloured field** to see the leave: person, period and state; for your own leave (and for the approver and HR) also the kind, the working days, a link to the request and **Withdraw**.
- **Week**: one cell per person and week with the days away. The fill is a gradient of the approved (green) and waiting (amber) share of the week.

The top row "Team away (peak)" shows the day of the week with the most people away and colours it: green is fine, amber is at the limit, red is over it. Hover for the numbers. Colleagues only see **that** somebody is away, not why.

## Absence rule {#rule}

By default at most 20 % of a team may be away at the same time, small teams always one person (Admin > Settings). If a request would exceed that, the request dialog and the leave box on the task page list the days. **It is a warning, never a block.** The supervisor can still approve; the supervisor's supervisor is told and finds the days under **Rule violations**. That list is computed live from the current leave of the next six months, so a day disappears when someone withdraws and appears when a later request pushes a team over the limit.

## Change the period {#adjust}

While a request waits, the requester and the approver can use **Change period** in the leave box of the task. The supervisor changes days or half days and then approves; the feed shows old and new and the other person is notified.

## To decide {#approvals}

If you approve leave, the tab **To decide** lists the waiting requests (also those of people you stand in for). Open one: there you see the period, the warning of the absence rule and can change the period before you approve or reject.

## State {#state}

- **Waiting for approval**: the supervisor has not decided yet.
- **Approved**, **Rejected** (with the reason in the feed) or **Withdrawn**.

You can withdraw a request that is still waiting, and approved leave that has not ended yet. The supervisor is told when approved leave is withdrawn.

## Days taken {#days}

The top of the page shows the approved working days per year, and what is still waiting. Leave that runs over New Year is split between the two years. Entitlement and remaining days are **not** kept here, they are in time recording.
