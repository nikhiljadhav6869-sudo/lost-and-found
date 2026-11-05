import fs from 'node:fs/promises';
import path from 'node:path';
import {build} from 'esbuild';
import {embed} from './models.mjs';

// Keep consented datasets in ignored .sites-runtime, never in the public repo.
// Labels are used only to grade results, never included in model inputs.
const file=process.argv[2];
if(!file)throw Error('Supply a labelled JSON dataset. See docs/MATCHING-FIELD-TEST.md.');
const root=await fs.realpath(path.dirname(path.resolve(file)));
if((await fs.stat(file)).size>1024*1024)throw Error('Dataset exceeds 1 MB.');
const input=await fs.readFile(file,'utf8');
if(Buffer.byteLength(input)>1024*1024)throw Error('Dataset exceeds 1 MB.');
let dataset;
try { dataset=JSON.parse(input); } catch { throw Error('Dataset must be valid JSON.'); }
if(!dataset||!['synthetic','consented-field'].includes(dataset.source)||!Array.isArray(dataset.reports)||dataset.reports.length<2||dataset.reports.length>200)
  throw Error('Use 2–200 reports and a documented source.');
const {outputFiles}=await build({stdin:{contents:"export * from './lib/intelligence'; export {isStrongMatch,categories} from './lib/matching';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false});
const {multimodal,publicEmbeddingText,MODEL_VERSION,isStrongMatch,categories}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].contents).toString('base64'));
const reports=[];
for(const [index,entry] of dataset.reports.entries()) {
  if(typeof entry.objectId!=='string'||!entry.objectId.trim()||!['lost','found'].includes(entry.type)||!categories.includes(entry.category))throw Error('Invalid item label, report type or category.');
  for(const [field,limit] of Object.entries({title:100,description:2000,colour:50,brand:60,location:100,date:10}))if(typeof entry[field]!=='string'||entry[field].length>limit)throw Error('Invalid report field.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(entry.date)||!Number.isFinite(Date.parse(entry.date))||new Date(entry.date).toISOString().slice(0,10)!==entry.date)throw Error('Invalid report date.');
  if(!Array.isArray(entry.photos)||entry.photos.length>5)throw Error('Supply at most five local photos per report.');
  const photos=[];
  for(const filename of entry.photos){
    if(typeof filename!=='string'||path.isAbsolute(filename))throw Error('Photos must be relative to the dataset.');
    const resolved=await fs.realpath(path.resolve(root,filename));
    const relative=path.relative(root,resolved);
    if(relative.startsWith('..'+path.sep)||relative==='..'||path.isAbsolute(relative))throw Error('Photo must remain inside the dataset directory.');
    const stat=await fs.stat(resolved);if(!stat.isFile()||stat.size>5*1024*1024)throw Error('Photo is missing or exceeds 5 MB.');
    photos.push(await fs.readFile(resolved));
  }
  const report={id:String(index),status:'Open',type:entry.type,category:entry.category,title:entry.title,description:entry.description,colour:entry.colour,brand:entry.brand,location:entry.location,date:entry.date};
  const vector=await embed(publicEmbeddingText(report),photos);
  reports.push({objectId:entry.objectId,report,embedding:{model:MODEL_VERSION,revision:1,textVector:JSON.stringify(vector.textVector),imageVector:vector.imageVector?JSON.stringify(vector.imageVector):null}});
}
const queries=reports.filter(r=>r.report.type==='lost'),gallery=reports.filter(r=>r.report.type==='found');
if(!queries.length||!gallery.length)throw Error('Dataset needs both lost and found reports.');
let genuine=0,unrelated=0,trueAlerts=0,falseAlerts=0,top1=0,top3=0,answerable=0;
for(const query of queries){
  const ranked=gallery.map(candidate=>({same:query.objectId===candidate.objectId,score:multimodal(query.report,candidate.report,query.embedding,candidate.embedding).score})).sort((a,b)=>b.score-a.score);
  for(const pair of ranked){if(pair.same){genuine++;if(isStrongMatch(pair.score))trueAlerts++;}else{unrelated++;if(isStrongMatch(pair.score))falseAlerts++;}}
  if(ranked.some(r=>r.same)){
    answerable++;
    // Count tied cutoffs conservatively: every candidate at/above the cutoff must fit.
    const bestCorrect=ranked.find(r=>r.same).score;
    const competing=ranked.filter(r=>!r.same&&r.score>=bestCorrect).length;
    if(competing===0)top1++;if(competing<3)top3++;
  }
}
console.log(JSON.stringify({source:dataset.source,model:MODEL_VERSION,queries:queries.length,gallery:gallery.length,answerable,top1,top3,genuine,unrelated,trueAlerts,falseAlerts,missed:genuine-trueAlerts,precision:trueAlerts+falseAlerts?trueAlerts/(trueAlerts+falseAlerts):null,recall:genuine?trueAlerts/genuine:null},null,2));
