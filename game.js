/* ========= CONFIG (pastel + onboarding + 5-minute first game) ========= */
const CONFIG = {
  HEAT_DURATION_SEC: 22,        // duration of a single heat
  ROUND_GAP_SEC: 2,             // gap between rounds
  FIRST_GAME_DELAY_SEC: 300,    // 5 minutes for first game
  GAME_PERIOD_SEC: 180,         // new game every 3 min (test value; change later)
  COLORS: ["#7c5cff","#ff7ab6","#34d399","#fbbf24","#60a5fa","#f87171","#22d3ee","#4ade80","#c084fc","#ffb347"],
  SEASON_SALT: "holders-2025-giggle-soft",
  TWITTER_URL: "https://x.com/horse402_sol",
  FORMEME_URL: "https://Pump.fun"
};
document.getElementById("twitter-link").href = CONFIG.TWITTER_URL;
document.getElementById("formeme-link").href = CONFIG.FORMEME_URL;

/* ========= Helpers ========= */
const $ = s => document.querySelector(s);
function short(a){ return (a||"—").length>12 ? a.slice(0,6)+"…"+a.slice(-4) : (a||"—"); }
function fmt(ms){ ms=Math.max(0,ms); const s=Math.ceil(ms/1000); const m=String(Math.floor(s/60)).padStart(2,"0"); const ss=String(s%60).padStart(2,"0"); return `${m}:${ss}`; }
function chunk(arr,size){ const out=[]; for(let i=0;i<arr.length;i+=size) out.push(arr.slice(i,i+size)); return out; }
function mulberry32(a){ return function(){ let t=a+=0x6D2B79F5; t=Math.imul(t^t>>>15,t|1); t^=t+Math.imul(t^t>>>7,t|61); return ((t^t>>>14)>>>0)/4294967296; } }
function seedForHeat(h){ const s=h.id+"|"+h.startAt+"|"+CONFIG.SEASON_SALT; let x=0; for(let i=0;i<s.length;i++) x=(x*31+s.charCodeAt(i))>>>0; return x>>>0; }
function randHex(n){ const c="0123456789abcdef"; let s=""; for(let i=0;i<n;i++) s+=c[Math.floor(Math.random()*16)]; return s; }

/* ========= Mock Wallets (400) ========= */
const WALLETS = Array.from({length:400}, (_,i)=>`0x${(i+1).toString(16).padStart(3,"0")}${randHex(37)}`);

/* ========= Scheduler (concurrent heats) ========= */
let GAME_NO = 1;
let GAME = null;
let NEXT_GAME_AT = Date.now() + CONFIG.FIRST_GAME_DELAY_SEC*1000;

/* onboarding modal */
const intro = document.getElementById("intro");
$("#intro-go").onclick = () => intro.setAttribute("aria-hidden","true");
$("#intro-close").onclick = () => intro.setAttribute("aria-hidden","true");

function createGame(gameNo, startAt){
  const groups = chunk(WALLETS, 10); // 40 groups
  const R1 = Array.from({length:40}, (_,i)=>({
    id:`G${gameNo}-R1-${i+1}`, stage:"R1", index:i, entrants: groups[i],
    startAt, winner:null
  }));
  const r2Start = startAt + (CONFIG.HEAT_DURATION_SEC + CONFIG.ROUND_GAP_SEC)*1000;
  const R2 = Array.from({length:4}, (_,i)=>({
    id:`G${gameNo}-R2-${i+1}`, stage:"R2", index:i, entrants:[], startAt:r2Start, winner:null
  }));
  const finalStart = r2Start + (CONFIG.HEAT_DURATION_SEC + CONFIG.ROUND_GAP_SEC)*1000;
  const FINAL = [{ id:`G${gameNo}-F-1`, stage:"FINAL", index:0, entrants:[], startAt:finalStart, winner:null }];
  return {gameNo, R1, R2, FINAL, startAt, endsAt: finalStart + CONFIG.HEAT_DURATION_SEC*1000};
}
function ensureGame(now){
  if (!GAME && now >= NEXT_GAME_AT){
    GAME_NO++;
    $("#game-no").textContent = GAME_NO; ["g1","g2","g3"].forEach(id=> $("#"+id).textContent = GAME_NO);
    GAME = createGame(GAME_NO, now);          // start instantly
    // first time we also reveal holders list (replace skeleton)
    $("#holders-loading").hidden = true;
    $("#board").hidden = false;
  }
  if (GAME && now >= GAME.endsAt + CONFIG.ROUND_GAP_SEC*1000){
    NEXT_GAME_AT = now + CONFIG.GAME_PERIOD_SEC*1000;
    GAME = null;
  }
}

/* ========= Heat state & scoring ========= */
function heatState(h, now){
  const t0=h.startAt, t1=t0+CONFIG.HEAT_DURATION_SEC*1000;
  if (now<t0) return {status:"scheduled", startsIn:t0-now, progress:0};
  if (now>=t1) return {status:"finished", startsIn:0, progress:1};
  return {status:"running", startsIn:0, progress:(now-t0)/(t1-t0)};
}
function computeRanking(h){
  const rng=mulberry32(seedForHeat(h));
  const times=h.entrants.map(()=>18 + rng()*8);
  const order=times.map((t,i)=>({t,i})).sort((a,b)=>a.t-b.t).map(o=>o.i);
  return {order,times};
}
const Points = new Map();
function addPoints(a,p){ Points.set(a,(Points.get(a)||0)+p); }
function finalizeHeat(h){
  if (h.winner || !h.entrants.length) return;
  if (heatState(h, Date.now()).status!=='finished') return;
  const {order}=computeRanking(h);
  h.winner=h.entrants[order[0]];
  if (h.stage==='R1') addPoints(h.winner,3);
  if (h.stage==='R2') addPoints(h.winner,6);
  if (h.stage==='FINAL') addPoints(h.winner,12);
}
function propagateWinners(){
  if (!GAME) return;
  const wr1 = GAME.R1.map(h=>h.winner).filter(Boolean);
  for(let i=0;i<4;i++){
    if (wr1.length>=(i+1)*10) GAME.R2[i].entrants = wr1.slice(i*10,(i+1)*10);
  }
  const wr2 = GAME.R2.map(h=>h.winner).filter(Boolean);
  if (wr2.length===4) GAME.FINAL[0].entrants = wr2;
}

/* ========= UI: tabs & heats ========= */
const heatsWrap = document.getElementById("heats");
let currentStage="R1";
function setTab(stage){
  document.querySelectorAll(".tab").forEach(b=> b.setAttribute("aria-selected", b.dataset.stage===stage ? "true" : "false"));
  currentStage = stage;
}
document.querySelectorAll(".tab").forEach(b=> b.addEventListener("click", ()=> setTab(b.dataset.stage)));

function renderHeats(){
  const pool = !GAME ? [] : currentStage==="R1" ? GAME.R1 : currentStage==="R2" ? GAME.R2 : GAME.FINAL;
  const now=Date.now();
  heatsWrap.innerHTML="";
  pool.forEach(h=>{
    const st=heatState(h,now);
    const card=document.createElement("div"); card.className="heat";
    card.innerHTML=`<div class="hhead"><b>${h.id}</b><span class="tag">${st.status}</span></div>`;
    const list=document.createElement("div"); list.className="slots";
    const n=h.stage==="FINAL"?4:10;
    const addrs=h.entrants.length?h.entrants:Array.from({length:n},()=> "—");
    addrs.forEach((a,i)=>{
      const row=document.createElement("div"); row.className="slot";
      const dot=`<span style="width:12px;height:12px;border-radius:50%;background:${CONFIG.COLORS[i%CONFIG.COLORS.length]}"></span>`;
      row.innerHTML=`<span style="display:flex;align-items:center;gap:8px">${dot}<code>${short(a)}</code></span><span class="muted">#${i+1}</span>`;
      list.appendChild(row);
    });
    const btn=document.createElement("button"); btn.className="btn watch"; btn.type="button"; btn.dataset.heatId=h.id; btn.textContent="Watch";
    card.appendChild(list); card.appendChild(btn);
    heatsWrap.appendChild(card);
  });
}

/* delegated watch click */
document.addEventListener("click",(e)=>{
  const btn=e.target.closest("button.watch"); if(!btn) return;
  const id=btn.dataset.heatId;
  const heat = GAME ? [...GAME.R1,...GAME.R2,...GAME.FINAL].find(h=>h.id===id) : null;
  if (heat) openViewer(heat);
});

/* ========= Live Now (random running heat) ========= */
const liveBtn = document.getElementById("live-watch");
function pickRandomRunning(){
  if (!GAME) return null;
  const now=Date.now();
  const all=[...GAME.R1,...GAME.R2,...GAME.FINAL];
  const running=all.filter(h=>heatState(h,now).status==="running");
  if (!running.length) return null;
  return running[Math.floor(Math.random()*running.length)];
}
liveBtn.addEventListener("click", ()=>{
  const heat = pickRandomRunning(); if (heat) openViewer(heat);
});

/* ========= Viewer (rect track) ========= */
const modal = document.getElementById("viewer");
const closeBtn = document.getElementById("viewer-close");
const track = document.getElementById("race-track");
const legend = document.getElementById("legend");
const bar = document.getElementById("bar");
const cd  = document.getElementById("countdown");
const title = document.getElementById("viewer-title");
let viewed=null;

function openViewer(h){
  viewed=h; title.textContent=`${h.id}`;
  modal.setAttribute("aria-hidden","false");
  requestAnimationFrame(()=> setupHorses(h));
}
function closeViewer(){ modal.setAttribute("aria-hidden","true"); }
closeBtn.onclick=closeViewer;
modal.querySelector(".modal-backdrop").onclick=closeViewer;
document.addEventListener("keydown", e=>{ if(e.key==="Escape") closeViewer(); });

function makeHorse(headIdx, bodyIdx, sheet){
  const el = document.createElement("div");
  el.className = "horse runRight";
  el.innerHTML = `<div class="rider"><div class="head"></div><div class="body"></div></div>`;
  el.querySelector(".rider .head").style.backgroundImage = `url(images/head${headIdx}.png)`;
  el.querySelector(".rider .body").style.backgroundImage = `url(images/body${bodyIdx}.png)`;
  el.style.backgroundImage = `url(images/${sheet}.png)`;
  track.appendChild(el);
  return {el};
}
function setDir(H, d){ const want="run"+d; if(!H.el.classList.contains(want)) H.el.className="horse "+want; }

function setupHorses(h){
  track.querySelectorAll(".horse").forEach(n=>n.remove());
  legend.innerHTML="";
  const n = h.stage==="FINAL"?4:10;
  const addrs=h.entrants.length?h.entrants:Array.from({length:n},()=> "—");

  const rect = track.getBoundingClientRect();
  const insetTop = rect.height*0.12, insetBottom=rect.height*0.12;
  const insetLeft= rect.width*0.08,  insetRight =rect.width*0.08;
  const inner = { x0: insetLeft, y0: insetTop, x1: rect.width - insetRight, y1: rect.height - insetBottom };
  const laneGap = (inner.y1 - inner.y0 - 40) / Math.max(1,(n-1));
  const startX = inner.x0 + 16, startY0 = inner.y0 + 16;

  const horses=[];
  for(let i=0;i<n;i++){
    const H = makeHorse(i%5, i%5, ["horse1","horse2","horse3","horse4"][i%4]);
    H.path = {inner, laneY: startY0 + i*laneGap};
    setDir(H,"Right");
    H.el.style.left = `${startX}px`;
    H.el.style.top  = `${H.path.laneY}px`;
    horses.push(H);

    const item=document.createElement("div"); item.className="row";
    item.innerHTML = `<span class="muted tiny">Lane ${i+1}</span> <code>${short(addrs[i])}</code>`;
    legend.appendChild(item);
  }
  h._horses = horses;
  h._speeds = null;
}

function animateRect(h, now){
  if (!h || !h._horses || !h._horses.length) return;
  const inner = h._horses[0].path.inner;
  const w = inner.x1 - inner.x0, hgt = inner.y1 - inner.y0;
  const L = 2*(w+hgt);
  if (!h._speeds){
    const rng=mulberry32(seedForHeat(h));
    const base = L / CONFIG.HEAT_DURATION_SEC;
    h._speeds = h._horses.map(()=> base*(1+(rng()-0.5)*0.15));
  }
  const t0=h.startAt, t1=t0+CONFIG.HEAT_DURATION_SEC*1000;
  const elapsed = Math.min(CONFIG.HEAT_DURATION_SEC, Math.max(0,(now - t0)/1000));

  for(let i=0;i<h._horses.length;i++){
    const H=h._horses[i], laneY=H.path.laneY;
    const s = (h._speeds[i]*elapsed) % L;
    const segTop=w, segRight=hgt, segBottom=w, segLeft=hgt;
    let x,y;
    if (s <= segTop){ x=inner.x0 + s; y=laneY; setDir(H,"Right"); }
    else if (s <= segTop+segRight){ x=inner.x1; y=inner.y0 + (s - segTop); setDir(H,"Down"); }
    else if (s <= segTop+segRight+segBottom){ x=inner.x1 - (s - segTop - segRight); y=inner.y1 - (laneY - inner.y0); setDir(H,"Left"); }
    else { x=inner.x0; y=inner.y1 - (s - segTop - segRight - segBottom); setDir(H,"Up"); }
    H.el.style.left = `${x}px`; H.el.style.top = `${y}px`;
  }
}

/* ========= Leaderboard & search ========= */
const board = document.getElementById("board");
document.getElementById("find").addEventListener("click", ()=>{
  const q=($("#search").value||"").trim(); if(!q || !GAME) return;
  const heat=[...GAME.R1,...GAME.R2,...GAME.FINAL].find(h=>h.entrants.includes(q));
  if (heat) openViewer(heat); else alert("Wallet not in the current Game.");
});
function renderBoard(){
  if (!GAME){ return; }
  const all=new Map(); WALLETS.forEach(w=> all.set(w,0)); Points.forEach((v,k)=> all.set(k,v));
  const arr=[...all.entries()].sort((a,b)=> b[1]-a[1]);
  board.innerHTML="";
  arr.slice(0,200).forEach(([a,p],i)=>{
    const row=document.createElement("div"); row.className="row";
    row.innerHTML=`<span>#${String(i+1).padStart(3,"0")} · <code>${short(a)}</code></span><b>${p}</b>`;
    board.appendChild(row);
  });
}

/* ========= Main loop ========= */
const phaseEl = document.getElementById("phase");
const gameCt = document.getElementById("game-ct");
const gameBar = document.getElementById("game-bar");
const liveCaption = document.getElementById("live-caption");
function loop(){
  const now = Date.now();

  // schedule
  ensureGame(now);

  // game timer/progress
  if (!GAME){
    phaseEl.textContent="WAIT";
    const total = NEXT_GAME_AT - (NEXT_GAME_AT - CONFIG.FIRST_GAME_DELAY_SEC*1000); // first span doesn't matter for progress; compute by remaining
    const remaining = NEXT_GAME_AT - now;
    gameCt.textContent = fmt(remaining);
    const p = 1 - Math.max(0,remaining) / Math.max(1,CONFIG.FIRST_GAME_DELAY_SEC*1000);
    gameBar.style.width = (Math.max(0,Math.min(1,p))*100).toFixed(1)+"%";
    liveCaption.textContent = "Waiting for next game…";
    document.getElementById("live-watch").disabled = true;
  } else {
    gameCt.textContent = "—";
    const r1End = GAME.startAt + CONFIG.HEAT_DURATION_SEC*1000;
    const r2End = GAME.R2[0].startAt + CONFIG.HEAT_DURATION_SEC*1000;
    const fEnd  = GAME.FINAL[0].startAt + CONFIG.HEAT_DURATION_SEC*1000;
    const phase = now < r1End ? "R1" : now < r2End ? "R2" : now < fEnd ? "FINAL" : "COOLDOWN";
    phaseEl.textContent = phase;

    // Live caption & button
    const running = [...GAME.R1,...GAME.R2,...GAME.FINAL].filter(h=>heatState(h,now).status==="running");
    if (running.length){
      liveCaption.textContent = `${running.length} heats are running in parallel`;
      document.getElementById("live-watch").disabled = false;
    }else{
      liveCaption.textContent = (phase==="COOLDOWN") ? "Wrapping up…" : "Round starts any second…";
      document.getElementById("live-watch").disabled = true;
    }
    // round progress bar
    const activeRoundStart = phase==="R1" ? GAME.startAt : phase==="R2" ? GAME.R2[0].startAt : GAME.FINAL[0].startAt;
    const rp = Math.min(1, Math.max(0, (now - activeRoundStart) / (CONFIG.HEAT_DURATION_SEC*1000)));
    gameBar.style.width = (rp*100).toFixed(1)+"%";
  }

  // finalize & propagate
  if (GAME){
    [...GAME.R1,...GAME.R2,...GAME.FINAL].forEach(finalizeHeat);
    propagateWinners();
  }

  // UI grids
  renderHeats();
  renderBoard();

  // viewer tick
  if (modal.getAttribute("aria-hidden")==="false" && viewed){
    const st = heatState(viewed, now);
    if (st.status==="scheduled"){ cd.textContent=fmt(st.startsIn); bar.style.width="0%"; }
    if (st.status==="running"){   cd.textContent="running";         bar.style.width=(st.progress*100).toFixed(1)+"%"; }
    if (st.status==="finished"){  cd.textContent="finished";        bar.style.width="100%"; }
    animateRect(viewed, now);
  }

  requestAnimationFrame(loop);
}
window.addEventListener("resize", ()=>{ if (modal.getAttribute("aria-hidden")==="false" && viewed) setupHorses(viewed); });

/* boot */
setTab("R1");
renderHeats(); loop();
