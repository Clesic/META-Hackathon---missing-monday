"""Freeze and run a small, reproducible representation comparison (not a human study)."""
import argparse
import hashlib
import json
import random
import sqlite3
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from app.grade import grade
from app.model import _post, _read_choice, parse_recommendation, runtime
from app.store import HANDBOOK

CONDITIONS = ('handbook', 'raw_answer', 'approved_card')
ACTIONS = ['accept', 'reject', 'request_evidence', 'escalate', 'report_permission_issue', 'ask_expert']
PROMPT = ('Choose the next step for this fictional purchasing order using only the supplied evidence. '
          'Do not invent rules. Ask the expert when the evidence does not resolve a rule; request missing facts '
          'and report missing access where appropriate. Return JSON with action, reason, evidence_refs. '
          'action must be one of ' + ', '.join(ACTIONS) + '. Cite supplied evidence IDs.')

def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()

def cases():
    base = dict(supplier='Northline', ordered_part='P-100', offered_part='P-100B', machine_revision='R2', certificate='C-B', quantity=137)
    variants = [({}, 'eligible'), ({'machine_revision':'R3','quantity':219}, 'eligible'),
                ({'machine_revision':'R1'}, 'boundary'), ({'machine_revision':'R20'}, 'boundary'),
                ({'certificate':'C-A'}, 'boundary'), ({'certificate':'C-B-expired'}, 'boundary'),
                ({'certificate':None}, 'missing_evidence'), ({'machine_revision':None}, 'missing_evidence'),
                ({'supplier':'Other supplier'}, 'outside_scope')]
    result = [dict(case_id=f'F{i+1:02}', family='substitution', group=group, facts={**base, **change}) for i,(change,group) in enumerate(variants)]
    for i,(facts,group) in enumerate([
        ({'access':True,'documents_complete':True,'part_matches':True},'standard'),
        ({'access':True,'documents_complete':False,'part_matches':True},'missing_evidence'),
        ({'access':False,'documents_complete':True,'part_matches':True},'permission')],10):
        result.append(dict(case_id=f'F{i:02}', family='standard', group=group, facts=facts))
    return result

def freeze(database, output):
    with sqlite3.connect(f'file:{database.resolve()}?mode=ro', uri=True) as db:
        db.row_factory = sqlite3.Row
        card = db.execute("SELECT * FROM guidance WHERE status='approved' AND family='substitution' ORDER BY created DESC LIMIT 1").fetchone()
        if not card:
            raise ValueError('No approved substitution card exists.')
        source = db.execute("SELECT original_answer FROM answer_records WHERE gap_id=? AND review_status='draft' AND model_output=? ORDER BY created DESC LIMIT 1", (card['source_gap_id'],card['body'])).fetchone()
        if not source:
            raise ValueError('Cannot trace this exact card to its raw expert answer. Choose a database with an unedited, reviewed draft.')
    conf = runtime()
    package = dict(created=datetime.now(timezone.utc).isoformat(), provider=conf['provider'], model=conf['model'],
        prompt=PROMPT, handbook=HANDBOOK, raw_answer=source[0], approved_card=card['body'], guidance_id=card['id'],
        cases=cases(), conditions=CONDITIONS, max_completion_tokens=2500,
        grading_sha256=hashlib.sha256((ROOT/'app/grade.py').read_bytes()).hexdigest(),
        limitation='New synthetic instances of known rules, one attempt per condition and case. Not a novel-domain or human-transfer study. The card was approved in an earlier developer rehearsal.')
    package['sha256'] = digest(package)
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open('x') as f:
        json.dump(package, f, indent=2)
    print(f'Frozen {len(package["cases"])} cases, 3 conditions; no API calls. SHA256: {package["sha256"]}')

def messages(package, case, condition):
    evidence = [{'id':'handbook','content':package['handbook']}]
    if condition != 'handbook':
        evidence.append({'id':'expert-guidance','content':package[condition]})
    # No group, family, expected outcome or grader reaches the model.
    return [{'role':'system','content':package['prompt']},
            {'role':'user','content':json.dumps({'case':{'case_id':case['case_id'],'facts':case['facts']},'evidence':evidence})}]

def summarize(rows):
    summary = {}
    for condition in CONDITIONS:
        subset = [r for r in rows if r['condition']==condition]
        summary[condition] = dict(attempted=len(subset), correct=sum(r.get('correct',False) for r in subset),
            wrong_decisions=sum(r.get('action') in ('accept','reject') and not r.get('correct',False) for r in subset),
            expert_requests=sum(r.get('action')=='ask_expert' for r in subset),
            failures=sum('error' in r for r in subset),
            resolved_without_expert=sum(r.get('correct',False) and r.get('action') in ('accept','reject') for r in subset),
            eligible_decisions=sum(r['expected'] in ('accept','reject') for r in subset))
    return summary

def run(package_path, output, confirmed_credit, input_rate, output_rate):
    package = json.loads(package_path.read_text())
    stored_hash = package.pop('sha256')
    if digest(package) != stored_hash:
        raise ValueError('Frozen package changed; create a new version.')
    if package['grading_sha256'] != hashlib.sha256((ROOT/'app/grade.py').read_bytes()).hexdigest():
        raise ValueError('Grading changed after freeze.')
    conf = runtime()
    if (conf['provider'],conf['model']) != (package['provider'],package['model']):
        raise ValueError('Provider/model changed after freeze.')
    if not conf['key']:
        raise ValueError('Model access is not configured.')
    if confirmed_credit < 1 or input_rate <= 0 or output_rate <= 0:
        raise ValueError('Confirm at least $1 credit and current positive per-million token rates.')
    # One bounded request; no silent retries. Reserve conservatively from UTF-8 bytes.
    jobs = [(c,condition) for c in package['cases'] for condition in CONDITIONS]
    random.Random(1029).shuffle(jobs)
    reservations = []
    for case,condition in jobs:
        incoming_bound = len(json.dumps(messages(package,case,condition)).encode()) + 1024
        reservations.append((incoming_bound*input_rate + package['max_completion_tokens']*output_rate)/1_000_000)
    if sum(reservations) > 1:
        raise ValueError(f'Conservative batch reservation ${sum(reservations):.3f} exceeds $1. No calls made.')
    report = dict(package_sha256=stored_hash, provider=conf['provider'], model=conf['model'],
                  started=datetime.now(timezone.utc).isoformat(), planned=len(jobs), reservation_usd=sum(reservations),
                  input_rate=input_rate, output_rate=output_rate, rows=[], complete=False, limitation=package['limitation'])
    with output.open('x') as f:
        json.dump(report,f,indent=2)
    for (case,condition),reservation in zip(jobs,reservations):
        row = dict(case_id=case['case_id'],group=case['group'],condition=condition,expected=grade(case),reservation_usd=reservation)
        start = time.monotonic()
        try:
            payload = dict(model=conf['model'], messages=messages(package,case,condition),max_completion_tokens=package['max_completion_tokens'])
            if conf['provider']=='meta':
                payload['reasoning_effort']='low'
            raw = _post(payload,conf)
            row.update(request_id=raw.get('id'),usage=raw.get('usage'),returned_model=raw.get('model'))
            content,finish = _read_choice(raw)
            row.update(response=content,finish_reason=finish)
            answer = parse_recommendation(content,['handbook'] + ([] if condition=='handbook' else ['expert-guidance']),ACTIONS)
            row.update(answer,correct=answer['action']==row['expected'])
        except Exception as error:
            row.update(error=type(error).__name__ + ': ' + str(error),correct=False)
        row['seconds'] = round(time.monotonic()-start,3)
        report['rows'].append(row)
        report['summary'] = summarize(report['rows'])
        report['complete'] = len(report['rows'])==len(jobs)
        output.write_text(json.dumps(report,indent=2)+'\n')
        print(f'{len(report["rows"])}/{len(jobs)} {case["case_id"]} {condition}: {row.get("action","failed")}',flush=True)
        if 'error' in row:
            print('Stopped after failure; all attempted results retained. No automatic retry.',flush=True)
            break

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    sub=parser.add_subparsers(dest='command',required=True)
    p=sub.add_parser('freeze');p.add_argument('--database',type=Path,default=ROOT/'runs/missing-monday.sqlite3');p.add_argument('--output',type=Path,required=True)
    p=sub.add_parser('run');p.add_argument('--package',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--confirmed-credit',type=float,required=True);p.add_argument('--input-rate',type=float,required=True);p.add_argument('--output-rate',type=float,required=True)
    args=parser.parse_args()
    if args.command=='freeze':freeze(args.database,args.output)
    else:run(args.package,args.output,args.confirmed_credit,args.input_rate,args.output_rate)
