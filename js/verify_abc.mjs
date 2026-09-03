globalThis.window = {}; globalThis.document = { createElement(){ throw new Error('no-dom'); }, head:{ appendChild(){} } };
const { renderTikz } = await import('./tikz-renderer.js');
import fs from 'fs'; import path from 'path';
async function render(src){ const el={innerHTML:'',classList:{add(){}},getAttribute(n){return n==='data-tikz'?src:null;}}; const c={querySelectorAll(){return[el];}}; await renderTikz(c); return el.innerHTML; }
let ok=0,fail=0,nan=0,overlapFix=0;
const files=[]; (function walk(d){ for(const e of fs.readdirSync(d,{withFileTypes:true})){ const p=path.join(d,e.name); if(e.isDirectory())walk(p); else if(e.name.endsWith('.md'))files.push(p);} })('Markdown');
for(const f of files){ let txt; try{txt=fs.readFileSync(f,'utf8');}catch{continue;}
  const re=/```tikz\s*\n?([\s\S]*?)\n?```/g; let m;
  while((m=re.exec(txt))){ const out=await render(m[1]);
    if(out.includes('tikz-error')){fail++;continue;}
    ok++;
    if(/[cx\="][^"]*(?:NaN|Infinity)/.test(out)||/M\s*(?:NaN|Infinity)/.test(out)) nan++;
    // circle 重叠检测(非同心)
    const cs=[...out.matchAll(/<circle cx="(-?[\d.e]+)" cy="(-?[\d.e]+)" r="(-?[\d.e]+)"/g)].map(p=>({x:+p[1],y:+p[2],r:+p[3]}));
    for(let i=0;i<cs.length;i++)for(let j=i+1;j<cs.length;j++){const a=cs[i],b=cs[j];const d=Math.hypot(a.x-b.x,a.y-b.y);if(d>0.5&&d<a.r+b.r-0.5)overlapFix++;}
  }
}
console.log(`OK=${ok} FAIL=${fail} NaN=${nan} 圆重叠对=${overlapFix}`);
// 具体检查: 15.7 圆
const exm=fs.readFileSync('Markdown/example.md','utf8');
const exBlk=[...exm.matchAll(/```tikz\s*\n?([\s\S]*?)\n?```/g)].map(x=>x[1]);
const b157=exBlk.find(b=>b.includes('grid (8,3)'));
if(b157){ const out=await render(b157); const cs=[...out.matchAll(/<circle cx="(-?[\d.e]+)" cy="(-?[\d.e]+)" r="(-?[\d.e]+)"/g)].map(p=>({x:+p[1],y:+p[2],r:+p[3]})); const xs=[...new Set(cs.map(c=>Math.round(c.x)))].sort((a,b)=>a-b); console.log('15.7 圆x位置:', xs.join(','), ' 半径:', [...new Set(cs.map(c=>c.r.toFixed(1)))].join(',')); }
