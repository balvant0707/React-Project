---
routes: /positions, /positions/:id#position-page, /positions/:id/versions/:versionId#versions, /people/:id/fit-review#fit-review
---
# Stellen und Stellenbeschreibungen

Hier pflegst du Stellenbeschreibungen, die Versionen dazu, wer welche Stelle innehat und wer wofür beauftragt ist (z. B. Ersthelfer).

## Stellenliste {#list}

Unter **Stellen** stehen alle Stellen, die du sehen darfst. **Neue Stelle** legt eine an: Name, Kürzel und Teams. Eine Stelle kann **direkt** Personen zugewiesen sein oder **über Teams**: Alle Mitglieder des Teams haben dann die Stelle inne. Der Filter **Art** zeigt nur Stellen oder nur Beauftragungen.

## Stellenseite {#position-page}

Reiter:

- **Beschreibung:** die gültige Stellenbeschreibung.
- **Versionen:** alle Fassungen mit Status.
- **Inhaber:** wer die Stelle heute innehat, die direkten Zuordnungen mit Zeitraum (**Von** und **Bis**) und der Verlauf. Wer am Stichtag Inhaber war, lässt sich auch zu einem früheren Datum nachsehen. Eine Zuordnung beendest du, indem du **Bis** setzt. Sie bleibt dann als Verlauf stehen. **Löschen** ist nur für Fehler gedacht.
- **Schulungen:** welche Schulungen für die Stelle vorgeschrieben sind.

## Beauftragungen {#appointments}

Ersthelfer, Brandschutzhelfer und ähnliche Aufgaben legst du als Stelle der Art **Beauftragung** an (**Neue Stelle**, Art „Beauftragung“). Für eine Beauftragung gilt:

- Sie wird immer **einer Person direkt** übertragen, nie über ein Team.
- Im Reiter **Inhaber** wählst du **Person beauftragen**. Dort trägst du ein, **von** wann (auch rückwirkend) und optional **bis** wann sie gilt und wer **beauftragt** hat. Das unterschriebene **Bestellschreiben** lädst du in der Zeile hoch. Lesen dürfen es die Person selbst und das Personalwesen.
- Eine Zuordnung mit Bestellschreiben lässt sich nicht löschen. Beende sie mit einem **Bis**-Datum.
- **Pflichtschulungen** (z. B. Erste Hilfe) hängst du wie bei jeder Stelle im Reiter **Schulungen** an. Wer beauftragt ist, bekommt sie in die Schulungsübersicht und wird erinnert.
- Eine Beauftragung gehört nicht zur **Eignungsprüfung**.

Auf der Personenseite stehen die Beauftragungen mit Startdatum und Bestellschreiben unter den Stellen. Wer beauftragt ist, sehen alle.

## Versionen und Freigabe {#versions}

Eine Stellenbeschreibung durchläuft: **Entwurf → Eingereicht → Veröffentlicht → Archiviert**.

1. Im Reiter „Versionen“ legst du einen **neuen Entwurf** an und bearbeitest ihn im Editor. Die **Anforderungen** sind eine Liste: Tippe eine Anforderung ein und drücke Enter. Schon verwendete Texte werden vorgeschlagen, ein neuer Text wird dazugelernt.
2. **Einreichen** schickt ihn zur Prüfung.
3. Wer „alles bearbeiten“ darf, kann den Entwurf **zurückgeben** oder **veröffentlichen**. Die vorige Version wird archiviert.

Die Beteiligten bekommen jeweils eine Benachrichtigung.

## Eignungsprüfung {#fit-review}

Die Eignungsprüfung beantwortet regelmäßig: **Erfüllt die Person die Anforderungen ihrer Stelle(n)?** COMPASS speichert dafür nur das Ergebnis deiner Prüfung, keine Fähigkeiten der Person.

1. Öffne die Person und wähle in der Karte **Eignungsprüfung** den Knopf **Eignung prüfen**. (Eine Übersicht aller Personen steht unter Stellen im Reiter **Eignungsprüfungen**.)
2. COMPASS fasst die Anforderungen **aller Stellen** der Person zusammen. Eine Anforderung, die mehrere Stellen haben, erscheint einmal. Daneben steht die Feststellung der **letzten Prüfung**.
3. Bewerte jede Anforderung von Hand mit **Erfüllt** oder **Abweichung** und schreibe bei Bedarf einen Kommentar. Das Gesamtergebnis folgt daraus: eine Abweichung genügt.
4. Trage eine Notiz und bei Abweichungen eine **Maßnahme** mit Termin und Status ein.
5. Das Datum der **nächsten Prüfung** steht auf einem Jahr nach der Prüfung. Du kannst es ändern.

Der Status je Person: **Nie geprüft**, **Überfällig**, **Bald fällig** (30 Tage) oder **Aktuell**. Wer Prüfungen durchführen darf, bekommt montags eine Meldung, wenn Fälle anstehen. Jede Prüfung hält fest, gegen welche **Version** der Stellenbeschreibung geprüft wurde. Prüfungen werden nicht gelöscht; **Korrigieren** ändert eine bestehende Prüfung, die **Druckansicht** auf der Personenkarte bündelt alle Prüfungen für den Audit. Wer prüfen darf, regelt ein eigenes Recht (Eignungsprüfungen, getrennt von den Stellenbeschreibungen): Führungskräfte prüfen ihr Team und die Personen unter sich, das Personalwesen alle. Die geprüfte Person sieht ihre Prüfungen nur, wenn ihr dieses Recht ausdrücklich gegeben wurde.

Hat eine Stelle noch keine veröffentlichte Stellenbeschreibung, gehört sie nicht zur Prüfung; COMPASS weist darauf hin.

## Drucken {#print}

**Druckansicht** erzeugt eine druckfertige Seite der veröffentlichten Version mit Feldern für Datum und Unterschrift von Vorgesetzten und Stelleninhaber. Eine nicht veröffentlichte Version wird als „Nicht gültig“ markiert.

## Rechte {#rights}

Alle sehen ihre eigene Stelle. Führungskräfte sehen und bearbeiten die Stellen ihres Teams, das Personalwesen alle. Archivierte Versionen und Verlaufseinträge löscht nur das Personalwesen, ausschließlich zur Fehlerkorrektur.
