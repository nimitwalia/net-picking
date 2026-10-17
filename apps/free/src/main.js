import { buildSchedule, validMatchCounts, checkScore, standings as coreStandings, tieAtCutoff, finalFour as coreFinalFour, pickTeams, resolveFinalTeams } from '@net-picking/core';
/* ============ SCHEDULER: now in @net-picking/core ============ */

/* ============ SCORING RULES ============ */
const MODES={side:'Service points',rally:'Rally scoring'};
// Tie at match point. A missing value (a tournament saved before this setting existed) reads as 'win2'.
const tieOf=r=>r&&r.tie==='golden'?'golden':'win2';
// Remembered default for NEW tournaments, kept on this device under its own key (never the tournament key).
const PREFS_KEY='pickleball_prefs_v1';
const TIE_LABEL={golden:'Golden point',win2:'Win by 2 (deuce)'};
function readTiePref(){try{const p=JSON.parse(localStorage.getItem(PREFS_KEY));return p&&(p.tie==='win2'||p.tie==='golden')?p.tie:null;}catch(e){return null;}}
function writeTiePref(v){try{localStorage.setItem(PREFS_KEY,JSON.stringify({tie:v}));return true;}catch(e){return false;}}
const defaultTie=()=>readTiePref()||'golden';
let defaultSaved=false; // feedback shown after pressing "Make this my default"
const ruleText=r=>`${MODES[r.mode]} · to ${r.to} · ${tieOf(r)==='golden'?'golden point':'win by 2'}`;

/* ============ STATE ============ */
const KEY='pickleball_tournament_v1';
function fresh(){return {tab:'setup',playersText:'',m:null,players:[],matches:[],stats:null,finals:null,lbAt:0,cfg:{mode:'side',to:11,tie:defaultTie()},rules:null,fcfg:null,tieSwap:false};}
let S=fresh();
let D={}; // unsaved score drafts, keyed by 'm<i>' or 'f'
try{const raw=localStorage.getItem(KEY);if(raw){const saved=JSON.parse(raw);S=Object.assign(fresh(),saved);
  // fresh() carries the new-tournament default tie rule; a saved state with no cfg must not inherit it (missing reads as win2).
  if(!saved.cfg)S.cfg={mode:'side',to:11};}}catch(e){}
(function migrate(){
  if(!S.cfg)S.cfg={mode:'side',to:11};
  if(!S.rules)S.rules=Object.assign({},S.cfg);
  if(S.finals){
    if(S.finals.s1===undefined){S.finals.s1=Number.isFinite(S.finals.sA)?S.finals.sA:null;S.finals.s2=Number.isFinite(S.finals.sB)?S.finals.sB:null;}
    if(!S.finals.rules)S.finals.rules=Object.assign({},S.rules);
  }
})();
function save(){try{localStorage.setItem(KEY,JSON.stringify(S));}catch(e){}}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
const TONES=['var(--peach)','var(--sage)','var(--butter)','var(--sky)','var(--blush)','var(--cream)'];
const tone=i=>TONES[i%TONES.length];

function parsePlayers(text){
  const raw=text.split(/\r?\n/).map(s=>s.trim().replace(/\s+/g,' ')).filter(Boolean);
  const seen=new Set(),dupes=[],names=[];
  for(const n of raw){const k=n.toLowerCase();if(seen.has(k)){dupes.push(n);}else{seen.add(k);names.push(n);}}
  return {names,dupes};
}
const hasResults=()=>S.matches.some(m=>m.winner);
const allDone=()=>S.matches.length>0&&S.matches.every(m=>m.winner);
const doneCount=()=>S.matches.filter(m=>m.winner).length;
const rec=id=>id==='f'?S.finals:S.matches[+id.slice(1)];

/* ============ STANDINGS ============ */
function standings(upTo){return coreStandings(S.players,S.matches,upTo);}

/* ============ RENDER ============ */
function render(){
  const tabs=[['setup','Setup'],['matches','Matches'],['board','Board'],['finals','Finals']];
  const hasSched=S.matches.length>0;
  document.getElementById('nav').innerHTML=tabs.map(([k,l])=>{
    const dis=(k!=='setup'&&!hasSched);
    return `<button data-act="tab" data-tab="${k}" class="${S.tab===k?'active':''}" ${dis?'disabled':''}>${l}</button>`;
  }).join('');
  const v=document.getElementById('view');
  if(S.tab==='setup'||!hasSched)v.innerHTML=viewSetup();
  else if(S.tab==='matches')v.innerHTML=viewMatches();
  else if(S.tab==='board')v.innerHTML=viewBoard();
  else v.innerHTML=viewFinals();
  if(S.tab==='finals'&&S.finals&&S.finals.winner)prepareShare();
}

function rulesInner(c,withDefault){
  return `<div class="seg" role="group" aria-label="Scoring type">
    <button class="${c.mode==='side'?'on':''}" data-act="rule" data-k="mode" data-v="side">Service points</button>
    <button class="${c.mode==='rally'?'on':''}" data-act="rule" data-k="mode" data-v="rally">Rally scoring</button></div>
    <p class="hint">${c.mode==='side'?'Only the serving side scores a point. A side-out passes the serve with no point.':'A point is scored on every rally, whoever served.'} ${tieOf(c)==='golden'?`The first side to reach ${c.to} wins the game.`:'Win by 2.'}</p>
    <label style="margin-top:14px">Play to</label>
    <div class="pts-row">${[7,11,15,21].map(n=>`<button class="${c.to===n?'on':''}" data-act="rule" data-k="to" data-v="${n}">${n}</button>`).join('')}</div>`
    +`<label data-tie-ui="label" style="margin-top:14px">Tie at match point</label>`
    +`<div class="seg" data-tie-ui="seg" role="group" aria-label="Tie at match point">`
    +`<button data-tie-ui="golden" class="${tieOf(c)==='golden'?'on':''}" data-act="rule" data-k="tie" data-v="golden">Golden point</button>`
    +`<button data-tie-ui="win2" class="${tieOf(c)==='win2'?'on':''}" data-act="rule" data-k="tie" data-v="win2">Win by 2 (deuce)</button></div>`
    +`<p class="hint" data-tie-ui="hint">Golden point is a house rule. Official USA Pickleball scoring is win by 2 (Rule 15.C).</p>`
    +(withDefault?`<div data-tie-ui="default-row" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:8px">`
      +`<button data-tie-ui="default" data-act="makeDefault">${defaultSaved?'Default saved':'Make this my default'}</button>`
      +`<span class="hint" data-tie-ui="default-note" style="margin:0">${defaultSaved?'Saved as default for new tournaments. ':''}Default for new tournaments: ${defaultTie()==='golden'?'Golden point':'not golden point'}</span></div>`:'');
}

function setupInfoHtml(){
  const {names,dupes}=parsePlayers(S.playersText);
  const N=names.length;
  let h=`<div class="hint">${N} player${N===1?'':'s'} · min 4, max 32</div>`;
  if(N)h+=`<div class="chips">${names.slice(0,32).map((n,i)=>`<span class="chip" style="background:${tone(i)}"><b>${esc(n.charAt(0).toUpperCase())}</b><span>${esc(n)}</span></span>`).join('')}</div>`;
  if(dupes.length)h+=`<div class="note err">Duplicate name${dupes.length>1?'s':''} ignored: ${esc(dupes.join(', '))}. Use distinct names, e.g. "Rahul S" and "Rahul K".</div>`;
  if(N>32)h+=`<div class="note err">Too many players. The maximum is 32.</div>`;
  return h;
}
function setupRestHtml(){
  const {names}=parsePlayers(S.playersText);
  const N=names.length;
  const opts=N>=4?validMatchCounts(N):[];
  let mSel=S.m;
  if(!opts.includes(mSel))mSel=opts.length?opts[Math.min(1,opts.length-1)]:null;
  let h='';
  if(N>=4&&N<=32){
    h+=`<div class="card"><label for="mSel">Matches per player</label>
      <select id="mSel" data-act="mChange">${opts.map(o=>`<option value="${o}" ${o===mSel?'selected':''}>${o} match${o>1?'es':''} each · ${N*o/4} total</option>`).join('')}</select>
      <div class="stats" id="stats">${statsHtml(N,mSel)}</div>
      <div class="hint">Only counts that give every player the same number of doubles matches are listed. The cap is players − 1, so nobody partners the same person twice.</div>`;
    if(N<8)h+=`<div class="note warn">Under 8 players, someone has to play back-to-back: a match uses 4 players and not enough are left to rest. The app keeps it to the minimum.</div>`;
    h+=`</div>`;
    if(hasResults())h+=`<div class="note warn" style="margin-bottom:12px">Regenerating erases the ${doneCount()} result(s) already entered.</div>`;
    if(S.matches.length)h+=`<div class="hint" style="margin:0 0 12px">The current schedule uses ${esc(ruleText(S.rules))}. Regenerating applies the scoring chosen above. Before any score is saved, changing it above updates the current schedule straight away.</div>`;
    h+=`<div class="row"><button class="btn" data-act="generate" ${mSel?'':'disabled'}>${S.matches.length?'Regenerate schedule':'Generate schedule'}</button>
      ${S.matches.length?'<button class="btn ghost" data-act="tab" data-tab="matches">Back to matches</button>':''}</div>`;
  } else if(N>0&&N<4){
    h+=`<div class="note err">You need at least 4 players for doubles.</div>`;
  }
  return h;
}
function statsHtml(N,m){
  if(!m)return '';
  return `<div class="stat" style="background:var(--peach)"><small>Players</small><b>${N}</b></div>
    <div class="stat" style="background:var(--sage)"><small>Each plays</small><b>${m}</b></div>
    <div class="stat" style="background:var(--butter)"><small>Matches</small><b>${N*m/4}</b></div>`;
}
function viewSetup(){
  return `<p class="eyebrow">Step 1</p><h2 class="t">Who's playing?</h2><p class="lede">One name per line. Doubles, partners rotate every match.</p>
    <div class="card">
    <label for="players">Players</label>
    <textarea id="players" data-act="playersInput" placeholder="Nimit&#10;Divya">${esc(S.playersText)}</textarea>
    <div id="setupInfo">${setupInfoHtml()}</div></div>
    <div class="card"><label>Scoring for the matches</label><div class="rules" data-ns="cfg">${rulesInner(S.cfg,true)}</div></div>
    <div id="setupRest">${setupRestHtml()}</div>`;
}

const nmHtml=arr=>arr.map(n=>`<div class="n">${esc(n)}</div>`).join('<div class="amp">&amp;</div>');
// One score entry block, used by every group match and by the final.
function scoreBlock(id,A,B,r,lab,rules){
  const w=r.winner,d=D[id]||{};
  const v1=d.a!==undefined?d.a:(Number.isFinite(r.s1)?r.s1:'');
  const v2=d.b!==undefined?d.b:(Number.isFinite(r.s2)?r.s2:'');
  const tile=(n,arr)=>{
    const c=w===n?'win':(w?'lose':'');
    const sm=w===n?lab.win:(w?lab.lose:'');
    return `<div class="team ${c}">${nmHtml(arr)}${sm?`<small>${sm}</small>`:''}</div>`;
  };
  const inp=(k,v,who)=>`<input type="number" min="0" step="1" inputmode="numeric" pattern="[0-9]*" id="${id}${k}" data-act="score" data-id="${id}" data-k="${k}" value="${v}" placeholder="0" aria-label="Score for ${esc(who.join(' and '))}">`;
  return `<div class="teams">${tile(1,A)}<div class="vs">VS</div>${tile(2,B)}</div>
    <div class="scorebox">${inp('a',v1,A)}<div class="dash">–</div>${inp('b',v2,B)}</div>
    <div class="rhint">${esc(MODES[rules.mode])} · game to ${rules.to} · ${tieOf(rules)==='golden'?'golden point':'win by 2'}</div>
    <div class="note err" id="${id}err" hidden></div>
    <div class="actions"><button class="btn ${w?'':'peach'}" data-act="saveScore" data-id="${id}">${w?'Update score':'Save score'}</button>${w?`<button class="btn ghost" data-act="clearScore" data-id="${id}">Clear</button>`:''}</div>`;
}
function matchCard(m,i,nextIdx){
  const done=!!m.winner;
  return `<div class="mcard ${i===nextIdx?'next':''}">
    <div class="mh"><span class="mno">MATCH ${String(i+1).padStart(2,'0')}</span><span class="pill ${done?'done':(i===nextIdx?'next':'')}">${done?'Saved':(i===nextIdx?'Up next':'Pending')}</span></div>
    ${scoreBlock('m'+i,m.t1.map(p=>S.players[p]),m.t2.map(p=>S.players[p]),m,{win:'Won · +3 each',lose:'Lost · −1 each'},S.rules)}
  </div>`;
}

function viewMatches(){
  const total=S.matches.length,d=doneCount();
  const nextIdx=S.matches.findIndex(m=>!m.winner);
  let h=`<p class="eyebrow">Round robin</p><h2 class="t">Matches</h2>
    <div style="margin:10px 0 14px"><span class="rchip">${esc(ruleText(S.rules))}</span></div>
    ${(S.cfg.mode!==S.rules.mode||S.cfg.to!==S.rules.to||tieOf(S.cfg)!==tieOf(S.rules))?`<div class="note warn" style="margin:0 0 14px">Setup is set to ${esc(ruleText(S.cfg))}, but scores already saved here use ${esc(ruleText(S.rules))}. Regenerate the schedule on the Setup tab to switch.</div>`:''}
    <div class="prog"><div class="bar"><div style="width:${total?d/total*100:0}%"></div></div><span>${d}/${total}</span></div>`;
  if(S.stats){
    const st=S.stats;
    if(st.cost===0)h+=`<div class="note ok" style="margin:0 0 14px">Clean schedule: no repeated partners or opponents, nobody plays back-to-back.</div>`;
    else{
      const parts=[];
      if(st.partnerRepeats)parts.push(`${st.partnerRepeats} repeated partnership${st.partnerRepeats>1?'s':''}`);
      if(st.oppRepeats)parts.push(`${st.oppRepeats} repeated opponent pairing${st.oppRepeats>1?'s':''}`);
      if(st.backToBack)parts.push(`${st.backToBack} back-to-back appearance${st.backToBack>1?'s':''}`);
      h+=`<div class="note warn" style="margin:0 0 14px">Best possible for this setup still has ${parts.join(', ')}. Try a different matches-per-player or add players.</div>`;
    }
  }
  h+=S.matches.map((m,i)=>matchCard(m,i,nextIdx)).join('');
  if(allDone())h+=`<button class="btn block peach" data-act="tab" data-tab="finals">All matches done · Go to finals</button>`;
  return h;
}

function viewBoard(){
  const total=S.matches.length;
  let lastDone=0;S.matches.forEach((m,i)=>{if(m.winner)lastDone=i+1;});
  const at=S.lbAt&&S.lbAt<=total?S.lbAt:lastDone;
  const rows=standings(at);
  const prevRanks={};
  if(at>=2)standings(at-1).forEach((r,i)=>prevRanks[r.name]=i);
  let opts=`<option value="0" ${!S.lbAt?'selected':''}>Latest · after match ${lastDone}</option>`;
  for(let k=1;k<=total;k++)opts+=`<option value="${k}" ${S.lbAt===k?'selected':''}>After match ${k}</option>`;
  let h=`<p class="eyebrow">+3 win · −1 loss</p><h2 class="t">Leaderboard</h2>
    <div class="card" style="margin-top:12px"><label for="lbAt">View standings</label><select id="lbAt" data-act="lbAt">${opts}</select>
    <div class="hint">Ties break on wins, then point difference, then points scored (from the scores you saved), then name. The top 4 go to the final.</div></div>`;
  if(at>0){
    h+=`<div class="podium">${[0,1,2].map(i=>rows[i]?`<div class="pod p${i+1}"><div class="r">#${i+1}</div><div class="nm">${esc(rows[i].name)}</div><div class="pp">${rows[i].pts}</div></div>`:'').join('')}</div>`;
  }
  h+=`<div class="tablewrap"><table><thead><tr><th></th><th class="name">Player</th><th>P</th><th>W</th><th>L</th><th>+/−</th><th>Pts</th></tr></thead><tbody>`;
  rows.forEach((r,i)=>{
    let mv='';
    if(at>=2&&prevRanks[r.name]!==undefined){const dlt=prevRanks[r.name]-i;if(dlt>0)mv=` <span class="up">▲${dlt}</span>`;else if(dlt<0)mv=` <span class="down">▼${-dlt}</span>`;}
    h+=`<tr class="${i<4?'top4':''} ${i===3?'cut':''}"><td><span class="rk">${i+1}</span></td><td class="name">${esc(r.name)}${mv}</td><td>${r.p}</td><td>${r.w}</td><td>${r.l}</td><td>${r.diff}</td><td class="pts">${r.pts}</td></tr>`;
  });
  h+=`</tbody></table></div>`;
  if(at===lastDone&&tieAtCutoff(rows))h+=`<div class="note warn">4th and 5th are level on every tiebreaker. The Finals tab lets you swap which of them plays.</div>`;
  return h;
}

const CUP='<svg class="cup" viewBox="0 0 54 54" aria-hidden="true"><path d="M15 8h24v12a12 12 0 0 1-24 0V8z" fill="#1a1814"/><path d="M15 12H8c0 8 3 12 8 13M39 12h7c0 8-3 12-8 13" fill="none" stroke="#1a1814" stroke-width="3" stroke-linecap="round"/><rect x="24" y="31" width="6" height="8" fill="#1a1814"/><rect x="17" y="39" width="20" height="6" rx="2" fill="#1a1814"/></svg>';
const canShare=()=>!!(navigator.share&&navigator.canShare);

function finalTeams(){return resolveFinalTeams(S.finals);}
// Top four on the leaderboard (4th and 5th can be swapped by hand when they are level on everything).
function finalFour(rows){return coreFinalFour(rows,S.tieSwap);}

function viewFinals(){
  if(!allDone()){
    return `<p class="eyebrow">Locked</p><h2 class="t">Finals</h2><div class="card" style="margin-top:12px">${S.matches.length-doneCount()} match(es) still to play. Finals unlock once every match has a saved score.</div>`;
  }
  const rows=standings(S.matches.length);
  if(!S.finals||!(S.finals.teams||S.finals.seeds)){
    if(!S.fcfg)S.fcfg=Object.assign({},S.rules);
    const four=finalFour(rows),{A,B}=pickTeams(four);
    const rank=r=>rows.indexOf(r)+1;
    const tile=(team,label)=>`<div class="team" style="gap:6px"><span class="eyebrow" style="margin:0">${label}</span>${team.map(r=>`<div class="n">${esc(r.name)}</div><div class="amp">#${rank(r)} · ${r.pts} pts</div>`).join('')}</div>`;
    const sA=A.reduce((t,r)=>t+r.pts,0),sB=B.reduce((t,r)=>t+r.pts,0);
    let h=`<p class="eyebrow">Step 3</p><h2 class="t">The final</h2><p class="lede">The top 4 on the leaderboard, paired so neither side gets two of the strongest.</p>
      <div class="card"><div class="teams">${tile(A,'TEAM A')}<div class="vs">VS</div>${tile(B,'TEAM B')}</div>
      <div class="hint" style="text-align:center">Balanced by leaderboard points: ${sA} vs ${sB}</div>`;
    if(tieAtCutoff(rows)){
      const inn=S.tieSwap?rows[4]:rows[3],out=S.tieSwap?rows[3]:rows[4];
      h+=`<div class="note warn">${esc(rows[3].name)} and ${esc(rows[4].name)} are level for 4th on points, wins, point difference and points scored. ${esc(inn.name)} is in for now.</div>
        <div style="margin-top:10px"><button class="btn ghost small" data-act="tieSwap">Swap in ${esc(out.name)} instead</button></div>`;
    }
    h+=`</div><div class="card"><label>Scoring for the final</label><div class="rules" data-ns="fcfg">${rulesInner(S.fcfg)}</div></div>
      <button class="btn" data-act="startFinals">Start finals</button>`;
    return h;
  }
  const f=S.finals,{A,B}=finalTeams(),w=f.winner;
  let h=`<p class="eyebrow">Final</p><h2 class="t">Championship match</h2>
    <div style="margin:10px 0 12px"><span class="rchip">${esc(ruleText(f.rules))}</span></div>
    ${f.strength?`<div class="hint" style="margin:0 0 12px">Teams balanced from the leaderboard: ${f.strength.A} vs ${f.strength.B} points.</div>`:''}
    <div class="mcard"><div class="mh"><span class="mno">FINAL</span><span class="pill ${w?'done':'next'}">${w?'Saved':'To play'}</span></div>
    ${scoreBlock('f',A,B,f,{win:'Champions',lose:'Runners-up'},f.rules)}</div>`;
  if(w){
    const champ=(w===1?A:B).map(esc).join(' &amp; ');
    const hi=Math.max(f.s1,f.s2),lo=Math.min(f.s1,f.s2);
    h+=`<div class="champ">${CUP}<div class="eyebrow" style="color:#5d5646">Champions</div><h3>${champ}</h3><div class="sc">${hi} – ${lo}</div></div>
      <button class="btn block peach" data-act="share" style="margin-bottom:12px">${canShare()?'Share result as image':'Get result image'}</button>`;
  }
  h+=`<button class="btn ghost" data-act="resetFinals">Reset final</button>`;
  return h;
}

/* ============ SAVING SCORES ============ */
function scrollNext(){setTimeout(()=>{const n=document.querySelector('.mcard.next');if(n)n.scrollIntoView({behavior:'smooth',block:'start'});},60);}
function saveScore(id){
  const ia=document.getElementById(id+'a'),ib=document.getElementById(id+'b'),eb=document.getElementById(id+'err');
  if(!ia||!ib)return;
  const a=ia.value===''?NaN:Number(ia.value),b=ib.value===''?NaN:Number(ib.value);
  const rules=id==='f'?S.finals.rules:S.rules;
  const e=checkScore(a,b,rules.to,tieOf(rules));
  if(e){eb.textContent=e;eb.hidden=false;return;}
  const r=rec(id);
  if(r.winner&&r.s1===a&&r.s2===b){delete D[id];render();return;}
  const wasNew=!r.winner;
  const apply=()=>{
    r.s1=a;r.s2=b;r.winner=a>b?1:2;delete D[id];
    if(id!=='f'&&S.finals)S.finals=null;
    save();render();
    if(wasNew&&id!=='f')scrollNext();
  };
  if(id!=='f'&&S.finals)ask('Changing a group-stage score resets the finals, because the finalists may change. Continue?',apply);
  else apply();
}
function clearScore(id){
  const r=rec(id);
  const apply=()=>{r.winner=null;r.s1=null;r.s2=null;delete D[id];if(id!=='f'&&S.finals)S.finals=null;save();render();};
  if(id!=='f'&&S.finals)ask('Clearing this result resets the finals, because the finalists may change. Continue?',apply);
  else apply();
}

/* ============ RESULT IMAGE ============ */
async function makeImage(){
  const W=1080,M=72;
  const rowsData=standings(S.matches.length).slice(0,6);
  const H=906+rowsData.length*72+110;
  const FD='"Bricolage Grotesque","DM Sans",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
  const FB='"DM Sans",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
  const FM='"DM Mono",ui-monospace,Menlo,monospace';
  try{await Promise.race([Promise.all([document.fonts.load('800 60px "Bricolage Grotesque"'),document.fonts.load('700 30px "DM Sans"'),document.fonts.load('500 24px "DM Mono"')]),new Promise(r=>setTimeout(r,1500))]);}catch(e){}
  const c=document.createElement('canvas');c.width=W;c.height=H;
  const x=c.getContext('2d');
  const CREAM='#f4ecd8',INK='#1a1814',MUTED='#9b9486',DIM='#6b6350',SURF='#141413',LINE='#2c2a26';
  const TN=['#f5cfb0','#cfe2c2','#f3e3a6','#c9dde6','#eebdb4','#f4ecd8'];
  const rr=(X,Y,w,h,r)=>{x.beginPath();x.moveTo(X+r,Y);x.arcTo(X+w,Y,X+w,Y+h,r);x.arcTo(X+w,Y+h,X,Y+h,r);x.arcTo(X,Y+h,X,Y,r);x.arcTo(X,Y,X+w,Y,r);x.closePath();};
  const txt=(s,X,Y,maxW,px,wt,fam,col,al)=>{
    x.fillStyle=col;x.textAlign=al||'left';x.textBaseline='alphabetic';
    let p=px;x.font=`${wt} ${p}px ${fam}`;
    while(x.measureText(s).width>maxW&&p>20){p-=2;x.font=`${wt} ${p}px ${fam}`;}
    if(x.measureText(s).width>maxW){while(s.length>1&&x.measureText(s+'…').width>maxW)s=s.slice(0,-1);s+='…';}
    x.fillText(s,X,Y);
  };
  const spaced=(on)=>{if('letterSpacing' in x)x.letterSpacing=on?'4px':'0px';};
  // ground
  x.fillStyle='#0b0b0a';x.fillRect(0,0,W,H);
  // header: ball + wordmark + date
  x.fillStyle='#f3e3a6';x.beginPath();x.arc(M+30,100,30,0,Math.PI*2);x.fill();
  x.fillStyle=INK;
  [[0,-14],[-13,-5],[13,-5],[0,3],[-11,13],[11,13]].forEach(([dx,dy])=>{x.beginPath();x.arc(M+30+dx,100+dy,4.2,0,Math.PI*2);x.fill();});
  x.font=`800 54px ${FD}`;x.textAlign='left';
  x.fillStyle=CREAM;x.fillText('Net',M+80,118);
  const nw=x.measureText('Net').width;
  x.fillStyle='#f5cfb0';x.fillText('-picking',M+80+nw,118);
  const dateS=new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}).toUpperCase();
  x.font=`500 24px ${FM}`;x.fillStyle=MUTED;x.textAlign='right';x.fillText(dateS,W-M,114);
  x.fillStyle=LINE;x.fillRect(M,156,W-2*M,2);
  // champion card
  const f=S.finals,{A,B}=finalTeams(),w=f.winner;
  const champ=w===1?A:B,other=w===1?B:A;
  x.fillStyle=CREAM;rr(M,196,W-2*M,430,48);x.fill();
  const cx=W/2;
  x.fillStyle=INK;x.beginPath();x.moveTo(cx-34,232);x.lineTo(cx+34,232);x.lineTo(cx+34,258);x.arc(cx,258,34,0,Math.PI);x.closePath();x.fill();
  x.lineWidth=7;x.strokeStyle=INK;x.lineCap='round';
  x.beginPath();x.arc(cx-34,248,16,Math.PI*0.5,Math.PI*1.5);x.stroke();
  x.beginPath();x.arc(cx+34,248,16,-Math.PI*0.5,Math.PI*0.5);x.stroke();
  x.fillRect(cx-6,290,12,24);rr(cx-30,314,60,14,5);x.fill();
  spaced(true);x.font=`500 24px ${FM}`;x.fillStyle=DIM;x.textAlign='center';x.fillText('CHAMPIONS',cx,378);spaced(false);
  txt(champ[0],cx,462,840,84,800,FD,INK,'center');
  txt('&',cx,512,200,38,500,FB,DIM,'center');
  txt(champ[1],cx,596,840,84,800,FD,INK,'center');
  // final score strip
  x.fillStyle=SURF;rr(M,660,W-2*M,104,30);x.fill();
  x.strokeStyle=LINE;x.lineWidth=2;rr(M,660,W-2*M,104,30);x.stroke();
  spaced(true);x.font=`500 22px ${FM}`;x.fillStyle=MUTED;x.textAlign='left';x.fillText('FINAL',M+38,706);spaced(false);
  txt(`${MODES[f.rules.mode]} · to ${f.rules.to}`,M+38,742,430,24,400,FB,MUTED,'left');
  const hi=Math.max(f.s1,f.s2),lo=Math.min(f.s1,f.s2);
  txt(`${hi} – ${lo}`,W-M-38,740,360,70,800,FD,CREAM,'right');
  txt(`def. ${other[0]} & ${other[1]}`,cx,812,W-2*M,28,500,FB,MUTED,'center');
  // standings
  spaced(true);x.font=`500 22px ${FM}`;x.fillStyle=MUTED;x.textAlign='left';x.fillText('ROUND ROBIN STANDINGS',M,884);spaced(false);
  const rows=rowsData;
  rows.forEach((r,i)=>{
    const y=906+i*72;
    x.fillStyle=SURF;rr(M,y,W-2*M,64,20);x.fill();
    x.fillStyle=TN[i%TN.length];x.beginPath();x.arc(M+40,y+32,20,0,Math.PI*2);x.fill();
    x.font=`500 22px ${FM}`;x.fillStyle=INK;x.textAlign='center';x.textBaseline='middle';x.fillText(String(i+1),M+40,y+33);x.textBaseline='alphabetic';
    txt(r.name,M+82,y+42,520,28,700,FB,CREAM,'left');
    x.font=`500 22px ${FM}`;x.fillStyle=MUTED;x.textAlign='right';x.fillText(`${r.w}W ${r.l}L`,W-M-130,y+40);
    x.font=`800 32px ${FD}`;x.fillStyle=CREAM;x.textAlign='right';x.fillText(String(r.pts),W-M-28,y+43);
  });
  x.font=`500 22px ${FM}`;x.fillStyle=DIM;x.textAlign='center';
  x.fillText(`${S.players.length} PLAYERS · ${S.matches.length} MATCHES · NET-PICKING`,cx,H-34);
  return new Promise(res=>c.toBlob(b=>res(b),'image/png'));
}

let shareCache={key:'',blob:null,promise:null};
function shareKey(){const f=S.finals;return JSON.stringify([f.seeds,f.winner,f.s1,f.s2,f.rules,S.players,S.matches.map(m=>[m.winner,m.s1,m.s2])]);}
// Render the image ahead of the tap so navigator.share runs inside the user gesture (iOS needs this).
function prepareShare(){
  if(!S.finals||!S.finals.winner)return null;
  const k=shareKey();
  if(shareCache.key===k)return shareCache.promise;
  shareCache={key:k,blob:null,promise:null};
  shareCache.promise=makeImage().then(b=>{if(shareCache.key===k)shareCache.blob=b;return b;}).catch(()=>null);
  return shareCache.promise;
}
function showPreview(blob){
  if(!blob){ask('Could not create the image on this device.',()=>{});return;}
  // data: URL instead of blob: URL, because some in-app viewers block blob: images
  const rd=new FileReader();
  rd.onload=()=>{
    document.getElementById('shareImg').src=rd.result;
    document.getElementById('dl').href=rd.result;
    document.getElementById('shareHint').textContent=canShare()
      ?'The share menu did not open. Press and hold the image to save or share it.'
      :'Direct sharing is not available in this window. Open your Net-picking link in Chrome or Safari to get the share menu. For now, press and hold the image to save it.';
    document.getElementById('imgModal').hidden=false;
  };
  rd.readAsDataURL(blob);
}
async function tryShare(blob){
  if(!blob||!canShare())return false;
  const f=S.finals,{A,B}=finalTeams(),champ=(f.winner===1?A:B).join(' & ');
  const file=new File([blob],'net-picking-result.png',{type:'image/png'});
  try{
    if(!navigator.canShare({files:[file]}))return false;
    await navigator.share({files:[file],title:'Net-picking final',text:`${champ} won the Net-picking final, ${Math.max(f.s1,f.s2)}–${Math.min(f.s1,f.s2)}.`});
    return true;
  }catch(err){return !!(err&&err.name==='AbortError');}
}
async function doShare(){
  const k=shareKey();
  let blob=shareCache.key===k?shareCache.blob:null;
  // Image already rendered: call share synchronously inside the tap so the phone opens its share menu.
  if(blob&&await tryShare(blob))return;
  if(!blob){blob=await prepareShare();if(await tryShare(blob))return;}
  showPreview(blob);
}

/* ============ EVENTS ============ */
let pending=null;
function ask(msg,fn){document.getElementById('mtext').textContent=msg;document.getElementById('modal').hidden=false;pending=fn;}
document.addEventListener('click',e=>{
  const el=e.target.closest('[data-act]');if(!el)return;
  const act=el.dataset.act;
  if(act==='mNo'){document.getElementById('modal').hidden=true;pending=null;return;}
  if(act==='mYes'){document.getElementById('modal').hidden=true;const f=pending;pending=null;if(f)f();return;}
  if(act==='imgClose'){document.getElementById('imgModal').hidden=true;return;}
  if(act==='makeDefault'){
    const box=el.closest('.rules');defaultSaved=writeTiePref(tieOf(S.cfg));box.innerHTML=rulesInner(S.cfg,true);return;
  }
  if(act==='rule'){
    defaultSaved=false;
    const box=el.closest('.rules');const ns=box.dataset.ns;
    S[ns][el.dataset.k]=el.dataset.k==='to'?Number(el.dataset.v):el.dataset.v;
    if(ns==='cfg'&&S.matches.length&&!hasResults())S.rules=Object.assign({},S.cfg);
    save();box.innerHTML=rulesInner(S[ns],ns==='cfg');if(ns==='cfg'){const sr=document.getElementById('setupRest');if(sr)sr.innerHTML=setupRestHtml();}return;
  }
  if(act==='saveScore'){saveScore(el.dataset.id);return;}
  if(act==='clearScore'){clearScore(el.dataset.id);return;}
  if(act==='share'){doShare();return;}
  if(act==='tab'){if(el.disabled)return;S.tab=el.dataset.tab;save();render();window.scrollTo(0,0);}
  else if(act==='generate'){
    const {names}=parsePlayers(S.playersText);
    const N=names.length;
    const opts=validMatchCounts(N);
    const m=parseInt(document.getElementById('mSel').value,10);
    if(!opts.includes(m))return;
    const go=()=>{
      el.disabled=true;el.textContent='Generating…';
      setTimeout(()=>{
        const r=buildSchedule(N,m,1500,{random:Math.random,now:Date.now});
        if(!r){render();ask('Could not generate a valid schedule. Try a different number of matches.',()=>{});return;}
        S.players=names;S.m=m;S.matches=r.matches.map(x=>({t1:x.t1,t2:x.t2,winner:null,s1:null,s2:null}));
        S.rules=Object.assign({},S.cfg);S.fcfg=null;S.tieSwap=false;D={};
        S.stats=r.stats;S.finals=null;S.lbAt=0;S.tab='matches';save();render();window.scrollTo(0,0);
      },30);
    };
    if(hasResults())ask('This erases all results entered so far. Continue?',go);else go();
  }
  else if(act==='tieSwap'){S.tieSwap=!S.tieSwap;save();render();}
  else if(act==='startFinals'){
    const rows=standings(S.matches.length),four=finalFour(rows),{A,B}=pickTeams(four);
    const sum=t=>t.reduce((n,r)=>n+r.pts,0);
    S.finals={teams:{A:A.map(r=>r.name),B:B.map(r=>r.name)},strength:{A:sum(A),B:sum(B)},winner:null,s1:null,s2:null,rules:Object.assign({},S.fcfg||S.rules)};D={};save();render();
  }
  else if(act==='resetFinals'){
    ask('Reset the final? The teams are worked out again from the leaderboard.',()=>{S.finals=null;delete D.f;save();render();});
  }
  else if(act==='newTournament'){
    ask('Start a brand-new tournament? All players, matches and results will be erased.',()=>{const keep=S.cfg;defaultSaved=false;S=fresh();S.cfg=Object.assign({},keep,{tie:defaultTie()});S.rules=Object.assign({},S.cfg);D={};save();render();});
  }
});
document.addEventListener('input',e=>{
  const el=e.target;const act=el.dataset.act;
  if(act==='playersInput'){
    S.playersText=el.value;save();
    document.getElementById('setupInfo').innerHTML=setupInfoHtml();
    document.getElementById('setupRest').innerHTML=setupRestHtml();
  }
  else if(act==='score'){
    const id=el.dataset.id;D[id]=D[id]||{};D[id][el.dataset.k]=el.value;
    const eb=document.getElementById(id+'err');if(eb)eb.hidden=true;
  }
});
document.addEventListener('keydown',e=>{
  const el=e.target;
  if(e.key==='Enter'&&el.dataset&&el.dataset.act==='score'){e.preventDefault();saveScore(el.dataset.id);}
});
document.addEventListener('change',e=>{
  const el=e.target;const act=el.dataset.act;
  if(act==='mChange'){
    S.m=parseInt(el.value,10);save();
    const {names}=parsePlayers(S.playersText);
    const st=document.getElementById('stats');if(st)st.innerHTML=statsHtml(names.length,S.m);
  }
  else if(act==='lbAt'){S.lbAt=parseInt(el.value,10);save();render();}
});

try{['800 60px "Bricolage Grotesque"','700 30px "DM Sans"','500 24px "DM Mono"'].forEach(f=>document.fonts.load(f).catch(()=>{}));}catch(e){}
render();
if('serviceWorker' in navigator&&location.protocol.indexOf('http')===0){navigator.serviceWorker.register('sw.js',{scope:'./'}).catch(function(){});}
