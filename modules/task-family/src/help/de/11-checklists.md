---
routes: /checklists
---
# Arbeitsblätter

Arbeitsblätter sind abzuarbeitende Punkte innerhalb einer Aufgabe. Es gibt offizielle Vorlagen und eigene Listen pro Aufgabe.

## Vorlagen verwalten {#templates}

Unter **Arbeitsblätter** pflegst du die Vorlagen-Bibliothek. **Neue Vorlage** öffnet den Editor.

- **Punktarten:** Überschrift, Abhaken, OK / Mangel, Messwert (mit Einheit sowie Min und Max), Notiz, Datum.
- **Pflicht:** Pflichtpunkte müssen beantwortet sein, bevor die Aufgabe abgeschlossen werden kann. Punkte, die ein Aufgabentyp direkt an einem Schritt festlegt ([Punkte dieses Schritts](help:admin#task-types)), stehen in jeder neuen Aufgabe ganz oben und bleiben beim Wechsel der Vorlage erhalten. Ist ein Pflichtpunkt einem Schritt zugeordnet, hält er schon diesen Schritt: Weiterschalten geht erst, wenn er beantwortet ist. Ablehnen, Zurückschicken und Abbrechen bleiben möglich. So wird ein Pflichtpunkt am Schritt zum Checkpunkt („Angebot liegt bei“).
- Mit `Enter` fügst du den nächsten Punkt ein, Rücktaste in einem leeren Punkt löscht ihn. Eine Liste mit einem Punkt pro Zeile kannst du einfügen.
- Ein **Aufgabentyp** an der Vorlage hängt sie als Standard an. Punkte lassen sich Schritten des Ablaufs zuordnen.
- **Duplizieren** kopiert eine Vorlage.

Änderungen an einer Vorlage gelten für Listen, die ab jetzt angelegt werden. Bestehende Listen behalten ihre Punkte.

## Auf der Aufgabe ausfüllen {#fill}

Auf der Aufgabe fügst du über **Vorlage wählen** ein Arbeitsblatt hinzu oder legst eigene Punkte an („Eigene Punkte hinzufügen“). Beim Ausfüllen:

- **OK**, **Mangel** oder **n. a.** pro Punkt, bei Messwerten eine Zahl. Liegt sie außerhalb der Grenzen, erscheint ein Warnzeichen.
- Zu jedem Punkt kannst du **Fotos** aufnehmen und eine Notiz schreiben.
- Das Menü der Liste bietet „Als Vorlage speichern“ und „Arbeitsblatt entfernen“.

Beim Abschließen warnt COMPASS: „Arbeitsblatt unvollständig: … Pflichtpunkt(e) noch offen.“ Beim Weiterschalten eines Schritts mit offenen Pflichtpunkten erscheint dieselbe Warnung für den Schritt. Der Fortschritt erscheint als Tag in der Aufgabenliste und auf Karten der Plantafel.

## Mangel melden {#defect}

Bei einem Mangel (oder einem Messwert außerhalb der Grenzen) bietet COMPASS **Ticket erstellen** oder **Folgeaufgabe** an. Beim Ticket werden Fotos mitkopiert, am Punkt erscheint ein Link „Ticket #…“.

## Ohne Netz {#offline}

Eingaben und Fotos bleiben auf dem Gerät und werden gesendet, sobald wieder Empfang da ist. Die Zahl der wartenden Eingaben wird angezeigt.

## In Serien {#series}

Hängst du ein Arbeitsblatt an eine [Serie](help:recurring), bekommt jede erzeugte Aufgabe die aktuelle Version. Es gibt auch eigene Punkte pro Serie.
