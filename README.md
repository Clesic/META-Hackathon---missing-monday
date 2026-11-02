# Missing Monday

**Could your team get through Monday without its most experienced employee?**

Missing Monday rehearses that absence, finds the knowledge the team is missing, asks the expert focused questions, and checks whether someone else can now do the work.

Built by Clemens Sickert for the Meta Hackathon. All demo orders and company data are fictional.

## Watch the demo

[Watch or download the narrated demo (2:03)](05-demo/video-edit/finished/Missing-Monday-judge-cut.mp4) · [Captions](05-demo/video-edit/finished/missing-monday-judge-cut.srt)

## Run locally

Requires Python 3.9 or later. No packages are required for the manual workflow.

```sh
git clone https://github.com/Clesic/missing-monday.git
cd missing-monday
python3 -m app.server
```

Open http://127.0.0.1:8766. Stop with Ctrl+C.

For AI features, copy `.env.example` to `.env`, then enter your own `BASETEN_API_KEY` before starting the app. The demo uses the hackathon model `meta-models/muse-spark-open-1026`; your account needs access to that model. Credentials are not included. The manual workflow works without a key.

[Full setup and walkthrough](RUNNING.md)

## Try the handover

1. Open the rehearsal order and inspect the handbook to find the missing substitution rule.
2. Ask the expert a focused question. The [fictional expert rulebook](03-scenarios/expert-only/rulebook.json) supplies the expert's knowledge for this rehearsal.
3. Draft a handover note from the expert's answer. Review and approve its wording.
4. Try a fresh order using the approved note.
5. Test harder orders to see where the advice stops applying.

The model cannot approve its own note. The app never places real orders.

## Meta model and evidence

Meta's model, accessed through Baseten, identifies missing information, asks an expert question, drafts a note, suggests a next step and proposes harder cases. The local simulator checks synthetic outcomes against an answer key.

A 36-request comparison tested 12 fictional orders with three information conditions. Of seven orders requiring a final accept-or-reject decision:

- Handbook alone: **1 of 7** resolved without asking the expert.
- Handbook plus the original expert answer: **6 of 7**.
- Handbook plus the approved note: **7 of 7**.

No condition made an incorrect accept-or-reject decision. The one-case difference between the original answer and approved note involved an ambiguous certificate label. This small synthetic test does not establish better accuracy or real workplace productivity. No field study has been run.

[Findings and limitations](04-evaluation/comparison-findings.md) · [Actual responses](04-evaluation/comparison-results-v1.json) · [Comparison method](04-evaluation/comparison-guide.md)

## Checks

```sh
python3 -m unittest discover -s tests -v
python3 tools/validate_pack.py
```

These checks require no paid model calls. The public development cases are not a private held-out benchmark.

## Working defaults

English product and documentation. One builder, one synthetic purchasing workflow, one expert role, one successor role. Text first; optional voice after the loop works. Meta performs gap diagnosis, focused questioning and evidence-based guidance. A deterministic simulator owns outcomes. These are reversible planning decisions, not user-confirmed facts about team size or available time.

The application starts as a safe local rehearsal. It never places real orders. It evaluates task coverage, not employee worth. A later real pilot needs an actual practitioner and fresh successor attempts.

## Contents

- [Concept and positioning](01-product/project-description.md)
- [MVP](01-product/mvp.md)
- [Business hypotheses and discovery](01-product/business-and-discovery.md)
- [Architecture](02-design/architecture.md)
- [Data contracts and transitions](02-design/data-contracts.md)
- [Experience and screen copy](02-design/experience.md)
- [Synthetic company and handbook](03-scenarios/company-and-handbook.md)
- [Scenario authoring rules](03-scenarios/README.md)
- [Evaluation protocol](04-evaluation/protocol.md)
- [Blank results record](04-evaluation/results-template.json)
- [Three-minute demo](05-demo/demo-script.md)
- [Submission draft](05-demo/submission-draft.md)
- [Resources and budget](06-build/resources-and-budget.md)
- [Eight-day execution plan: October 27–November 3](06-build/eight-day-plan.md)
- [Tomorrow: October 27, detailed schedule](06-build/tomorrow-october-27.md)
- [Original build roadmap](06-build/roadmap.md)
- [Implementation backlog](06-build/backlog.md)
- [Prompt specifications](06-build/prompts.md)
- [Security and data handling](07-governance/data-handling.md)
- [Research and source register](07-governance/research.md)
- [Decisions and outstanding dependencies](07-governance/decisions.md)
- [Hackathon checklist](07-governance/hackathon-checklist.md)

## Relationship to earlier work

This is a new project folder for the concept selected by the user. TacitOS and the downloaded Tacit and Apprentice drafts remain separate. Their existing code is not presented as an implementation of Missing Monday. Reuse may be possible after inspection, with attribution to the original development history. No source files, credentials, databases, or private logs have been copied from TacitOS.
