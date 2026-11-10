import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemoEvaluationRun,DEMO_AGENT_OUTPUT,parseWebsiteAgentOutput} from '../src/lib/eval-verifier';

test('incorrect-price example is verified against unchanged frozen source and references',async()=>{
 const wrong=await createDemoEvaluationRun('pricing-mismatch');
 const original=await createDemoEvaluationRun();
 assert.equal(wrong.mode,'demo');assert.equal(wrong.sessionId,null);assert.equal(wrong.usage,null);
 assert.equal(wrong.expectedFacts?.pricing?.amount,29);
 assert.equal(parseWebsiteAgentOutput(wrong.agentOutput)?.facts.pricing?.amount,49);
 assert.equal(wrong.result?.checks.find(c=>c.id==='pricing-extraction')?.status,'fail');
 assert.equal(original.result?.checks.find(c=>c.id==='pricing-extraction')?.status,'pass');
 assert.equal(wrong.captures[0].sha256,original.captures[0].sha256);
 assert.equal(DEMO_AGENT_OUTPUT.facts.pricing?.amount,29);
 assert.match(wrong.siteName,/incorrect-price example/);
});
