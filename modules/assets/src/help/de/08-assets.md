---
routes: /assets#list, /assets/labels#qr, /assets/:id#asset-page
---
# Anlagen

Anlagen sind Maschinen, Anlagen und Orte, geordnet in einem Baum (Standort → Halle → Linie → Maschine …). Jede Anlage hat Dokumente, einen QR-Code, Aufgaben, Tickets und einen Verlauf.

## Baum und Liste {#list}

Über der Tabelle zeigt die Zahl **Assets mit überfälligen Aufgaben**, bei wie vielen Assets die nächste Aufgabe überfällig ist; ein Tipp öffnet die flache Liste mit diesem Filter.

**Anlagen** zeigt eine Tabelle, die sich wie ein Baum auf- und zuklappen lässt. Ist ein Team für einen Knoten zuständig, gilt das für alles darunter. Klappe eine Zeile mit dem Pfeil auf, dann werden ihre Unteranlagen geladen. Ein Klick auf die Zeile öffnet die Anlage. Die Zahlen (blau: offene Aufgaben, orange: offene Tickets) und die nächste Fälligkeit öffnen direkt den passenden Reiter oder die Aufgabe.

Suche und Filter wirken auf alle Ebenen: Die Tabelle zeigt dann die Treffer an ihrem Platz im Baum, die übergeordneten Anlagen grau darüber. Ein Klick auf einen Spaltenkopf sortiert innerhalb jeder Ebene. Auf dem Handy siehst du eine Ebene nach der anderen: „N Unteranlagen“ führt eine Ebene tiefer, die Zeile oben führt zurück. Sortiert wird dort mit **Sortieren**.

Die **Liste** (Umschalter „Baum / Liste“) zeigt alle Anlagen flach, sortiert nach der nächsten Fälligkeit. Der Filter „Unterhalb von“ begrenzt auf einen Teilbaum. „Nur Geräte“ blendet reine Gliederungsknoten wie Standorte und Kategorien aus und ist in der Liste anfangs an. Technische Merkmale lassen sich in beiden Ansichten als Spalte und Filter einblenden.

## Anlage anlegen und bearbeiten {#edit}

**Neue Anlage** (oder „Neue untergeordnete Anlage“ an einem Knoten) öffnet das Formular: Name, Typ, übergeordnete Anlage, Zuständiges Team, Hersteller, Seriennummer, Standort. Beim Typ erscheinen weitere technische Merkmale. Das **Symbol** gilt auch für alles darunter, bis ein Knoten ein eigenes hat: Bekommt die Kategorie „Gabelstapler“ das Gabelstapler-Symbol, tragen es alle Stapler darunter. Leer übernimmt das Symbol von oben, sonst das des Anlagentyps. Eine Anlage mit Unteranlagen, Tickets oder Aufgaben lässt sich nicht löschen.

## Die Anlagenseite {#asset-page}

Reiter:

- **Aktivität:** Verlauf und Kommentare (am Computer; auf dem Handy öffnet der Chat-Knopf oben den Verlauf unter **Nachrichten**).
- **Aufgaben** und **Tickets:** offen oder abgeschlossen, auch alles unterhalb.
- **Serien:** wiederkehrende Aufgaben dieser Anlage, mit Knopf zum Anlegen.
- **Ersatzteile:** die Ersatzteilliste der Maschine. Siehe [Artikel](help:items#asset-parts).
- **Betriebsanweisungen:** die Anweisungen der Anlage, ihres Anlagentyps und der Anlagen darüber. Siehe [Betriebsanweisungen](help:operating-instructions#page).
- **Statistik:** Pünktlichkeit, Tickets pro Monat, Wartungsaufwand. Siehe [Auswertung](help:statistics).
- **Dokumente:** Handbücher und Dateien.
- **Details:** technische Daten.

Daneben stehen der **QR-Code** und das **zuständige Team**. Das Feld **Zugriff** in der Feldleiste nennt die Teams, Personen und Rollen, die die Anlage sehen oder bearbeiten können; ein Klick zeigt die ganze Liste mit der Stufe und dem Grund. Dasselbe Feld gibt es bei Aufgaben und Tickets.

## Technische Daten {#attributes}

Pro Anlagentyp legt ein Administrator Merkmale fest (Text, Zahl, Datum, Ja/Nein, Auswahl). Du pflegst die Werte im Reiter „Details“. Auswahllisten lernen aus dem, was bisher eingetragen wurde.

## Dokumente {#documents}

Ziehe Dateien in den Bereich „Dokumente“ oder klicke zum Hochladen. PDFs öffnen in einer Vorschau mit Blättern, Zoom und Download. Andere Dateien werden heruntergeladen.

## Offline verfügbar {#offline}

„Offline verfügbar machen“ speichert die Dokumente der Anlage und die Fotos ihrer Ersatzteilliste auf deinem Gerät. So hast du Handbücher auch in der Halle ohne Empfang dabei.

## QR-Code und Etiketten {#qr}

Der QR-Code öffnet das öffentliche Meldeformular für diese Anlage. „Link kopieren“ kopiert die Adresse, „Etikett drucken“ druckt einen Aufkleber. Hat die Anlage Unteranlagen, bietet **Etiketten drucken** „Nur diese Anlage“ oder „Diese und alle darunter“. Auf der Etikettenseite wählst du per Häkchen aus, welche Etiketten gedruckt werden. Meldungen laufen als [Tickets](help:tickets#qr) ein.

## Zugriff auf Anlagen {#access}

Im Formular der Anlage wählst du das **zuständige Team**. Es ist für die Anlage und alles darunter zuständig, einschließlich der Tickets, Aufgaben, Kommentare und Dateien. Teams weiter oben im Baum bleiben zuständig, wenn weiter unten ein anderes Team steht; die Karte „Zuständiges Team“ zeigt alle. Was die Mitglieder dort tun dürfen, bestimmen ihre eigenen Rollen (die Rechte „… für die mein Team zuständig ist“). Wer das Team ändern darf, darf die Anlage bearbeiten; es erscheinen nur Teams, die das Personalwesen oder der Administrator dafür freigegeben hat (Admin > Teams, „Zuständig für Anlagen“). Siehe [Administration](help:admin#grants).
