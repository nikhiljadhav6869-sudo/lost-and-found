export async function boundedBody(req:Request,max:number){
 const reader=req.body?.getReader();if(!reader)return new Uint8Array();const parts:Uint8Array[]=[];let total=0;
 while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>max){await reader.cancel();throw Object.assign(new Error('Request is too large.'),{status:413});}parts.push(value);}
 const out=new Uint8Array(total);let pos=0;for(const p of parts){out.set(p,pos);pos+=p.length;}return out;
}
