# Consented matching evaluation

The COIL-20 results and synthetic descriptions do not measure campus accuracy. Collect independently written lost and found reports for the same physical items, plus different lookalike items. Include unmatched lost reports, different lighting/backgrounds, short descriptions, misspellings, and supported-language variation. Obtain permission from contributors; remove people, identifying documents, contacts and private ownership evidence. Do not export production accounts or private conversations.

Save the dataset and its photos under ignored `.sites-runtime/field-evaluation/`. Do not commit this directory. Use `source: "consented-field"` only for real, consented examples; use `synthetic` for invented examples. Each report has:

```json
{
  "source": "synthetic",
  "reports": [
    {"objectId":"example-A","type":"lost","title":"Green canvas backpack","description":"Green woven backpack with brown straps","category":"Bags","colour":"Green","brand":"","location":"Library","date":"2026-11-01","photos":[]},
    {"objectId":"example-A","type":"found","title":"Canvas bag with brown straps","description":"Green backpack picked up by the library","category":"Bags","colour":"Green","brand":"","location":"Library","date":"2026-11-01","photos":[]}
  ]
}
```

Reports for the exact same physical object share `objectId`; lookalikes have different IDs. Labels are excluded from scoring. Photos are relative paths inside the dataset directory, maximum five per report and 5 MB each. Use distinct photos and independent descriptions between lost and found examples. The two-report example only demonstrates the format and cannot establish quality.

Run from the repository root after installing root and AI dependencies:

```sh
node ai-worker/evaluate-items.mjs .sites-runtime/field-evaluation/dataset.json
```

The tool runs the pinned local models and unchanged production scorer. It prints aggregate top-one/top-three retrieval, true/false alerts, precision and recall. It never prints report text, labels, photos or vectors. Missing true counterparts are excluded from retrieval recall but remain negative alert comparisons. Ties are counted conservatively. Model weights may download from their pinned provider; report inputs are processed locally.

Have a second person check the labels. Split by physical object before tuning, keep a held-out set, and report the dataset size and source with every result. Review false alerts and missed pairs before changing production weights or the strict >75 threshold. An alert is never ownership verification. A representative real dataset and independent review are still pending.
