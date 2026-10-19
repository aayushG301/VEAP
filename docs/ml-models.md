# ML model cards

| Component | Method | Training data | Notes |
|---|---|---|---|
| Scan anomaly detection | Isolation Forest (200 trees) blended with transparent rules | Synthetic "normal scan behaviour" generated at startup | Score 0-100; >=85 auto-locks the QR. Normal scans score < 30, scraper bursts >= 85 (tested) |
| Triage classifier | Gradient Boosting (4 classes: LOW/MODERATE/HIGH/CRITICAL) | Synthetic data from a clinical-style scoring function + label noise | Importance-weighted factors (not SHAP). Hard safety net: unconscious / not breathing is always CRITICAL. **Not clinically validated** |
| First-aid assistant | TF-IDF (1-2 grams) retrieval + keyword boost over 12 curated guides | Curated corpus in `data/first_aid_corpus/` | Retrieval-only (no generation), patient-aware warnings, injection flagging, always shows "call emergency number" |
| Drug-allergy / drug-drug checker | Curated rule table (`data/interactions.json`) | n/a | Small and illustrative; not a complete interaction database |

All outputs are advisory decision support, never a diagnosis. A clinician must review the corpus and rules before any real-world use.
