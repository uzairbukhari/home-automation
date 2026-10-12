import { generateKeyPairSync,randomBytes } from 'node:crypto';
import { existsSync,mkdirSync,readFileSync,writeFileSync } from 'node:fs';
const file='.sites-runtime/push-config.json';
mkdirSync('.sites-runtime',{recursive:true});
let config;
if(existsSync(file))config=JSON.parse(readFileSync(file,'utf8'));
else {
  const {privateKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),jwk=privateKey.export({format:'jwk'});
  config={VAPID_PUBLIC_KEY:Buffer.concat([Buffer.from([4]),Buffer.from(jwk.x,'base64url'),Buffer.from(jwk.y,'base64url')]).toString('base64url'),VAPID_PRIVATE_KEY:jwk.d,VAPID_SUBJECT:'mailto:suzairbukhari@gmail.com',NOTIFICATION_COLLECTION_SECRET:randomBytes(32).toString('base64url')};
  writeFileSync(file,JSON.stringify(config),{mode:0o600});
}
const envFile='.env.local';let existing=existsSync(envFile)?readFileSync(envFile,'utf8'):'';
for(const [key,value] of Object.entries(config))if(!new RegExp(`^${key}=`, 'm').test(existing))existing+=`\n${key}=${value}`;
writeFileSync(envFile,existing);
console.log(process.argv.includes('--json')?JSON.stringify(config):'Mobile push configuration prepared. Private values stay in ignored files.');
