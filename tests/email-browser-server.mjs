import {isolate} from './environment.mjs';import fs from 'node:fs';
isolate('email-browser');Object.assign(process.env,{PORT:'3007',HOST:'127.0.0.1',APP_ORIGIN:'http://127.0.0.1:3007',AUTH_EMAIL_CODES:'true',BREVO_API_KEY:'test-only',EMAIL_FROM:'sender@ui.test'});
globalThis.fetch=async(url,options)=>{if(url!=='https://api.brevo.com/v3/smtp/email')throw Error('Unexpected test request');const mail=JSON.parse(options.body);if(!mail.to[0].email.endsWith('@ui.test'))throw Error('Only isolated test recipients allowed');fs.writeFileSync('.sites-runtime/email-browser-code.json',JSON.stringify({code:mail.textContent.match(/\b\d{6}\b/)[0]}));return Response.json({messageId:'test-only'});};
await import('../dist/local-server.mjs');
