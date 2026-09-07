const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const app=$("#app"), audio=$("#audio");
const screens={title:$("#titleScreen"),song:$("#songScreen"),diff:$("#diffScreen"),game:$("#gameScreen")};
const chartPaths={
  EASY:"swing_swing_showtime_easy.json",
  NORMAL:"swing_swing_showtime_normal.json",
  HARD:"swing_swing_showtime_hard.json"
};
const levels={EASY:1,NORMAL:4,HARD:7};
let chart=null,difficulty="EASY",notes=[],playing=false,paused=false,finished=false;
let score=0,combo=0,maxCombo=0,life=20,stats={perfect:0,great:0,good:0,miss:0};
let lastLifeReward=0,raf=0,judgeTimer=0;
const spawnLead=1.8, judgeWindows={perfect:.070,great:.130,good:.200};

function showScreen(name){Object.values(screens).forEach(x=>x.classList.remove("active"));screens[name].classList.add("active")}
function setTheme(d){app.className="theme-"+d.toLowerCase()}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
function fmt(n){return Math.max(0,Math.floor(n)).toString().padStart(7,"0")}
function updateHud(){
  $("#score").textContent=fmt(score);$("#combo").textContent=combo;
  $("#lifeText").textContent=`LIFE ${life}/20`;$("#lifeFill").style.width=`${life*5}%`;
}
function clearNotes(){notes.forEach(n=>n.el?.remove());notes=[]}
function flashJudge(text,color="#fff"){
  const e=$("#judgeText");e.textContent=text;e.style.color=color;e.style.opacity=1;
  clearTimeout(judgeTimer);judgeTimer=setTimeout(()=>e.style.opacity=0,280);
}
function laneLeft(lane){return `${lane*25+2}%`}
function createVisual(n){
  const el=document.createElement("div");el.className=n.chord?"note chord":"note";
  el.style.left=laneLeft(n.lane);el.style.width="21%";$("#field").appendChild(el);n.el=el;
}
function resetState(){
  cancelAnimationFrame(raf);clearNotes();audio.pause();audio.currentTime=0;
  score=0;combo=0;maxCombo=0;life=20;lastLifeReward=0;finished=false;paused=false;playing=false;
  stats={perfect:0,great:0,good:0,miss:0};updateHud();$("#progressInner").style.width="0%";
}
async function loadChart(diff){
  difficulty=diff;setTheme(diff);
  const res=await fetch(chartPaths[diff],{cache:"no-store"});chart=await res.json();
}
async function countdown(){
  $("#countdown").classList.remove("hidden");
  for(const x of ["3","2","1","GO!"]){$("#countdownText").textContent=x;await sleep(x==="GO!"?450:650)}
  $("#countdown").classList.add("hidden");
}
function renderNotesAt(now,allowMiss=false){
  const field=$("#field"), h=field.clientHeight, judgeY=h*.76, spawnY=-36;
  for(const n of notes){
    if(n.hit||n.missed)continue;
    const dt=n.time-now;
    if(dt<=spawnLead && dt>=-judgeWindows.good && !n.el)createVisual(n);
    if(n.el){
      const p=1-dt/spawnLead;
      const y=spawnY+p*((judgeY-13)-spawnY);
      n.el.style.transform=`translateY(${y}px)`;
    }
    if(allowMiss && dt < -judgeWindows.good)missNote(n);
  }
}
async function startCountdownWithNotes(){
  const preRoll=1.65;
  const stepMs=550;
  $("#countdown").classList.remove("hidden");
  let start=performance.now();
  let done=false;
  function previewFrame(nowMs){
    if(done)return;
    const elapsed=Math.min(preRoll,(nowMs-start)/1000);
    const virtualNow=-preRoll+elapsed;
    renderNotesAt(virtualNow,false);
    if(elapsed<preRoll)requestAnimationFrame(previewFrame);
  }
  requestAnimationFrame(previewFrame);
  for(const x of ["3","2","1"]){
    $("#countdownText").textContent=x;
    await sleep(stepMs);
  }
  done=true;
  renderNotesAt(0,false);
  $("#countdown").classList.add("hidden");
}
async function startGame(){
  resetState();showScreen("game");
  notes=chart.notes.map(n=>({...n,hit:false,missed:false,el:null}));
  try{await audio.play();audio.pause();audio.currentTime=0}catch(e){}
  await startCountdownWithNotes();
  playing=true;await audio.play();loop();
}
function missNote(n){
  if(n.hit||n.missed)return;n.missed=true;n.el?.remove();n.el=null;
  stats.miss++;combo=0;life=Math.max(0,life-1);updateHud();flashJudge("MISS","#ff7890");
  if(life<=0)finish(false);
}
function judge(lane){
  if(!playing||paused||finished)return;
  const now=audio.currentTime;
  const cand=notes.filter(n=>!n.hit&&!n.missed&&n.lane===lane&&Math.abs(n.time-now)<=judgeWindows.good)
                  .sort((a,b)=>Math.abs(a.time-now)-Math.abs(b.time-now))[0];
  if(!cand){combo=0;life=Math.max(0,life-1);stats.miss++;updateHud();flashJudge("MISS","#ff7890");if(life<=0)finish(false);return}
  const d=Math.abs(cand.time-now);cand.hit=true;cand.el?.remove();cand.el=null;
  let pts,label,color;
  if(d<=judgeWindows.perfect){stats.perfect++;pts=1000;label="PERFECT";color="#fff"}
  else if(d<=judgeWindows.great){stats.great++;pts=700;label="GREAT";color="#9ee8ff"}
  else{stats.good++;pts=400;label="GOOD";color="#ffe58b"}
  combo++;maxCombo=Math.max(maxCombo,combo);score+=pts+Math.min(combo,200)*2;
  const reward=Math.floor(combo/100);if(reward>lastLifeReward){life=Math.min(20,life+1);lastLifeReward=reward}
  updateHud();flashJudge(label,color);
}
function loop(){
  if(!playing||paused||finished)return;
  const now=audio.currentTime;
  renderNotesAt(now,true);
  $("#progressInner").style.width=`${Math.min(100,(now/(audio.duration||121.4))*100)}%`;
  raf=requestAnimationFrame(loop);
}
function accuracy(){
  const total=stats.perfect+stats.great+stats.good+stats.miss;if(!total)return 0;
  return (stats.perfect+stats.great*.7+stats.good*.4)/total*100;
}
function finish(clear=true){
  if(finished)return;finished=true;playing=false;audio.pause();cancelAnimationFrame(raf);
  notes.forEach(n=>n.el?.remove());
  const acc=accuracy();let rank=clear?(acc>=95?"S":acc>=85?"A":acc>=70?"B":"C"):"F";
  $("#resultStatus").textContent=clear?"CLEAR!":"FAILED";$("#rank").textContent=rank;
  $("#resultDiff").textContent=`${difficulty} Lv.${levels[difficulty]}`;$("#finalScore").textContent=fmt(score);
  $("#rp").textContent=stats.perfect;$("#rg").textContent=stats.great;$("#rgo").textContent=stats.good;$("#rm").textContent=stats.miss;
  $("#maxCombo").textContent=maxCombo;$("#resultLife").textContent=`${life}/20`;$("#resultScreen").classList.remove("hidden");
}
audio.addEventListener("ended",()=>finish(life>0));
async function pauseGame(){if(!playing||finished)return;paused=true;audio.pause();cancelAnimationFrame(raf);$("#pauseMenu").classList.remove("hidden")}
async function resumeGame(){$("#pauseMenu").classList.add("hidden");await countdown();paused=false;await audio.play();loop()}
function goSongSelect(){resetState();$("#pauseMenu").classList.add("hidden");$("#resultScreen").classList.add("hidden");setTheme("EASY");showScreen("song")}

$("#enterBtn").onclick=()=>showScreen("song");
$("#songBack").onclick=()=>showScreen("title");
$("#song01").onclick=()=>showScreen("diff");
$("#diffBack").onclick=()=>showScreen("song");
$$(".diff").forEach(b=>b.onclick=async()=>{await loadChart(b.dataset.diff);await startGame()});
$("#pauseBtn").onclick=pauseGame;$("#resumeBtn").onclick=resumeGame;
$("#restartBtn").onclick=async()=>{$("#pauseMenu").classList.add("hidden");await startGame()};
$("#pauseHomeBtn").onclick=goSongSelect;$("#resultHomeBtn").onclick=goSongSelect;
$("#retryBtn").onclick=async()=>{$("#resultScreen").classList.add("hidden");await startGame()};

$$(".pad").forEach(p=>{
  const lane=+p.dataset.lane;
  p.addEventListener("pointerdown",e=>{e.preventDefault();p.classList.add("active");$$(`.lane[data-lane="${lane}"]`).forEach(x=>x.classList.add("flash"));judge(lane)});
  p.addEventListener("pointerup",()=>{p.classList.remove("active");$$(`.lane[data-lane="${lane}"]`).forEach(x=>x.classList.remove("flash"))});
  p.addEventListener("pointercancel",()=>p.classList.remove("active"));
});
window.addEventListener("dblclick",e=>e.preventDefault(),{passive:false});
let lastTouchEnd=0;document.addEventListener("touchend",e=>{const now=Date.now();if(now-lastTouchEnd<=350)e.preventDefault();lastTouchEnd=now},{passive:false});
["gesturestart","gesturechange","gestureend"].forEach(x=>document.addEventListener(x,e=>e.preventDefault(),{passive:false}));
