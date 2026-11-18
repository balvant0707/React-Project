---
routes: /tickets, /tickets/:id#ticket-page
---
# Tickets

Ein Ticket meldet eine Störung, eine Anfrage oder einen Prüfmangel, mit oder ohne Anlage. Aus einem Ticket entsteht bei Bedarf eine Aufgabe.

## Liste und Filter {#list}

Unter **Tickets** stehen die Tickets aller Warteschlangen, die du sehen darfst. Das Suchfeld neben „Filter hinzufügen“ filtert nach Titel, Anlage und Melder. Schnellfilter „Meine Tickets“ zeigt, was du gemeldet hast. Weitere Filter, Spalten und Sortierung wie bei [Aufgaben](help:tasks#list).

## Ticket anlegen {#create}

**Neues Ticket** öffnet das Formular. Ein Ticket mit Priorität **Hoch** oder **Dringend** meldet sich sofort bei den Mitgliedern der Teams der Warteschlange, die es bearbeiten dürfen (und bei der Verantwortlichen der Anlage). Wird die Priorität später erhöht, kommt keine Meldung; erwähne das Team dann im Kommentar mit @.

1. Wähle die **Warteschlange** (Service-Desk), wenn du in mehreren melden darfst. Typische Warteschlangen sind „Instandhaltung“ und „IT-Service-Desk“. Der **Typ** hängt von der Warteschlange ab (Störung, Anfrage, Prüfmangel, Änderung, Serviceanfrage).
2. Gib einen Titel und eine Beschreibung ein. Screenshots fügst du mit `Strg+V` ein.
3. Wähle die betroffene **Anlage**. Leer lassen bedeutet allgemeine Anfrage.
4. Lege die Priorität fest und speichere.

## Die Ticketseite {#ticket-page}

Wie bei Aufgaben stehen oben Titel und Aktionen, darunter die Feldleiste und der Verlauf mit Kommentaren, Erwähnungen und Dateien. Auf dem Handy öffnet der Chat-Knopf neben dem Status den Verlauf unter **Nachrichten**.

**Status:** Offen → In Bearbeitung → Gelöst → Geschlossen. „Wartet auf Rückmeldung“ bedeutet, dass das Team eine Antwort der meldenden Person braucht. Antwortet diese mit einem Kommentar, öffnet sich das Ticket wieder. Ein Banner weist die meldende Person darauf hin.

**Rechte:** Wer ein Ticket nur „prüfen“ darf, etwa die meldende Person, sieht es schreibgeschützt und kann im Verlauf antworten.

## Ticket in Aufgabe umwandeln {#convert}

**Aufgabe erstellen** macht aus dem Ticket eine Aufgabe und startet deren Ablauf. Du wählst Aufgabentyp und ein Team oder eine Person. Das Ticket zeigt danach „Aufgabe #… öffnen“, und der Status wechselt zu „In Aufgabe umgewandelt“. Hinweis zur Störungsbehebung: Aufgaben, die aus einem Ticket entstanden sind, zählen in der [Auswertung](help:statistics) als Störungsbehebung.

## Meldung per QR-Code {#qr}

Jede Anlage hat einen QR-Code. Wer ihn scannt, öffnet **ohne Anmeldung** das Meldeformular: „Was ist los?“, Details, optional Foto und Kontaktdaten. Danach erscheint die Ticketnummer. Die Meldung landet in der Warteschlange „Instandhaltung“. Ohne Empfang speichert das Telefon die Meldung und sendet sie später. Siehe [QR-Code und Etiketten](help:assets#qr).
