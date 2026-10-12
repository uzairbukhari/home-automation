import { readdirSync,writeFileSync } from 'node:fs';
import path from 'node:path';
export function generateOfflineAssets(root=path.resolve('dist/client')) {
  const files=readdirSync(root,{recursive:true}).filter(name=>/\.(?:js|css|woff2|png|svg)$/.test(String(name)));
  writeFileSync(path.join(root,'offline-assets.json'),JSON.stringify(files.map(name=>'/'+String(name).replaceAll('\\','/'))));
}
if(process.argv[1]?.endsWith('generate-offline-assets.mjs'))generateOfflineAssets();
