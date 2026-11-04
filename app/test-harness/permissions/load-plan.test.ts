// EZD-285 J1–J10 (vault/plans/EZD-285.md section 4; AC-EZD-285-2). Pure unit tests of loadPlanProblems on
// literal LoadPlan values. "Good plan" is the section 4 literal; every node with Relation Name has
// Schema 'pg_temp' (section 4 Values). Expected codes come from section 3 and section 1 (loadPlanProblems rules).
import { describe, expect, it } from 'vitest';
import { loadPlanProblems, type LoadPlan, type PlanNode } from './load-plan';

const GOOD_TABLES = ['membership', 'membership_project', 'user_permission'];

function goodPlan(): PlanNode {
  return {
    'Node Type': 'Index Scan',
    'Relation Name': 'membership',
    Schema: 'pg_temp',
    'Index Name': 'membership_pkey',
    'Index Cond': '(id = $0)',
    Plans: [
      {
        'Node Type': 'Bitmap Heap Scan',
        'Relation Name': 'user_permission',
        Schema: 'pg_temp',
        Plans: [
          {
            'Node Type': 'Bitmap Index Scan',
            'Index Name': 'user_permission_pkey',
            'Index Cond': '(membership_id = m.id)',
          },
        ],
      },
      {
        'Node Type': 'Index Only Scan',
        'Relation Name': 'membership_project',
        Schema: 'pg_temp',
        'Index Name': 'membership_project_pkey',
        'Index Cond': '(membership_id = m.id)',
      },
    ],
  };
}

function childrenOf(node: PlanNode): PlanNode[] {
  return node.Plans as PlanNode[];
}

function loadWith(plan: PlanNode | null, over: Partial<LoadPlan> = {}): LoadPlan {
  return {
    fn: 'public.current_permissions()',
    language: 'sql',
    tables: [...GOOD_TABLES],
    unsupported: [],
    statements: 1,
    plan,
    ...over,
  };
}

describe('EZD-285 loadPlanProblems', () => {
  it('J1 an Index Scan with only a Filter (the Q-0355 shape) gives unindexed:membership_project', () => {
    const plan = goodPlan();
    childrenOf(plan)[1] = {
      'Node Type': 'Index Scan',
      'Relation Name': 'membership_project',
      Schema: 'pg_temp',
      'Index Name': 'membership_project_project_id_idx',
      Filter: '(membership_id = m.id)',
    };
    expect(loadPlanProblems(loadWith(plan))).toEqual(['unindexed:membership_project']);
  });

  it('J2 the good plan gives no problems', () => {
    expect(loadPlanProblems(loadWith(goodPlan()))).toEqual([]);
  });

  it('J3 a Seq Scan with only a Filter on user_permission gives unindexed:user_permission', () => {
    const plan = goodPlan();
    childrenOf(plan)[0] = {
      'Node Type': 'Seq Scan',
      'Relation Name': 'user_permission',
      Schema: 'pg_temp',
      Filter: 'granted',
    };
    expect(loadPlanProblems(loadWith(plan))).toEqual(['unindexed:user_permission']);
  });

  it('J4 a Bitmap Index Scan without an Index Cond gives unindexed:user_permission_pkey', () => {
    const plan = goodPlan();
    const bitmapIndex = childrenOf(childrenOf(plan)[0])[0];
    delete bitmapIndex['Index Cond'];
    expect(loadPlanProblems(loadWith(plan))).toEqual(['unindexed:user_permission_pkey']);
  });

  it('J5 a plpgsql load gives language:plpgsql', () => {
    const load = loadWith(null, {
      language: 'plpgsql',
      tables: [],
      statements: 0,
    });
    expect(loadPlanProblems(load)).toEqual(['language:plpgsql']);
  });

  it('J6 two statements give statements:2', () => {
    expect(loadPlanProblems(loadWith(goodPlan(), { statements: 2 }))).toEqual(['statements:2']);
  });

  it('J7 an unsupported name gives unsupported:public.current_app_user_id', () => {
    const load = loadWith(null, {
      tables: [],
      unsupported: ['public.current_app_user_id'],
      statements: 0,
    });
    expect(loadPlanProblems(load)).toEqual(['unsupported:public.current_app_user_id']);
  });

  it('J8 a table no node scans gives not_scanned:membership_project', () => {
    const plan = goodPlan();
    plan.Plans = [childrenOf(plan)[0]];
    expect(loadPlanProblems(loadWith(plan))).toEqual(['not_scanned:membership_project']);
  });

  it('J9 no tables and no statements give statements:0', () => {
    const load = loadWith(null, { tables: [], statements: 0 });
    expect(loadPlanProblems(load)).toEqual(['statements:0']);
  });

  it('J10 a node whose Schema is public gives not_cloned:public.membership', () => {
    const plan = goodPlan();
    plan.Schema = 'public';
    expect(loadPlanProblems(loadWith(plan))).toEqual(['not_cloned:public.membership']);
  });
});
