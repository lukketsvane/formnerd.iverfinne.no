import {readFile,writeFile,mkdir,cp,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
const assets=JSON.parse(await readFile(path.join(root,'studio-assets.json'),'utf8'));
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
await rm(path.join(root,'dist'),{recursive:true,force:true});
await cp(path.join(root,'public'),path.join(root,'dist'),{recursive:true});
await mkdir(path.join(root,'.asset-cache'),{recursive:true});
for(let offset=0;offset<assets.length;offset+=4){
  await Promise.all(assets.slice(offset,offset+4).map(async asset=>{
    const cached=path.join(root,'.asset-cache',asset.sha256);
    let bytes;
    try{bytes=await readFile(cached);}catch{}
    if(!bytes||digest(bytes)!==asset.sha256){
      const response=await fetch(asset.url,{signal:AbortSignal.timeout(120000)});
      if(!response.ok)throw new Error(`Asset fetch failed: ${asset.path} (${response.status})`);
      bytes=Buffer.from(await response.arrayBuffer());
      if(digest(bytes)!==asset.sha256)throw new Error(`Asset integrity mismatch: ${asset.path}`);
      await writeFile(cached,bytes);
    }
    const destination=path.join(root,'dist',asset.path);
    await mkdir(path.dirname(destination),{recursive:true});
    await writeFile(destination,bytes);
    console.log(`Verified ${asset.path} (${bytes.length} bytes)`);
  }));
}
console.log('Built the narrative, five studio routes and A15 build page.');
