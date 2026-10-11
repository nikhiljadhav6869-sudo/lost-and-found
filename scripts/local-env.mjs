import fs from 'node:fs';
import {randomBytes} from 'node:crypto';
if(!fs.existsSync('.dev.vars')){fs.writeFileSync('.dev.vars','BETTER_AUTH_SECRET='+randomBytes(48).toString('base64url')+'\nADMIN_USER_IDS=\n');console.log('Created local authentication secret in ignored .dev.vars.');}else console.log('Keeping existing local environment.');
