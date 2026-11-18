---
routes: /trainings, /trainings/sessions/:id#sessions
---
# Schulungen

COMPASS führt, wer welche Schulung gemacht hat, wann sie abläuft und was fehlt. Nachweise werden bei der Schulung abgelegt.

## Matrix {#matrix}

Der Reiter **Matrix** zeigt Personen gegen Schulungen. Jede Zelle zeigt das Gültig-bis-Datum, farbig:

- **Grün (Gültig)**
- **Orange (Bald fällig)**
- **Gelb (Nachunterweisung fällig)**: noch gültig, aber eine [Betriebsanweisung](help:operating-instructions#trainings) der Schulung wurde wesentlich geändert oder neu hinzugefügt.
- **Rot (Abgelaufen)**
- **Fehlt** (vorgeschrieben, aber nicht vorhanden) und **Befreit** (mit Begründung).

Filter für Team, Kategorie und Suche. „Nur Handlungsbedarf“ blendet alles Gültige aus. Ein Klick auf eine Zelle öffnet die Schulungen der Person.

## Bald fällig {#due}

Der Reiter **Bald fällig** listet abgelaufene, fehlende und demnächst ablaufende Einträge.

## Katalog {#catalogue}

Im **Katalog** definiert das Personalwesen die Schulungsarten: Kategorie, Gültigkeit in Monaten oder einmalig, Vorlauf der Erinnerung, ob ein Zertifikat vorgeschrieben ist, wer verantwortlich ist (Vorgesetzte der Teilnehmenden, eine bestimmte Person oder eine externe Stelle als Text) und wie lange Daten nach dem Austritt aufbewahrt werden. Außerdem legt es fest, für **welche Teams, Rollen und Stellen** eine Schulung vorgeschrieben ist. Die Anforderungen einer Person sind die Summe aus allen dreien und den Anforderungen, die für sie einzeln gesetzt wurden. Unter **Unterwiesene Betriebsanweisungen** wählst du die Betriebsanweisungen, die die Schulung vermittelt, z. B. alle BAs der Jahresunterweisung einer Abteilung. Siehe [Betriebsanweisungen](help:operating-instructions#trainings).

## Eintrag erfassen und erneuern {#record}

In den Schulungen einer Person (Personenseite oder Matrix) gibt es **Eintrag erfassen** und **Erneuern**. Du trägst Datum, Schulungsleitung und Notiz ein und fügst Nachweise (Zertifikate, Fotos) hinzu. Ein Zertifikat ist nie Pflicht beim Speichern: es lässt sich jederzeit nachreichen. Für mehrere Personen oder mehrere Schulungen auf einmal plant man eine [Durchführung](help:trainings#sessions).

Vorgesetzte (und die Vertretung eines Vorgesetzten) bearbeiten die Schulungen der Personen unter sich, auf jeder Ebene, sofern ihre Rolle es erlaubt; das Personalwesen bearbeitet die aller. Ein gemeinsames Team genügt nicht. Wer keinen Vorgesetzten eingetragen hat, ist nur für das Personalwesen sichtbar, trage den Vorgesetzten daher dort nach. Du kannst nur Personen wählen, die du bearbeiten darfst. Einträge werden nie gelöscht, damit die Historie erhalten bleibt.

## Durchführungen {#sessions}

Eine **Durchführung** bündelt eine Unterweisung für mehrere Personen und mehrere Schulungen, zum Beispiel Brandschutz und Gefahrstoffe am selben Termin.

1. **Schulung planen** (oben auf der Seite): Schulungen, Termin, Trainer, Ort und die eingeladenen Personen wählen, auch ein ganzes Team. Unter **Ergänzende Inhalte** stehen Punkte nur dieser Durchführung.
2. **Teilnehmerliste drucken**: das Formular listet die Inhalte jeder Schulung aus dem Katalog, die ergänzenden Punkte und alle Eingeladenen mit einem Feld für die Unterschrift unter dem Bestätigungstext („Ich habe den Inhalt der obigen Unterweisung verstanden …“). Vermittelt eine Schulung Betriebsanweisungen, stehen sie mit Nummer und Version darunter. Drei freie Zeilen für Nachzügler.
3. Nach der Schulung auf der Durchführung abhaken, wer **nicht** teilgenommen hat, Personen ergänzen oder von der Liste nehmen.
4. **Bestätigen**: erst jetzt entstehen die Einträge, je Teilnehmer und Schulung einer, mit dem Termin als Datum. Danach sind Termin, Schulungen und Liste fest; wer vergessen wurde, lässt sich noch hinzufügen und bekommt seine Einträge sofort.

Die unterschriebene Liste oder ein Zertifikat lädst du unter **Nachweise** der Durchführung hoch, auch Wochen später. Der Nachweis gilt für alle Teilnehmer und erscheint bei ihren Einträgen. Die Inhalte einer Schulung pflegt das Personalwesen im Katalog (Feld **Inhalte**). Der Reiter **Durchführungen** zeigt zuerst die geplanten, dann die bestätigten.

## Schulung für eine Person vorschreiben {#require-person}

Braucht nur eine einzelne Person eine Schulung, ohne dass es schon einen Eintrag gibt, öffne ihre Schulungen (Personenseite) und wähle **Schulung vorschreiben**. Die Schulung steht dann als **Fehlt** in der Matrix und in den Erinnerungen, bis ein Eintrag erfasst ist. Mit **Anforderung zurücknehmen** nimmst du sie wieder weg. Vorgesetzte tun das für die Personen unter sich, das Personalwesen für alle. Für ganze Gruppen nutzt du im Katalog Team, Rolle oder Stelle.

## Erinnerungen {#reminders}

Wer eine vorgeschriebene Schulung hat, die bald abläuft, abgelaufen ist, fehlt oder eine Nachunterweisung braucht, bekommt eine Glockenmeldung (einmal pro Ablaufdatum, bei Abgelaufen, Fehlt und Nachunterweisung zunächst sofort, dann wöchentlich). Vorgesetzte, die handeln dürfen, erhalten täglich eine Sammelzeile. Abschalten im [Profil](help:profile#reminders).
