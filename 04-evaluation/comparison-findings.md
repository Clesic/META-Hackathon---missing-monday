# First live comparison — October 29, 2026

The expert’s knowledge helped the AI continue work. This small test does not establish that an approved note is more accurate than the original answer.

All 36 requests completed using Baseten meta-models/muse-spark-open-1026. Estimated usage cost: $0.20083895, below the $1 authorized limit. The conservative pre-run reservation was $0.5046675. No retries, failed requests or excluded attempts. These are token-based estimates, not a billing statement.

## Results in plain language

Twelve fictional orders were tried under each condition. Seven called for a final accept/reject decision; the others required missing information, access or help outside the rule’s scope.

- Handbook alone: 1 of 7 final decisions resolved without expert help; 9 of 12 next steps requested the expert.
- Handbook plus the original expert answer: 6 of 7 final decisions resolved; 2 of 12 next steps requested the expert.
- Handbook plus the approved note: 7 of 7 final decisions resolved; 1 of 12 next steps requested the expert.
- No condition made an incorrect accept/reject decision. These counts include rejections, so “resolved” does not mean seven accepted orders.

Exact matches to the frozen answer key were 3/12, 10/12 and 11/12 respectively. These are strict action matches, not a fair standalone safety score: asking for help can be appropriate when the model lacks the rule.

## Review of the important differences

For F09 (another supplier), all conditions asked the expert while the answer key expected escalation. Asking the expert follows the handbook and is a reasonable safe response. The original scores remain unchanged; the limitation is recorded separately.

The only difference between the raw answer and approved note was F06, labelled C-B-expired. The raw-answer model asked whether that counted as a different certificate. The note model rejected it. This is an ambiguous label, not strong evidence of a product advantage. There was only one attempt per condition/case, so model variability could also explain the difference.

For F02, both enriched conditions used wording suggesting all documents were present, although only a certificate was supplied. The chosen action matched the exercise rule, but some explanation wording went beyond the facts. Valid citation IDs alone do not establish full support.

## What we can say in the demo

“In a small test of fictional orders, the handbook alone let the AI resolve one of seven final decisions without asking the expert. With the approved handover note, it resolved all seven. The original expert answer also worked well, resolving six. None made a wrong accept-or-reject decision. Our contribution is making the handover reviewable and testing where it holds up.”

Do not say this proves better human productivity, general workplace readiness, or a reliable accuracy advantage over raw answers. The expert text came from a developer rehearsal of a synthetic scenario. New cases reuse known rules; this is not a new-domain test.

## Next step for the hackathon

Use the real counts in the narration and emphasize the capture, approval and testing loop. Next, run the prepared first-use walkthrough with a willing participant, then record the revised demo. No additional model batch is needed for the present claim. A future evaluation should define certificate status explicitly and distinguish safe help requests from wrong decisions before freezing new cases.

Source: frozen-comparison-v1.json, comparison-results-v1.json and comparison-review-v1.json in this folder. Inputs and the grader were hashed before the run; prompts and scoring were not changed after results appeared.
