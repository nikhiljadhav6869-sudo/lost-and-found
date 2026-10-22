import fs from 'node:fs';
// Values already supplied by the host always win. Never print loaded values.
if (fs.existsSync('.dev.vars')) process.loadEnvFile('.dev.vars');
