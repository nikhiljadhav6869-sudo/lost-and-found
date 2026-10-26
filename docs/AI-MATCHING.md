# AI matching and search

The web server never loads a neural model. An optional, separate Node CPU worker produces real embeddings from public report fields and authorized photos. Without completed compatible embeddings, matching falls back to the existing public-detail algorithm and the interface identifies that fallback.

## Models and data

- Transformers.js 3.8.1, installed independently in `ai-worker`.
- MiniLM sentence embeddings: `Xenova/all-MiniLM-L6-v2`, revision `751bff37182d3f1213fa05d7196b954e230abad9`, q8, 384 dimensions.
- CLIP image embeddings: `Xenova/clip-vit-base-patch32`, revision `d15189d7028b43f1d3e65039190477f6af591c2a`, q8, 512 dimensions.
- Version tag: `minilm-751bff3_clip-d15189d_q8_v1`.
- Text input includes public title, description, category, colour and brand. Private distinguishing details, messages, account email and claim evidence are excluded.
- Up to five owned, validated photos are normalized and their vectors averaged. The worker reads private storage directly; it never downloads an arbitrary user URL.
- Model downloads go to Hugging Face; report text/photos are processed locally in the worker, not sent to Hugging Face inference.

Model references: [MiniLM](https://huggingface.co/Xenova/all-MiniLM-L6-v2), [CLIP](https://huggingface.co/Xenova/clip-vit-base-patch32), [Transformers.js model API](https://huggingface.co/docs/transformers.js/v3.8.1/api/models).

## Queue and consistency

Additive database migrations create durable report/search jobs and embeddings. Public-field/photo edits increment a report revision and invalidate earlier results. Workers acquire atomic leases; completion is conditional on the same revision and lease. Old results cannot overwrite an edit. Failures retain a fixed error code and retry up to three times with backoff. A failed worker lease becomes available after 15 minutes.

The CLI processes a bounded batch or runs continuously:

```text
npm ci --prefix ai-worker
npm run ai:benchmark
npm run ai:worker
npm run ai:worker -- --watch
```

Supply the same remote database and private photo settings as the web app through the worker host's secrets. Do not copy them into tracked files. A trusted personal computer can run the worker without a new hosting bill while it is awake. A continuously available worker is an external hosting requirement. No worker is deployed by installing the web app.

## Ranking

The fallback retains category 30, word overlap 25, colour 15, brand 10, compatible date 10 and shared location words 10. Unicode letters are recognized. For compatible neural embeddings, default weights are public details 0.40, semantic text 0.35, image 0.25. Missing images contribute no weight; remaining weights are normalized.

Cosine values are transformed with heuristic floors (text 0.2, image 0.4). A category mismatch caps the combined rank below the high-similarity threshold. These are engineering heuristics, not calibrated accuracy or ownership probabilities. `MATCH_WEIGHTS` can supply a JSON object with `details`, `text`, `image`; each must be 0–1 and details at least 0.25. Invalid configuration safely uses defaults.

UI labels are High Similarity (internal rank strictly above 75), Medium (40–75), Low, or Insufficient Information. Matches need opposite report types, different owners, visible active reports, the same demo mode and no block between participants. Alerts are reserved transactionally once per pair; each owner's preference is respected. Re-enabling alerts does not replay old events.

Retrieval examines the latest 1,000 eligible reports. This is bounded exact comparison, not an ANN vector index. Scale beyond that requires a proper vector index and evaluation before changing recall behavior.

## Search, feedback and limitations

Signed-in users can submit a natural-language description and/or an owned photo. Search jobs and vectors are owner-scoped and expire after 24 hours. Results exclude blocked/hidden/demo reports and indicate the latest-1,000 scope. Unattached photos follow the seven-day cleanup policy. Search requests are bounded and rate limited. No worker heartbeat means search submission is disabled with a useful fallback message.

Natural-language search compares semantic content; it does not reliably parse geographic distance or phrases like “yesterday” into filters. Use the explicit location/date filters. Duplicate review currently compares the owner's latest 100 active same-type reports using public text/fields; it does not merge/delete or claim image-based duplicate detection.

Relevant/not-relevant feedback is stored for evaluation. No automatic retraining occurs. Confirmed returns are a separate ground-truth signal; a similarity score never approves ownership.

The smoke benchmark measured 949 ms for the first combined inference with cached downloads, 105 ms for three warm calls, and approximately 661 MB resident memory on this Windows machine. The earbuds paraphrase cosine was 0.660 versus 0.148 for an unrelated scarf; repeating the same synthetic image gave 1.000 within floating-point precision. These few fixtures establish functioning inference, not real-world accuracy. CLIP can confuse objects of the same class; averaging photos can lose distinguishing detail. MiniLM is primarily suited to English.

The current 512 MB Render web service is too small for this observed worker footprint. Do not start the worker inside that web process. A labelled, diverse real-item evaluation set, false-positive review and sustained production latency/resource tests remain required before claiming matching quality.
