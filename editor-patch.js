/* Editor universal da Sala Bibliométrica.
   É injetado dentro do script principal da aplicação, sem criar novas tags <script>.
   Não altera o CSV bruto: aplica regras salvas no projeto sobre uma cópia lógica do corpus. */

const ED_FIELDS = {
  authors:{label:'Autores',array:true},
  journal:{label:'Periódicos',array:false},
  keywords:{label:'Palavras-chave',array:true},
  kwplus:{label:'Keywords Plus',array:true},
  countries:{label:'Países',array:true},
  institutions:{label:'Instituições',array:true},
  area:{label:'Áreas de pesquisa',array:true},
  lang:{label:'Idiomas',array:false},
  doctype:{label:'Tipos de documento',array:false}
};
let ED_BASE = null;
let ED_BASE_KEY = '';
let ED_RAW_COMPUTE = null;
let ED_RAW_RENDER_CORPUS = null;
let ED_RAW_BUILD = null;
let ED_INSTALLED = false;

function edClone(v){ try{return structuredClone(v);}catch(e){return JSON.parse(JSON.stringify(v));} }
function edNorm(v){ return String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[’'"`´]/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim(); }
function edEsc(v){ return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function edRuleStore(){
  if(typeof PROJ==='undefined' || !PROJ) return {};
  if(!PROJ.normalizationRules || typeof PROJ.normalizationRules!=='object') PROJ.normalizationRules={};
  Object.keys(ED_FIELDS).forEach(f=>{ if(!PROJ.normalizationRules[f] || typeof PROJ.normalizationRules[f]!=='object') PROJ.normalizationRules[f]={}; });
  return PROJ.normalizationRules;
}
function edCorpusKey(){
  if(typeof CORPUS==='undefined' || !CORPUS) return '';
  const pid=(typeof PROJ!=='undefined' && PROJ && PROJ.id)||'';
  const head=(CORPUS.records||[]).slice(0,8).map(r=>String(r.title||'')+'@'+String(r.year||'')).join('|');
  return pid+'#'+(CORPUS.records||[]).length+'#'+head;
}
function edResetBase(){ ED_BASE=null; ED_BASE_KEY=''; }
function edCaptureBase(){
  if(typeof CORPUS==='undefined' || !CORPUS) return;
  const key=edCorpusKey();
  if(!ED_BASE || ED_BASE_KEY!==key){ ED_BASE=edClone(CORPUS.records||[]); ED_BASE_KEY=key; }
}
function edResolve(field,value){
  const rules=edRuleStore();
  const row=rules[field] && rules[field][edNorm(value)];
  if(row===undefined) return value;
  if(typeof row==='string') return row;
  if(row && typeof row==='object') return row.remove ? '' : String(row.to??'');
  return value;
}
function edApplyRecord(rec){
  const r=edClone(rec);
  for(const [field,cfg] of Object.entries(ED_FIELDS)){
    if(cfg.array){
      const a=Array.isArray(r[field])?r[field]:[];
      r[field]=[...new Set(a.map(v=>String(edResolve(field,v)).trim()).filter(Boolean))];
    }else{
      r[field]=String(edResolve(field,r[field]??'')).trim();
    }
  }
  return r;
}
function edPrepareCorpus(){
  if(typeof CORPUS==='undefined' || !CORPUS) return;
  edCaptureBase();
  CORPUS.records=(ED_BASE||[]).map(edApplyRecord);
}
function edValues(field){
  if(typeof CORPUS==='undefined' || !CORPUS) return [];
  edCaptureBase();
  const src=ED_BASE||CORPUS.records||[], cfg=ED_FIELDS[field], m=new Map();
  if(!cfg) return [];
  for(const r of src){
    const vals=cfg.array ? (Array.isArray(r[field])?r[field]:[]) : [r[field]];
    for(const v of vals){ const s=String(v??'').trim(); if(s) m.set(s,(m.get(s)||0)+1); }
  }
  return [...m.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'pt-BR'));
}
function edCurrentRule(field,value){
  const r=edRuleStore()[field]?.[edNorm(value)];
  if(r===undefined) return null;
  if(typeof r==='string') return {from:value,to:r,remove:false};
  return r;
}
function edPersistRules(){
  if(typeof PROJ==='undefined'||!PROJ||typeof updateProj!=='function') return Promise.resolve();
  return Promise.resolve(updateProj({normalizationRules:edClone(PROJ.normalizationRules||{})})).catch(e=>console.warn('Falha ao salvar padronização:',e));
}
function edRecompute(message){
  if(typeof CORPUS==='undefined'||!CORPUS||!ED_RAW_COMPUTE) return;
  edPrepareCorpus();
  ED_RAW_COMPUTE();
  if(typeof renderAll==='function') renderAll();
  if(ED_RAW_RENDER_CORPUS) ED_RAW_RENDER_CORPUS();
  edRenderUI();
  if(typeof saveResults==='function') Promise.resolve(saveResults()).catch(()=>{});
  const mapTab=document.getElementById('tab-mapa');
  const mode=document.getElementById('map-mode');
  if(mapTab && !mapTab.classList.contains('hidden') && mode?.value==='world' && typeof mapFromCorpus==='function'){
    try{mapFromCorpus();}catch(e){console.warn(e);}
  }
  if(typeof toast==='function' && message) toast(message);
}
async function edSetRule(remove){
  const field=document.getElementById('ed-field')?.value;
  const from=document.getElementById('ed-from')?.value?.trim();
  const to=document.getElementById('ed-to')?.value?.trim();
  if(!field||!from){ if(typeof toast==='function')toast('Escolha o valor que deseja corrigir.'); return; }
  if(!remove && !to){ if(typeof toast==='function')toast('Informe como o valor deve ficar.'); return; }
  const rules=edRuleStore();
  rules[field][edNorm(from)]={from,to:remove?'':to,remove:!!remove,updatedAt:new Date().toISOString()};
  await edPersistRules();
  edRecompute(remove?'Valor removido da análise.':'Correção aplicada e análises recalculadas.');
}
async function edRemoveRule(field,key){
  const rules=edRuleStore();
  if(rules[field]) delete rules[field][decodeURIComponent(key)];
  await edPersistRules();
  edRecompute('Correção desfeita.');
}
async function edClearRules(){
  if(!confirm('Remover todas as correções deste projeto? O arquivo original não será alterado.')) return;
  PROJ.normalizationRules={}; edRuleStore();
  await edPersistRules();
  edRecompute('Todas as correções foram removidas.');
}
function edPick(encoded){
  const v=decodeURIComponent(encoded);
  const a=document.getElementById('ed-from'), b=document.getElementById('ed-to');
  if(a)a.value=v; if(b)b.value=v;
  b?.focus(); b?.select();
}
function edRenderRules(){
  const box=document.getElementById('ed-rules'); if(!box) return;
  const field=document.getElementById('ed-field')?.value||'authors';
  const rows=Object.entries(edRuleStore()[field]||{});
  box.innerHTML=rows.length ? rows.map(([k,r])=>{
    const x=typeof r==='string'?{from:k,to:r,remove:false}:r;
    const target=x.remove?'<em>removido da análise</em>':'<b>'+edEsc(x.to||'')+'</b>';
    return '<div style="display:flex;gap:8px;align-items:center;justify-content:space-between;padding:7px 0;border-bottom:1px solid #edf0f3"><span class="small">'+edEsc(x.from||k)+' → '+target+'</span><button class="btn sm" type="button" onclick="edRemoveRule(\''+field+'\',\''+encodeURIComponent(k)+'\')">Desfazer</button></div>';
  }).join('') : '<span class="small muted">Nenhuma correção ativa neste campo.</span>';
}
function edRenderValues(){
  const field=document.getElementById('ed-field')?.value||'authors';
  const q=edNorm(document.getElementById('ed-search')?.value||'');
  const box=document.getElementById('ed-values-table'), dl=document.getElementById('ed-datalist');
  const vals=edValues(field).filter(([v])=>!q||edNorm(v).includes(q));
  if(dl) dl.innerHTML=edValues(field).slice(0,2000).map(([v,n])=>'<option value="'+edEsc(v)+'">'+n+' ocorrência(s)</option>').join('');
  if(!box)return;
  box.innerHTML='<thead><tr><th>Valor encontrado</th><th class="n">Ocorrências</th><th>Como está sendo usado</th><th></th></tr></thead><tbody>'+vals.slice(0,80).map(([v,n])=>{
    const rr=edCurrentRule(field,v); const now=rr?(rr.remove?'REMOVIDO':rr.to):v;
    return '<tr><td>'+edEsc(v)+'</td><td class="n">'+n+'</td><td>'+edEsc(now)+'</td><td><button class="btn sm" type="button" onclick="edPick(\''+encodeURIComponent(v)+'\')">Editar</button></td></tr>';
  }).join('')+'</tbody>';
}
function edFieldChanged(){
  const a=document.getElementById('ed-from'), b=document.getElementById('ed-to'), s=document.getElementById('ed-search');
  if(a)a.value=''; if(b)b.value=''; if(s)s.value='';
  edRenderValues(); edRenderRules();
}
function edEnsureUI(){
  if(typeof CORPUS==='undefined'||!CORPUS) return;
  const host=document.getElementById('data-summary'); if(!host) return;
  let card=document.getElementById('ed-card');
  if(!card){
    card=document.createElement('div'); card.id='ed-card'; card.className='card';
    card.innerHTML='<div class="charthead"><div><h3>Editar e padronizar os dados</h3><div class="lead">Corrija nomes, periódicos, palavras-chave, países, instituições e outros campos sem abrir o CSV. Ao aplicar, gráficos, estatísticas, redes, mapas e exportações são recalculados imediatamente. O arquivo original fica intacto.</div></div><button class="btn sm" type="button" onclick="edClearRules()">Limpar todas as correções</button></div>'+
      '<div class="grid2" style="grid-template-columns:220px 1fr;gap:12px;margin-top:12px"><div class="field"><label>Campo</label><select id="ed-field" onchange="edFieldChanged()">'+Object.entries(ED_FIELDS).map(([k,v])=>'<option value="'+k+'">'+v.label+'</option>').join('')+'</select></div><div class="field"><label>Filtrar valores</label><input id="ed-search" placeholder="digite parte do nome ou termo" oninput="edRenderValues()"></div></div>'+
      '<div class="grid2" style="margin-top:4px"><div class="field"><label>Valor encontrado</label><input id="ed-from" list="ed-datalist" placeholder="ex.: Brazil"><datalist id="ed-datalist"></datalist></div><div class="field"><label>Padronizar como</label><input id="ed-to" placeholder="ex.: Brasil"></div></div>'+
      '<div class="actions"><button class="btn primary" type="button" onclick="edSetRule(false)">Aplicar e recalcular agora</button><button class="btn" type="button" onclick="edSetRule(true)">Remover este valor da análise</button></div>'+
      '<div class="small muted" style="margin-top:8px">Exemplos: Brazil → Brasil; duas grafias do mesmo autor → um único nome; abreviação de periódico → nome completo; palavra-chave indesejada → remover.</div>'+
      '<div class="grid2" style="margin-top:16px;align-items:start"><div><b class="small">Valores encontrados no arquivo</b><div class="tscroll" style="max-height:360px;margin-top:6px"><table class="t" id="ed-values-table"></table></div></div><div><b class="small">Correções ativas</b><div id="ed-rules" style="margin-top:6px"></div></div></div>';
    const cards=host.querySelectorAll(':scope > .card');
    if(cards.length>1) host.insertBefore(card,cards[1]); else host.appendChild(card);
  }
  edRenderValues(); edRenderRules();
}
function edRenderUI(){ try{edEnsureUI();}catch(e){console.warn('Editor UI:',e);} }
function edInstall(){
  if(ED_INSTALLED) return;
  if(typeof computeAll!=='function' || typeof renderCorpusUI!=='function' || typeof buildCorpus!=='function') return setTimeout(edInstall,50);
  ED_INSTALLED=true;
  ED_RAW_COMPUTE=computeAll;
  computeAll=function(){ edPrepareCorpus(); return ED_RAW_COMPUTE(); };
  ED_RAW_RENDER_CORPUS=renderCorpusUI;
  renderCorpusUI=function(){ const x=ED_RAW_RENDER_CORPUS(); setTimeout(edRenderUI,0); return x; };
  ED_RAW_BUILD=buildCorpus;
  buildCorpus=function(rows){ edResetBase(); return ED_RAW_BUILD(rows); };
  setTimeout(edRenderUI,0);
}
setTimeout(edInstall,0);
