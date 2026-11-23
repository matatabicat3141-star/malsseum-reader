'use strict';
const FORM_URL='https://docs.google.com/forms/d/e/1FAIpQLSdr9lYfR73KZ8yBTfexzUzvc__kUWepFENN38CLHFY5xfSJ5g/viewform';
const qs=new URLSearchParams(location.search);
const VOL=parseInt(qs.get('vol')||'119',10);
const LS_KEY='malsseum_vol'+String(VOL).padStart(3,'0')+'_annotations';
let DATA=null, lecOfPage={}; // page -> lecture no (running)
let SECS=[], secOfPage={}, curSec=0; // sections: front matter (only when it has body text) + lectures
let FRONT_HIDDEN=false, FIRST_LEC_PAGE=null;

/* ---------- front matter: hide the front section when it has no body text ---------- */
function normTxt(t){ return String(t).replace(/[\s　]+/g,''); }
function isFrontMatterPage(pg){
  const paras=(pg.ja||[]).concat(pg.ko||[]).map(normTxt).filter(s=>s.length);
  if(!paras.length) return true; // no text at all (blank / page-number only)
  if(paras.some(s=>/^(目次|목차|차례)/.test(s))) return true; // table of contents page
  const joined=paras.join('');
  const dots=(joined.match(/[·…‥]/g)||[]).length;
  if(joined.length>=40 && dots/joined.length>=0.2) return true; // TOC continuation (dot leaders)
  if(joined.length<=130) return true; // cover, preface heading+signature, blank/extraction markers only
  return false;
}
function frontHasBody(d){
  if(!d.lectures || !d.lectures.length) return true;
  const first=d.lectures[0].page;
  for(const pg of d.pages){
    if(pg.p>=first) break;
    if(!isFrontMatterPage(pg)) return true;
  }
  return false;
}

const $=s=>document.querySelector(s);
const main=$('#main');

/* ---------- annotations (localStorage) ---------- */
function loadAnnos(){ try{return JSON.parse(localStorage.getItem(LS_KEY))||[]}catch(e){return[]} }
function saveAnnos(a){ localStorage.setItem(LS_KEY, JSON.stringify(a)); }
let annos=loadAnnos();

/* ---------- bookmarks & last-read (localStorage, all volumes) ---------- */
const BM_KEY='malsseum_bookmarks';
const LR_KEY='malsseum_last_read';
function loadBookmarks(){ try{return JSON.parse(localStorage.getItem(BM_KEY))||[]}catch(e){return[]} }
function saveBookmarks(a){ try{localStorage.setItem(BM_KEY, JSON.stringify(a));}catch(e){} }
let bookmarks=loadBookmarks();
function loadLastRead(){ try{return JSON.parse(localStorage.getItem(LR_KEY))||null}catch(e){return null} }
function saveLastRead(p){ try{localStorage.setItem(LR_KEY, JSON.stringify(p));}catch(e){} }

/* ---------- data ---------- */
fetch('data/vol'+String(VOL).padStart(3,'0')+'.json').then(r=>r.json()).then(d=>{
  DATA=d;
  document.title='第'+VOL+'巻 ― 御言選集リーダー';
  $('#volTitle').textContent='文鮮明先生御言選集 第'+VOL+'巻';
  let cur=null;
  for(const pg of d.pages){ if(pg.lec) cur=pg.lec; lecOfPage[pg.p]=cur; }
  FRONT_HIDDEN=!frontHasBody(d);
  FIRST_LEC_PAGE=d.lectures.length?d.lectures[0].page:null;
  SECS=[];
  if(!FRONT_HIDDEN) SECS.push({no:0,title:'巻頭（表紙・まえがき・目次）',start:d.pages[0].p});
  for(const l of d.lectures) SECS.push({no:l.no,title:l.title,koTitle:l.koTitle,start:l.page});
  SECS.forEach((s,i)=>{ s.idx=i; s.end=(i+1<SECS.length?SECS[i+1].start-1:d.pages[d.pages.length-1].p); });
  { let si=0; for(const pg of d.pages){ while(si+1<SECS.length && SECS[si+1].start<=pg.p) si++; secOfPage[pg.p]=si; } }
  buildToc();
  let initSec=0;
  const m0=location.hash.match(/p(\d+)/);
  if(m0 && secOfPage[+m0[1]]!=null) initSec=secOfPage[+m0[1]];
  render(initSec); applyAnnos(); jumpFromHash(); refreshResumeBtn(); maybeShowResumeBanner();
}).catch(()=>{ main.innerHTML='<p>データの読み込みに失敗しました。</p>'; });

function buildToc(){
  const el=$('#tocList');
  let html='';
  if(!FRONT_HIDDEN) html+='<a href="#top" data-jump="'+SECS[0].start+'">巻頭（表紙・まえがき・目次）</a>';
  for(const l of DATA.lectures){
    html+='<a href="#lec'+l.no+'-p'+l.page+'" data-jump="'+l.page+'">第'+l.no+'講 '+esc(l.title)+(l.koTitle?' <span class="ko-title">'+esc(l.koTitle)+'</span>':'')+' <span class="pg">p.'+l.page+'</span></a>';
  }
  el.innerHTML=html;
  el.querySelectorAll('a').forEach(a=>a.addEventListener('click',e=>{
    e.preventDefault();
    location.hash=a.getAttribute('href').slice(1);
    jumpFromHash();
    $('#toc').classList.remove('open');
  }));
}

function esc(s){ return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

function secLabel(s){ return s.no? ('第'+s.no+'講　'+s.title) : s.title; }
function lecNavHtml(pos){
  return '<div class="lec-nav '+pos+'">'+
    '<button data-nav="-1"'+(curSec<=0?' disabled':'')+'>← 前の講へ</button>'+
    '<span class="lec-nav-label">'+esc(secLabel(SECS[curSec]))+'</span>'+
    '<button data-nav="1"'+(curSec>=SECS.length-1?' disabled':'')+'>次の講へ →</button></div>';
}
function updateTocCur(){
  document.querySelectorAll('#tocList a').forEach((a,i)=>a.classList.toggle('cur', i===curSec));
}
function gotoSection(idx){
  if(idx<0||idx>=SECS.length) return;
  if(idx===curSec){ window.scrollTo({top:0}); return; }
  render(idx); applyAnnos();
  const s=SECS[idx];
  history.replaceState(null,'', s.no? ('#lec'+s.no+'-p'+s.start) : '#p'+s.start);
  window.scrollTo({top:0});
}
function render(secIdx){
  curSec=Math.max(0,Math.min(secIdx||0,SECS.length-1));
  const sec=SECS[curSec];
  const lecMap={}; DATA.lectures.forEach(l=>lecMap[l.page]=l);
  let html=lecNavHtml('top');
  for(const pg of DATA.pages){
    if(pg.p<sec.start||pg.p>sec.end) continue;
    if(lecMap[pg.p]) html+='<h2 class="lec-title" id="lec'+lecMap[pg.p].no+'">第'+lecMap[pg.p].no+'講　'+esc(lecMap[pg.p].title)+(lecMap[pg.p].koTitle?'<span class="ko-title">'+esc(lecMap[pg.p].koTitle)+'</span>':'')+'</h2>';
    html+='<div class="pagemark" id="p'+pg.p+'" data-page="'+pg.p+'"><span>p.'+pg.p+'</span>'+
      '<button data-report="'+pg.p+'">誤りを報告</button>'+
      '<button data-bookmark="'+pg.p+'">栞を挟む</button>'+
      '<button data-pagememo="'+pg.p+'">メモ</button></div>';
    const n=Math.max(pg.ja.length, pg.ko.length);
    for(let i=0;i<n;i++){
      if(pg.ko[i]) html+='<p class="para ko" data-page="'+pg.p+'" data-idx="'+i+'" data-lang="ko">'+esc(pg.ko[i])+'</p>';
      if(pg.ja[i]) html+='<p class="para ja" data-page="'+pg.p+'" data-idx="'+i+'" data-lang="ja">'+esc(pg.ja[i])+'</p>';
    }
    if(pg.note) html+='<div class="note">'+esc(pg.note)+'</div>';
    html+='<div class="page-memos" data-memos="'+pg.p+'"></div>';
  }
  html+=lecNavHtml('bottom');
  main.innerHTML=html;
  main.querySelectorAll('[data-report]').forEach(b=>b.addEventListener('click',()=>openReport(+b.dataset.report,'')));
  main.querySelectorAll('[data-pagememo]').forEach(b=>b.addEventListener('click',()=>openMemoEditor({page:+b.dataset.pagememo,pageMemo:true})));
  main.querySelectorAll('[data-bookmark]').forEach(b=>b.addEventListener('click',()=>toggleBookmark(+b.dataset.bookmark)));
  main.querySelectorAll('[data-nav]').forEach(b=>b.addEventListener('click',()=>gotoSection(curSec+ +b.dataset.nav)));
  renderBookmarkStates();
  renderPageMemos();
  updateTocCur();
}

function pageFromHash(){
  const m=location.hash.match(/lec(\d+)-p(\d+)|p(\d+)|lec(\d+)/);
  if(!m) return null;
  if(m[2]||m[3]) return +(m[2]||m[3]);
  const l=DATA.lectures.find(x=>x.no===+m[4]);
  return l?l.page:null;
}
function showPage(page){
  const s=secOfPage[page];
  if(s==null) return null;
  if(s!==curSec){ render(s); applyAnnos(); }
  // page not rendered (e.g. hidden front matter): fall back to the section start
  return document.getElementById('p'+page) || document.getElementById('p'+SECS[s].start);
}
function jumpFromHash(){
  let target=null;
  if(location.hash==='#top'){
    if(curSec!==0){ render(0); applyAnnos(); }
    target=document.getElementById('p'+SECS[0].start);
  }else{
    const p=pageFromHash();
    if(p!=null) target=showPage(p);
  }
  if(target) target.scrollIntoView();
}
window.addEventListener('hashchange',()=>{ if(DATA) jumpFromHash(); });

/* ---------- toolbar ---------- */
const toolbar=$('#toolbar');
function syncHeaderH(){ document.documentElement.style.setProperty('--header-h', toolbar.offsetHeight+'px'); }
new ResizeObserver(syncHeaderH).observe(toolbar); syncHeaderH();
$('#hideTb').addEventListener('click',()=>{ toolbar.classList.add('hidden'); document.body.classList.add('tb-hidden'); });
$('#showTab').addEventListener('click',()=>{ toolbar.classList.remove('hidden'); document.body.classList.remove('tb-hidden'); });
$('#tocToggle').addEventListener('click',()=>$('#toc').classList.toggle('open'));
$('#modeSeg').addEventListener('click',e=>{
  const b=e.target.closest('button'); if(!b) return;
  $('#modeSeg').querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b));
  document.body.classList.toggle('hide-ko', b.dataset.mode==='ja');
  document.body.classList.toggle('hide-ja', b.dataset.mode==='ko');
});
$('#noteToggle').addEventListener('change',e=>document.body.classList.toggle('show-notes', e.target.checked));
$('#fsSeg').addEventListener('click',e=>{
  const b=e.target.closest('button'); if(!b) return;
  $('#fsSeg').querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b));
  main.className=b.dataset.fs;
});
$('#reportBtn').addEventListener('click',()=>window.open(FORM_URL,'_blank','noopener'));
$('#bmBtn').addEventListener('click',()=>{ renderBmList(); $('#bmPanel').classList.add('open'); });
$('#bmClose').addEventListener('click',()=>$('#bmPanel').classList.remove('open'));
$('#resumeBtn').addEventListener('click',()=>{
  const lr=loadLastRead(); if(!lr) return;
  if(lr.volume===VOL){ scrollToPos(lr); }
  else location.href='reader.html?vol='+lr.volume+'#p'+lr.page;
});

/* ---------- report ---------- */
function openReport(page, quote){
  const lec=lecOfPage[page];
  const loc='第'+VOL+'巻 '+(lec?('第'+lec+'講 '):'')+'p.'+page;
  let url=FORM_URL+'?usp=pp_url&entry.2107571930='+encodeURIComponent(loc);
  if(quote) url+='&entry.1209924091='+encodeURIComponent(quote.slice(0,500));
  window.open(url,'_blank','noopener');
}

/* ---------- search (within volume) ---------- */
$('#searchBtn').addEventListener('click',()=>{ $('#searchPanel').classList.toggle('open'); $('#searchInput').focus(); });
let searchTimer=null;
$('#searchInput').addEventListener('input',e=>{
  clearTimeout(searchTimer);
  searchTimer=setTimeout(()=>doSearch(e.target.value.trim()),250);
});
function doSearch(q){
  const box=$('#searchResults');
  main.querySelectorAll('mark.search-hit').forEach(mk=>{ mk.replaceWith(document.createTextNode(mk.textContent)); });
  if(!q||!DATA){ box.innerHTML=''; return; }
  const hits=[];
  for(const pg of DATA.pages){
    if(FRONT_HIDDEN && FIRST_LEC_PAGE!=null && pg.p<FIRST_LEC_PAGE) continue; // hidden front matter is not searchable
    for(const lang of ['ja','ko']){
      pg[lang].forEach((t,i)=>{ if(t.includes(q)) hits.push({page:pg.p,lang,idx:i,text:t}); });
    }
  }
  box.innerHTML='<div style="padding:4px">'+hits.length+'件</div>'+hits.slice(0,200).map((h,i)=>{
    const at=h.text.indexOf(q);
    const snip=esc(h.text.slice(Math.max(0,at-30),at+q.length+40));
    return '<a href="#p'+h.page+'" data-hit="'+i+'"><span class="loc">p.'+h.page+'（'+(h.lang==='ja'?'日':'韓')+'）</span> …'+snip+'…</a>';
  }).join('');
  box.querySelectorAll('a').forEach(a=>a.addEventListener('click',ev=>{
    ev.preventDefault();
    const h=hits[+a.dataset.hit];
    location.hash='p'+h.page;
    jumpFromHash();
    highlightInPara(h.page,h.idx,h.lang,q);
  }));
}
function highlightInPara(page,idx,lang,q){
  const el=main.querySelector('p.para[data-page="'+page+'"][data-idx="'+idx+'"][data-lang="'+lang+'"]');
  if(!el) return;
  const t=el.textContent, at=t.indexOf(q);
  if(at<0) return;
  el.innerHTML=esc(t.slice(0,at))+'<mark class="search-hit">'+esc(t.slice(at,at+q.length))+'</mark>'+esc(t.slice(at+q.length));
  el.scrollIntoView({block:'center'});
}

/* ---------- selection -> highlight / memo ---------- */
let pendingSel=null;
const popup=$('#selPopup');
const isCoarse=window.matchMedia('(pointer: coarse)').matches;
function captureSelection(){
  const sel=window.getSelection();
  if(!sel || sel.isCollapsed || !sel.rangeCount) return null;
  const range=sel.getRangeAt(0);
  const el=range.startContainer.nodeType===1?range.startContainer:range.startContainer.parentElement;
  const para=el.closest('p.para');
  if(!para || !main.contains(para)) return null;
  if(range.endContainer.parentElement.closest('p.para')!==para) return null; // single paragraph only
  const pre=range.cloneRange(); pre.selectNodeContents(para); pre.setEnd(range.startContainer, range.startOffset);
  const start=pre.toString().length;
  const text=range.toString();
  if(!text.trim()) return null;
  return {page:+para.dataset.page, idx:+para.dataset.idx, lang:para.dataset.lang,
          lec:lecOfPage[+para.dataset.page], start, end:start+text.length, quote:text, rect:range.getBoundingClientRect()};
}
function maybeShowPopup(){
  pendingSel=captureSelection();
  if(!pendingSel){ hidePopup(); return; }
  popup.style.display='flex';
  if(isCoarse){ popup.classList.add('bottom-bar'); document.body.classList.add('sel-bar-open'); }
  else{
    popup.classList.remove('bottom-bar');
    popup.style.left=(window.scrollX+pendingSel.rect.left)+'px';
    popup.style.top=(window.scrollY+pendingSel.rect.top-56)+'px';
  }
}
function hidePopup(){ popup.style.display='none'; popup.classList.remove('bottom-bar'); document.body.classList.remove('sel-bar-open'); }
document.addEventListener('selectionchange',()=>{ setTimeout(()=>{ if(!window.getSelection()||window.getSelection().isCollapsed) hidePopup(); },50); });
document.addEventListener('mouseup',()=>setTimeout(maybeShowPopup,10));
document.addEventListener('touchend',e=>{ if(!popup.contains(e.target)) setTimeout(maybeShowPopup,60); }, {passive:true});
popup.addEventListener('mousedown',e=>e.preventDefault());
$('#selCancel').addEventListener('click',()=>{ hidePopup(); window.getSelection().removeAllRanges(); });
$('#selHighlight').addEventListener('click',()=>{
  if(!pendingSel) return;
  annos.push(Object.assign({},pendingSel,{memo:'',ts:Date.now(),rect:undefined}));
  saveAnnos(annos); applyAnnos(); hidePopup(); window.getSelection().removeAllRanges();
});
$('#selMemo').addEventListener('click',()=>{ if(pendingSel) openMemoEditor(Object.assign({},pendingSel)); hidePopup(); });

/* ---------- apply highlights ---------- */
function applyAnnos(){
  main.querySelectorAll('mark[data-anno]').forEach(mk=>{ mk.replaceWith(document.createTextNode(mk.textContent)); });
  main.normalize();
  for(const a of annos){
    if(a.pageMemo) continue;
    const el=main.querySelector('p.para[data-page="'+a.page+'"][data-idx="'+a.idx+'"][data-lang="'+a.lang+'"]');
    if(!el || el.querySelector('mark.search-hit')) continue;
    const t=el.textContent;
    let at=t.indexOf(a.quote, Math.max(0,a.start-5));
    if(at<0) at=t.indexOf(a.quote);
    if(at<0) continue;
    el.innerHTML=esc(t.slice(0,at))+'<mark data-anno="'+a.ts+'">'+esc(t.slice(at,at+a.quote.length))+'</mark>'+esc(t.slice(at+a.quote.length));
  }
  main.querySelectorAll('mark[data-anno]').forEach(mk=>{
    mk.addEventListener('click',()=>{
      const a=annos.find(x=>x.ts===+mk.dataset.anno);
      if(a) openMemoEditor(a);
    });
  });
  renderPageMemos();
}
function renderPageMemos(){
  main.querySelectorAll('.page-memos').forEach(box=>{
    const list=annos.filter(a=>a.pageMemo && a.page===+box.dataset.memos);
    box.innerHTML=list.map(a=>'<div class="memo-card"><div class="mc-head"><span>ページのメモ</span><button data-delpm="'+a.ts+'">削除</button></div>'+esc(a.memo)+'</div>').join('');
    box.querySelectorAll('[data-delpm]').forEach(b=>b.addEventListener('click',()=>{
      annos=annos.filter(x=>x.ts!==+b.dataset.delpm); saveAnnos(annos); renderPageMemos(); renderAnnoList();
    }));
  });
}

/* ---------- memo editor ---------- */
let editing=null;
function openMemoEditor(a){
  editing=a;
  $('#memoLoc').textContent='第'+VOL+'巻 '+(a.lec?('第'+a.lec+'講 '):'')+'p.'+a.page+(a.quote?(' ― 「'+a.quote.slice(0,40)+'」'):'');
  $('#memoText').value=a.memo||'';
  $('#memoDelete').style.display=(a.ts? 'inline-block':'none');
  $('#memoModal').classList.add('open');
  $('#memoText').focus();
}
$('#memoCancel').addEventListener('click',()=>$('#memoModal').classList.remove('open'));
$('#memoSave').addEventListener('click',()=>{
  const txt=$('#memoText').value;
  if(editing.ts){ const a=annos.find(x=>x.ts===editing.ts); if(a) a.memo=txt; }
  else annos.push(Object.assign({},editing,{memo:txt,ts:Date.now(),rect:undefined}));
  saveAnnos(annos); applyAnnos(); renderAnnoList();
  $('#memoModal').classList.remove('open');
  window.getSelection().removeAllRanges();
});
$('#memoDelete').addEventListener('click',()=>{
  annos=annos.filter(x=>x.ts!==editing.ts); saveAnnos(annos); applyAnnos(); renderAnnoList();
  $('#memoModal').classList.remove('open');
});

/* ---------- annotation list panel ---------- */
$('#annoBtn').addEventListener('click',()=>{ renderAnnoList(); $('#annoPanel').classList.add('open'); });
$('#annoClose').addEventListener('click',()=>$('#annoPanel').classList.remove('open'));
function renderAnnoList(){
  const box=$('#annoList');
  if(!annos.length){ box.innerHTML='<p style="color:var(--muted);font-size:.85rem">まだありません。本文を選択するとハイライトやメモを付けられます。</p>'; return; }
  box.innerHTML=annos.slice().sort((a,b)=>a.page-b.page).map(a=>
    '<div class="anno-item"><span class="loc">p.'+a.page+(a.lec?(' 第'+a.lec+'講'):'')+'</span> '+
    (a.quote?'<span class="q">「'+esc(a.quote.slice(0,60))+'」</span><br>':'')+
    (a.memo?esc(a.memo):'<span style="color:var(--muted)">（ハイライトのみ）</span>')+
    '<br><button data-jump="'+a.ts+'">移動</button> <button data-edit="'+a.ts+'">編集</button> <button data-del="'+a.ts+'">削除</button></div>'
  ).join('');
  box.querySelectorAll('[data-jump]').forEach(b=>b.addEventListener('click',()=>{
    const a=annos.find(x=>x.ts===+b.dataset.jump); location.hash='p'+a.page; jumpFromHash(); $('#annoPanel').classList.remove('open');
  }));
  box.querySelectorAll('[data-edit]').forEach(b=>b.addEventListener('click',()=>{
    const a=annos.find(x=>x.ts===+b.dataset.edit); if(a) openMemoEditor(a);
  }));
  box.querySelectorAll('[data-del]').forEach(b=>b.addEventListener('click',()=>{
    annos=annos.filter(x=>x.ts!==+b.dataset.del); saveAnnos(annos); applyAnnos(); renderAnnoList();
  }));
}
$('#annoExport').addEventListener('click',()=>{
  const blob=new Blob([JSON.stringify(annos,null,1)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download='malsseum_vol'+String(VOL).padStart(3,'0')+'_annotations.json'; a.click();
  URL.revokeObjectURL(a.href);
});
$('#annoImportBtn').addEventListener('click',()=>$('#annoImport').click());
$('#annoImport').addEventListener('change',e=>{
  const f=e.target.files[0]; if(!f) return;
  const r=new FileReader();
  r.onload=()=>{ try{ const add=JSON.parse(r.result); if(Array.isArray(add)){ annos=annos.concat(add.filter(x=>!annos.some(y=>y.ts===x.ts))); saveAnnos(annos); applyAnnos(); renderAnnoList(); } }catch(err){ alert('読み込みに失敗しました'); } };
  r.readAsText(f);
});

/* ---------- bookmarks ---------- */
function findBookmark(page){ return bookmarks.find(b=>b.volume===VOL && b.page===page); }
function toggleBookmark(page){
  const ex=findBookmark(page);
  if(ex){ bookmarks=bookmarks.filter(b=>b!==ex); }
  else{
    const pg=DATA.pages.find(p=>p.p===page);
    const quoteSrc=(pg && ((pg.ja&&pg.ja[0])||(pg.ko&&pg.ko[0])))||'';
    bookmarks.push({volume:VOL, lecture:lecOfPage[page]||null, page:page, paraIndex:0,
                    quote:quoteSrc.slice(0,80), createdAt:Date.now()});
  }
  saveBookmarks(bookmarks); renderBookmarkStates(); renderBmList();
}
function renderBookmarkStates(){
  main.querySelectorAll('[data-bookmark]').forEach(b=>{
    const on=!!findBookmark(+b.dataset.bookmark);
    b.textContent=on?'栞を外す':'栞を挟む';
    b.classList.toggle('bm-on', on);
  });
}
function renderBmList(){
  const box=$('#bmList'); if(!box) return;
  if(!bookmarks.length){ box.innerHTML='<p style="color:var(--muted);font-size:.85rem">まだ栞がありません。各ページの区切りにある「栞を挟む」ボタンで挟めます。</p>'; return; }
  const sorted=bookmarks.slice().sort((a,b)=>a.volume-b.volume || a.page-b.page);
  box.innerHTML=sorted.map(b=>
    '<div class="bm-item"><span class="loc">第'+b.volume+'巻'+(b.lecture?(' 第'+b.lecture+'講'):'')+' p.'+b.page+'</span> '+
    '<span class="dt">'+new Date(b.createdAt).toLocaleDateString('ja-JP')+'</span><br>'+
    (b.quote?'<span class="q">「'+esc(b.quote.slice(0,60))+'…」</span><br>':'')+
    '<button data-bmjump="'+b.createdAt+'">移動</button> <button data-bmdel="'+b.createdAt+'">削除</button></div>'
  ).join('');
  box.querySelectorAll('[data-bmjump]').forEach(btn=>btn.addEventListener('click',()=>{
    const b=bookmarks.find(x=>x.createdAt===+btn.dataset.bmjump); if(!b) return;
    $('#bmPanel').classList.remove('open');
    if(b.volume===VOL){ location.hash='p'+b.page; jumpFromHash(); }
    else location.href='reader.html?vol='+b.volume+'#p'+b.page;
  }));
  box.querySelectorAll('[data-bmdel]').forEach(btn=>btn.addEventListener('click',()=>{
    bookmarks=bookmarks.filter(x=>x.createdAt!==+btn.dataset.bmdel);
    saveBookmarks(bookmarks); renderBookmarkStates(); renderBmList();
  }));
}

/* ---------- last read: auto-save & resume ---------- */
function docTop(el){ return el.getBoundingClientRect().top + window.scrollY; }
function currentPos(){
  const y=window.scrollY + (toolbar.offsetHeight||100) + 40;
  let page=null;
  for(const m of main.querySelectorAll('.pagemark')){
    if(docTop(m)<=y) page=+m.dataset.page; else break;
  }
  if(page==null) return null;
  let idx=0;
  for(const p of main.querySelectorAll('p.para[data-page="'+page+'"]')){
    if(docTop(p)<=y+60) idx=+p.dataset.idx; else break;
  }
  return {volume:VOL, lecture:lecOfPage[page]||null, page:page, paraIndex:idx, ts:Date.now()};
}
let lrTimer=null;
window.addEventListener('scroll',()=>{
  if(!DATA || lrTimer) return;
  lrTimer=setTimeout(()=>{ lrTimer=null; const pos=currentPos(); if(pos){ saveLastRead(pos); refreshResumeBtn(); } },400);
},{passive:true});
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='hidden' && DATA){ const pos=currentPos(); if(pos) saveLastRead(pos); }
});
function scrollToPos(pos){
  const mark=showPage(pos.page);
  const el=main.querySelector('p.para[data-page="'+pos.page+'"][data-idx="'+pos.paraIndex+'"]')
        || document.getElementById('p'+pos.page) || mark;
  if(el) el.scrollIntoView({block:'start'});
}
function refreshResumeBtn(){
  const b=$('#resumeBtn'); if(!b) return;
  const lr=loadLastRead();
  if(lr){ b.disabled=false; b.textContent='前回の続きから読む（第'+lr.volume+'巻 p.'+lr.page+'）'; }
  else{ b.disabled=true; b.textContent='前回の続きから読む'; }
}
function maybeShowResumeBanner(){
  if(location.hash) return;
  const lr=loadLastRead();
  if(!lr || lr.volume!==VOL || !lr.page || lr.page<=1) return;
  const div=document.createElement('div');
  div.className='resume-banner';
  div.innerHTML='前回は 第'+VOL+'巻 '+(lr.lecture?('第'+lr.lecture+'講 '):'')+'p.'+lr.page+' まで読みました。 '+
    '<button type="button" class="rb-go">続きから読む</button> <button type="button" class="rb-dismiss">閉じる</button>';
  main.insertBefore(div, main.firstChild);
  div.querySelector('.rb-go').addEventListener('click',()=>{ scrollToPos(lr); div.remove(); });
  div.querySelector('.rb-dismiss').addEventListener('click',()=>div.remove());
}
