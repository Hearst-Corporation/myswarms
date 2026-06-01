-- SQUAD G #1 — recompute reputation in SQL, compare to repo.py fetch_agent_reputation logic.
-- repo.py: accuracy = correct/(correct+wrong), n = correct+wrong, only AGENT_CORRECT/AGENT_WRONG.
select subject,
  count(*) filter (where feedback_type='AGENT_CORRECT') correct,
  count(*) filter (where feedback_type='AGENT_WRONG')   wrong,
  count(*) filter (where feedback_type in ('AGENT_CORRECT','AGENT_WRONG')) n,
  round( (count(*) filter (where feedback_type='AGENT_CORRECT'))::numeric
         / nullif(count(*) filter (where feedback_type in ('AGENT_CORRECT','AGENT_WRONG')),0), 3) accuracy,
  (count(*) filter (where feedback_type in ('AGENT_CORRECT','AGENT_WRONG')) >= 20) as meets_n_min_20
from hedge_cognitive_feedback
where feedback_type in ('AGENT_CORRECT','AGENT_WRONG')
group by subject order by subject;
