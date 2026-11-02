# Does the handover note help?

Status: the first live run completed October 29: 36/36 requests, estimated cost $0.20083895. Read [the findings](comparison-findings.md) before using the scores. Existing result files cannot be overwritten.

We will ask the same model to handle 12 fictional orders three ways: with the handbook, with the handbook plus the original expert answer, and with the handbook plus the approved note. The raw answer and note come from the same saved expert interaction. Both receive the same neutral evidence label and instructions; no condition gets the correct answers.

The 36 requests are shuffled using a fixed seed. Every request has the same completion-token limit and starts with no conversation history. Errors remain in the denominator. A failed call stops the batch, records the failure and leaves the unattempted cases visible through the planned/attempted counts. No automatic retries or overwriting of result files.

The set includes eligible substitutions, wrong certificates, excluded revisions, missing information, another supplier, and ordinary document/access controls. These are new instances of already-known synthetic rules, not evidence of generalization to a new workplace. Quantity variations are incidental; no novelty claim rests on them. One attempt per case is a small descriptive comparison, not a statistical study. Expert effort and human performance are not measured.

## Run after confirming credit and current rates

From the project folder:

```sh
python3 tools/compare_handover.py run --package 04-evaluation/frozen-comparison-v1.json --output 04-evaluation/comparison-results-v1.json --confirmed-credit 1 --input-rate 1.25 --output-rate 4.25
```

Baseten’s public Muse Spark Open listing was checked October 29 and lists these rates: https://www.baseten.co/library/muse-spark-open/. The special hackathon model alias may have separate terms; confirm any account-specific difference before running. Confirm at least $1 of available credit. The runner reserves conservatively for all 36 requests and refuses a batch above $1. Usage and provider response IDs are retained where returned; reservations are not actual billing. No new purchase is authorized by this guide.

Read correct next steps, wrong accept/reject decisions, requests for expert help, failures and resolved decisions separately. Requesting a needed document is correct handling, but is not completing the order. Inspect reasons and citations before publishing conclusions.

If raw answers and cards tie, say so. The product’s demonstrated contribution may be its approved handover and testing process rather than a more accurate answer. Do not change the frozen inputs after seeing results and call the rerun the original test.

Software checks verify fairness and accounting, not model quality. The earlier day2_rehearsal.py hardcodes accept/reject actions; its outcomes are workflow checks, not an autonomous AI comparison.
