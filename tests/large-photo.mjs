import fs from 'node:fs';
// Valid JPEG with comments stripped during upload; no large decoded bitmap needed.
export function photoOfSize(size) {
 const original=fs.readFileSync(new URL('fixtures/sample.jpg',import.meta.url));
 let remaining=size-original.length;
 if(remaining<4)throw Error('Requested fixture is too small');
 const chunks=[original.subarray(0,2)];
 while(remaining){
  let length=Math.min(remaining,65537);
  if(remaining>length && remaining-length<4)length-=4;
  const segment=Buffer.alloc(length,32);segment[0]=255;segment[1]=254;segment.writeUInt16BE(length-2,2);
  chunks.push(segment);remaining-=length;
 }
 chunks.push(original.subarray(2));return Buffer.concat(chunks);
}
