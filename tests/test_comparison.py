import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from tools.compare_handover import cases, messages, summarize, freeze, run

class ComparisonTests(unittest.TestCase):
    def test_model_sees_only_facts_and_condition_evidence(self):
        package={'prompt':'same instructions','handbook':['public manual'],'raw_answer':'expert original','approved_card':'reviewed note'}
        case={**cases()[0], 'expected':'SECRET', 'group':'SECRET'}
        for condition in ('handbook','raw_answer','approved_card'):
            out=messages(package,case,condition)
            self.assertEqual(out[0]['content'],'same instructions')
            self.assertNotIn('SECRET',json.dumps(out))
            user=json.loads(out[1]['content'])
            self.assertEqual(set(user['case']),{'case_id','facts'})
            self.assertEqual(len(user['evidence']),1 if condition=='handbook' else 2)
            if condition!='handbook':
                self.assertEqual(user['evidence'][1]['content'],package[condition])
    def test_failures_and_expert_requests_stay_in_denominator(self):
        rows=[dict(condition='handbook',expected='accept',action='accept',correct=True),
              dict(condition='handbook',expected='reject',action='accept',correct=False),
              dict(condition='handbook',expected='accept',action='ask_expert',correct=False),
              dict(condition='handbook',expected='request_evidence',error='timeout',correct=False)]
        s=summarize(rows)['handbook']
        self.assertEqual((s['attempted'],s['correct'],s['wrong_decisions'],s['failures'],s['expert_requests']),(4,1,1,1,1))
        self.assertEqual((s['resolved_without_expert'],s['eligible_decisions']),(1,3))
    def test_case_set_contains_controls_and_unique_ids(self):
        items=cases()
        self.assertEqual(len({c['case_id'] for c in items}),12)
        self.assertTrue({'eligible','boundary','missing_evidence','permission','outside_scope'} <= {c['group'] for c in items})
    def test_changed_package_is_rejected_before_network(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/'package.json';p.write_text(json.dumps({'sha256':'wrong','cases':[]}))
            with patch('tools.compare_handover._post') as post:
                with self.assertRaisesRegex(ValueError,'changed'):
                    run(p,Path(tmp)/'results.json',1,1.25,4.25)
                post.assert_not_called()
