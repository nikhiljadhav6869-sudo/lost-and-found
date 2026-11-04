import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const source=fs.readFileSync(require.resolve('axe-core/axe.min.js'),'utf8');
export async function checkAccessibility(page, label) {
  await page.evaluate(async()=>Promise.all(document.getAnimations().filter(animation=>
    Number.isFinite(animation.effect?.getComputedTiming().endTime)
  ).map(animation=>animation.finished.catch(()=>{}))));
  await page.evaluate(source);
  const result=await page.evaluate(async()=>window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));
  const violations=result.violations.map(v=>({id:v.id,impact:v.impact,help:v.help,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}));
  if(violations.length)fs.writeFileSync('.sites-runtime/accessibility-'+label+'.json',JSON.stringify(violations,null,2));
  assert.deepEqual(violations,[],label+' accessibility violations');
}
