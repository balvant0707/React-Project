---
routes: /maintenance/statistics
---
# Auswertung

Die Auswertung zeigt, wie viel Instandhaltung geleistet wird, was sie kostet und wie pünktlich sie ist.

## Instandhaltungs-Auswertung {#maintenance}

Unter **Auswertung** wählst du Zeitraum (letzte 12 Monate oder dieses Jahr) und Bereich (eine Anlage und alles darunter). Du siehst:

- erledigte Aufgaben, davon Störungsbehebung (Aufgaben aus Tickets),
- Arbeitsstunden und Stillstand in Stunden,
- Fremdkosten netto.

Aufschlüsselungen zeigen **je Anlage**, **je Lieferant** und **je Monat**. **CSV exportieren** speichert die Daten für Excel.

> Stunden und Stillstand zählen Aufgaben, die im Zeitraum abgeschlossen bzw. begonnen wurden.

Dieselben Kennzahlen siehst du für eine einzelne Anlage im Reiter „Statistik“ der [Anlagenseite](help:assets#asset-page).

## Pünktlichkeit {#punctuality}

COMPASS bewertet erledigte Aufgaben mit Fälligkeit:

- **Pünktlich:** bis zur ursprünglichen Fälligkeit erledigt.
- **Verschoben:** die Fälligkeit wurde verschoben und der neue Termin gehalten.
- **Zu spät:** nach der Fälligkeit erledigt.

Die ursprüngliche Fälligkeit bleibt immer erhalten, auch wenn der Termin später geändert wird. Dafür verlangt COMPASS beim Verschieben eine Begründung. Zu sehen ist die Pünktlichkeit bei Serien (Punktestreifen), bei Initiativen und Aufgaben mit Unteraufgaben sowie in der Anlagenstatistik.

## Kosten {#costs}

Fremdkosten erfasst du an der Aufgabe: Datum, Betrag netto in EUR, Lieferant, Rechnungsdatei. Wer Kosten sehen oder erfassen darf, hängt von den Rechten der Rolle ab.

Die Spalte **Material aus dem Lager** zählt die verbrauchten Katalogartikel, die nicht für die Aufgabe bestellt wurden, zum aktuellen Stückpreis. Bestelltes zählt über die Rechnung, siehe [Artikel](help:items#costs).
