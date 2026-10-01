/* Sala Bibliométrica — harmonização universal + mapa Brasil por estados
   Carregado depois do app principal. Não altera o CSV bruto. */
(()=>{
'use strict';

const H_FIELDS = {
  authors:'Autores', keywords:'Palavras-chave', kwplus:'Keywords Plus', journal:'Periódicos',
  countries:'Países', institutions:'Instituições', area:'Áreas de pesquisa', states:'Estados do Brasil'
};
const H_ARRAY_FIELDS = new Set(['authors','keywords','kwplus','countries','institutions','area','states']);
let HARM_RULES = {};
let HARM_BASE = null;
let HARM_PROJECT_ID = null;
let HARM_SUGGESTIONS = [];
let HARM_RENDERING = false;

function hClone(v){ try{return structuredClone(v);}catch(e){return JSON.parse(JSON.stringify(v));} }
function hNorm(v){ return String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[’'"`´]/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim(); }
function hEsc(v){ return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function hSyncProject(){
  const id = (typeof PROJ!=='undefined' && PROJ && PROJ.id) ? PROJ.id : '';
  if(id !== HARM_PROJECT_ID){
    HARM_PROJECT_ID = id;
    HARM_RULES = hClone((typeof PROJ!=='undefined' && PROJ && PROJ.harmonization) || {});
    HARM_BASE = null;
  }
  Object.keys(H_FIELDS).forEach(f=>{ if(!HARM_RULES[f] || typeof HARM_RULES[f]!=='object') HARM_RULES[f]={}; });
}
function hFingerprint(records){ return (records||[]).length+'|'+(records||[]).slice(0,5).map(r=>String(r.title||'')+'@'+String(r.year||'')).join('||'); }
function hRule(field, value){
  const k=hNorm(value), r=HARM_RULES[field]||{};
  return Object.prototype.hasOwnProperty.call(r,k) ? r[k] : value;
}
function hApplyRecord(r){
  const x=hClone(r);
  for(const field of Object.keys(H_FIELDS)){
    if(H_ARRAY_FIELDS.has(field)){
      const arr=Array.isArray(x[field])?x[field]:[];
      x[field]=[...new Set(arr.map(v=>String(hRule(field,v)).trim()).filter(Boolean))];
    }else{
      x[field]=String(hRule(field,x[field]||'')).trim();
    }
  }
  return x;
}
function hApplyCorpus(){
  if(typeof CORPUS==='undefined' || !CORPUS) return;
  hSyncProject();
  if(!HARM_BASE || HARM_BASE.fp!==hFingerprint(CORPUS.records)) HARM_BASE={fp:hFingerprint(CORPUS.records), records:hClone(CORPUS.records)};
  CORPUS.records=HARM_BASE.records.map(hApplyRecord);
}
function hFieldValues(field){
  if(typeof CORPUS==='undefined' || !CORPUS) return [];
  const m=new Map();
  for(const r of CORPUS.records||[]){
    const vals=H_ARRAY_FIELDS.has(field)?(r[field]||[]):[r[field]];
    for(const v of vals){ const s=String(v||'').trim(); if(s)m.set(s,(m.get(s)||0)+1); }
  }
  return [...m.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'pt-BR'));
}
const GEO_EQ = new Map([
  ['brasil','brazil'],['brazil','brazil'],
  ['estados unidos','united states'],['eua','united states'],['usa','united states'],['u s a','united states'],['united states','united states'],['united states of america','united states'],
  ['reino unido','united kingdom'],['uk','united kingdom'],['united kingdom','united kingdom'],['inglaterra','united kingdom'],['england','united kingdom'],
  ['alemanha','germany'],['germany','germany'],['deutschland','germany'],
  ['espanha','spain'],['spain','spain'],['espana','spain'],
  ['franca','france'],['france','france'],
  ['italia','italy'],['italy','italy'],
  ['mexico','mexico'],['argentina','argentina'],['chile','chile'],['colombia','colombia'],['portugal','portugal'],
  ['china','china'],['japao','japan'],['japan','japan'],['india','india']
]);
function hSemantic(v){ const n=hNorm(v); return GEO_EQ.has(n)?'geo:'+GEO_EQ.get(n):'norm:'+n; }
function hFindSuggestions(field){
  const vals=hFieldValues(field), groups=new Map();
  for(const [v,n] of vals){
    const key=(field==='countries'||field==='keywords'||field==='kwplus'||field==='area')?hSemantic(v):'norm:'+hNorm(v);
    if(!groups.has(key))groups.set(key,[]); groups.get(key).push([v,n]);
  }
  return [...groups.values()].filter(g=>g.length>1).map(g=>g.sort((a,b)=>b[1]-a[1])).slice(0,30);
}
async function hPersist(){
  if(typeof PROJ==='undefined'||!PROJ) return;
  PROJ.harmonization=hClone(HARM_RULES);
  try{ if(typeof updateProj==='function') await updateProj({harmonization:hClone(HARM_RULES)}); }catch(e){ console.warn('harmonization save',e); }
}
function hRecompute(msg){
  try{
    hApplyCorpus();
    if(typeof computeAll==='function') computeAll.__raw ? computeAll.__raw() : computeAll();
    if(typeof renderAll==='function') renderAll();
    if(typeof saveResults==='function') Promise.resolve(saveResults()).catch(()=>{});
    hRender();
    if(typeof toast==='function' && msg) toast(msg);
    const ta=document.getElementById('map-ta'); if(ta?.dataset.source==='corpus' && typeof mapFromCorpus==='function') mapFromCorpus();
  }catch(e){ console.error(e); if(typeof toast==='function')toast('Não foi possível recalcular: '+e.message); }
}
function hApplyRule(){
  const field=document.getElementById('harm-field')?.value, src=document.getElementById('harm-source')?.value?.trim(), dst=document.getElementById('harm-target')?.value?.trim();
  if(!field||!src||!dst){ if(typeof toast==='function')toast('Escolha o valor encontrado e informe como ele deve ficar.'); return; }
  hSyncProject(); HARM_RULES[field][hNorm(src)]=dst;
  hPersist(); hRecompute('Correção aplicada em toda a análise.');
}
function hRemoveRule(field,key){ hSyncProject(); delete HARM_RULES[field]?.[key]; hPersist(); hRecompute('Correção removida.'); }
function hResetRules(){
  if(!confirm('Remover todas as correções deste projeto? O CSV original não será alterado.')) return;
  hSyncProject(); Object.keys(H_FIELDS).forEach(f=>HARM_RULES[f]={}); hPersist(); hRecompute('Correções removidas.');
}
function hUseSuggestion(i){
  const g=HARM_SUGGESTIONS[i]; if(!g?.length)return;
  const field=document.getElementById('harm-field').value, canonical=g[0][0];
  hSyncProject();
  g.forEach(([v])=>{ if(hNorm(v)!==hNorm(canonical) || v!==canonical) HARM_RULES[field][hNorm(v)]=canonical; });
  HARM_RULES[field][hNorm(canonical)]=canonical;
  hPersist(); hRecompute('Variações unificadas em “'+canonical+'”.');
}
function hFillValues(){
  const field=document.getElementById('harm-field')?.value||'authors', dl=document.getElementById('harm-values');
  if(!dl)return;
  const vals=hFieldValues(field).slice(0,1500);
  dl.innerHTML=vals.map(([v,n])=>'<option value="'+hEsc(v)+'">'+n+' ocorrência(s)</option>').join('');
  const src=document.getElementById('harm-source'), dst=document.getElementById('harm-target');
  if(src){ src.value=''; src.onchange=()=>{ if(dst&&!dst.value)dst.value=src.value; }; }
  if(dst)dst.value='';
  hRenderRules(); hRenderSuggestions();
}
function hRenderRules(){
  const box=document.getElementById('harm-rules'); if(!box)return;
  const field=document.getElementById('harm-field')?.value||'authors'; hSyncProject();
  const rows=Object.entries(HARM_RULES[field]||{});
  box.innerHTML=rows.length?rows.map(([k,v])=>'<span class="pill" style="margin:3px 4px 3px 0">'+hEsc(k)+' → <b>'+hEsc(v)+'</b> <button type="button" aria-label="remover" style="border:0;background:none;cursor:pointer;color:#b23a3a" onclick="harmRemoveRule(\''+field+'\',\''+encodeURIComponent(k)+'\')">×</button></span>').join(''):'<span class="small muted">Nenhuma correção manual neste campo.</span>';
}
function hRenderSuggestions(){
  const box=document.getElementById('harm-suggestions'); if(!box)return;
  const field=document.getElementById('harm-field')?.value||'authors'; HARM_SUGGESTIONS=hFindSuggestions(field);
  if(!HARM_SUGGESTIONS.length){ box.innerHTML='<span class="small muted">Nenhuma variação óbvia detectada automaticamente. Você ainda pode corrigir qualquer termo acima.</span>'; return; }
  box.innerHTML=HARM_SUGGESTIONS.map((g,i)=>'<div style="display:flex;gap:8px;align-items:center;justify-content:space-between;padding:7px 0;border-bottom:1px solid #edf0f3"><span class="small">'+g.map(([v,n])=>'<b>'+hEsc(v)+'</b> ('+n+')').join(' · ')+'</span><button class="btn sm" type="button" onclick="harmUseSuggestion('+i+')">Unir</button></div>').join('');
}
function hEnsureUI(){
  const host=document.getElementById('data-summary'); if(!host||!CORPUS)return;
  let card=document.getElementById('harm-card');
  if(!card){
    card=document.createElement('div'); card.id='harm-card'; card.className='card';
    card.innerHTML=`<div class="charthead"><div><h3>Padronizar antes de gerar os gráficos</h3><div class="lead">Corrija aqui nomes equivalentes sem abrir o CSV. A mudança vale imediatamente para tabelas, leis bibliométricas, redes, mapas e exportações; o arquivo bruto continua intacto.</div></div><button class="btn sm" type="button" onclick="harmResetRules()">Limpar correções</button></div>
      <div class="grid2" style="grid-template-columns:220px 1fr;gap:12px;margin-top:12px">
        <div class="field"><label>Campo</label><select id="harm-field" onchange="harmFillValues()">${Object.entries(H_FIELDS).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></div>
        <div class="field"><label>Valor encontrado</label><input id="harm-source" list="harm-values" placeholder="ex.: brazil"><datalist id="harm-values"></datalist></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr auto;gap:10px;align-items:end">
        <div class="field"><label>Padronizar como</label><input id="harm-target" placeholder="ex.: brasil"></div>
        <button class="btn primary" type="button" onclick="harmApplyRule()">Aplicar e refazer análises</button>
      </div>
      <div style="margin-top:12px"><b class="small">Correções ativas neste campo</b><div id="harm-rules" style="margin-top:5px"></div></div>
      <div style="margin-top:14px"><b class="small">Variações equivalentes detectadas</b><div class="small muted" style="margin:2px 0 6px">Inclui diferenças de caixa, acento e pontuação e equivalências geográficas claras, como Brasil/Brazil e EUA/USA/United States.</div><div id="harm-suggestions"></div></div>`;
    const cards=host.querySelectorAll(':scope > .card');
    if(cards.length>1) host.insertBefore(card,cards[1]); else host.appendChild(card);
  }
  hFillValues();
}
function hRender(){
  if(HARM_RENDERING)return; HARM_RENDERING=true;
  try{ hEnsureUI(); }finally{ HARM_RENDERING=false; }
}

const BR_STATES = [
 ['AC','Acre'],['AL','Alagoas'],['AP','Amapá'],['AM','Amazonas'],['BA','Bahia'],['CE','Ceará'],['DF','Distrito Federal'],['ES','Espírito Santo'],['GO','Goiás'],['MA','Maranhão'],['MT','Mato Grosso'],['MS','Mato Grosso do Sul'],['MG','Minas Gerais'],['PA','Pará'],['PB','Paraíba'],['PR','Paraná'],['PE','Pernambuco'],['PI','Piauí'],['RJ','Rio de Janeiro'],['RN','Rio Grande do Norte'],['RS','Rio Grande do Sul'],['RO','Rondônia'],['RR','Roraima'],['SC','Santa Catarina'],['SP','São Paulo'],['SE','Sergipe'],['TO','Tocantins']
];
const BR_STATE_BY_NORM = new Map(); BR_STATES.forEach(([uf,n])=>{BR_STATE_BY_NORM.set(hNorm(uf),n);BR_STATE_BY_NORM.set(hNorm(n),n);});
function hStateName(v){ return BR_STATE_BY_NORM.get(hNorm(v))||''; }
function hExtractStates(text){
  const out=new Set(), src=String(text||''); if(!src)return [];
  const blocks=src.split(';');
  for(const b of blocks){
    if(!/\b(brasil|brazil)\b/i.test(b))continue;
    const nb=hNorm(b);
    for(const [uf,name] of BR_STATES){
      if(nb.includes(hNorm(name))){out.add(name);continue;}
      const re=new RegExp('(?:^|[,;\\s()\\-])'+uf+'(?:$|[,;\\s()\\-0-9])','i'); if(re.test(b))out.add(name);
    }
  }
  return [...out];
}
function hAttachStates(corpus){
  (corpus?.records||[]).forEach(r=>{ const found=hExtractStates([r.addresses,r.affil].filter(Boolean).join('; ')); r.states=[...new Set([...(r.states||[]),...found])]; });
  return corpus;
}
function hStateCounts(){
  if(typeof CORPUS==='undefined'||!CORPUS)return [];
  const m=new Map(); (CORPUS.records||[]).forEach(r=>(r.states||[]).forEach(s=>{const n=hStateName(s)||s;m.set(n,(m.get(n)||0)+1);}));
  return [...m.entries()].sort((a,b)=>b[1]-a[1]);
}
function hBrazilianRecords(){ return (CORPUS?.records||[]).filter(r=>(r.countries||[]).some(c=>['brazil','brasil'].includes(hNorm(c)))); }
const INST_STATE_CACHE=new Map();
async function hLookupInstitutionState(name){
  const key=hNorm(name); if(INST_STATE_CACHE.has(key))return INST_STATE_CACHE.get(key);
  let st='';
  try{
    const u='https://api.openalex.org/institutions?search='+encodeURIComponent(name)+'&filter=country_code:BR&per-page=3&select='+encodeURIComponent('display_name,geo,country_code');
    const ctl=new AbortController(), timer=setTimeout(()=>ctl.abort(),8000);
    const res=await fetch(u,{signal:ctl.signal,headers:{Accept:'application/json'}}); clearTimeout(timer);
    if(res.ok){ const j=await res.json(), candidates=j.results||[]; const q=hNorm(name); const best=candidates.sort((a,b)=>{const an=hNorm(a.display_name),bn=hNorm(b.display_name);return (bn===q?3:bn.includes(q)||q.includes(bn)?2:0)-(an===q?3:an.includes(q)||q.includes(an)?2:0);})[0]; st=hStateName(best?.geo?.region||''); }
  }catch(e){}
  INST_STATE_CACHE.set(key,st); return st;
}
async function hEnrichStatesOnDemand(){
  const recs=hBrazilianRecords(); if(!recs.length){ if(typeof toast==='function')toast('Não há documentos brasileiros identificados neste corpus.'); return; }
  const names=[...new Set(recs.flatMap(r=>r.institutions||[]).filter(Boolean))];
  if(!names.length){ if(typeof toast==='function')toast('Esta base não trouxe instituições suficientes para localizar os estados.'); return; }
  const btn=document.getElementById('map-state-enrich'); if(btn){btn.disabled=true;btn.textContent='Localizando estados…';}
  let next=0,done=0;
  async function worker(){while(true){const i=next++;if(i>=names.length)return;await hLookupInstitutionState(names[i]);done++;if(btn)btn.textContent='Localizando '+done+'/'+names.length;}}
  await Promise.all(Array.from({length:Math.min(4,names.length)},worker));
  let added=0;
  recs.forEach(r=>{ const states=[...new Set((r.institutions||[]).map(n=>INST_STATE_CACHE.get(hNorm(n))).filter(Boolean))]; if(states.length){r.states=states;added++;} });
  if(HARM_BASE){ const byTitle=new Map(recs.map(r=>[hNorm(r.title)+'|'+r.year,r.states||[]])); HARM_BASE.records.forEach(r=>{const s=byTitle.get(hNorm(r.title)+'|'+r.year);if(s)r.states=hClone(s);}); }
  hRecompute(); mapFromCorpus();
  if(typeof toast==='function')toast(added+' documento(s) com estado brasileiro localizado.');
}
function hMapButton(){ return [...document.querySelectorAll('#tab-mapa button')].find(b=>/Usar (países|estados) do corpus/i.test(b.textContent||'')); }
function hUpdateMapUI(){
  const mode=document.getElementById('map-mode')?.value||'world', btn=hMapButton(), lead=document.querySelector('#tab-mapa .card > .lead');
  if(btn)btn.textContent=mode==='world'?'Usar países do corpus':'Usar estados do corpus';
  if(lead)lead.textContent=mode==='world'?'No modo Mundo, os países vêm das afiliações do corpus. Você também pode colar uma lista própria.':'No modo Brasil, a Sala lê UF/estado das afiliações brasileiras. Se a base não trouxer endereço, você pode colar a lista ou tentar localizar os estados pelas instituições.';
}
function hRenderStateWarning(extra=''){
  const box=document.getElementById('map-warn'); if(!box)return;
  const canTry=(typeof CORPUS!=='undefined'&&CORPUS&&hBrazilianRecords().some(r=>(r.institutions||[]).length));
  box.innerHTML='<div class="msg warn"><b>Nenhum estado brasileiro foi identificado no corpus.</b> Algumas bases não exportam UF/endereço. '+(canTry?'<button id="map-state-enrich" class="btn sm" type="button" onclick="harmEnrichStates()">Tentar localizar pelas instituições</button> ':'')+'Você também pode colar “SP 12”, “Mato Grosso 8” etc.'+(extra?'<br>'+hEsc(extra):'')+'</div>';
}

if(typeof buildCorpus==='function'){
  const rawBuild=buildCorpus;
  buildCorpus=function(rows){ HARM_BASE=null; const c=rawBuild(rows); return hAttachStates(c); };
}
if(typeof computeAll==='function'){
  const rawCompute=computeAll;
  function wrappedCompute(){ hSyncProject(); hApplyCorpus(); const r=rawCompute(); setTimeout(hRender,0); return r; }
  wrappedCompute.__raw=rawCompute;
  computeAll=wrappedCompute;
}
if(typeof renderCorpusUI==='function'){
  const rawRenderCorpus=renderCorpusUI;
  renderCorpusUI=function(){ const r=rawRenderCorpus(); setTimeout(hRender,0); return r; };
}
if(typeof reloadRaw==='function'){
  const rawReload=reloadRaw;
  reloadRaw=async function(){ HARM_BASE=null; return await rawReload(); };
}
if(typeof mapModeChange==='function'){
  mapModeChange=function(){
    const mode=document.getElementById('map-mode').value, ta=document.getElementById('map-ta'); ta.value=''; ta.dataset.source='corpus';
    document.getElementById('map-lbl').textContent=mode==='world'?'Dados (país e valor, um por linha)':'Dados (estado ou sigla e valor, um por linha)';
    hUpdateMapUI(); if(typeof CORPUS!=='undefined'&&CORPUS) mapFromCorpus(); else renderMap();
  };
}
if(typeof mapFromCorpus==='function'){
  mapFromCorpus=function(){
    if(typeof CORPUS==='undefined'||!CORPUS){ if(typeof toast==='function')toast('Sem corpus'); return; }
    const mode=document.getElementById('map-mode').value, ta=document.getElementById('map-ta');
    let rows=[];
    if(mode==='world') rows=(typeof RESULTS!=='undefined'&&RESULTS?.countries)?RESULTS.countries:[];
    else rows=hStateCounts();
    ta.dataset.source='corpus'; ta.value=rows.map(x=>x[0]+'\t'+x[1]).join('\n');
    hUpdateMapUI(); renderMap();
    if(mode==='brasil'&&!rows.length) hRenderStateWarning();
  };
}

window.harmApplyRule=hApplyRule;
window.harmRemoveRule=(field,key)=>hRemoveRule(field,decodeURIComponent(key));
window.harmResetRules=hResetRules;
window.harmFillValues=hFillValues;
window.harmUseSuggestion=hUseSuggestion;
window.harmEnrichStates=hEnrichStatesOnDemand;

setTimeout(()=>{
  const ta=document.getElementById('map-ta'); if(ta) ta.addEventListener('input',e=>{ if(e.isTrusted)ta.dataset.source='manual'; });
  hUpdateMapUI(); hSyncProject(); hRender();
},0);

})();
