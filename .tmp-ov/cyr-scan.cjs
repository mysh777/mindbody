const fs=require('fs'),path=require('path');const out=[];
(function walk(d){for(const f of fs.readdirSync(d)){const p=path.join(d,f);if(fs.statSync(p).isDirectory())walk(p);else if(/\.(tsx?|css|html)$/.test(f))fs.readFileSync(p,'utf8').split('\n').forEach((l,i)=>{if(/[\u0400-\u04FF]/.test(l))out.push(`${p}:${i+1}: ${l.trim().slice(0,160)}`)})}})('src');
if(fs.existsSync('index.html'))fs.readFileSync('index.html','utf8').split('\n').forEach((l,i)=>{if(/[\u0400-\u04FF]/.test(l))out.push(`index.html:${i+1}: ${l.trim()}`)});
console.log(out.join('\n'));console.error('TOTAL',out.length);
