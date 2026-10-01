/* Editor universal da Sala Bibliométrica.
   Injetado dentro do script principal. Não altera o CSV bruto. */

const ED_FIELDS={
  authors:{label:'Autores',array:true},journal:{label:'Periódicos',array:false},keywords:{label:'Palavras-chave',array:true},
  kwplus:{label:'Keywords Plus',array:true},countries:{label:'Países',array:true},institutions:{label:'Instituições',array:true},
  area:{label:'Áreas de pesquisa',array:true},lang:{label:'Idiomas',array:false},doctype:{label:'Tipos de documento',array:false}
};
let ED_BASE=null,ED_BASE_KEY='',ED_RAW_COMPUTE=null,ED_RAW_RENDER_CORPUS=null,ED_RAW_BUILD=null,ED_RAW_RENDER_ALL=null,ED_INSTALLED=false;

function edClone(v){try{return structuredClone(v);}catch(e){return JSON.parse(JSON.stringify(v));}}
function edNorm(v){return String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[’'"`´]/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();}
function edEsc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function edRuleStore(){
  if(typeof PROJ==='undefined'||!PROJ)return {};
  if(!PROJ.normalizationRules||typeof PROJ.normalizationRules!=='object')PROJ.normalizationRules={};
  Object.keys(ED_FIELDS).forEach(f=>{if(!PROJ.normalizationRules[f]||typeof PROJ.normalizationRules[f]!=='object')PROJ.normalizationRules[f]={};});
  return PROJ.normalizationRules;
}
function edCorpusKey(){
  if(typeof CORPUS==='undefined'||!CORPUS)return '';
  const pid=(typeof PROJ!=='undefined'&&PROJ&&PROJ.id)||'';
  return pid+'#'+(CORPUS.records||[]).length+'#'+(CORPUS.records||[]).slice(0,8).map(r=>String(r.title||'')+'@'+String(r.year||'')).join('|');
}
function edResetBase(){ED_BASE=null;ED_BASE_KEY='';}
function edCaptureBase(){if(typeof CORPUS==='undefined'||!CORPUS)return;const k=edCorpusKey();if(!ED_BASE||ED_BASE_KEY!==k){ED_BASE=edClone(CORPUS.records||[]);ED_BASE_KEY=k;}}
function edResolve(field,value){const rules=edRuleStore(),row=rules[field]&&rules[field][edNorm(value)];if(row===undefined)return value;if(typeof row==='string')return row;if(row&&typeof row==='object')return row.remove?'':String(row.to??'');return value;}
function edApplyRecord(rec){
  const r=edClone(rec);
  for(const [field,cfg] of Object.entries(ED_FIELDS)){
    if(cfg.array){const a=Array.isArray(r[field])?r[field]:[];r[field]=[...new Set(a.map(v=>String(edResolve(field,v)).trim()).filter(Boolean))];}
    else r[field]=String(edResolve(field,r[field]??'')).trim();
  }
  return r;
}
function edPrepareCorpus(){if(typeof CORPUS==='undefined'||!CORPUS)return;edCaptureBase();CORPUS.records=(ED_BASE||[]).map(edApplyRecord);}
function edValues(field){
  if(typeof CORPUS==='undefined'||!CORPUS)return [];
  edCaptureBase();const src=ED_BASE||CORPUS.records||[],cfg=ED_FIELDS[field],m=new Map();if(!cfg)return [];
  for(const r of src){const vals=cfg.array?(Array.isArray(r[field])?r[field]:[]):[r[field]];for(const v of vals){const s=String(v??'').trim();if(s)m.set(s,(m.get(s)||0)+1);}}
  return [...m.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'pt-BR'));
}
function edCurrentRule(field,value){const r=edRuleStore()[field]?.[edNorm(value)];if(r===undefined)return null;if(typeof r==='string')return {from:value,to:r,remove:false};return r;}
function edPersistRules(){
  if(typeof PROJ==='undefined'||!PROJ||typeof updateProj!=='function')return Promise.resolve();
  return Promise.resolve(updateProj({normalizationRules:edClone(PROJ.normalizationRules||{})})).catch(e=>{console.warn('Falha ao salvar padronização:',e);if(typeof toast==='function')toast('A correção foi aplicada nesta sessão, mas não pôde ser salva no projeto.');});
}
function edRecompute(message){
  if(typeof CORPUS==='undefined'||!CORPUS||!ED_RAW_COMPUTE)return;
  edPrepareCorpus();ED_RAW_COMPUTE();if(typeof renderAll==='function')renderAll();if(ED_RAW_RENDER_CORPUS)ED_RAW_RENDER_CORPUS();edRenderUI();
  const ss=document.getElementById('save-status');if(ss)ss.textContent='Correções salvas · análises recalculadas';
  const mapTab=document.getElementById('tab-mapa'),mode=document.getElementById('map-mode');
  if(mapTab&&!mapTab.classList.contains('hidden')&&mode?.value==='world'&&typeof mapFromCorpus==='function'){try{mapFromCorpus();}catch(e){console.warn(e);}}
  if(typeof toast==='function'&&message)toast(message);
}
async function edSetRule(remove){
  const field=document.getElementById('ed-field')?.value,from=document.getElementById('ed-from')?.value?.trim(),to=document.getElementById('ed-to')?.value?.trim();
  if(!field||!from){if(typeof toast==='function')toast('Escolha o valor que deseja corrigir.');return;}
  if(!remove&&!to){if(typeof toast==='function')toast('Informe como o valor deve ficar.');return;}
  edRuleStore()[field][edNorm(from)]={from,to:remove?'':to,remove:!!remove,updatedAt:new Date().toISOString()};
  await edPersistRules();edRecompute(remove?'Valor removido da análise.':'Correção aplicada. Gráficos e estatísticas foram recalculados.');
}
async function edRemoveRule(field,key){const rules=edRuleStore();if(rules[field])delete rules[field][decodeURIComponent(key)];await edPersistRules();edRecompute('Correção desfeita.');}
async function edClearRules(){if(!confirm('Remover todas as correções deste projeto? O arquivo original não será alterado.'))return;PROJ.normalizationRules={};edRuleStore();await edPersistRules();edRecompute('Todas as correções foram removidas.');}
function edPick(encoded){const v=decodeURIComponent(encoded),a=document.getElementById('ed-from'),b=document.getElementById('ed-to');if(a)a.value=v;if(b)b.value=v;b?.focus();b?.select();}
function edRenderRules(){
  const box=document.getElementById('ed-rules');if(!box)return;const field=document.getElementById('ed-field')?.value||'authors',rows=Object.entries(edRuleStore()[field]||{});
  box.innerHTML=rows.length?rows.map(([k,r])=>{const x=typeof r==='string'?{from:k,to:r,remove:false}:r,target=x.remove?'<em>removido da análise</em>':'<b>'+edEsc(x.to||'')+'</b>';return '<div style="display:flex;gap:8px;align-items:center;justify-content:space-between;padding:7px 0;border-bottom:1px solid #edf0f3"><span class="small">'+edEsc(x.from||k)+' → '+target+'</span><button class="btn sm" type="button" onclick="edRemoveRule(\''+field+'\',\''+encodeURIComponent(k)+'\')">Desfazer</button></div>';}).join(''):'<span class="small muted">Nenhuma correção ativa neste campo.</span>';
}
function edRenderValues(){
  const field=document.getElementById('ed-field')?.value||'authors',q=edNorm(document.getElementById('ed-search')?.value||''),box=document.getElementById('ed-values-table'),dl=document.getElementById('ed-datalist'),all=edValues(field),vals=all.filter(([v])=>!q||edNorm(v).includes(q));
  if(dl)dl.innerHTML=all.slice(0,2000).map(([v,n])=>'<option value="'+edEsc(v)+'">'+n+' ocorrência(s)</option>').join('');if(!box)return;
  box.innerHTML='<thead><tr><th>Valor encontrado</th><th class="n">Ocorrências</th><th>Usado como</th><th></th></tr></thead><tbody>'+vals.slice(0,100).map(([v,n])=>{const rr=edCurrentRule(field,v),now=rr?(rr.remove?'REMOVIDO':rr.to):v;return '<tr><td>'+edEsc(v)+'</td><td class="n">'+n+'</td><td>'+edEsc(now)+'</td><td><button class="btn sm" type="button" onclick="edPick(\''+encodeURIComponent(v)+'\')">Editar</button></td></tr>';}).join('')+'</tbody>';
}
function edFieldChanged(){const a=document.getElementById('ed-from'),b=document.getElementById('ed-to'),s=document.getElementById('ed-search');if(a)a.value='';if(b)b.value='';if(s)s.value='';edRenderValues();edRenderRules();}
function edEnsureUI(){
  if(typeof CORPUS==='undefined'||!CORPUS)return;const host=document.getElementById('data-summary');if(!host)return;let card=document.getElementById('ed-card');
  if(!card){card=document.createElement('div');card.id='ed-card';card.className='card';card.innerHTML='<div class="charthead"><div><h3>Editar nomes e termos</h3><div class="lead">Corrija autores, revistas, palavras-chave, países, instituições e outros campos sem abrir o CSV. Ao aplicar, gráficos, estatísticas, redes e mapas mudam imediatamente. O arquivo original fica intacto.</div></div><button class="btn sm" type="button" onclick="edClearRules()">Limpar correções</button></div>'+
    '<div class="grid2" style="grid-template-columns:220px 1fr;gap:12px;margin-top:12px"><div class="field"><label>O que deseja corrigir?</label><select id="ed-field" onchange="edFieldChanged()">'+Object.entries(ED_FIELDS).map(([k,v])=>'<option value="'+k+'">'+v.label+'</option>').join('')+'</select></div><div class="field"><label>Buscar na lista</label><input id="ed-search" placeholder="digite parte do nome ou termo" oninput="edRenderValues()"></div></div>'+
    '<div class="grid2"><div class="field"><label>Valor atual</label><input id="ed-from" list="ed-datalist" placeholder="ex.: Brazil"><datalist id="ed-datalist"></datalist></div><div class="field"><label>Trocar por</label><input id="ed-to" placeholder="ex.: Brasil"></div></div>'+
    '<div class="actions"><button class="btn primary" type="button" onclick="edSetRule(false)">Aplicar e atualizar tudo agora</button><button class="btn" type="button" onclick="edSetRule(true)">Excluir este valor das análises</button></div>'+
    '<div class="small muted" style="margin-top:8px">Ex.: Brazil → Brasil; duas grafias do mesmo autor → um único nome; abreviação de periódico → nome completo; palavra-chave genérica → excluir.</div>'+
    '<div class="grid2" style="margin-top:16px;align-items:start"><div><b class="small">Valores encontrados</b><div class="tscroll" style="max-height:380px;margin-top:6px"><table class="t" id="ed-values-table"></table></div></div><div><b class="small">Correções ativas</b><div id="ed-rules" style="margin-top:6px"></div></div></div>';
    const cards=host.querySelectorAll(':scope > .card');if(cards.length>1)host.insertBefore(card,cards[1]);else host.appendChild(card);
  }
  edRenderValues();edRenderRules();
}
function edEnsureShortcut(){
  const actions=document.querySelector('.topbar .actions');if(!actions||document.getElementById('ed-shortcut'))return;
  const b=document.createElement('button');b.id='ed-shortcut';b.className='btn';b.type='button';b.textContent='Editar nomes e termos';b.onclick=edGoEditor;actions.prepend(b);
}
async function edGoEditor(){
  if(typeof showTab==='function')showTab('dados');
  if((typeof CORPUS==='undefined'||!CORPUS)&&typeof reloadRaw==='function'&&PROJ?.file?.path){try{await reloadRaw();}catch(e){console.warn(e);}}
  setTimeout(()=>{edRenderUI();document.getElementById('ed-card')?.scrollIntoView({behavior:'smooth',block:'start'});},120);
}
function edRenderUI(){try{edEnsureShortcut();edEnsureUI();}catch(e){console.warn('Editor UI:',e);}}
function edDecodeSaved(){
  if(typeof RESULTS!=='undefined'&&RESULTS&&RESULTS.__json){try{RESULTS=JSON.parse(RESULTS.__json);}catch(e){console.error('Resultados salvos inválidos',e);}}
}
function edFirestoreSafeSlim(rawSlim){
  return function(R){const c=rawSlim(R);return {__json:JSON.stringify(c),__encoding:'json-v1',version:c.version||''};};
}
function edInstall(){
  if(ED_INSTALLED)return;if(typeof computeAll!=='function'||typeof renderCorpusUI!=='function'||typeof buildCorpus!=='function'||typeof renderAll!=='function')return setTimeout(edInstall,50);ED_INSTALLED=true;
  ED_RAW_COMPUTE=computeAll;computeAll=function(){edPrepareCorpus();return ED_RAW_COMPUTE();};
  ED_RAW_RENDER_CORPUS=renderCorpusUI;renderCorpusUI=function(){const x=ED_RAW_RENDER_CORPUS();setTimeout(edRenderUI,0);return x;};
  ED_RAW_BUILD=buildCorpus;buildCorpus=function(rows){edResetBase();return ED_RAW_BUILD(rows);};
  ED_RAW_RENDER_ALL=renderAll;renderAll=function(){edDecodeSaved();const x=ED_RAW_RENDER_ALL();setTimeout(edRenderUI,0);return x;};
  if(typeof slimResults==='function'){const rawSlim=slimResults;slimResults=edFirestoreSafeSlim(rawSlim);}
  setTimeout(edRenderUI,0);
}
window.edSetRule=edSetRule;window.edRemoveRule=edRemoveRule;window.edClearRules=edClearRules;window.edPick=edPick;window.edRenderValues=edRenderValues;window.edFieldChanged=edFieldChanged;window.edGoEditor=edGoEditor;
setTimeout(edInstall,0);
