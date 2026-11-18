---
routes: /admin/users, /admin/groups#teams, /admin/roles#roles, /admin/grants#grants, /admin/configuration#configuration, /admin/task-types#task-types, /admin/task-types/new#task-types, /admin/task-types/:id#task-types, /admin/asset-types#asset-types, /admin/asset-attributes#asset-attributes, /admin/ticket-queues#ticket-queues, /admin/absence-types#absence-types, /admin/phrases#phrases, /admin/email#email, /admin/settings#deadlines
---
# Administration

Dieses Kapitel ist für Administratoren. Im Menü „Einstellungen“ stehen nebeneinander Benutzer, Teams, Rollen, Rechte, Konfiguration, Arbeitsblätter und Aufgabentypen. Wer nur Arbeitsblatt-Vorlagen oder eigene Aufgabentypen pflegen darf, sieht nur diese Einträge.

## Benutzer {#users}

Unter **Benutzer** steht die Liste aller Personen mit Benutzername, Vorgesetzten, Vertretung, Rollen, Teams und Anmeldeverfahren. Ein Klick auf eine Zeile öffnet den Dialog: Name, Benutzername, Position, Vorgesetzte/r, Vertretung, Anmeldeverfahren, Rollen und Teams.

- **Benutzername:** Mit ihm meldet sich jede Person mit Passwort an (nicht mit der E-Mail). Er wird beim Anlegen vergeben und ändert sich nicht mit dem Namen; nur in Ausnahmefällen anpassen.
- **Login geben, Aktivierungsblatt, Sperren, Login entziehen:** wie auf der [Personenseite](help:people#manage) beschrieben. „Passwort vergessen“ schickt den Link an die hinterlegte E-Mail-Adresse; dafür müssen die [E-Mail-Einstellungen](help:admin#email) samt App-Adresse ausgefüllt sein.
- **Anmeldeverfahren:** „Passwort + Authenticator“ oder „Microsoft (SSO)“. Beim Umstellen enden alle offenen Sitzungen der Person. Bei SSO wird das Passwort gelöscht.
- Vorgesetzte und Vertretung bestimmen, wer Freigaben erteilt.

Benutzer und Teams kann auch eine andere Rolle verwalten, standardmäßig das **Personalwesen**: Das Recht *Benutzer verwalten* erlaubt Login geben, Aktivierungsblätter, Sperren und Login entziehen, Benutzername, Name, Position, Vorgesetzte und Vertretung; *Teams verwalten* erlaubt Teams anlegen, ändern und löschen sowie Mitglieder und Owner pflegen. Owner mit dem Recht *Mitglieder der eigenen Teams pflegen* (standardmäßig Leitung) pflegen die Mitglieder ihrer eigenen Teams auf der Seite Nachrichten. **Rollen**, das **Anmeldeverfahren** und die E-Mail eines Kontos ändert nur die Administration, denn wer Rollen vergibt, kann sich jedes Recht geben.

## Teams {#teams}

Teams sind Gruppen von Personen, die Zeilen der Plantafel und die Gruppen der Seite Nachrichten. Pro Team legst du fest, wofür es nutzbar ist: Aufgaben, Schulungsbedarf, Stellen, Filter, Urlaub, Zuständigkeit für Anlagen. Eine Person kann in mehreren Teams sein. Ein Klick auf ein Team öffnet den Dialog: Name, Beschreibung, **Farbe** (für die Avatare und Punkte des Teams, zum Beispiel in der Aufgabenliste; leer = grau), Verwendung, Löschen und die Einstellungen für **Nachrichten**: **wer liest** (nur die Mitglieder oder alle), **wer startet einen Beitrag** (alle, die lesen, oder nur die Owner), **wer darf das ganze Team erwähnen** (nur die Owner oder jedes Mitglied) und die **Owner**, die die Beiträge betreuen (sie müssen keine Mitglieder sein). Eine Gruppe nur für Ankündigungen an alle, zum Beispiel „Unternehmen“, hat keine Mitglieder, Leser „Alle“, „Nur die Owner“ posten, und alle anderen Verwendungen sind ausgeschaltet. Das Recht **messages.edit** (standardmäßig Leitung und Personalwesen) macht jemanden zum Moderator aller Gruppen; die Rechte zum Lesen, Kommentieren und Posten stehen auf der Rechte-Seite.

## Rollen und Rechte {#roles}

Eine **Rolle** bündelt Rechte (Berechtigungen wie „Aufgaben bearbeiten (Team)“). Du kannst Rollen kopieren und anpassen; den Namen änderst du mit dem Stift in der Zeile (der englische Name der Rolle Admin bleibt fest). In der Spalte „Aufgabentypen“ schränkst du ein, welche Typen eine Rolle starten darf (leer = alle). Rollen, Aufgabentypen, Schritte, Anlagentypen und Ticket-Queues/-Typen haben je **zwei Namen**, Englisch und Deutsch; alle sehen den in ihrer Sprache, trage also beide ein. Standardrollen sind Administrator, Leitung, Werkstatt, Einkauf, Produktion, IT-Support und Personalwesen.

Bei Aufgaben und Initiativen sagt der Bereich eines Rechts, **welche** Aufgaben gemeint sind: *mir zugewiesen* (die Aufgabe ist mir zugewiesen oder ihr aktueller Schritt liegt bei mir oder bei jemandem, den ich vertrete), *von mir angelegt* und *meiner Teams* (die Aufgabe gehört einem meiner Teams oder ihr aktueller Schritt liegt bei einem meiner Teams). Üblich ist: Wer eine Aufgabe anlegt, darf sie **lesen**; **bearbeiten** darf, wer sie oder ihren aktuellen Schritt hat, als Person oder als Team. Nennt der aktuelle Schritt jemanden (Person, Team oder Rolle), zählt fürs Bearbeiten und Löschen nur der Schritt; die zugewiesene Person und das Team der Aufgabe sehen und kommentieren sie weiter und bearbeiten sie wieder, wenn ein Schritt ohne Regel folgt. Liegt ein Schritt bei einer Rolle, handeln deren Mitglieder im Schritt, bearbeiten die Aufgabe aber nur mit ihren eigenen Rechten. Über einen Entscheidungsschritt der eigenen Aufgabe entscheidet nie, wer sie angelegt hat; ergibt die Regel diese Person, geht der Schritt an die Ausweichrolle. Bei Tickets heißen die Bereiche *von mir gemeldet*, *mir zugewiesen* und *meiner Teams*.

Die Administration verwaltet das System (Rollen, Rechte, Einstellungen, Abläufe, Stammdaten), sieht aber **keine Inhalte** von selbst: weder Anlagen, Tickets, Aufgaben, Ziele und Serien noch Personaldaten wie Schulungen, Eignungsbeurteilungen oder Urlaub. Wer als Administrator damit arbeitet, braucht dafür eine Rolle wie *Leitung* oder *Personalwesen*, wie alle anderen auch. Deine eigene Arbeit erledigst du über eine solche zweite Rolle. Fremde Dateien und Kommentare an einem Vorgang löschen nur Personen mit dem Recht „alle bearbeiten“ des jeweiligen Bereichs.

Jede Änderung an Rollen einer Person, an den Rechten einer Rolle und an Teammitgliedschaften wird **protokolliert**: wer, wann, was, für wen. Das Protokoll kann niemand ändern oder löschen, auch kein Administrator; lesen darf es nur das Personalwesen. Das gilt auch, wenn du dir selbst eine Rolle gibst.

## Zuständigkeit für Anlagen {#grants}

Die Rolle sagt, **was** jemand darf, das Team sagt, **wo**. Im Formular einer Anlage wählst du das zuständige Team; es gilt für den ganzen Teilbaum, einschließlich Tickets, Aufgaben, Kommentare und Dateien, und Teams weiter oben bleiben zuständig. Ein Mitglied darf dort tun, was seine eigenen Rollen mit „… für die mein Team zuständig ist“ erlauben. Pro Team schaltest du unter **Teams** („Zuständig für Anlagen“) ein, ob es für Anlagen gewählt werden darf. Jede Änderung steht im Protokoll.

## Konfiguration {#configuration}

Die Konfiguration ist ein Kartenraster. Jede Karte öffnet einen der folgenden Bereiche; die Aufgabentypen haben einen eigenen Eintrag im Menü „Einstellungen“.

## Aufgabentypen {#task-types}

Ein Aufgabentyp legt den Ablauf fest: Schritte, wer jeden Schritt bearbeitet, was ein Schritt verlangt (Punkte dieses Schritts), Entscheidungen (Freigeben, Ablehnen …) und Übergänge. Im Editor stellst du auch ein: Standardteam, Standard-Arbeitsblatt, Besitzer, Texte für die Startseite, die erlaubten Unteraufgaben-Typen (leer = der Typ nimmt keine Unteraufgaben), was Aufgaben dieses Typs mit **Artikeln** machen (keine, brauchen und verbrauchen, bestellen) und welche Kategorien sie anbieten und ob der Typ auf „Neues Anliegen“ erscheint. Das Anlegen und Löschen von Typen ist Administratoren vorbehalten, Besitzer dürfen ihre Typen bearbeiten. Ein Typ kann eine **Sonderfunktion** tragen (Feld im Editor, nur für Administratoren), zum Beispiel *Urlaub*: Den Ablauf gestaltest du frei, er muss aber die Sonderfunktionen enthalten, die der Urlaubsantrag braucht; der Editor warnt, wenn sie fehlen. Pro Sonderfunktion gibt es einen Typ, und ein Typ mit Sonderfunktion lässt sich nicht löschen. Unter **Einstellungen** legst du fest, mit welchem Typ neue Aufgaben beginnen (ohne Asset und für Arbeit an einem Asset); diese Typen lassen sich ebenfalls nicht löschen.

**Symbol und Farbe:** Im Editor wählst du ein Symbol für den Typ; es steht vor jeder Aufgabe dieses Typs in den Listen und auf „Meine Arbeit“. Die Farbe ist zunächst grau. Gib einem Typ nur dann eine Farbe, wenn sie etwas bedeutet (zum Beispiel Störungen orange), sonst wird die Oberfläche unruhig.

**Wer einen Schritt bearbeitet** („Bearbeitet von“): eine Rolle (leer = alle, die die Aufgabe bearbeiten dürfen), ein festes Team, **das Team der Aufgabe** (alle Mitglieder, auch wenn eine Person zugewiesen ist; ändert jemand das Team, wandert der Schritt mit; nicht für Entscheidungsschritte, denn das Team wählt der Anfragende), die zugewiesene Person der Aufgabe (ohne Person ihr Team), die anfragende Person oder deren vorgesetzte Person (eine oder mehrere Ebenen höher). Eine Rolle lässt sich unter **Nur Mitglieder von** auf ein Team beschränken: das Team der Aufgabe, ein Team der anfragenden Person (etwa „Leitung in meinem Team“; bei mehreren Teams zuerst das Team der Aufgabe, sonst das erste nach Name, in dem jemand die Rolle hat) oder ein festes Team. Bei einem **Entscheidungsschritt** steht das Team der Aufgabe nicht zur Wahl (das wählt die anfragende Person selbst), und Teams, die Benutzer selbst angelegt haben, zählen nicht. Dann handeln nur die Inhaber der Rolle in diesem Team, und nur sie werden benachrichtigt; zieht die Aufgabe in ein anderes Team um, folgt der Schritt. Hinterlege keine festen Namen: Regeln überstehen Urlaub und Wechsel. Findet eine Regel niemanden (keine vorgesetzte Person, eine Serie ohne anfragende Person), geht der Schritt an die Rolle unter „Falls niemand gefunden wird“, sonst an die Standardrolle unter **Einstellungen** (anfangs Leitung); ist auch die leer, handelt, wer die Aufgabe bearbeiten darf.

Die Aufgaben verweisen auf den Ablauf ihres Typs, sie kopieren ihn nicht: Eine Änderung gilt sofort auch für laufende Aufgaben. Einen Schritt, in dem noch offene Aufgaben stehen, kannst du deshalb weder löschen noch umbenennen.

Der Editor beginnt mit einer **Ablaufübersicht**: jeder Schritt in einer Zeile mit seinen Entscheidungen und wohin sie führen, so sind Verzweigungen auf einen Blick sichtbar. Jeder Schritt ist eine eingeklappte Karte; öffne sie, um zu ändern, wer ihn bearbeitet, seine Entscheidungen, seine Punkte und Sonderfunktionen. **Punkte dieses Schritts** legst du direkt in der Karte an (Abhaken, OK / Mangel, Messwert, Notiz, Datum), ohne eigene Arbeitsblatt: Sie kommen in das Arbeitsblatt jeder neuen Aufgabe dieses Typs, und ein Pflichtpunkt hält den Schritt, bis er beantwortet ist; der Dialog der Aktion fragt danach. Schalte einen Schritt auf **Entscheidungsschritt**, wenn eine Person zwischen seinen Entscheidungen wählt (Genehmigen oder Ablehnen, Variante A oder B): Die Aufgabe erscheint dann unter *Zur Entscheidung* bei dem, auf den der Schritt wartet. Ein Entscheidungsschritt braucht mindestens zwei Entscheidungen und muss benennen, wer entscheidet (eine Rolle, ein Team, der Vorgesetzte, der Anforderer oder der Aufgabenbesitzer, nicht „Beliebige“).

**Sonderfunktionen** (pro Schritt, unter den Punkten des Schritts): Funktionen, die im selben Moment wie ein Schrittwechsel laufen, etwa schreibt ein Abwesenheitsablauf die Entscheidung in die Abwesenheit zurück. Du wählst die Funktion und wann sie läuft (Aufgabe kommt in den Schritt, in ihm wird eine Aktion ausgeführt, sie verlässt ihn, wird aus ihm abgeschlossen oder in ihm abgebrochen). Scheitert eine Funktion, wird die Aktion nicht ausgeführt. Dieselbe Liste gibt es für den **ganzen Aufgabentyp** (läuft für jeden Schritt): Dort wird das Ticket, aus dem eine Aufgabe entstand, beim Abschluss gelöst und beim Abbruch zurückgegeben (wieder offen), und ein Bestelltyp bucht den Eingang seiner Artikel. Welche Funktionen es gibt, legen die Entwickler fest; ein Schritt ohne Eintrag leitet nur weiter.

## Anlagentypen und Merkmale {#asset-types}

**Anlagentypen** beschriften den Anlagenbaum. Jeder Typ kann ein **Symbol** bekommen (zum Beispiel Motor, Gabelstapler, Tank); es steht im Baum und in den Listen vor der Anlage. Anlagen werden an der Form unterschieden, nicht an einer Farbe. „Gruppierungsknoten“ dienen nur der Gliederung des Baums, die Anlagenliste blendet sie standardmäßig aus.

## Merkmale {#asset-attributes}

Merkmale sind technische Daten pro Anlagentyp: Text, Zahl, Datum, Ja/Nein oder Auswahlliste. Die Werte pflegen Nutzer an der [Anlage](help:assets#attributes).

## Ticket-Warteschlangen {#ticket-queues}

Eine Warteschlange ist ein Service-Desk mit eigenen Tickettypen, zum Beispiel „Instandhaltung“ und „IT-Service-Desk“. Was jemand mit Tickets tun darf, kommt aus den Rollen und ist für alle Warteschlangen gleich. Die **Teams** einer Warteschlange bestimmen, wo die breiten Rechte („alle Tickets“, „zugewiesene Anlagen“) und das Ändern von Tickets gelten: Mitglieder eines ihrer Teams bearbeiten die Warteschlange; eine Warteschlange ohne Team bearbeiten alle, die das Recht haben. Eigene Tickets und die des eigenen Teams siehst du in jeder Warteschlange. **Für alle offen** erlaubt jeder angemeldeten Person, in der Warteschlange zu melden und die eigenen Tickets zu verfolgen, wie beim IT-Service-Desk. Das **Standardteam** bekommt neue Tickets, wenn die meldende Person niemanden wählt. Eine neue Warteschlange braucht keinen Entwickler: Name, Typen, Teams.

## Abwesenheitsarten {#absence-types}

Unter **Konfiguration > Abwesenheitsarten** stehen die Arten von Abwesenheit, die gemeldet werden können: Urlaub, Sonderurlaub und was du ergänzt (etwa Krankheit, Dienstreise, Homeoffice). Jede Art hat einen Namen in beiden Sprachen, Symbol und Farbe und eine **Route**: einen Aufgabentyp mit der Sonderfunktion „Abwesenheit“. Mehrere Arten können sich eine Route teilen. **Zählt als Urlaub** nimmt eine Art in die Urlaubstage pro Jahr auf.

Alles Weitere bestimmt die Route. Ein Entscheidungsschritt (etwa die Führungskraft) braucht die Sonderfunktion „Abwesenheit: Entscheidung zurückschreiben“ bei „In diesem Schritt wird eine Aktion ausgeführt (weiter oder abschließen)“; der Editor warnt, wenn sie fehlt. Schritte nach der Entscheidung sind gewöhnliche Schritte, zum Beispiel das **Buchen in der Zeiterfassung**: ein Rollenschritt wie „Zeiterfassung“, unter **Nur Mitglieder von** auf ein Team des Antragstellers eingegrenzt, damit die buchende Person jeder Abteilung ihre Abwesenheiten bekommt; die Aktion „Gebucht“ schließt die Aufgabe ab. Eine Route **ohne** Entscheidungsschritt lässt die Abwesenheit sofort gelten (eine Krankmeldung, die nur HR bucht, sobald die Bescheinigung vorliegt). Für eine neue Route einen Aufgabentyp anlegen, die Sonderfunktion „Abwesenheit“ wählen und für den ganzen Typ zwei Funktionen eintragen: „Abwesenheit: als zurückgezogen markieren“ bei „Die Aufgabe wird in diesem Schritt abgebrochen“ und „Abwesenheit: Entscheidung zurückschreiben“ bei „Die Aufgabe wird aus diesem Schritt abgeschlossen“ (eine Abwesenheit, die beim Ende der Aufgabe noch wartet, etwa nach einer Rückgabe zur Nacharbeit, gilt dann als abgelehnt). Die Sonderfunktion eines Typs, der schon Aufgaben hat, lässt sich nicht mehr ändern; dann einen neuen Typ anlegen.

## Phrasen {#phrases}

Allgemeine Auswahllisten, etwa Dokumenttypen, Schulungskategorien sowie Kategorien und Einheiten der Artikel, jeweils in Deutsch und Englisch.

## E-Mail-Versand {#email}

SMTP-Server, Absender, Zeit der Tageszusammenfassung. „Testmail senden“ prüft die Verbindung, „Jetzt senden“ löst den Versand sofort aus. Das Passwort wird nur geschrieben, nie angezeigt.

## Feiertage {#holidays}

Unter **Konfiguration > Feiertage** stehen die Tage, die nicht als Urlaubstage zählen. Stelle das **Bundesland je Standort** ein, wähle die Jahre und drücke **Feiertage importieren**: Die Feiertage kommen vom offenen Dienst Nager.Date, bundesweite für alle und regionale für die Standorte in diesem Bundesland. Ein Import ersetzt früher importierte Einträge dieser Jahre und lässt selbst eingetragene stehen. Ein Feiertag, den nur ein Teil eines Bundeslandes begeht, wird für das ganze Bundesland importiert: Lösche ihn in der Liste, wenn er nicht gilt. Betriebsferien und Brückentage trägst du mit **Feiertag hinzufügen** ein.

## Fristen {#deadlines}

Die Standard-Frist neuer Aufgaben.

Unter **Betriebsanweisungen** legst du fest, welche Sprachen der Editor bei jedem Entwurf anbietet. Deutsch steht immer vorn, siehe [Betriebsanweisungen](help:operating-instructions#languages).

## Sicherheit {#security}

Die zweite Stufe (Authenticator oder Microsoft-Anmeldung) ist in der Regel für alle Konten verpflichtend. Die Seite „Benutzer“ zeigt, wer wie angemeldet ist.
