---
routes: /recurring
---
# Serien-Aufgaben

Eine Serie erzeugt Aufgaben nach Zeitplan oder Betriebsstunden: Prüfungen, Wartungen, Kontrollen. Jede erzeugte Aufgabe ist eine normale Aufgabe.

## Die Liste {#list}

Unter **Serien-Aufgaben** stehen alle Regeln mit Zeitplan, nächster Fälligkeit und offenen Aufgaben. Ein Schalter aktiviert oder pausiert eine Regel, ein Fehler-Tag zeigt, dass die letzte Erzeugung scheiterte. Administratoren können mit **Jetzt erzeugen** sofort anlegen lassen, was heute fällig ist. Sonst läuft das täglich automatisch.

## Regel anlegen {#create}

**Neue wiederkehrende Aufgabe** öffnet das Formular.

- **Name:** wird zum Titel jeder erzeugten Aufgabe.
- **Wiederholung:** täglich, wöchentlich, monatlich, jährlich oder nach Betriebsstunden. Dazu „Alle …“ (Intervall), Beginn und optional Ende.
- **Nächster Termin:** „Folgt dem Kalender“ oder „Nächste Aufgabe entsteht, wenn die vorherige erledigt ist“.
- **Vorlauf (Tage):** so viele Tage vor der Fälligkeit erscheint die Aufgabe.
- **Warten, bis die vorherige erledigt ist:** keine neue Aufgabe, solange die letzte offen ist.
- **Wer:** das ganze Team, eine Person oder reihum durch die Teammitglieder.
- Optional Anlage, Aufgabentyp und Arbeitsblatt. Jede Aufgabe der Serie bekommt die aktuelle Version des Arbeitsblatts.
- **Artikel:** was jede Aufgabe der Serie braucht; es kommt als geplant an und erinnert ans [rechtzeitige Bestellen](help:items#lead-time). Bei einer Beschaffungsanfrage als Serie bestellt jede Anfrage diese Artikel.

Betriebsstunden brauchen eine Anlage. Die Stunden pflegst du an der Anlage, die erste Aufgabe entsteht nach einem vollen Intervall.

## Aus einer Aufgabe oder Anlage {#from-task}

Im Aufgabenmenü macht **Regelmäßig wiederholen …** eine bestehende Aufgabe zur Serie. Auf der Aufgabe steht dann „Wiederholt sich …“ mit „Bearbeiten“ und „Serie beenden“. Auf der Anlagenseite legt der Reiter „Serien“ Regeln für diese Anlage an.

## Pünktlichkeit {#punctuality}

Bei einer Serie zeigt ein Punktestreifen die letzten Ausführungen: pünktlich, verschoben oder zu spät. Siehe [Auswertung](help:statistics#punctuality).
