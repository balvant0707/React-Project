---
routes: /people, /people/:id#person-page
---
# Personen

Das Personenverzeichnis zeigt, wer im Unternehmen arbeitet, in welchen Teams und mit welchen Kontaktdaten. Es steht allen offen.

## Verzeichnis {#directory}

Karten mit Foto, Funktion, Teams, Telefon (Büro und mobil, zum Antippen), E-Mail und Geburtstag (Tag und Monat; wer ihn im Profil ausblendet, erscheint ohne). Die Suche findet Name, Funktion, E-Mail, Telefon und Standort. Filter gibt es für Team und Standort. Ein Streifen oben zeigt Geburtstage und Firmenjubiläen des Monats.

## Telefonliste {#phone-list}

**Telefonliste** (oben rechts) öffnet eine Druckansicht: alle mit Rufnummer, nach Nachname sortiert, mit Mobil und Festnetz, zwei Spalten à 50 Zeilen, also 100 Personen auf einer A4-Seite. Weitere Personen folgen auf der nächsten Seite. Bei mehreren Standorten begrenzt ein Filter die Liste auf einen. Ehemalige fehlen. **Drucken** nutzt den Druckdialog des Browsers (Maßstab 100 %, keine Ränder).

## Organigramm {#org}

Der zweite Reiter zeigt die Berichtslinien als Baum. Filter für Team, Standort und **Vorgesetzte/r (inkl. alle darunter)**. Äste lassen sich auf- und zuklappen, Personen ohne Login sind gestrichelt. Jeder Knoten zeigt Funktion und Teams.

**Auf dem Handy** steht eine Führungskraft zentriert oben, darunter scrollt die Reihe ihrer direkten Mitarbeitenden seitwärts. Unter jeder Person steht ihr Team als Liste mit Spiegelstrichen. Mit dem **Plus** wird eine Person zur Führungskraft oben und ihr Team erscheint darunter, mit **Zurück zu …** geht es eine Ebene hoch.

## Personenseite {#person-page}

Kontakt, Berichtslinie (Vorgesetzte/r, Vertretung, direkte Mitarbeitende), Teams, Stellen und Schulungen. Das Foto, die Kontaktdaten und die Stammdaten pflegt das Personalwesen. Du selbst änderst nur deine Sprache. Wer Rechte hat, sieht zusätzlich Knöpfe für Bearbeiten, Foto und Eintragen von Schulungen.

Das Austrittsdatum ist nur für das Personalwesen sichtbar. Ehemalige Mitarbeitende verschwinden aus Verzeichnis, Organigramm und Matrix, nur das Personalwesen kann sie über einen Schalter einblenden.

## Person anlegen und Login geben {#manage}

Das Personalwesen legt Personen mit **Person anlegen** an, auch ohne Login (zum Beispiel Mitarbeitende ohne Computerzugang). Die Administration oder das Personalwesen (Recht *Benutzer verwalten*) pflegt den Zugang in der Karte **Anmeldung** auf der Personenseite:

- **Login geben:** Die Person meldet sich mit ihrem Benutzernamen an (wird beim Anlegen vergeben, `vorname.nachname`). Ist eine E-Mail-Adresse hinterlegt, kann sie einen Link zum Passwort-Setzen bekommen; sonst oder auf Wunsch gibt es ein **Aktivierungsblatt** mit QR-Code zum Ausdrucken. Eine E-Mail-Adresse ist nur für die Microsoft-Anmeldung Pflicht: Dafür stellt die Administration die Anmeldeart **vorher** auf Microsoft (SSO) um; die Person bekommt dann weder Mail noch Blatt und meldet sich mit ihrem Microsoft-Konto an. Wer ausgeschieden oder gesperrt ist, bekommt keinen Login.
- **Aktivierungsblatt:** stellt ein neues Blatt aus, zum Beispiel wenn das Passwort vergessen ist und keine E-Mail hinterlegt ist oder das Handy getauscht wurde. Passwort und zweiter Faktor werden dabei gelöscht, alle Sitzungen enden. Der Code wird nur einmal angezeigt, gilt sieben Tage und nur einmal; übergib das Blatt persönlich.
- **Sperren / Entsperren:** Die Person kann sich sofort nicht mehr anmelden, laufende Sitzungen enden. In Auswahlfeldern (Zuständig, Owner, Weiterleiten, Erwähnungen ...) wird sie nicht mehr angeboten; wo sie schon eingetragen ist, bleibt sie stehen. Neue Freigaben überspringen sie und gehen an die nächste Ebene bzw. die Ersatzrolle; was schon bei ihr liegt, leitest du weiter. Passwort und Daten bleiben, Entsperren macht es rückgängig. Den Grund kannst du angeben, er steht im Protokoll.
- **Login entziehen:** löscht das Konto (Passwort, zweiter Faktor, Geräte). Die Person bleibt mit ihrer Historie erhalten, später kann wieder ein Login vergeben werden.

Deinen eigenen Zugang kannst du hier nicht ändern, und den eines Administrators nur, wenn du selbst einer bist.
