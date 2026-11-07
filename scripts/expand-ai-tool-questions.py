"""Deterministic AI-tool evaluation questions; no provider calls or invented observations.

Appends a reviewed question set for AI assistants and AI app builders. It never
edits the existing 3,500-question website corpus or its observations.
"""
import json
from pathlib import Path

scenarios = [
    'a solo professional using AI daily for research and drafts',
    'a two-person startup with a $100 monthly software budget',
    'a ten-person team standardizing on one assistant',
    'a regulated business handling confidential client data',
    'a student working on a free plan',
    'a consultant working across several client accounts',
    'a team migrating from a mix of consumer chatbot accounts',
    'a distributed team working across US and European time zones',
    'a budget-capped nonprofit',
    'a non-technical operations team',
    'an enterprise pilot that may become a paid rollout',
]

categories = [
    {
        'id': 'ai-assistants-v1',
        'category': 'AI assistants',
        'noun': 'an AI assistant',
        'candidates': 'ChatGPT, Claude, Gemini, Perplexity, Microsoft Copilot and Manus',
        'seed': ('For a small team choosing one general AI assistant, how should I compare ChatGPT, Claude, Gemini, '
                 'Perplexity, Microsoft Copilot and Manus on answer quality, citations, plan limits, data handling and '
                 'when a specialist tool is a better fit?'),
        'topics': [
            'answer quality with citations and source transparency',
            'long-document and file analysis limits',
            'coding help, data analysis and code execution',
            'multi-step browser or computer-use automation',
            'team administration, shared workspaces and retention controls',
            'free-plan limits and subscription cost triggers',
            'data privacy, training opt-out and residency',
            'mobile, voice and cross-device continuity',
            'API access, export and vendor lock-in',
        ],
    },
    {
        'id': 'ai-app-builders-v1',
        'category': 'AI app builders',
        'noun': 'an AI app builder or coding agent',
        'candidates': 'Lovable, v0, Bolt, Replit, Cursor, Devin and GitHub Copilot',
        'seed': ('Which AI app builder or coding agent should a small product team evaluate for turning a prompt into a '
                 'maintainable web app? Compare Lovable, v0, Bolt, Replit, Cursor, Devin and GitHub Copilot on '
                 'stack control, code export, backend services, deployment and cost.'),
        'topics': [
            'prompt-to-app fidelity and editability',
            'framework choice, source ownership and code export',
            'database, authentication and backend integration',
            'deployment, custom domains and environment promotion',
            'version control and team collaboration',
            'secrets, environment variables and permission boundaries',
            'credit pricing and usage limits',
            'security review, dependency updates and auditability',
            'migration to a conventional codebase and vendor lock-in',
        ],
    },
]

questions = []
for spec in categories:
    base = {
        'id': spec['id'],
        'audience': 'AI tools',
        'category': spec['category'],
        'query': spec['seed'],
        'language': 'en',
        'locale': 'en-US',
    }
    questions.append(base)
    assert len(spec['topics']) == 9
    for scenario_index, scenario in enumerate(scenarios, 1):
        for topic_index, topic in enumerate(spec['topics'], 1):
            questions.append({
                **base,
                'id': f"{spec['id']}-s{scenario_index:02d}-q{topic_index:02d}",
                'query': (f"For {scenario}, how should I evaluate {spec['candidates']} when choosing {spec['noun']}, "
                          f"specifically {topic}? Use current official sources, name the plans or limits that change the answer, "
                          "distinguish documented capabilities from marketing claims, and explain the evidence I should check "
                          "before choosing. If a capability is unavailable or unclear, say so rather than assuming it exists."),
            })

assert len(questions) == 200, len(questions)
assert len({question['id'] for question in questions}) == 200
assert len({question['query'] for question in questions}) == 200
assert all(len(question['id']) <= 160 for question in questions)

path = Path('src/data/public-ai-tool-questions.json')
path.write_text(json.dumps(questions, indent=2, ensure_ascii=False) + '\n')
print('2 AI-tool categories; 100 questions each; 200 total; no runs or observations created')
