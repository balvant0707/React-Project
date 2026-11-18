---
routes: /items, /items/:id#item-page, /items/locations/:id#stock, /items/locations/labels#stock
---
# Artikel

COMPASS führt einen Katalog der **Artikel**: Ersatzteile, Verbrauchsmaterial, Schutzausrüstung, Laborbedarf, Bürobedarf, Hygieneartikel. Jede Maschine hat eine Ersatzteilliste, eine Aufgabe die Artikel, die sie braucht oder verbraucht hat, und eine Beschaffungsanfrage die Artikel, die sie bestellt. Ausgewählte größere Ersatzteile lassen sich auf Lager führen (siehe [Bestand](help:items#stock)); Bestellung und Rechnung laufen im ERP.

## Der Katalog {#catalogue}

Über den Reitern zeigt eine Reihe von Zahlen, was Aufmerksamkeit braucht (auf dem Telefon seitlich wischen): **Unter Mindestbestand** und **Artikel mit Bestandsführung** (nur mit dem Bestandsrecht) sowie **Aufgaben warten auf Material**. Ein Tipp öffnet die passende Liste.

**Artikel** zeigt alle aktiven Artikel. Suche nach Artikelnummer, Hersteller- oder ERP-Nummer oder Name; filtere nach Kategorie oder Lieferant oder zeige nur kritische Artikel. „Inaktive zeigen“ listet auch Artikel, die nicht mehr verwendet werden.

Wer das Recht „Katalog pflegen“ hat (standardmäßig Manager und Einkauf), legt Artikel mit **Neuer Artikel** an:

- **Artikelnummer:** unsere eigene Nummer, eindeutig.
- **Name** und **Kategorie** (die Liste pflegt die Administration unter Phrasen).
- **ERP-Artikelnr.:** der Artikel, auf den das ERP bucht, ein echter oder der Dummy-Artikel für solche Einkäufe.
- **Hersteller, Herstellernummer.**
- **Lieferant:** der bevorzugte Lieferant. Einen neuen Namen kannst du direkt im Feld anlegen.
- **Einheit:** Stück, Satz, Meter, Packung …
- **Lieferzeit:** Tage von der Bestellung bis zur Lieferung. Sie steuert die Erinnerung, [rechtzeitig zu bestellen](help:items#lead-time).
- **Stückpreis (netto):** nur mit dem Recht, Kosten zu sehen, sichtbar.
- **Kritisch:** ohne diesen Artikel steht die Maschine. Kritische Artikel sind überall rot markiert.

Ein Artikel, der an einer Aufgabe oder Serie verwendet wird, lässt sich nicht löschen; setze ihn stattdessen auf inaktiv.

## Die Artikelseite {#item-page}

Die Artikelseite zeigt die Daten mit dem **Hauptfoto**, die Maschinen, in denen der Artikel **verbaut** ist, die **Aufgaben**, an denen er gebraucht oder bestellt wurde, und **Dokumente** wie Datenblätter, Zeichnungen und Fotos.

## Fotos {#photos}

Ersatzteile erkennt man am Aussehen, darum gib jedem Artikel ein Foto: auf der Artikelseite, Reiter **Dokumente**, **Datenblatt oder Foto hinzufügen** (am Handy auch direkt mit der Kamera). COMPASS verkleinert das Foto und legt eine kleine Kopie für Listen an. Bei mehreren Fotos wählt **Als Hauptfoto** das, das überall erscheint; ohne Wahl erscheint das erste Foto. Ein Klick auf ein Foto zeigt es groß.

Das Foto erscheint im Katalog, in der Ersatzteilliste einer Maschine, beim Hinzufügen eines Artikels zu einer Aufgabe, in den Zeilen einer Aufgabe oder Beschaffungsanfrage und bei der Frage, [welche Artikel du verbraucht hast](help:items#usage).

## Lieferanten {#suppliers}

Der Reiter **Lieferanten** listet die Lieferanten mit unserer Kundennummer, der **ERP-Lieferantennummer**, E-Mail, Telefon und Website. Dieselben Lieferanten stehen bei den Fremdkosten einer Aufgabe zur Wahl. Ein verwendeter Lieferant lässt sich nicht löschen; deaktiviere ihn.

## Ersatzteilliste einer Maschine {#asset-parts}

Auf der Anlagenseite zeigt der Reiter **Ersatzteile**, welche Artikel in der Maschine verbaut sind, wie viele und wo („Antriebsseite links“). Umschalten zwischen **Liste** und **Karten**: Karten zeigen jedes Teil mit großem [Foto](help:items#photos), praktisch am Handy vor der Maschine. Der Browser merkt sich die Wahl; ohne Wahl zeigen Handys Karten und PCs die Liste. „Mit allem darunter“ nimmt die Listen aller untergeordneten Anlagen dazu. **Von Asset übernehmen** kopiert die Liste einer gleichen Maschine. QR-Code an der Maschine scannen, und du hast die Liste in der Hand.

## Artikel an einer Aufgabe {#task-items}

Was eine Aufgabe mit Artikeln macht, legt ihr [Aufgabentyp](help:admin#task-types) fest:

- **Brauchen und verbrauchen** (ab Werk Instandhaltung und Prüfung): die Aufgabe listet, was fehlt, was geplant ist und was verbraucht wurde.
- **Bestellen** (die Beschaffungsanfrage): die Aufgabe listet, was sie bestellt, siehe [unten](help:items#purchase).
- **Keine Artikel** (alle anderen): kein Abschnitt.

Ein Aufgabentyp kann auf bestimmte Kategorien beschränkt sein; die Auswahl bietet dann nur diese an.

**Artikel hinzufügen** bietet zuerst die Ersatzteilliste der Maschine als Fotokacheln an: tippe auf das Teil, das du meinst. „Im ganzen Katalog suchen“ durchsucht alle Artikel, ebenfalls mit kleinem Foto. Was nicht im Katalog steht, trägst du als **Freitext** ein, so beschrieben, dass der Einkauf es bestellen kann. Am schnellsten geht es im Feld **Schnell erfassen**: „3 Packungen Toilettenpapier“ und Enter. Die Zahl wird zur Menge, ein Einheitenwort zur Einheit, der Rest zum Text; eine genaue Artikelnummer nimmt den Katalogartikel. Der Einkauf macht aus einer Freitextzeile mit einem Klick einen Katalogartikel.

Die Zustände:

- **Fehlt** (rot): der Artikel wird gebraucht, ist aber nicht da.
- **Bestellt** (gelb): eine Beschaffungsanfrage dafür ist offen.
- **Angefragt** (gelb): eine Zeile der Beschaffungsanfrage selbst, noch nicht geliefert.
- **Eingetroffen** (türkis): die Bestellung ist abgeschlossen.
- **Geplant** (blau): die Serie der Aufgabe sieht den Artikel vor.
- **Verbaut** (grün): der Artikel ist in die Maschine gegangen oder verbraucht.

## Fehlende Artikel bestellen {#order}

**Fehlende Artikel bestellen** (oder einzelne Zeilen auswählen und bestellen) legt mit dem normalen Aufgabenformular eine **Beschaffungsanfrage als Unteraufgabe** an. Sie läuft ihren Ablauf: Freigabe, Einkauf, Wareneingang. Die Zeilen bleiben an der Instandhaltungsaufgabe und werden mit der Anfrage verknüpft, nicht kopiert.

Solange Artikel fehlen oder unterwegs sind, zeigt die Aufgabe „Wartet auf Artikel“ auf ihrer Seite, in der Aufgabenliste und auf der Plantafel. Ist die Beschaffungsanfrage abgeschlossen, bekommt die zugewiesene Person eine Benachrichtigung und die Artikel stehen auf eingetroffen. Wird sie abgebrochen, fehlen die Artikel wieder und lassen sich neu bestellen.

## Die Beschaffungsanfrage {#purchase}

Eine Beschaffungsanfrage zeigt **Bestellte Artikel**: ihre eigenen Zeilen und die Zeilen der Aufgabe, aus der sie gestartet wurde (mit „Für Aufgabe #…“, nur lesbar). So brauchst du für Klopapier oder Laborbedarf keine Instandhaltungsaufgabe: starte die Beschaffungsanfrage direkt und erfasse die Artikel dort, aus dem Katalog oder als Freitext. Der Einkauf sieht alle Zeilen, auch ohne Zugriff auf die Instandhaltungsaufgabe.

Auch eine [Serie](help:recurring#create) kann eine Beschaffungsanfrage sein, etwa die monatliche Bestellung der Hygieneartikel: jede Anfrage der Serie bestellt die hinterlegten Artikel.

## Für das ERP kopieren {#erp}

Bestellung und Rechnung laufen im ERP. Damit der Einkauf nichts abtippt, kopiert **Für ERP kopieren** alle Zeilen der Beschaffungsanfrage tabgetrennt in die Zwischenablage: ERP-Lieferantennummer, Lieferant, ERP-Artikelnummer, Artikelnummer, Bezeichnung mit Hersteller und Herstellernummer, Menge, Einheit, Stückpreis, für welche Aufgabe, Notiz. Das lässt sich ins ERP oder in Excel einfügen. **CSV** lädt dasselbe als Datei herunter.

## Welche Artikel hast du verbraucht? {#usage}

Beim Abschließen einer Aufgabe, die Artikel braucht und verbraucht, fragt COMPASS nach den Stunden auch, welche Artikel du verbaut oder verbraucht hast. Geplante und eingetroffene Artikel sind schon angehakt, darunter steht die Ersatzteilliste der Maschine. Du kannst die Frage überspringen und Artikel später nachtragen.

## Geplante Artikel und Lieferzeit {#lead-time}

Eine [wiederkehrende Aufgabe](help:recurring#create) kann die Artikel nennen, die jede Aufgabe der Serie braucht, etwa den Filtersatz der Jahreswartung. Jede neue Aufgabe bekommt sie als geplant. Hat ein geplanter oder fehlender Artikel eine Lieferzeit und ist das Fälligkeitsdatum minus Lieferzeit erreicht, erinnert COMPASS die zugewiesene Person (oder das Team), jetzt zu bestellen. Abschalten kannst du das unter [Profil > Erinnerungen](help:profile#reminders).

## Kosten der Artikel {#costs}

Ein für die Aufgabe gekaufter Artikel zählt über die Rechnung an seiner Beschaffungsanfrage (Fremdkosten). Ein Katalogartikel aus dem Regal zählt in der [Auswertung](help:statistics#costs) als „Material aus dem Lager“ zum aktuellen Stückpreis. So wird nichts doppelt gezählt.

## Bestand {#stock}

Nur **relevante, größere Ersatzteile** werden auf Lager geführt. Kleinteile und Verbrauchsmaterial werden weiter per Kanban nachbestellt und bleiben außerhalb des Bestands von COMPASS.

- **Einschalten** im Artikel („Auf Lager führen“): Wähle den **Standardlagerort**, optional einen **Mindestbestand** (für den Artikel insgesamt, alle Lagerorte zusammen) und eine Bestellmenge. Dafür brauchst du das Recht, den Katalog zu pflegen.
- **Lagerorte** sind ein Baum: Lager, Regal, Fach. Öffne unter Artikel den Reiter **Lagerorte**. Jeder Lagerort hat einen kurzen **Code**, kann einem **verantwortlichen Team** zugeordnet werden und hat eine Seite mit seinem Bestand und einem QR-Code. Drucke die Etiketten mit **QR-Etiketten** (oder **Etikett drucken** auf der Seite des Lagerorts, inklusive allem darunter) und klebe sie an Regal oder Fach; Scannen mit der Handykamera öffnet den Lagerort.
- **Bestand je Artikel:** Der Reiter **Bestand** der Artikelseite zeigt die Menge je Lagerort, die Buchungen (neueste zuerst, ältere laden auf Wunsch) und die Aktionen. Der Reiter **Bestand** unter Artikel listet alle Artikel, die auf Lager geführt werden, mit dem Filter *Nur unter Mindestbestand*.
- **Entwicklung:** Unter den Buchungen zeigt ein Diagramm den Bestand des Artikels über die letzten 3, 6 oder 12 Monate, der Mindestbestand als gestrichelte Linie. In der Liste unter Artikel > Bestand zeigt eine kleine Linie je Artikel die letzten 12 Wochen; mit der Maus oder per Berührung siehst du den Wert einer Woche.
- **Entnahme geschieht in deiner Arbeit:** Schließt du eine Aufgabe ab und gibst an, welche Artikel du verbraucht hast, werden die Teile aus dem Bestand gebucht. Bei einem Lagerort wird nichts gefragt. Kommen die Teile von mehreren Orten, klicke unter dem Artikel auf **Ändern** und teile die Menge auf die Lagerorte auf (die Aufteilung muss aufgehen). Ohne Eingriff nimmt COMPASS zuerst vom Standardlagerort und dann von dort, wo Bestand liegt.
- **Wareneingang:** Wird eine Beschaffungsanfrage abgeschlossen, werden ihre Artikel, die auf Lager geführt werden, auf den Standardlagerort des Artikels gebucht. Ware ohne Anfrage buchst du mit **Bestand buchen** (*Zugang*); den Anfangsbestand beim Start als *Anfangsbestand*.
- **Zählen, korrigieren, umlagern:** **Zählen** bucht die Differenz zwischen gezählter und gebuchter Menge. **Umlagern** nimmt Bestand von einem Lagerort zum anderen. Eine Korrektur behebt einen Buchungsfehler. Erlaubt für das verantwortliche Team des Lagerorts (Recht „meine Teams“) oder überall (Recht „überall“).
- **Unter Mindestbestand:** Das verantwortliche Team des Standardlagerorts bekommt einmal eine Meldung, wenn ein Artikel seinen Mindestbestand unterschreitet, danach wöchentlich, solange er darunter bleibt; die Startseite zeigt die Zahl.
- **Nichts wird überschrieben.** Jede Buchung bleibt in der Liste der Buchungen stehen. Korrigierst du später die verbrauchten Teile einer Aufgabe, bucht COMPASS nur die Differenz.

> Ein negativer Bestand heißt, es wurde mehr entnommen als eingebucht war. Zähle diesen Lagerort; die Differenz wird als Zählung gebucht.
