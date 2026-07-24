export const SIZE=4, EMPTY=0, BLACK=1, WHITE=2;
export const indexOf=(x,y,z)=>x+y*SIZE+z*SIZE*SIZE;
export const coordOf=i=>({x:i%SIZE,y:Math.floor(i/SIZE)%SIZE,z:Math.floor(i/(SIZE*SIZE))});

export function generateLines(){
  const lines=[];
  const directions=[];
  for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(let dz=-1;dz<=1;dz++){
    if(!dx&&!dy&&!dz)continue;
    const first=dx||dy||dz;
    if(first>0)directions.push([dx,dy,dz]);
  }
  for(let x=0;x<SIZE;x++)for(let y=0;y<SIZE;y++)for(let z=0;z<SIZE;z++)for(const [dx,dy,dz] of directions){
    const ex=x+3*dx,ey=y+3*dy,ez=z+3*dz;
    if(ex<0||ex>=SIZE||ey<0||ey>=SIZE||ez<0||ez>=SIZE)continue;
    lines.push(Array.from({length:4},(_,n)=>indexOf(x+n*dx,y+n*dy,z+n*dz)));
  }
  return lines;
}
export const LINES=generateLines();
if(LINES.length!==76)throw new Error(`Winning line generation failed: ${LINES.length} (expected 76)`);
export const CELL_LINES=Array.from({length:64},(_,i)=>LINES.filter(line=>line.includes(i)));
export function createGame(){return{cells:new Uint8Array(64),heights:new Uint8Array(16),turn:BLACK,history:[],winner:EMPTY,winningLine:null,draw:false}}
export const other=p=>p===BLACK?WHITE:BLACK;
export function legalMoves(game){const a=[];for(let y=0;y<4;y++)for(let x=0;x<4;x++)if(game.heights[x+y*4]<4)a.push(x+y*4);return a}
export function play(game,rod){
  if(game.winner||game.draw||rod<0||rod>15||game.heights[rod]>=4)return null;
  const z=game.heights[rod]++,x=rod%4,y=Math.floor(rod/4),cell=indexOf(x,y,z),player=game.turn;
  game.cells[cell]=player;game.history.push({rod,cell,player});
  game.winningLine=CELL_LINES[cell].find(line=>line.every(i=>game.cells[i]===player))||null;
  if(game.winningLine)game.winner=player;else if(game.history.length===64)game.draw=true;else game.turn=other(player);
  return cell;
}
export function undo(game,count=1){while(count--&&game.history.length){const m=game.history.pop();game.cells[m.cell]=EMPTY;game.heights[m.rod]--;game.turn=m.player}game.winner=EMPTY;game.winningLine=null;game.draw=false}
export function serialize(game){return{cells:Array.from(game.cells),heights:Array.from(game.heights),turn:game.turn,history:game.history.slice()}}
