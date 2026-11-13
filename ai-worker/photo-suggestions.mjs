import {pipeline,RawImage} from '@huggingface/transformers';
import {validateImageInput} from './models.mjs';
// Reuse the pinned CLIP family; classifications are editable suggestions, not facts.
const items={backpack:'Bags',handbag:'Bags',wallet:'Wallets',keys:'Keys',phone:'Electronics',laptop:'Electronics',headphones:'Electronics',earbuds:'Electronics',watch:'Jewellery',ring:'Jewellery',bracelet:'Jewellery',book:'Books',notebook:'Books',jacket:'Clothing',cap:'Clothing',scarf:'Clothing',umbrella:'Other',bottle:'Other',glasses:'Other',ball:'Sports equipment',racket:'Sports equipment',document:'Documents',charger:'Electronics'};
let model;
const choose=async(image,labels)=>{
 const result=await model(image,labels,{hypothesis_template:'A photo of {}.'});
 return result[0].score>=.25&&result[0].score-result[1].score>=.06?result[0].label:null;
};
export async function suggestPhoto(bytes){
 await validateImageInput(bytes);
 model??=await pipeline('zero-shot-image-classification','Xenova/clip-vit-base-patch32',{revision:'d15189d7028b43f1d3e65039190477f6af591c2a',dtype:'q8',device:'cpu',session_options:{intraOpNumThreads:2,interOpNumThreads:1}});
 const image=await RawImage.fromBlob(new Blob([bytes]));
 const item=await choose(image,[...Object.keys(items),'unrecognizable object']);
 const recognised=item&&Object.hasOwn(items,item)?item:'';
 const colours=['black','white','blue','green','red','yellow','brown','grey','pink','purple','orange','multicoloured'];
 const colourLabel=await choose(image,colours.map(c=>`${c} ${recognised||'object'}`));
 const colour=colourLabel?.split(' ')[0]||'';
 const pattern=await choose(image,['a striped object','a spotted object','a plain object','an object with no clear pattern']);
 const features=pattern==='a striped object'?['Possibly striped']:pattern==='a spotted object'?['Possibly spotted']:[];
 const title=recognised?[colour,recognised].filter(Boolean).join(' '):'';
 return {title,category:recognised?items[recognised]:'Other',colour,features,description:title?`Possibly a ${title}.${features.length?' '+features.join('. ')+'.':''}`:''};
}
