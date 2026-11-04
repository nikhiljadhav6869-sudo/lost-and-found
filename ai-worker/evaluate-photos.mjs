import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {build} from 'esbuild';
import {embed} from './models.mjs';

const directory = process.argv[2];
if (!directory) throw Error('Supply the extracted COIL-20 directory containing obj1__0.png.');
const {outputFiles} = await build({stdin:{contents:"export * from './lib/intelligence'; export {isStrongMatch} from './lib/matching';",resolveDir:process.cwd()},bundle:true,format:'esm',write:false,platform:'node'});
const {multimodal, cosine, publicEmbeddingText, isStrongMatch, MODEL_VERSION} = await import('data:text/javascript;base64,' + Buffer.from(outputFiles[0].contents).toString('base64'));
const gallery = [];
const truth = {trueAlerts:0, falseAlerts:0, missed:0, correctRejections:0};
const described = {...truth};
let lookalikePairs = 0, lookalikeAlerts = 0;
// Coarse, manually assigned captions. Lookalikes deliberately share the same caption.
const families = ['duck','block','car','cat','box','car','block','bottle','box','jar','block','cup','pig','fitting','jar','bottle','cup','cup','car','tub'];
const captions = {
  duck:['toy duck','small duck toy'], block:['wooden block','wooden piece'],
  car:['toy car','small model vehicle'], cat:['cat figurine','small ornamental cat'],
  box:['medicine box','carton of tablets'], bottle:['plastic bottle','small toiletry bottle'],
  jar:['lidded jar','small container with a lid'], cup:['drinking cup','small cup'],
  pig:['pig figurine','small pig ornament'], fitting:['round fitting','circular mechanical fitting'],
  tub:['plastic tub','round plastic container'],
};
const captionVectors = new Map();
const views = process.argv[3] ? process.argv[3].split(',').map(Number) : [9,18,36,54];
if (!views.length || views.some(view=>!Number.isInteger(view)||view<1||view>71) || new Set(views).size!==views.length)
  throw Error('Use distinct COIL-20 view indices from 1 through 71. Gallery view zero is excluded.');
let imageTop1 = 0, imageTop3 = 0;
const latency = [], burstWait = [];
let firstMs;
async function photo(object, view, type) {
  // Identity and view are labels only. All reports share deliberately generic public details.
  const report = {id:type+object+'-'+view, type, status:'Open', title:'Small household object', description:'Found on campus', category:'Other', location:'Library', date:'2026-10-01', colour:'', brand:''};
  const bytes = await readFile(path.join(directory, 'obj'+object+'__'+view+'.png'));
  const {textVector,imageVector} = await embed(publicEmbeddingText(report),[bytes]);
  const embedding = {model:MODEL_VERSION,revision:1,textVector:JSON.stringify(textVector), imageVector:JSON.stringify(imageVector)};
  const caption = captions[families[object-1]][type === 'found' ? 0 : 1];
  const captioned = {...report,title:caption,description:''};
  if (!captionVectors.has(caption)) captionVectors.set(caption, JSON.stringify((await embed(publicEmbeddingText(captioned))).textVector));
  return {object,report,imageVector,embedding,captioned,captionEmbedding:{...embedding,textVector:captionVectors.get(caption)}};
}
for(let object=1; object<=20; object++){
  const started=performance.now();
  gallery.push(await photo(object,0,'found'));
  if(object===1) firstMs=Math.round(performance.now()-started);
}
for (const view of views) {
  let burstStart;
  for(let object=1; object<=20; object++){
    const start=performance.now();
    if((object-1)%5===0) burstStart=start;
    const query=await photo(object,view,'lost');
    const ranked=gallery.map(candidate=>{
      const score=multimodal(query.report,candidate.report,query.embedding,candidate.embedding).score;
      const same=object===candidate.object;
      const captionScore=multimodal(query.captioned,candidate.captioned,query.captionEmbedding,candidate.captionEmbedding).score;
      const alert=isStrongMatch(captionScore);
      described[alert ? (same?'trueAlerts':'falseAlerts') : (same?'missed':'correctRejections')]++;
      if (!same && families[object-1]===families[candidate.object-1]) {
        lookalikePairs++;
        if (alert) lookalikeAlerts++;
      }
      if(isStrongMatch(score)) truth[same?'trueAlerts':'falseAlerts']++;
      else truth[same?'missed':'correctRejections']++;
      return {same,similarity:cosine(query.imageVector,candidate.imageVector)};
    }).sort((a,b)=>b.similarity-a.similarity);
    imageTop1+=Number(ranked[0].same);
    imageTop3+=Number(ranked.slice(0,3).some(entry=>entry.same));
    latency.push(performance.now()-start);
    burstWait.push(performance.now()-burstStart);
  }
}
const p95=values=>Math.round(values.toSorted((a,b)=>a-b)[Math.ceil(0.95*values.length)-1]);
console.log(JSON.stringify({model:MODEL_VERSION,gallery:20,queries:latency.length,views,imageTop1,imageTop3,genericDetails:truth,coarseCaptions:described,lookalikePairs,lookalikeAlerts,firstEmbeddingMs:firstMs,evaluationP95Ms:p95(latency),fiveQueryEvaluationBurstP95Ms:p95(burstWait),rssMB:Math.round(process.memoryUsage().rss/1048576)},null,2));
