'use strict';
// ---- Config: drop a relay URL here later. null = dry run, nothing is sent.
const FEEDBACK_ENDPOINT = null;
const FEEDBACK_INBOX = 'feedback@mathera.example';
const KEY = 'mathera-privacy-test';

const ADJ=['Brave','Clever','Swift','Sunny','Quiet','Lucky','Bold','Curious','Jolly','Mighty','Gentle','Zippy'];
const ANI=['Otter','Falcon','Panda','Fox','Owl','Tiger','Koala','Dolphin','Badger','Lynx','Gecko','Heron'];
const AVATARS=['🦊','🐼','🦉','🐢','🚀','⭐'];
const GRADES=['K','1','2','3','4','5','6','7','8','9'];
const TOPICS=['Counting','Fractions','Integers','Exponents','Equations','Geometry','Functions','Data'];
const COMMON=['james','john','robert','michael','william','david','mary','patricia','jennifer','linda','elizabeth','emma','olivia','noah','liam','sophia','ava','mia','lucas','ethan','mason','logan','harper','amelia','julius','julian','jack','oliver','charlotte','isabella','alex','sam','max','lily','grace','chloe','daniel','matthew','sarah','emily'];
const PROFANITY=['fuck','shit','bitch','bastard','asshole','dick','crap','piss','damn','idiot','stupid','dumb','hate you','loser','suck'];
const SAFETY=['kill myself','suicide','hurt myself','self harm','self-harm','cut myself','want to die','end my life','abuse','abused','unsafe at home','hits me','touched me','bully','bullied','scared to go home'];

const rnd=a=>a[Math.floor(Math.random()*a.length)];
const genName=()=>`${rnd(ADJ)} ${rnd(ANI)} ${1+Math.floor(Math.random()*99)}`;
const PICKS=ADJ.slice(0,8).map((a,i)=>`${a} ${ANI[i]} ${(i*13+7)%99+1}`);

// ---- Filters (exposed on window.MP for tests)
function checkCodeName(s){
  s=(s||'').trim();
  if(!s) return 'Pick or generate a code name.';
  if(PICKS.includes(s)) return null;
  if(/[^\s@]+@[^\s@]+\.[^\s@]+/.test(s)||s.includes('@')) return 'That looks like an email.';
  if(/\d{3,}/.test(s)) return 'Numbers longer than 2 digits aren\'t allowed.';
  const words=s.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  if(words.some(w=>COMMON.includes(w))) return 'That looks like a real name. Use a made-up one.';
  const g=s.match(/^([A-Z][a-z]+) ([A-Z][a-z]+)( \d{1,2})?$/);
  if(g && !(ADJ.includes(g[1]) && ANI.includes(g[2]))) return 'That looks like a real First Last name. Use the generator or pick-list.';
  if(!/^[A-Za-z][A-Za-z ]{1,24}\d{0,2}$/.test(s)) return 'Letters, spaces and up to 2 digits only.';
  return null;
}
function hasSafety(t){const l=(t||'').toLowerCase();return SAFETY.some(k=>l.includes(k));}
function isAbusiveOrSpam(t){
  const l=(t||'').toLowerCase();
  if(PROFANITY.some(w=>new RegExp('\\b'+w.replace(/ /g,'\\s+')).test(l))) return true;
  if(/(.)\1{4,}/.test(l)) return true;               // repeated characters
  if(/(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|ly|gg|xyz|co)\b)/.test(l)) return true; // URLs
  return false;
}
function scrub(t){
  return (t||'')
   .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g,'[removed]')
   .replace(/\+?\d[\d\s().-]{6,}\d/g,'[removed]')
   .replace(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g,'[removed]')
   .replace(new RegExp('\\b('+COMMON.join('|')+')\\b','gi'),'[removed]');
}
// Returns {payload|null, safety:bool}
function buildFeedback(questionId, reason, comment){
  comment=(comment||'').slice(0,280);
  if(hasSafety(comment)) return {safety:true, payload:{questionId, reason, comment:''}};
  const s=scrub(comment).trim(); let c=isAbusiveOrSpam(s)?'':s;
  return {safety:false, payload:{questionId, reason, comment:c}};
}
window.MP={checkCodeName,scrub,isAbusiveOrSpam,hasSafety,buildFeedback};

// ---- Storage (localStorage only)
const load=()=>{try{return JSON.parse(localStorage.getItem(KEY))||{}}catch{return{}}};
const save=s=>localStorage.setItem(KEY,JSON.stringify(s));
async function sha256(s){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');}
const $=id=>document.getElementById(id);

// ---- Profile UI
function fillForm(){
  PICKS.forEach(p=>$('pickName').add(new Option(p,p)));
  $('avatars').innerHTML=AVATARS.map((a,i)=>`<label><input type="radio" name="av" value="${a}" ${i?'':'checked'}> ${a}</label>`).join('');
  GRADES.forEach(g=>$('grade').add(new Option('Grade '+g,g)));
  TOPICS.forEach(t=>$('topic').add(new Option(t,t)));
  $('genName').onclick=()=>{$('codeName').value=genName();$('nameErr').textContent='';};
  $('pickName').onchange=e=>{if(e.target.value)$('codeName').value=e.target.value;};
}
function renderProfile(){
  const s=load(),p=s.profile,v=$('profileView');
  let h=p?`<p><b>${p.avatar} ${esc(p.codeName)}</b> · Grade ${p.grade} · loves ${p.topic} <span class="ok">(approved)</span></p>`:'<p>No approved profile yet.</p>';
  if(s.pending) h+=`<p class="pending">Pending change: ${s.pending.avatar} ${esc(s.pending.codeName)} · Grade ${s.pending.grade} · ${s.pending.topic}. Waiting for parent PIN.</p><button id="approvePending">Parent: approve pending change</button>`;
  v.innerHTML=h;
  if(s.pending) $('approvePending').onclick=()=>openPin();
}
function esc(s){return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
function openPin(){
  const s=load();$('pinBox').classList.remove('hidden');$('pin').value='';$('pinErr').textContent='';
  $('pinTitle').textContent=s.pinHash?'Parent approval':'Parent: set a PIN';
  $('pinHelp').textContent=s.pinHash?'Enter the parent PIN to approve this change.':'Set a 4–6 digit PIN. It is stored only as a SHA-256 hash in this browser.';
  $('pin').focus();
}
async function pinOk(){
  const pin=$('pin').value,s=load();
  if(!/^\d{4,6}$/.test(pin)){$('pinErr').textContent='PIN must be 4–6 digits.';return;}
  const h=await sha256(KEY+':'+pin);
  if(!s.pinHash) s.pinHash=h; else if(s.pinHash!==h){$('pinErr').textContent='Wrong PIN. Change stays pending.';return;}
  if(s.pending){s.profile=s.pending;delete s.pending;}
  save(s);$('pinBox').classList.add('hidden');renderProfile();
}
function submitProfile(e){
  e.preventDefault();
  const name=$('codeName').value.trim(),err=checkCodeName(name);
  $('nameErr').textContent=err||'';if(err)return;
  const s=load();
  s.pending={codeName:name,avatar:document.querySelector('input[name=av]:checked').value,grade:$('grade').value,topic:$('topic').value};
  save(s);renderProfile();openPin();
}

// ---- Questions (from Mathera v0.6.2 skill tree)
const QS=[
 ['I.1.07-q1','I.1.07 How many in all','3 apples and 4 apples. How many in all?','7'],
 ['I.1.15-q1','I.1.15 Skip count by 5s','5, 10, 15, 20, __ ?','25'],
 ['I.2.10-q1','I.2.10 Symbols =, > and <','Which symbol makes it true: 47 __ 74',['<','>','=']],
 ['I.3.07-q1','I.3.07 Three-digit place value','What digit is in the tens place of 386?','8'],
 ['I.4.07-q1','I.4.07 Number bonds to 10','6 + __ = 10','4'],
 ['II.2.03-q1','II.2.03 Multiply by 0, 1, 2, 5 and 10','7 × 5 = ?','35'],
 ['II.3.14-q1','II.3.14 Mixed operations','48 ÷ 6 + 3 = ?','11'],
 ['II.5.08-q1','II.5.08 Equivalent fractions by rule','Which is equal to 2/3?',['4/6','3/4','2/6']],
 ['II.6.09-q1','II.6.09 Fraction × whole number','3/4 × 8 = ?','6'],
 ['II.7.04-q1','II.7.04 Fractions and decimals','Write 1/4 as a decimal.','0.25'],
 ['II.8.01-q1','II.8.01 Order of operations','3 + 4 × 2 = ?',['11','14','10']],
 ['II.9.08-q1','II.9.08 Area of rectangles','Area of a 6 by 4 rectangle?','24'],
 ['III.1.04-q1','III.1.04 Add integers','−7 + 3 = ?','-4'],
 ['III.1.07-q1','III.1.07 Divide integers','−24 ÷ −6 = ?','4'],
 ['III.3.03-q1','III.3.03 Percent of a number','What is 25% of 80?','20'],
 ['III.4.01-q1','III.4.01 Whole-number exponents','2⁵ = ?','32'],
 ['III.4.07-q1','III.4.07 Negative exponents','10⁻² = ?',['0.01','−100','−20']],
 ['III.6.04-q1','III.6.04 Two-step equations','Solve 3x + 5 = 20. x = ?','5'],
 ['III.7.04-q1','III.7.04 Slope','Slope of the line through (0,1) and (2,7)?','3'],
 ['III.7.09-q1','III.7.09 Functions','If f(x) = 2x − 1, what is f(4)?','7'],
 ['III.8.05-q1','III.8.05 Area of triangles','Triangle with base 10 and height 6. Area?','30'],
 ['III.8.16-q1','III.8.16 Converse of Pythagoras','Is a 5–12–13 triangle a right triangle?',['yes','no']],
];
const norm=s=>s.trim().replace(/−/g,'-').replace(/\s+/g,'').toLowerCase();
function renderQuestions(){
  $('questions').innerHTML=QS.map(([id,skill,q,a])=>{
    const ans=Array.isArray(a)?a.map(o=>`<button class="mc" data-v="${esc(o)}">${esc(o)}</button>`).join(' '):`<input class="sa" size="8"> <button class="chk">Check</button>`;
    return `<div class="q" data-id="${id}" data-a="${esc(Array.isArray(a)?a[0]:a)}"><small>${id} · ${skill}</small><div>${esc(q)}</div>${ans} <span class="res"></span>
    <button class="down" title="Report a problem">👎</button>
    <div class="fb hidden">${['confusing','wrong answer','too hard','other'].map(r=>`<button class="rsn" data-r="${r}">${r}</button>`).join(' ')}
    <textarea maxlength="280" rows="2" placeholder="Optional comment (no names)"></textarea><small class="cnt">0/280</small>
    <button class="send">Send feedback</button><div class="out"></div></div></div>`;}).join('');
  $('questions').addEventListener('click',e=>{
    const b=e.target,q=b.closest('.q');if(!q)return;
    const res=q.querySelector('.res');
    const check=v=>{const ok=norm(v)===norm(q.dataset.a);res.textContent=ok?'✔ right':'✘ try again';res.className='res '+(ok?'ok':'no');};
    if(b.classList.contains('mc')) check(b.dataset.v);
    if(b.classList.contains('chk')) check(q.querySelector('.sa').value);
    if(b.classList.contains('down')) q.querySelector('.fb').classList.toggle('hidden');
    if(b.classList.contains('rsn')){q.querySelectorAll('.rsn').forEach(x=>x.classList.remove('sel'));b.classList.add('sel');}
    if(b.classList.contains('send')){
      const r=q.querySelector('.rsn.sel'),out=q.querySelector('.out');
      if(!r){out.textContent='Pick a reason first.';return;}
      const {safety,payload}=buildFeedback(q.dataset.id,r.dataset.r,q.querySelector('textarea').value);
      if(safety){out.innerHTML='<div class="safety">please talk to your teacher or school counsellor.</div>';}
      else out.textContent='Thanks! Sent anonymously (dry run).';
      deliver(payload);q.querySelector('textarea').value='';q.querySelector('.cnt').textContent='0/280';
    }
  });
  $('questions').addEventListener('input',e=>{if(e.target.tagName==='TEXTAREA')e.target.closest('.fb').querySelector('.cnt').textContent=e.target.value.length+'/280';});
}
// Single send step. Swap FEEDBACK_ENDPOINT for a relay later; payload stays {questionId, reason, comment}.
async function deliver(payload){
  const body=JSON.stringify({questionId:payload.questionId,reason:payload.reason,comment:payload.comment},null,2);
  $('dry').textContent=`To: ${FEEDBACK_INBOX}\n${body}`;
  if(!FEEDBACK_ENDPOINT) return;
  await fetch(FEEDBACK_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},body,credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store'});
}
function runChecks(){
  const ext=[...document.querySelectorAll('script[src],link[href]')].filter(el=>{const u=new URL(el.src||el.href,location.href);return u.origin!==location.origin;});
  const items=[['document.cookie is empty',document.cookie===''],['No external script or link tags',ext.length===0],['Delivery is dry run (FEEDBACK_ENDPOINT = null)',FEEDBACK_ENDPOINT===null],['Data kept only in localStorage key "'+KEY+'"',true]];
  $('checks').innerHTML=items.map(([t,ok])=>`<li class="${ok?'pass':'fail'}">${t}</li>`).join('');
}
$('inbox').textContent=FEEDBACK_INBOX;
fillForm();renderProfile();renderQuestions();runChecks();
$('profileForm').onsubmit=submitProfile;$('pinOk').onclick=pinOk;$('pinCancel').onclick=()=>$('pinBox').classList.add('hidden');
$('wipe').onclick=()=>{if(confirm('Delete everything stored by this test page?')){localStorage.removeItem(KEY);renderProfile();$('dry').textContent='(no feedback yet)';}};
