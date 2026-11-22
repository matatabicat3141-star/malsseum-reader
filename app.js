'use strict';
const FORM_URL='https://docs.google.com/forms/d/e/1FAIpQLSdr9lYfR73KZ8yBTfexzUzvc__kUWepFENN38CLHFY5xfSJ5g/viewform';
const qs=new URLSearchParams(location.search);
const VOL=parseInt(qs.get('vol')||'119',10);
const LS_KEY='malsseum_vol'+String(VOL).padStart(3,'0')+'_annotations';
let DATA=null, lecOfPage={}; // page -> lecture no (running)

const $=s=>document.querySelector(s);
const main=$('#main');

/* ---------- annotations (localStorage) ---------- */
function loadAnnos(){ try{return JSON.parse(localStorage.getItem(LS_KEY))||[]}catch(e){return[]} }
function saveAnnos(a){ localStorage.setItem(LS_KEY, JSON.stringify(a)); }
let annos=loadAnnos();

/* ---------- data ---------- */
fetch('data/vol'+String(VOL).padStart(3,'0')+'.json').then(r=>r.json()).then(d=>{
  DATA=d;
  document.title='第'+VOL+'巻 ― 御言選集リーダー';
  $('#volTitle').textContent='文鮮明先生御言選集 第'+VOL+'巻';
  let cur=null;
  for(const pg of d.pages){ if(pg.lec) cur=pg.lec; lecOfPage[pg.p]=cur; }
  buildToc(); render(); applyAnnos(); jumpFromHash();
}).catch(()=>{ main.innerHTML='<p>データの読み込みに失敗しました。</p>'; });

function buildToc(){
  const el=$('#tocList');
  let html='<a href="#top" data-jump="9">巻頭（表紙・まえがき・目次）</a>';
  for(const l of DATA.lectures){
    html+='<a href="#lec'+l.no+'-p'+l.page+'" data-jump="'+l.page+'">第'+l.no+'講 '+esc(l.title)+' <span class="pg">p.'+l.page+'</span></a>';
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

function render(){
  const lecMap={}; DATA.lectures.forEach(l=>lecMap[l.page]=l);
  let html='';
  for(const pg of DATA.pages){
    if(lecMap[pg.p]) html+='<h2 class="lec-title" id="lec'+lecMap[pg.p].no+'">第'+lecMap[pg.p].no+'講　'+esc(lecMap[pg.p].title)+'</h2>';
    html+='<div class="pagemark" id="p'+pg.p+'" data-page="'+pg.p+'"><span>p.'+pg.p+'</span>'+
      '<button data-report="'+pg.p+'">誤りを報告</button>'+
      '<button data-pagememo="'+pg.p+'">メモ</button></div>';
    const n=Math.max(pg.ja.length, pg.ko.length);
    for(let i=0;i<n;i++){
      if(pg.ko[i]) html+='<p class="para ko" data-page="'+pg.p+'" data-idx="'+i+'" data-lang="ko">'+esc(pg.ko[i])+'</p>';
      if(pg.ja[i]) html+='<p class="para ja" data-page="'+pg.p+'" data-idx="'+i+'" data-lang="ja">'+esc(pg.ja[i])+'</p>';
    }
    if(pg.note) html+='<div class="note">'+esc(pg.note)+'</div>';
    html+='<div class="page-memos" data-memos="'+pg.p+'"></div>';
  }
  main.innerHTML=html;
  main.querySelectorAll('[data-report]').forEach(b=>b.addEventListener('click',()=>openReport(+b.dataset.report,'')));
  main.querySelectorAll('[data-pagememo]').forEach(b=>b.addEventListener('click',()=>openMemoEditor({page:+b.dataset.pagememo,pageMemo:true})));
  renderPageMemos();
}

function jumpFromHash(){
  const m=location.hash.match(/lec(\d+)-p(\d+)|p(\d+)/);
  let target=null;
  if(m){ target=document.getElementById('p'+(m[2]||m[3])); }
  else if(location.hash==='#top'){ target=document.getElementById('p1'); }
  if(target) target.scrollIntoView();
}

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
