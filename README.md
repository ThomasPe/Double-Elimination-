# Turnier im Doppel-K.-o. – Burschenschaft Wangen e.V.

Web-App für Turniere im Double-Elimination-Modus: Wer zweimal verliert, ist raus. Nach der ersten Niederlage geht es im Loser-Bracket weiter, im Finale treffen die Sieger beider Brackets aufeinander (ein einziges Finalspiel).

**Live:** https://thomaspe.github.io/Double-Elimination-/

## Bedienung

1. Turniername und Teilnehmer eintragen (3 bis 64, ein Name pro Zeile). Fehlende Plätze im Turnierbaum werden mit Freilosen aufgefüllt.
2. Setzliste auslosen lassen oder die eingegebene Reihenfolge als Setzliste nehmen.
3. Unter **Spiele** steht für jeden Tisch das aktuelle Spiel. Auf den Namen des Siegers tippen, dann rückt an diesem Tisch automatisch das nächste Spiel nach (niedrigste Spielnummer zuerst). Die Anzahl der Tische (Standard 3) lässt sich beim Anlegen und während des Turniers ändern. Falsch eingetragen? **Rückgängig** oder **Korrigieren**.
4. **Winner** und **Loser** zeigen die Turnierbäume, **Rangliste** den Zwischen- bzw. Endstand.

## Beamer

Auf dem Laptop **Beamer** anklicken. Es öffnet sich ein zweites Fenster mit der Tischbelegung, den nächsten Spielen und beiden Turnierbäumen formatfüllend. Das Fenster auf den Beamer ziehen und **Vollbild** wählen (Bedienleiste erscheint bei Mausbewegung). Ergebnisse, die im Hauptfenster eingetragen werden, erscheinen sofort auf dem Beamer.

Beide Fenster müssen im selben Browser auf demselben Rechner laufen, da das Turnier nur im Browser gespeichert wird (localStorage). Die Beamer-Ansicht ist auch direkt über `?beamer` erreichbar.

## Entwicklung

Reines HTML/CSS/JavaScript ohne Build-Schritt.

```bash
python3 -m http.server   # lokal unter http://localhost:8000
npm test                 # Tests der Turnierlogik (Node 20+)
```

- `bracket.js` – Turnierlogik (Paarungen, Freilose, Ergebnisse, Platzierungen)
- `app.js` – Oberfläche und Beamer-Ansicht
- `style.css` – Gestaltung in Weiß-Blau
