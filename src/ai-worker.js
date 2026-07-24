import{LINES,other}from'./core.js';
const cfg={easy:{ms:150,depth:2,noise:28},normal:{ms:400,depth:4,noise:3},hard:{ms:950,depth:7,noise:0}};
let deadline=0,nodes=0;
const moves=s=>{const r=[];for(let i=0;i<16;i++)if(s.heights[i]<4)r.push(i);return r.sort((a,b)=>center(b)-center(a))};
const center=r=>3.2-Math.abs(r%4-1.5)-Math.abs(Math.floor(r/4)-1.5);
function put(s,r,p){const z=s.heights[r]++,i=r%4+Math.floor(r/4)*4+z*16;s.cells[i]=p;return i}
function pop(s,r,i){s.cells[i]=0;s.heights[r]--}
function win(s,p){return LINES.some(l=>l.every(i=>s.cells[i]===p))}
function score(s,me){let v=0;const foe=other(me),w=[0,1,12,150,100000];for(const l of LINES){let a=0,b=0;for(const i of l){a+=s.cells[i]===me;b+=s.cells[i]===foe}if(!b)v+=w[a];if(!a)v-=w[b]*1.08}return v}
function search(s,depth,alpha,beta,maxing,me){
  if((++nodes&255)===0&&performance.now()>deadline)throw 0;
  if(depth===0)return score(s,me);
  const list=moves(s);if(!list.length)return 0;const p=maxing?me:other(me);let best=maxing?-Infinity:Infinity;
  for(const r of list){const i=put(s,r,p);let v;if(win(s,p))v=p===me?100000+depth:-100000-depth;else v=search(s,depth-1,alpha,beta,!maxing,me);pop(s,r,i);
    if(maxing){best=Math.max(best,v);alpha=Math.max(alpha,v)}else{best=Math.min(best,v);beta=Math.min(beta,v)}if(beta<=alpha)break}
  return best;
}
function choose(data){
  const s={cells:Uint8Array.from(data.game.cells),heights:Uint8Array.from(data.game.heights)},me=data.game.turn,c=cfg[data.difficulty]||cfg.normal;
  deadline=performance.now()+c.ms;let best=moves(s)[0],rated=[];
  const all=moves(s),foe=other(me);
  for(const r of all){const i=put(s,r,me),yes=win(s,me);pop(s,r,i);if(yes)return r}
  const threats=all.filter(r=>{const i=put(s,r,foe),yes=win(s,foe);pop(s,r,i);return yes});
  if(threats.length&&data.difficulty!=='easy')return threats[0];
  for(let depth=1;depth<=c.depth;depth++){try{rated=[];nodes=0;for(const r of all){const i=put(s,r,me);const v=search(s,depth-1,-Infinity,Infinity,false,me);pop(s,r,i);rated.push([r,v])}rated.sort((a,b)=>b[1]-a[1]);best=rated[0][0]}catch{return best}}
  if(c.noise&&Math.random()<.35&&rated.length>1){const pool=rated.filter(x=>x[1]>=rated[0][1]-c.noise).slice(0,4);best=pool[Math.floor(Math.random()*pool.length)][0]}
  return best;
}
self.onmessage=e=>self.postMessage({rod:choose(e.data),id:e.data.id});
