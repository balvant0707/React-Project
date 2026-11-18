---
routes: /operating-instructions#mine, /operating-instructions/:id#page, /operating-instructions/:id/versions/:versionId#editor
---
# Betriebsanweisungen

Betriebsanweisungen für **Gefahrstoffe** und **Maschinen**: versioniert, von der Arbeitssicherheit freigegeben und als eine A4-Seite gedruckt. Lesen darf sie jeder. Schreiben dürfen die Verantwortlichen, freigeben darf die Rolle **Arbeitssicherheit**.

## Liste {#list}

Im Reiter **Alle** unter **Betriebsanweisungen** stehen alle Anweisungen mit Nummer (**BA-0001**, fortlaufend), Titel, Art, Piktogrammen, Version, nächster Prüfung und Sprachen. Die Suche findet Nummer, alte Nummer, Titel, Stoff und Arbeitsbereich. Der Filter **Prüfung überfällig** zeigt, was nachgesehen werden muss.

**Neue Betriebsanweisung** (Arbeitssicherheit) legt eine Anweisung mit ihrem ersten Entwurf an. Die **Art** bestimmt die Abschnitte und die Farbe und lässt sich später nicht ändern:

| Art | Farbe | Abschnitte |
|---|---|---|
| Gefahrstoff | orange | Anwendungsbereich, Gefahren für Mensch und Umwelt, Schutzmaßnahmen und Verhaltensregeln, Verhalten im Gefahrfall, Erste Hilfe, Sachgerechte Entsorgung |
| Maschine | blau | Anwendungsbereich, Gefahren für Mensch und Umwelt, Schutzmaßnahmen und Verhaltensregeln, Verhalten bei Störungen, Erste Hilfe, Instandhaltung |

## Die Seite einer Betriebsanweisung {#page}

Links steht die Anweisung so, wie sie gedruckt wird. Darüber wählst du **Version** und **Sprache**. Rechts stehen:

- **Angaben:** Nummer, alte Nummer, verantwortliche Person, gültig ab, nächste Prüfung, Sprachen.
- **Gilt für:** Anlagen (die Anweisung gilt dann auch für alles darunter) und Anlagentypen (jede Anlage dieses Typs). Auf der Anlagenseite erscheint sie im Reiter **Betriebsanweisungen**.
- **Versionen** und **Verlauf** (eingereicht, zurückgegeben, veröffentlicht, geprüft, Übersetzungen).

**Geprüft, keine Änderung** (Arbeitssicherheit) bestätigt die jährliche Prüfung. Dabei verschiebt sich nur das Datum der nächsten Prüfung, eine neue Version entsteht nicht. Eine Anweisung, die nie veröffentlicht war, lässt sich löschen. Alle anderen werden **deaktiviert**.

## Entwurf bearbeiten {#editor}

Eine veröffentlichte Version ändert sich nicht mehr. **Neue Version** legt eine Kopie mit allen Sprachen an. Im Entwurf gilt:

- **Signalwort** (nur Gefahrstoffe), **Gültig ab** und **Was hat sich geändert**.
- **Erneute Unterweisung erforderlich** kreuzt du bei einer wesentlichen Änderung an. Siehe [Unterweisungen](help:operating-instructions#trainings).
- Pro Abschnitt: **Piktogramme** per Klick wählen (GHS, Warn-, Gebots-, Verbots-, Rettungs- und Brandschutzzeichen) und den Text schreiben. Die Piktogramme gelten für alle Sprachen.
- **Vorschau** zeigt die Seite mit allen Abschnitten, auch den leeren.

> Wer eine Anweisung verantwortet, reicht sie mit **Zur Freigabe einreichen** ein. Die Arbeitssicherheit prüft, gibt sie mit einer Notiz **zurück** oder **gibt sie frei**. Mit der Freigabe wird die alte Version archiviert, und die nächste Prüfung steht ein Jahr nach „gültig ab“ an.

## Sprachen und Übersetzungen {#languages}

**Deutsch ist die Leitsprache.** Weitere Sprachen sind Übersetzungen derselben Version. Mit dem Sprachschalter wechselst du die Sprache. Unter jedem Feld steht der deutsche Text zum Vergleich. Eine weitere Sprache fügst du über ihren zweistelligen Code hinzu, z. B. `pl` oder `tr`.

- Änderst du im Entwurf den deutschen Text, bekommen die Übersetzungen die Markierung **prüfen**, bis sie wieder gespeichert sind.
- Auch an einer **veröffentlichten** Version darf die Arbeitssicherheit Übersetzungen ergänzen oder korrigieren. Der deutsche Text bleibt dabei wie freigegeben. Jede solche Änderung steht im Verlauf.

## Meine Betriebsanweisungen {#mine}

Der Reiter **Meine** zeigt die Betriebsanweisungen, die du kennen musst. Sie kommen über deine vorgeschriebenen Schulungen (Stelle, Team, Rolle oder für dich einzeln). Links steht die Liste mit dem Stand (mit Suche nach Nummer, Titel, Stoff und Arbeitsbereich): **Unterwiesen** (Datum und Version), **Nachunterweisung fällig** oder **Noch nicht unterwiesen**. Rechts siehst du die Anweisung als Seite, in deiner Sprache, wenn es eine Übersetzung gibt. Auf dem Telefon öffnet ein Tipp die Anweisung. Alle Anweisungen stehen im Reiter **Alle**.

## Unterweisungen {#trainings}

Betriebsanweisungen werden über **Schulungen** unterwiesen. Im [Schulungskatalog](help:trainings#catalogue) wählst du pro Schulung die Anweisungen, die sie vermittelt. Eine Jahresunterweisung kann viele Anweisungen umfassen. Wer die Schulung braucht, muss diese Anweisungen kennen.

- Jeder Schulungsnachweis merkt sich, welche **Version** jeder Anweisung am Schulungstag gültig war.
- Wird eine Version mit **Erneute Unterweisung erforderlich** veröffentlicht oder kommt eine Anweisung neu zu einer Schulung, steht die Schulung bei allen, die auf eine ältere Version unterwiesen wurden, auf **Nachunterweisung fällig**. Es gibt dann auch eine Erinnerung.
- **Redaktionelle Änderungen** (Tippfehler, Formulierung, Layout) lösen keine Nachunterweisung aus. Bei der Freigabe ab Version 2 wählt die Arbeitssicherheit ausdrücklich **Redaktionelle Änderung** oder **Wesentliche Änderung**. In der Versionsliste steht die Einstufung als Markierung. Mit **Einstufung ändern** lässt sie sich auch nachträglich korrigieren; der Status aller Betroffenen folgt sofort, und die Änderung steht im Verlauf.
- Die Teilnehmerliste einer [Durchführung](help:trainings#sessions) nennt die Anweisungen mit Nummer und Version.
- Die Seite der Anweisung zeigt unter **Unterwiesen in**, welche Schulungen sie vermitteln. Die Personenseite und der Reiter **Schulungen** der Stelle zeigen die Anweisungen, die dort gelten.

## Excel-Export und -Import {#excel}

Über **Excel** im Reiter **Alle** bearbeitest du viele Anweisungen auf einmal oder lässt sie übersetzen.

- **Exportieren** schreibt die Anweisungen der aktuellen Filter in eine Datei, je Sprache eine Zeile. Gibt es einen offenen Entwurf, steht er in der Datei, sonst die veröffentlichte Version. Du wählst die Sprachen; eine Sprache ohne Übersetzung bekommt leere Zeilen zum Ausfüllen.
- **Leere Vorlage** ist dieselbe Datei ohne Anweisungen, für neue.
- Das Blatt **Guide** in der Datei erklärt die Spalten, das Blatt **Signs** listet alle Piktogramm-Codes.

Die wichtigsten Regeln:

- Art, Signalwort, Piktogramme, Anlagen, Anlagentypen und Schulungen zählen nur in der **deutschen Zeile**.
- **Neue Anweisung:** Nummer leer lassen. Übersetzungszeilen ohne Nummer direkt darunter gehören dazu.
- **Text:** jede Zeile ein Absatz, `- ` am Anfang eine Aufzählung, `1. ` eine nummerierte Liste, `**fett**`. Soll ein Absatz so beginnen, ohne Liste zu werden, schreib einen Backslash davor (`\1. Hilfe`). Einen Zeilenumbruch in einer Zelle machst du mit Alt+Enter. Wer eine Zelle ändert, ersetzt den ganzen Abschnitt; Kursiv oder Links gehen dabei verloren, die Vorschau warnt davor.
- **Piktogramme:** Codes mit Komma getrennt, z. B. `GHS02, GHS07`.
- **Verknüpfungen:** Namen mit Semikolon getrennt. Anlagen stehen mit ihrem Pfad da (`Werk / Linie 2 / Pumpe`); der Name allein reicht, wenn er eindeutig ist. Eine leere Zelle lässt alles, wie es ist; `-` entfernt alle.
- **checksum:** nicht ändern. Hat sich eine Anweisung seit dem Export in COMPASS geändert, lehnt der Import sie ab, statt die Änderung zu überschreiben. Dann neu exportieren.

**Importieren** vergleicht die Datei mit dem aktuellen Stand und zeigt eine Vorschau: was sich je Anweisung ändert und was nicht geht. Erst **Übernehmen** schreibt. Zeilen mit Fehlern werden ausgelassen.

> Der Import **veröffentlicht nie**. Änderungen landen im offenen Entwurf oder in einer neuen Version, die du wie gewohnt einreichst und freigibst. Ein eingereichter Entwurf wird nicht geändert. Reine Übersetzungen einer veröffentlichten Version gehen direkt dorthin, wenn die Arbeitssicherheit importiert.

## Drucken {#print}

**Drucken** öffnet die Druckansicht der gewählten Version in der gewählten Sprache. Eine Anweisung passt im Normalfall auf eine A4-Seite. Unten stehen die Freigabe, die nächste Prüfung und ein QR-Code, der zur aktuellen Version in der App führt. Damit ist ein veralteter Aushang sofort erkennbar. Entwürfe tragen den Vermerk **Nicht gültig**.
