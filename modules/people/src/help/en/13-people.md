---
routes: /people, /people/:id#person-page
---
# People

The people directory shows who works in the company, in which teams and with which contact data. It is open to everyone.

## Directory {#directory}

Cards with photo, position, teams, phone (office and mobile, tap to call), e-mail and birthday (day and month; whoever hides it in their profile appears without). The search finds name, position, e-mail, phone and site. There are filters for team and site. A strip at the top shows this month's birthdays and company anniversaries.

## Phone list {#phone-list}

**Phone list** (top right) opens a print view: everyone with a number, sorted by family name, with mobile and landline, two columns of 50 rows, so 100 people fit on one A4 page. More people continue on the next page. With several sites a filter limits the list to one. Former employees are left out. **Print** uses the browser's print dialog (scale 100 %, no margins).

## Org chart {#org}

The second tab shows reporting lines as a tree. Filters for team, site and **Supervisor (incl. everyone below)**. Branches fold in and out, people without a login are dashed. Every node shows position and teams.

**On a phone** a leader stands centred at the top, and the row of their direct reports below scrolls sideways. Under each person their team is listed with dashes. The **plus** makes a person the leader at the top and shows their team below; **Back to …** goes up one level.

## Person page {#person-page}

Contact, reporting line (supervisor, deputy, direct reports), teams, positions and trainings. Photo, contact data and master data are maintained by HR. You only change your own language. Those with rights also see buttons to edit, add a photo and record trainings.

The exit date is visible to HR only. Former employees disappear from directory, org chart and matrix; only HR can show them with a switch.

## Adding people and giving a login {#manage}

HR creates people with **Add person**, also without a login (for example staff without computer access). Administration or HR (right *Manage users*) maintains access in the **Sign-in** card on the person page:

- **Give login:** the person signs in with their username (given when the person is created, `firstname.lastname`). With an e-mail address stored they can get a link to set the password; otherwise, or if you prefer, there is an **activation sheet** with a QR code to print. An e-mail address is required only for Microsoft sign-in: for that, administration switches the sign-in method to Microsoft (SSO) **first**; the person then gets neither a mail nor a sheet and signs in with their Microsoft account. A person who has left or is locked gets no login.
- **Activation sheet:** issues a new sheet, for example when the password is forgotten and no e-mail is stored, or the phone was replaced. Password and second factor are deleted and all sessions end. The code is shown only once, is valid for seven days and only once; hand the sheet over in person.
- **Lock / Unlock:** the person can no longer sign in, open sessions end at once. Pickers (assignee, owner, forwarding, mentions ...) no longer offer them; where they are already set they stay. New approvals pass over them to the next level or the fallback role; forward what already waits with them. Password and data stay; unlocking undoes it. You can give a reason, it goes into the log.
- **Revoke login:** deletes the account (password, second factor, devices). The person stays with their history; a login can be given again later.

You cannot change your own access here, nor an administrator's unless you are one.
