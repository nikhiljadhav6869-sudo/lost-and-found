import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {restoreBackup} from './backup.mjs';

// Restored records and photos exist only in a newly created private directory.
// Never expose their contents or location in workflow output or artifacts.
export function verifyBackupRestore(archive,password,{temporaryDirectory=os.tmpdir()}={}){
 const parent=fs.realpathSync(temporaryDirectory);
 const directory=fs.mkdtempSync(path.join(parent,'lost-found-restore-'));
 try{
  fs.chmodSync(directory,0o700);
  const restored=restoreBackup(archive,password,path.join(directory,'restored'));
  return {tables:restored.tables,photos:restored.photos};
 }finally{
  // Restrict recursive removal to this invocation's directory under the resolved
  // temporary parent. Refuse to follow a replaced directory or symbolic link.
  const resolved=fs.realpathSync(directory);
  if(path.dirname(resolved)!==parent||resolved!==directory||!path.basename(resolved).startsWith('lost-found-restore-')||fs.lstatSync(directory).isSymbolicLink()){
   throw new Error('Restore drill cleanup refused an unexpected directory.');
  }
  fs.rmSync(directory,{recursive:true,force:false});
 }
}
