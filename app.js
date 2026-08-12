(() => {
  'use strict';

  const STORAGE_KEY = 'ts_mastery_lab_v1';
  const DIFF_RANK = {easy:1, medium:2, hard:3, expert:4};
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const todayKey = () => new Date().toISOString().slice(0,10);
  const addDays = (n) => { const d=new Date(); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); };
  const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
  const shuffle = (arr) => { const a=[...arr]; for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; };
  const sample = (arr) => arr[Math.floor(Math.random()*arr.length)];
  const pct = (a,b) => b ? Math.round(a/b*100) : 0;
  const esc = (s='') => String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));

  let manifest = window.BUILTIN_MANIFEST;
  let questions = window.BUILTIN_QUESTIONS;
  let remoteBase = '';
  let state = loadState();
  let quiz = null;
  let exam = null;
  let examTimerHandle = null;

  function defaultState(){
    return {version:1, items:{}, activity:[], exams:[], github:{owner:'',repo:'',branch:'main',enabled:false}, bestStreak:0};
  }
  function loadState(){
    try { return {...defaultState(), ...JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}')}; }
    catch { return defaultState(); }
  }
  function saveState(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  function toast(msg){ const el=$('#toast'); el.textContent=msg; el.classList.add('show'); clearTimeout(toast.t); toast.t=setTimeout(()=>el.classList.remove('show'),2300); }

  function itemFor(key){
    if(!state.items[key]) state.items[key]={attempts:0,correct:0,wrong:0,consecutive:0,interval:0,due:todayKey(),last:null};
    return state.items[key];
  }
  function trackKey(q){ return q.conceptId || q.id; }
  function recordAnswer(q, isCorrect, chosenIndex, context='quiz'){
    const key=trackKey(q), it=itemFor(key);
    it.attempts++; it.last=todayKey();
    if(isCorrect){
      it.correct++; it.consecutive++;
      const schedule=[1,3,7,14,30,60,90,120];
      it.interval=schedule[Math.min(it.consecutive-1,schedule.length-1)];
      it.due=addDays(it.interval);
    } else {
      it.wrong++; it.consecutive=0; it.interval=0; it.due=todayKey();
    }
    state.activity.unshift({ts:new Date().toISOString(), id:key, topic:q.topic, issue:q.issue, question:q.question, correct:isCorrect, chosen:chosenIndex, context});
    state.activity=state.activity.slice(0,250);
    saveState();
  }

  function getTotals(){
    const vals=Object.values(state.items);
    const attempts=vals.reduce((s,x)=>s+x.attempts,0), correct=vals.reduce((s,x)=>s+x.correct,0), wrong=vals.reduce((s,x)=>s+x.wrong,0);
    const due=vals.filter(x=>x.attempts>0 && x.due<=todayKey()).length;
    const mastered=vals.filter(x=>x.attempts>=5 && pct(x.correct,x.attempts)>=85 && x.consecutive>=3).length;
    const seen=vals.filter(x=>x.attempts>0).length;
    return {attempts,correct,wrong,due,mastered,seen,accuracy:pct(correct,attempts)};
  }
  function currentStreak(){
    let n=0; for(const a of state.activity){ if(a.correct) n++; else break; } return n;
  }
  function masteryScore(){
    const t=getTotals(); if(!t.attempts) return 0;
    const coverage=Math.min(1,t.seen/Math.max(25,questions.length*.65));
    return Math.round(t.accuracy*(0.65+0.35*coverage));
  }
  function topicStats(){
    const map={};
    state.activity.forEach(a=>{const k=a.topic||'Άλλο'; if(!map[k])map[k]={a:0,c:0}; map[k].a++; if(a.correct)map[k].c++;});
    return Object.entries(map).map(([topic,v])=>({topic,attempts:v.a,correct:v.c,accuracy:pct(v.c,v.a)})).sort((a,b)=>a.accuracy-b.accuracy || b.attempts-a.attempts);
  }
  function issueStats(){
    return manifest.documents.map(d=>{
      const acts=state.activity.filter(a=>a.issue===d.id); const c=acts.filter(a=>a.correct).length;
      return {id:d.id,title:d.title,attempts:acts.length,accuracy:pct(c,acts.length)};
    });
  }

  // -------- Dynamic parametric question templates --------
  const dynamicTemplates = [
    {
      id:'dyn_adf', issue:'B', topic:'Stationarity', difficulty:'medium',
      make(){
        const p=[0.01,0.02,0.03,0.08,0.12,0.18,0.32,0.41][Math.floor(Math.random()*8)];
        const reject=p<0.05;
        return dyn(this, `ADF test: p = ${p.toFixed(2)}, α = 0,05. Τι συμπεραίνεις για την H₀;`,
          reject ? ['Απορρίπτουμε H₀: υπάρχουν ενδείξεις κατά unit root','Δεν απορρίπτουμε H₀: αποδείχθηκε stationarity','Απορρίπτουμε H₀: υπάρχει ARCH','Δεν μπορούμε να διαβάσουμε p-value'] : ['Δεν απορρίπτουμε H₀: τα δεδομένα δεν δίνουν επαρκείς ενδείξεις κατά unit root','Απορρίπτουμε H₀: η σειρά είναι οριστικά στάσιμη','Αποδεικνύεται cointegration','Πρέπει πάντα να πάρουμε δεύτερη διαφορά'],0,
          reject ? 'Στο ADF η H₀ είναι unit root. p<0,05 οδηγεί σε απόρριψη της H₀, υπό τη σωστή deterministic specification.' : 'Στο ADF η H₀ είναι unit root. p≥0,05 σημαίνει ότι δεν την απορρίπτουμε — δεν ισοδυναμεί με απόδειξη unit root.','Τεύχος Β΄ — ADF');
      }
    },
    {
      id:'dyn_kpss', issue:'B', topic:'Stationarity', difficulty:'medium',
      make(){
        const p=[0.01,0.02,0.04,0.06,0.08,0.10][Math.floor(Math.random()*6)];
        const reject=p<0.05;
        return dyn(this, `KPSS test: p = ${p.toFixed(2)}, α = 0,05. Ποια είναι η σωστή ανάγνωση;`,
          reject ? ['Απορρίπτουμε H₀ stationarity: υπάρχουν ενδείξεις μη στασιμότητας','Δεν απορρίπτουμε H₀ unit root','Αποδεικνύεται λευκός θόρυβος','Υποχρεωτικά VECM'] : ['Δεν απορρίπτουμε H₀ stationarity','Απορρίπτουμε H₀ stationarity','Αποδεικνύεται unit root','Υπάρχουν υποχρεωτικά ARCH effects'],0,
          'Στο KPSS η H₀ είναι stationarity (level ή trend ανά προδιαγραφή), αντίστροφα από το ADF.','Τεύχος Β΄ — KPSS');
      }
    },
    {
      id:'dyn_its_slope', issue:'C', topic:'ITS', difficulty:'hard',
      make(){
        const b1=(Math.round((0.5+Math.random()*3)*10)/10); const b3=-(Math.round((0.2+Math.random()*2.2)*10)/10); const post=Math.round((b1+b3)*10)/10;
        const wrong1=b3, wrong2=Math.round((b1-b3)*10)/10, wrong3=b1;
        return dyn(this, `Σε ITS έχεις β₁=${b1.toFixed(1)} μονάδες/μήνα και β₃=${b3.toFixed(1)}. Ποια είναι η νέα κλίση μετά την παρέμβαση;`,
          [`${post.toFixed(1)} μονάδες/μήνα`,`${wrong1.toFixed(1)} μονάδες/μήνα`,`${wrong2.toFixed(1)} μονάδες/μήνα`,`${wrong3.toFixed(1)} μονάδες/μήνα`],0,
          `Η β₃ είναι αλλαγή κλίσης. Νέα κλίση = β₁+β₃ = ${b1.toFixed(1)} + (${b3.toFixed(1)}) = ${post.toFixed(1)}.`,'Τεύχος Γ΄ — ITS');
      }
    },
    {
      id:'dyn_garch', issue:'C', topic:'GARCH', difficulty:'hard',
      make(){
        const a=Math.round((0.04+Math.random()*0.12)*100)/100; const b=Math.round((0.70+Math.random()*0.25)*100)/100; const s=Math.round((a+b)*100)/100;
        let interp=s<1?'στάσιμη conditional variance με υψηλότερη επιμονή όσο πλησιάζει το 1':s===1?'IGARCH-like οριακή επιμονή':'μη στάσιμη/εκρηκτική variance dynamics στην απλή GARCH λογική';
        return dyn(this, `GARCH(1,1): α=${a.toFixed(2)}, β=${b.toFixed(2)}. Ποια είναι η persistence α+β;`,
          [s.toFixed(2),(a*b).toFixed(2),Math.abs(b-a).toFixed(2),(1-s).toFixed(2)],0,`Persistence = α+β = ${s.toFixed(2)}. Ερμηνεία: ${interp}.`,'Τεύχος Γ΄ — GARCH');
      }
    },
    {
      id:'dyn_mase', issue:'D', topic:'Metrics', difficulty:'medium',
      make(){
        const a=Math.round((0.65+Math.random()*0.25)*100)/100; const b=Math.round((1.05+Math.random()*0.35)*100)/100;
        return dyn(this, `Μοντέλο A: MASE=${a.toFixed(2)}. Μοντέλο B: MASE=${b.toFixed(2)}. Ποιο κερδίζει έναντι naive;`,
          ['Το A, επειδή MASE<1 και είναι καλύτερο από το naive','Το B, επειδή μεγαλύτερο MASE είναι καλύτερο','Κανένα, γιατί MASE δεν συγκρίνεται με naive','Ισοπαλία'],0,`MASE<1 σημαίνει καλύτερο από το scaling naive benchmark. Το A έχει περίπου ${Math.round((1-a)*100)}% μικρότερο scaled absolute error από naive.`,'Τεύχος Δ΄/Ε΄ — Metrics');
      }
    },
    {
      id:'dyn_ljung', issue:'B', topic:'Diagnostics', difficulty:'medium',
      make(){
        const p=sample([0.001,0.01,0.03,0.08,0.22,0.45,0.71]); const good=p>=0.05;
        return dyn(this, `Ljung–Box στα κατάλοιπα: p=${p<0.01?p.toFixed(3):p.toFixed(2)}. Πώς το διαβάζεις;`,
          good?['Δεν απορρίπτουμε H₀: τα κατάλοιπα είναι συμβατά με απουσία κοινής autocorrelation στα ελεγχόμενα lags','Απορρίπτουμε H₀: υπάρχει σίγουρα unit root','Υπάρχει cointegration','Το μοντέλο είναι αυτομάτως το καλύτερο']:[ 'Απορρίπτουμε H₀: υπάρχει εναπομείνασα χρονική δομή στα κατάλοιπα','Δεν απορρίπτουμε H₀: όλα είναι τέλεια','Αποδεικνύεται normality','Χρειάζεται μόνο μεγαλύτερο R²'],0,
          good?'Με p≥0,05 δεν απορρίπτουμε την joint-null μηδενικών autocorrelations. Αυτό είναι αναγκαίο αλλά όχι επαρκές για τελική επιλογή.':'Με p<0,05 τα κατάλοιπα δεν είναι συμβατά με white noise στα ελεγχόμενα lags· χρειάζεται αναθεώρηση.','Τεύχος Β΄/Ε΄ — Residual diagnostics');
      }
    },
    {
      id:'dyn_teff', issue:'A', topic:'Βασικές έννοιες', difficulty:'hard',
      make(){
        const T=sample([48,60,72,84,96,120]); const rho=sample([0.70,0.80,0.90,0.95]); const teff=T*(1-rho)/(1+rho); const r=Math.round(teff*10)/10;
        return dyn(this, `Πρόχειρη προσέγγιση ενεργού δείγματος: T=${T}, ρ(1)=${rho.toFixed(2)}. Με T_eff≈T(1−ρ)/(1+ρ), πόσο είναι περίπου;`,
          [r.toFixed(1),(T*rho).toFixed(1),(T/(1-rho)).toFixed(1),(T*(1+rho)).toFixed(1)],0,
          `T_eff≈${T}×${(1-rho).toFixed(2)}/${(1+rho).toFixed(2)}≈${r.toFixed(1)}. Ισχυρή autocorrelation σημαίνει πολύ λιγότερη ανεξάρτητη πληροφορία.`,'Τεύχος Α΄/Β΄ — autocorrelation & effective information');
      }
    },
    {
      id:'dyn_model_select', issue:'E', topic:'Decision Tree', difficulty:'hard',
      make(){
        const cases=[
          ['σειρά με πολλά μηδενικά και ADI=2,4','Croston / SBA / TSB','ARIMA(5,2,5)','VECM','OLS'],
          ['μικρούς ακέραιους counts με overdispersion','Negative Binomial time-series regression','Gaussian OLS','Croston','VECM'],
          ['σαφή policy intervention, μία σειρά και control series','Controlled ITS','Random 80/20 LightGBM','Croston','Johansen'],
          ['ημερήσια σειρά με εβδομαδιαία + ετήσια εποχικότητα','Dynamic harmonic regression / TBATS / MSTL','Μονο-seasonal SARIMA μόνο','Croston πάντα','ADF μόνο']
        ];
        const c=sample(cases);
        return dyn(this, `Ποια μέθοδος ταιριάζει καλύτερα σε ${c[0]};`, [c[1],c[2],c[3],c[4]],0,'Η επιλογή μοντέλου ξεκινά από τον σκοπό και τη δομή δεδομένων, όχι από το ποιο μοντέλο είναι πιο εντυπωσιακό.','Τεύχος Ε΄ — Decision Tree');
      }
    }
  ];
  function dyn(t,question,choices,correct,explanation,source){return {id:`${t.id}_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,conceptId:t.id,issue:t.issue,topic:t.topic,difficulty:t.difficulty,question,choices,correct,explanation,source,dynamic:true};}

  function cloneAndShuffle(q, doShuffle=true){
    const x=JSON.parse(JSON.stringify(q));
    if(!doShuffle) return x;
    const indexed=x.choices.map((c,i)=>({c,i})); const mixed=shuffle(indexed); x.choices=mixed.map(z=>z.c); x.correct=mixed.findIndex(z=>z.i===q.correct); return x;
  }
  function filterQuestions({issue='all',topic='all',difficulty='all',mode='mixed'}={}){
    let pool=[...questions];
    if(issue!=='all') pool=pool.filter(q=>q.issue===issue);
    if(topic!=='all') pool=pool.filter(q=>q.topic===topic);
    if(difficulty!=='all') pool=pool.filter(q=>q.difficulty===difficulty);
    if(mode==='mistakes') pool=pool.filter(q=>(state.items[q.id]?.wrong||0)>0);
    if(mode==='due') pool=pool.filter(q=>state.items[q.id]?.attempts>0 && state.items[q.id].due<=todayKey());
    if(mode==='weak'){
      const weakTopics=new Set(topicStats().filter(x=>x.attempts>=2 && x.accuracy<75).map(x=>x.topic));
      const p=pool.filter(q=>weakTopics.has(q.topic) || ((state.items[q.id]?.attempts||0)>=2 && pct(state.items[q.id].correct,state.items[q.id].attempts)<75));
      if(p.length) pool=p;
    }
    return pool;
  }
  function dynamicAllowed(filter){
    return dynamicTemplates.filter(t=>(filter.issue==='all'||t.issue===filter.issue) && (filter.topic==='all'||t.topic===filter.topic) && (filter.difficulty==='all'||t.difficulty===filter.difficulty));
  }
  function buildSession(filter,count,allowDynamic,doShuffle){
    let pool=filterQuestions(filter);
    if(!pool.length) pool=filterQuestions({...filter,mode:'mixed'});
    if(!pool.length) return [];
    const dynPool=allowDynamic?dynamicAllowed(filter):[];
    const out=[];
    for(let i=0;i<count;i++){
      let q;
      if(dynPool.length && Math.random()<0.35) q=sample(dynPool).make();
      else q=pool[i%pool.length];
      out.push(cloneAndShuffle(q,doShuffle));
      if((i+1)%pool.length===0) pool=shuffle(pool);
    }
    return shuffle(out);
  }
  function nextContinuousQuestion(filter,allowDynamic,doShuffle){
    const dynPool=allowDynamic?dynamicAllowed(filter):[];
    if(dynPool.length && Math.random()<0.48) return cloneAndShuffle(sample(dynPool).make(),doShuffle);
    let pool=filterQuestions(filter); if(!pool.length) pool=filterQuestions({...filter,mode:'mixed'}); return cloneAndShuffle(sample(pool),doShuffle);
  }

  // -------- Navigation --------
  const pageMeta={dashboard:['Αρχική','Adaptive learning για τα 6 τεύχη Time Series — Zero to Hero'],library:['Βιβλιοθήκη','Άμεση πρόσβαση στα PDF από το project ή το GitHub'],quiz:['Quiz Lab','Adaptive και παραμετρικά multiple choice'],review:['Επανάληψη','Spaced repetition και λάθη'],exam:['Exam Mode','Προσομοίωση εξέτασης χωρίς άμεσο feedback'],progress:['Πρόοδος','Knowledge map, accuracy και weak points'],settings:['GitHub / Ρυθμίσεις','Σύνδεση public repository και backup προόδου']};
  function showView(name){
    $$('.view').forEach(v=>v.classList.remove('active')); $(`#view-${name}`).classList.add('active');
    $$('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===name));
    $('#pageTitle').textContent=pageMeta[name][0]; $('#pageSubtitle').textContent=pageMeta[name][1];
    $('#sidebar').classList.remove('open');
    if(name==='dashboard') renderDashboard(); if(name==='library') renderLibrary(); if(name==='review') renderReview(); if(name==='progress') renderProgress(); if(name==='exam') renderExamBest();
  }

  // -------- Dashboard --------
  function renderDashboard(){
    const t=getTotals(), m=masteryScore(), streak=currentStreak(); state.bestStreak=Math.max(state.bestStreak||0,streak); saveState();
    $('#statAttempts').textContent=t.attempts; $('#statAccuracy').textContent=t.attempts?`${t.accuracy}%`:'—'; $('#statDue').textContent=t.due; $('#statStreak').textContent=streak;
    $('#masteryPct').textContent=`${m}%`; $('#masteryRing').style.setProperty('--p',m); $('#masteryText').textContent=t.attempts?`${t.seen} concepts έχουν ήδη δοκιμαστεί.`:'Απάντησε ερωτήσεις για να ξεκινήσει η μέτρηση.';
    $('#issueStrip').innerHTML=manifest.documents.map(d=>`<div class="issue-chip"><b>${esc(d.title)}</b><span>${esc(d.parts)} · ${esc(d.level)}</span></div>`).join('');
    const ts=topicStats().filter(x=>x.attempts>=2).slice(0,5);
    $('#weakMini').innerHTML=ts.length?ts.map(x=>barHtml(x.topic,x.accuracy,`${x.accuracy}%`)).join(''):'<p class="hint">Χρειάζονται λίγες απαντήσεις για να εντοπιστούν weak points.</p>';
    const rec=[];
    if(t.due) rec.push(recHtml('↻',`${t.due} έννοιες είναι due`,`Κάνε spaced repetition τώρα`,'review'));
    if(ts.length && ts[0].accuracy<75) rec.push(recHtml('⚑',`Weak point: ${ts[0].topic}`,`Ακρίβεια ${ts[0].accuracy}% — στόχευσέ το`,'quiz'));
    rec.push(recHtml('◎','30 ερωτήσεις adaptive mix','Συνδυασμός στατικών + παραμετρικών ερωτήσεων','quiz'));
    if(!state.exams.length) rec.push(recHtml('◫','Πρώτη προσομοίωση εξέτασης','40 ερωτήσεις · χωρίς feedback μέχρι το τέλος','exam'));
    $('#recommendations').innerHTML=rec.slice(0,4).join('');
    $$('[data-rec-go]').forEach(b=>b.onclick=()=>showView(b.dataset.recGo));
  }
  function recHtml(icon,title,small,go){return `<div class="rec"><div class="rec-icon">${icon}</div><div><strong>${esc(title)}</strong><small>${esc(small)}</small></div><button class="text-btn" data-rec-go="${go}">Άνοιγμα →</button></div>`;}
  function barHtml(name,value,label){return `<div class="bar-row"><span>${esc(name)}</span><div class="bar"><i style="width:${clamp(value,0,100)}%"></i></div><small>${esc(label)}</small></div>`;}

  // -------- Library --------
  function docUrl(d){return remoteBase?`${remoteBase}${d.file}`:d.file;}
  function renderLibrary(){
    $('#libraryList').innerHTML=manifest.documents.map(d=>`<div class="doc-item" data-doc="${d.id}"><strong>${esc(d.title)}</strong><span>${esc(d.subtitle)}</span><small>Μέρη ${esc(d.parts)} · ${esc(d.level)}</small></div>`).join('');
    $$('.doc-item').forEach(el=>el.onclick=()=>openDoc(el.dataset.doc));
  }
  function openDoc(id){
    const d=manifest.documents.find(x=>x.id===id); if(!d)return; $$('.doc-item').forEach(e=>e.classList.toggle('active',e.dataset.doc===id));
    const url=docUrl(d); $('#pdfTitle').textContent=`${d.title} — ${d.subtitle}`; $('#pdfMeta').textContent=`Μέρη ${d.parts} · ${d.level}`; $('#pdfPlaceholder').hidden=true; $('#pdfFrame').hidden=false; $('#pdfFrame').src=url; $('#openPdfBtn').href=url; $('#openPdfBtn').classList.remove('disabled');
  }

  // -------- Quiz --------
  function startQuiz(overrides={}){
    showView('quiz');
    const filter={mode:overrides.mode||$('#quizMode').value, issue:overrides.issue||$('#quizIssue').value, topic:overrides.topic||$('#quizTopic').value, difficulty:overrides.difficulty||$('#quizDifficulty').value};
    const count=overrides.count!==undefined?overrides.count:Number($('#quizCount').value); const allowDynamic=overrides.dynamic!==undefined?overrides.dynamic:$('#dynamicQuestions').checked; const doShuffle=$('#shuffleAnswers').checked;
    const continuous=count===0 || filter.mode==='mastery'; const queue=continuous?[nextContinuousQuestion(filter,allowDynamic,doShuffle)]:buildSession(filter,count,allowDynamic,doShuffle);
    if(!queue.length){toast('Δεν βρέθηκαν ερωτήσεις για αυτό το φίλτρο.');return;}
    quiz={filter,count,continuous,allowDynamic,doShuffle,queue,index:0,correct:0,answered:false}; $('#quizEmpty').hidden=true; $('#quizRunner').hidden=false; renderQuizQuestion();
  }
  function renderQuizQuestion(){
    const q=quiz.queue[quiz.index]; quiz.answered=false; $('#qCounter').textContent=quiz.continuous?`#${quiz.index+1} · ∞`:`${quiz.index+1} / ${quiz.queue.length}`; $('#qDifficulty').textContent=q.difficulty.toUpperCase(); $('#qTopic').textContent=q.topic; $('#qSource').textContent=q.source; $('#qText').textContent=q.question; $('#quizScore').textContent=`${quiz.correct} σωστές`;
    $('#quizProgress').style.width=quiz.continuous?'100%':`${(quiz.index/quiz.queue.length)*100}%`; $('#qFeedback').hidden=true; $('#nextQuestionBtn').disabled=true;
    $('#qChoices').innerHTML=q.choices.map((c,i)=>`<button class="choice" data-choice="${i}"><span class="key">${i+1}</span><span>${esc(c)}</span></button>`).join('');
    $$('#qChoices .choice').forEach(b=>b.onclick=()=>answerQuiz(Number(b.dataset.choice)));
  }
  function answerQuiz(i){
    if(quiz.answered)return; quiz.answered=true; const q=quiz.queue[quiz.index], ok=i===q.correct; if(ok)quiz.correct++; recordAnswer(q,ok,i,'quiz');
    $$('#qChoices .choice').forEach((b,idx)=>{b.disabled=true; if(idx===q.correct)b.classList.add('correct'); else if(idx===i)b.classList.add('wrong'); else b.classList.add('dim');});
    const fb=$('#qFeedback'); fb.hidden=false; fb.className=`feedback ${ok?'good':'bad'}`; fb.innerHTML=`<strong>${ok?'✓ Σωστό':'✕ Λάθος — σωστή απάντηση: '+esc(q.choices[q.correct])}</strong>${esc(q.explanation)}<br><small>${esc(q.source)}</small>`; $('#nextQuestionBtn').disabled=false; $('#quizScore').textContent=`${quiz.correct} σωστές`; renderDashboard();
  }
  function nextQuiz(){
    if(!quiz||!quiz.answered)return;
    if(quiz.continuous){quiz.index++; quiz.queue.push(nextContinuousQuestion(quiz.filter,quiz.allowDynamic,quiz.doShuffle)); renderQuizQuestion(); return;}
    if(quiz.index>=quiz.queue.length-1){finishQuiz();return;} quiz.index++; renderQuizQuestion();
  }
  function finishQuiz(){
    const total=quiz.index+1, score=pct(quiz.correct,total); $('#quizRunner').hidden=true; $('#quizEmpty').hidden=false; $('#quizEmpty').innerHTML=`<div class="big-icon">✓</div><h2>Ολοκληρώθηκε</h2><p><strong>${quiz.correct}/${total} · ${score}%</strong><br>Η πρόοδος και οι επαναλήψεις ενημερώθηκαν.</p><div><button class="btn primary" id="againQuiz">Νέο Quiz</button> <button class="btn secondary" id="goProgress">Πρόοδος</button></div>`; $('#againQuiz').onclick=()=>{ $('#quizEmpty').innerHTML='<div class="big-icon">◎</div><h2>Adaptive Multiple Choice</h2><p>Διάλεξε ρυθμίσεις και ξεκίνα.</p>'; }; $('#goProgress').onclick=()=>showView('progress'); quiz=null; renderDashboard();
  }

  // -------- Review --------
  function renderReview(){
    const t=getTotals(); $('#reviewDue').textContent=t.due; $('#reviewMistakes').textContent=Object.values(state.items).filter(x=>x.wrong>0).length; $('#reviewMastered').textContent=t.mastered; $('#reviewSeen').textContent=t.seen;
    const rows=questions.map(q=>({q,it:state.items[q.id]})).filter(x=>x.it?.attempts).sort((a,b)=>(a.it.due||'').localeCompare(b.it.due||'')).slice(0,30);
    $('#reviewQueue').innerHTML=rows.length?`<table class="simple-table"><thead><tr><th>Έννοια</th><th>Τεύχος</th><th>Accuracy</th><th>Due</th></tr></thead><tbody>${rows.map(({q,it})=>`<tr><td>${esc(q.topic)}<br><small>${esc(q.question.slice(0,72))}${q.question.length>72?'…':''}</small></td><td>${esc(q.issue)}</td><td>${pct(it.correct,it.attempts)}%</td><td class="${it.due<=todayKey()?'danger-text':''}">${esc(it.due||'—')}</td></tr>`).join('')}</tbody></table>`:'<p class="hint">Δεν υπάρχουν ακόμη προγραμματισμένες επαναλήψεις.</p>';
  }

  // -------- Exam --------
  function buildExam(){
    const count=Number($('#examCount').value), issue=$('#examIssue').value, d=$('#examDifficulty').value, dynOn=$('#examDynamic').checked;
    let pool=questions.filter(q=>issue==='all'||q.issue===issue);
    if(d==='medium') pool=pool.filter(q=>DIFF_RANK[q.difficulty]>=2); else if(d==='hard') pool=pool.filter(q=>DIFF_RANK[q.difficulty]>=3); else if(d==='expert') pool=pool.filter(q=>q.difficulty==='expert');
    if(!pool.length){toast('Δεν υπάρχουν αρκετές ερωτήσεις με αυτά τα φίλτρα.');return;}
    const filter={mode:'mixed',issue,topic:'all',difficulty:'all'}; let queue=[];
    for(let i=0;i<count;i++){
      let q; const dyns=dynOn?dynamicAllowed(filter).filter(t=>d==='all'||DIFF_RANK[t.difficulty]>=(d==='medium'?2:d==='hard'?3:4)):[];
      if(dyns.length&&Math.random()<.3) q=sample(dyns).make(); else q=pool[i%pool.length]; queue.push(cloneAndShuffle(q,true)); if((i+1)%pool.length===0)pool=shuffle(pool);
    }
    exam={queue:shuffle(queue),index:0,answers:Array(count).fill(null),started:Date.now(),minutes:Number($('#examMinutes').value),remaining:Number($('#examMinutes').value)*60};
    $('#examRunnerCard').hidden=false; $('#examResults').hidden=true; renderExamQuestion(); startExamTimer(); window.scrollTo({top:document.body.scrollHeight,behavior:'smooth'});
  }
  function renderExamQuestion(){
    const q=exam.queue[exam.index]; $('#examCounter').textContent=`${exam.index+1} / ${exam.queue.length}`; $('#examProgress').style.width=`${((exam.index+1)/exam.queue.length)*100}%`; $('#examSource').textContent=`${q.source} · ${q.difficulty.toUpperCase()}`; $('#examText').textContent=q.question; $('#examChoices').innerHTML=q.choices.map((c,i)=>`<button class="choice ${exam.answers[exam.index]===i?'correct':''}" data-exam-choice="${i}"><span class="key">${i+1}</span><span>${esc(c)}</span></button>`).join(''); $$('#examChoices .choice').forEach(b=>b.onclick=()=>{exam.answers[exam.index]=Number(b.dataset.examChoice);renderExamQuestion();}); $('#examPrevBtn').disabled=exam.index===0; $('#examNextBtn').textContent=exam.index===exam.queue.length-1?'Παράδοση':'Επόμενη →';
  }
  function startExamTimer(){
    clearInterval(examTimerHandle); if(!exam.minutes){$('#examTimer').textContent='Χωρίς χρόνο';return;} updateExamTimer(); examTimerHandle=setInterval(()=>{exam.remaining--;updateExamTimer();if(exam.remaining<=0){clearInterval(examTimerHandle);finishExam();}},1000);
  }
  function updateExamTimer(){const m=Math.floor(exam.remaining/60),s=exam.remaining%60;$('#examTimer').textContent=`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;}
  function finishExam(){
    if(!exam)return; clearInterval(examTimerHandle); let correct=0; exam.queue.forEach((q,i)=>{const ok=exam.answers[i]===q.correct;if(ok)correct++;recordAnswer(q,ok,exam.answers[i],'exam');}); const score=pct(correct,exam.queue.length); const duration=Math.round((Date.now()-exam.started)/1000); state.exams.unshift({date:new Date().toISOString(),score,correct,total:exam.queue.length,duration}); state.exams=state.exams.slice(0,30); saveState();
    const wrong=exam.queue.map((q,i)=>({q,a:exam.answers[i]})).filter(x=>x.a!==x.q.correct); $('#examRunnerCard').hidden=true; const r=$('#examResults');r.hidden=false;r.innerHTML=`<div class="result-grid"><div><span class="eyebrow">RESULT</span><div class="score-big">${score}%</div><p>${correct}/${exam.queue.length} σωστές</p></div><div><h2>${score>=85?'Εξαιρετική επίδοση':score>=70?'Καλή βάση — υπάρχει χώρος για mastery':'Χρειάζεται στοχευμένη επανάληψη'}</h2><p>${wrong.length?`Έκανες ${wrong.length} λάθη. Παρακάτω εμφανίζονται οι κρίσιμες διορθώσεις.`:'Καμία λανθασμένη απάντηση.'}</p></div></div>${wrong.slice(0,20).map(({q,a},idx)=>`<div class="review-item"><strong>${idx+1}. ${esc(q.question)}</strong><p>Σωστό: <b>${esc(q.choices[q.correct])}</b>${a===null?' · Δεν απαντήθηκε':''}</p><small>${esc(q.explanation)} — ${esc(q.source)}</small></div>`).join('')}`; exam=null; renderExamBest(); renderDashboard(); renderProgress(); window.scrollTo({top:document.body.scrollHeight,behavior:'smooth'});
  }
  function renderExamBest(){
    const best=state.exams.length?Math.max(...state.exams.map(x=>x.score)):null; $('#examBest').textContent=best===null?'—':`${best}%`; $('#examBest').parentElement.style.setProperty('--p',best||0); $('#examBestText').textContent=best===null?'Δεν υπάρχει ολοκληρωμένη εξέταση ακόμη.':`${state.exams.length} ολοκληρωμένες εξετάσεις · καλύτερη ${best}%`;
  }

  // -------- Progress --------
  function renderProgress(){
    const t=getTotals(),m=masteryScore(),best=state.exams.length?Math.max(...state.exams.map(x=>x.score)):null; $('#pMastery').textContent=`${m}%`;$('#pCorrect').textContent=t.correct;$('#pWrong').textContent=t.wrong;$('#pBestExam').textContent=best===null?'—':`${best}%`;
    const ts=topicStats(); $('#topicProgress').innerHTML=ts.length?ts.map(x=>`<div class="topic-progress-row"><div class="line"><strong>${esc(x.topic)}</strong><span>${x.accuracy}% · n=${x.attempts}</span></div><div class="bar"><i style="width:${x.accuracy}%"></i></div></div>`).join(''):'<p class="hint">Δεν υπάρχουν ακόμη δεδομένα.</p>';
    $('#issueProgress').innerHTML=issueStats().map(x=>`<div class="topic-progress-row"><div class="line"><strong>${esc(x.title)}</strong><span>${x.attempts?x.accuracy+'%':'—'} · n=${x.attempts}</span></div><div class="bar"><i style="width:${x.attempts?x.accuracy:0}%"></i></div></div>`).join('');
    $('#activityTable').innerHTML=state.activity.length?`<table class="simple-table"><thead><tr><th>Χρόνος</th><th>Θέμα</th><th>Αποτέλεσμα</th><th>Mode</th></tr></thead><tbody>${state.activity.slice(0,30).map(a=>`<tr><td>${new Date(a.ts).toLocaleString('el-GR')}</td><td>${esc(a.topic)} · ${esc(a.issue)}</td><td class="${a.correct?'activity-correct':'activity-wrong'}">${a.correct?'Σωστό':'Λάθος'}</td><td>${esc(a.context)}</td></tr>`).join('')}</tbody></table>`:'<p class="hint">Καμία δραστηριότητα ακόμη.</p>';
  }

  // -------- GitHub / data --------
  async function syncGitHub(){
    const owner=$('#ghOwner').value.trim(),repo=$('#ghRepo').value.trim(),branch=$('#ghBranch').value.trim()||'main'; if(!owner||!repo){toast('Συμπλήρωσε owner και repository.');return;}
    const base=`https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(branch)}/`;
    $('#syncStatus').textContent='Σύνδεση…';
    try{
      const [mRes,qRes]=await Promise.all([fetch(base+'manifest.json',{cache:'no-store'}),fetch(base+'data/questions.json',{cache:'no-store'})]);
      if(!mRes.ok)throw new Error(`manifest.json HTTP ${mRes.status}`); if(!qRes.ok)throw new Error(`questions.json HTTP ${qRes.status}`);
      const m=await mRes.json(),qs=await qRes.json(); if(!Array.isArray(m.documents)||!Array.isArray(qs))throw new Error('Μη έγκυρη δομή δεδομένων'); manifest=m;questions=qs;remoteBase=base;state.github={owner,repo,branch,enabled:true};saveState();populateFilters();renderLibrary();renderDashboard();$('#syncStatus').textContent=`✓ Συνδεδεμένο: ${owner}/${repo}@${branch} · ${qs.length} ερωτήσεις`;toast('GitHub sync ολοκληρώθηκε.');
    }catch(err){$('#syncStatus').textContent=`✕ Αποτυχία: ${err.message}. Για private repository απαιτείται ασφαλές backend/authentication — όχι token μέσα στο HTML.`;toast('Αποτυχία GitHub sync.');}
  }
  function useBundled(){manifest=window.BUILTIN_MANIFEST;questions=window.BUILTIN_QUESTIONS;remoteBase='';state.github.enabled=false;saveState();populateFilters();renderLibrary();renderDashboard();$('#syncStatus').textContent='Bundled mode — χρησιμοποιούνται τα PDF και η question bank του project.';toast('Ενεργοποιήθηκε bundled mode.');}
  async function autoSync(){
    const g=state.github||{}; $('#ghOwner').value=g.owner||'';$('#ghRepo').value=g.repo||'';$('#ghBranch').value=g.branch||'main'; if(g.enabled&&g.owner&&g.repo){await syncGitHub();}
  }
  function exportProgress(){const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`time-series-progress-${todayKey()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
  function importProgress(file){const r=new FileReader();r.onload=()=>{try{const x=JSON.parse(r.result);if(!x||typeof x!=='object'||!x.items)throw new Error();state={...defaultState(),...x};saveState();renderDashboard();renderReview();renderProgress();toast('Η πρόοδος εισήχθη.');}catch{toast('Μη έγκυρο progress.json');}};r.readAsText(file);}
  function resetProgress(){if(!confirm('Να διαγραφεί ΟΛΗ η πρόοδος, οι επαναλήψεις και οι εξετάσεις από αυτόν τον browser;'))return;const gh=state.github;state=defaultState();state.github=gh||defaultState().github;saveState();renderDashboard();renderReview();renderProgress();renderExamBest();toast('Η πρόοδος μηδενίστηκε.');}

  function populateFilters(){
    const issueOpts=manifest.documents.map(d=>`<option value="${esc(d.id)}">${esc(d.title)}</option>`).join(''); $('#quizIssue').innerHTML='<option value="all">Όλα τα τεύχη</option>'+issueOpts; $('#examIssue').innerHTML='<option value="all">Όλα</option>'+issueOpts;
    const topics=[...new Set(questions.map(q=>q.topic))].sort((a,b)=>a.localeCompare(b,'el')); $('#quizTopic').innerHTML='<option value="all">Όλες οι θεματικές</option>'+topics.map(t=>`<option value="${esc(t)}">${esc(t)}</option>`).join('');
  }

  // -------- Event wiring --------
  function wire(){
    $$('.nav-btn').forEach(b=>b.onclick=()=>showView(b.dataset.view)); $$('[data-go]').forEach(b=>b.onclick=()=>showView(b.dataset.go)); $('#menuBtn').onclick=()=>$('#sidebar').classList.toggle('open');
    $('#quickQuizBtn').onclick=()=>{showView('quiz');startQuiz({mode:'mixed',count:30});}; $('#quickReviewBtn').onclick=()=>startQuiz({mode:'due',count:20}); $('#startQuizBtn').onclick=()=>startQuiz(); $('#nextQuestionBtn').onclick=nextQuiz; $('#stopQuizBtn').onclick=()=>finishQuiz();
    $('#startDueBtn').onclick=()=>startQuiz({mode:'due',count:20});
    $('#startExamBtn').onclick=buildExam; $('#examPrevBtn').onclick=()=>{if(exam&&exam.index>0){exam.index--;renderExamQuestion();}}; $('#examNextBtn').onclick=()=>{if(!exam)return;if(exam.index<exam.queue.length-1){exam.index++;renderExamQuestion();}else finishExam();}; $('#endExamBtn').onclick=()=>{if(confirm('Παράδοση εξέτασης τώρα;'))finishExam();};
    $('#saveGitHubBtn').onclick=syncGitHub; $('#syncLibraryBtn').onclick=()=>{if(state.github.enabled)syncGitHub();else toast('Ρύθμισε πρώτα GitHub owner/repository.');}; $('#useBundledBtn').onclick=useBundled;
    $('#exportProgressBtn').onclick=exportProgress; $('#importProgressInput').onchange=e=>{if(e.target.files[0])importProgress(e.target.files[0]);e.target.value='';}; $('#resetProgressBtn').onclick=resetProgress;
    document.addEventListener('keydown',e=>{
      if(quiz&&$('#view-quiz').classList.contains('active')){if(['1','2','3','4'].includes(e.key)&&!quiz.answered){const i=Number(e.key)-1;if(i<quiz.queue[quiz.index].choices.length)answerQuiz(i);}else if(e.key==='Enter'&&quiz.answered)nextQuiz();}
      if(exam&&$('#view-exam').classList.contains('active')&&['1','2','3','4'].includes(e.key)){const i=Number(e.key)-1;if(i<exam.queue[exam.index].choices.length){exam.answers[exam.index]=i;renderExamQuestion();}}
    });
  }

  async function init(){populateFilters();wire();renderDashboard();renderLibrary();renderReview();renderProgress();renderExamBest();await autoSync();}
  init();
})();
