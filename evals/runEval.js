/**
 * Evaluation script for the LLM triage pipeline.
 * Runs test cases from evals/cases.json against the local API and calculates precision.
 */

const fs = require('fs');
const path = require('path');

const API_URL = process.env.EVAL_API_URL || 'http://localhost:3000/llm/triage';

async function runEval() {
  const casesPath = path.join(__dirname, 'cases.json');
  const cases = JSON.parse(fs.readFileSync(casesPath, 'utf8'));

  console.log(`\n🚀 Starting evaluation of ${cases.length} cases against: ${API_URL}\n`);

  const total = cases.length;
  let correctCategory = 0;
  let correctPriority = 0;
  let exactMatches = 0;

  for (const testCase of cases) {
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testCase.input)
      });

      if (!response.ok) {
        console.log(`❌ [Case #${testCase.id}] Failed with HTTP status ${response.status}`);
        continue;
      }

      const result = await response.json();

      const catOk = result.category === testCase.expected.category;
      const prioOk = result.priority === testCase.expected.priority;

      if (catOk) correctCategory++;
      if (prioOk) correctPriority++;
      if (catOk && prioOk) exactMatches++;

      console.log(
        `Case #${testCase.id}: ${catOk && prioOk ? '✅ PASS' : '⚠️ MISMATCH'} | ` +
        `Expected: [${testCase.expected.category}, ${testCase.expected.priority}] | ` +
        `Got: [${result.category}, ${result.priority}] (Confidence: ${result.confidence})`
      );
    } catch (err) {
      console.error(`💥 [Case #${testCase.id}] Execution error:`, err.message);
    }
  }

  const catScore = ((correctCategory / total) * 100).toFixed(1);
  const exactScore = ((exactMatches / total) * 100).toFixed(1);

  console.log('\n========================================');
  console.log('📊 EVALUATION RESULTS');
  console.log('========================================');
  console.log(`Category Accuracy: ${correctCategory}/${total} (${catScore}%)`);
  console.log(`Exact Match Accuracy: ${exactMatches}/${total} (${exactScore}%)`);
  console.log('========================================\n');
}

runEval();