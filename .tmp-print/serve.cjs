const http=require('http'),fs=require('fs'),path=require('path');
const root=path.resolve('dist');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'};
http.createServer((req,res)=>{let p=path.join(root,decodeURIComponent(req.url.split('?')[0]));if(!p.startsWith(root)||!fs.existsSync(p)||fs.statSync(p).isDirectory())p=path.join(root,'index.html');res.writeHead(200,{'Content-Type':types[path.extname(p)]||'application/octet-stream'});fs.createReadStream(p).pipe(res);}).listen(4180,()=>console.log('ok'));
