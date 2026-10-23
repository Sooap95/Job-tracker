import {copyFile, mkdir} from 'node:fs/promises';
import {join} from 'node:path';

// Liste blanche : les secrets, les tests et le Worker ne sont jamais publiés comme assets.
const published = [
  'index.html','style.css','app.js','sw.js','manifest.webmanifest',
  'icon.svg','icon-192.png','icon-512.png'
];
const dest = new URL('../dist/',import.meta.url);
await mkdir(dest,{recursive:true});
for (const file of published) await copyFile(new URL('../'+file,import.meta.url),new URL(file,dest));
console.log(`Prêt pour publication : ${published.length} ressources publiques.`);
