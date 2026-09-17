"""Add unrun decision questions; does not alter the frozen batch corpus or observations."""
import json
from pathlib import Path
import runpy
focus = runpy.run_path(str(Path(__file__).with_name('expand-category-questions.py')))['focus']
artifact = json.loads(Path('src/data/public-search-rankings.json').read_text())
seeds = artifact['queries'][:35]
intents = [
 'What information is missing from the official documentation, and which questions should a buyer ask before committing?',
 'What is the smallest practical trial that would test suitability, and what should count as success or failure?',
 'What recurring costs, usage limits, optional extras and cancellation terms should be compared over a year?',
 'Which advertised capabilities depend on a particular plan, location, device or eligibility requirement?',
 'What accessibility information and accommodation options are documented, and what remains unverified?',
 'What setup steps, prerequisites and ongoing responsibilities fall on the customer?',
 'What happens if the service or product does not meet expectations, including support, refunds and dispute handling?',
 'Which independent evidence would help verify the most important claims without treating marketing as proof?',
 'What restrictions would make this a poor fit, and what alternative approach should be considered?',
 'What changes after the initial purchase or signup, and which terms or capabilities should be rechecked later?',
]
questions = []
assert len(seeds) == len(focus) == 35
for base, (subject, _) in zip(seeds, focus):
 for index, intent in enumerate(intents, 1):
  questions.append({**base, 'id': f"{base['id']}-decision-{index:02d}",
   'query': f"When evaluating {subject}: {intent} Cite current official sources where available and explicitly identify uncertainty."})
assert len(questions) == 350 and len({q['id'] for q in questions}) == 350
Path('src/data/public-additional-questions.json').write_text(json.dumps(questions, indent=2, ensure_ascii=False)+'\n')
print('350 new questions; no runs or observations created')
