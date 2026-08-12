# Time Series Mastery Lab

Έτοιμη static web εφαρμογή για τα 6 τεύχη **Time Series Analysis — From Zero to Hero**.

## Τι περιλαμβάνει

- Βιβλιοθήκη των 6 PDF μέσα από browser.
- 58 έτοιμες source-grounded ερωτήσεις πολλαπλής επιλογής.
- Παραμετρικό question engine (ADF, KPSS, ITS slopes, GARCH persistence, MASE, Ljung–Box, effective sample size, model-selection cases).
- **Continuous / ∞ mode**: δεν υπάρχει πρακτικό όριο στις επαναλήψεις.
- Adaptive weak-point mode.
- Review μόνο των λαθών.
- Spaced repetition με ημερομηνίες επανάληψης.
- Exam mode με ή χωρίς χρονόμετρο.
- Progress dashboard ανά topic και τεύχος.
- Export / import της προόδου σε JSON.
- GitHub sync για `manifest.json`, `data/questions.json` και PDF από public repository.

## Γρήγορη εκκίνηση στα Windows

1. Αποσυμπίεσε το ZIP.
2. Κάνε διπλό κλικ στο `START_WINDOWS.bat`.
3. Άνοιξε `http://localhost:8000` αν δεν ανοίξει αυτόματα.

Απαιτεί Python εγκατεστημένο. Εναλλακτικά, μπορείς να ανοίξεις απευθείας το `index.html`, αλλά local HTTP server είναι προτιμότερος.

## Ανέβασμα στο GitHub Pages

1. Δημιούργησε repository, π.χ. `time-series-mastery`.
2. Ανέβασε **τα περιεχόμενα αυτού του φακέλου στη ρίζα** του repository.
3. Ενεργοποίησε GitHub Pages για το branch που χρησιμοποιείς.
4. Η εφαρμογή λειτουργεί ως static HTML/CSS/JavaScript χωρίς build step.

## Δομή repository

```text
/
├── index.html
├── style.css
├── app.js
├── manifest.json
├── data/
│   ├── questions.json
│   └── builtin-data.js
└── pdf/
    ├── TEYXOS_A.pdf
    ├── TEYXOS_B.pdf
    ├── TEYXOS_C.pdf
    ├── TEYXOS_D.pdf
    ├── TEYXOS_E.pdf
    └── TEYXOS_ST.pdf
```

## Προσθήκη νέου τεύχους / μαθήματος

1. Ανέβασε το PDF στον φάκελο `pdf/`.
2. Πρόσθεσε entry στο `manifest.json`.
3. Πρόσθεσε ερωτήσεις στο `data/questions.json` με την ίδια δομή:

```json
{
  "id": "NEW01",
  "issue": "NEW",
  "topic": "Νέα θεματική",
  "difficulty": "medium",
  "question": "Η ερώτηση;",
  "choices": ["Α", "Β", "Γ", "Δ"],
  "correct": 1,
  "explanation": "Γιατί η Β είναι σωστή.",
  "source": "Τεύχος Νέο — Κεφάλαιο Χ"
}
```

Το `correct` είναι 0-based: 0=Α, 1=Β, 2=Γ, 3=Δ.

## GitHub Sync

Στην οθόνη **GitHub / Ρυθμίσεις** συμπλήρωσε owner, repository και branch. Η εφαρμογή διαβάζει από:

- `manifest.json`
- `data/questions.json`
- τα paths των PDF που δηλώνονται στο manifest.

### Private repository

Μην βάλεις Personal Access Token μέσα στο `app.js`, στο HTML ή στο localStorage. Ο browser θα μπορούσε να το εκθέσει. Για private repository χρειάζεται ασφαλές authentication/backend ή άλλη access layer.

## Πρόοδος

Η πρόοδος αποθηκεύεται στο `localStorage` του browser. Χρησιμοποίησε **Εξαγωγή progress.json** για backup, ειδικά πριν καθαρίσεις browser data ή αλλάξεις υπολογιστή.
