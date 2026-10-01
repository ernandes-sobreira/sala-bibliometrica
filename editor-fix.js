/* Reparo complementar do editor: preserva/recupera enriquecimento SciELO após recarga do CSV bruto. */
(()=>{
  let FIX_RAW_RELOAD=null, FIX_RAW_OPEN=null, FIX_RAW_RENDER=null;
  const repaired=new Set();

  function fixNorm(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();}
  function fixIsSciELO(){
    const vals=[
      (typeof CORPUS!=='undefined'&&CORPUS?.format)||'',
      (typeof RESULTS!=='undefined'&&RESULTS?.format)||'',
      (typeof PROJ!=='undefined'&&PROJ?.file?.format)||'',
      (typeof PROJ!=='undefined'&&PROJ?.base)||''
    ].map(fixNorm);
    return vals.some(v=>v.includes('scielo'));
  }

  async function fixRebuildSciELO(force=false){
    if(typeof CORPUS==='undefined'||!CORPUS) {
      if(typeof reloadRaw==='function'&&PROJ?.file?.path) return reloadRaw();
      return;
    }
    if(!fixIsSciELO()&&!force) return;
    if(typeof enrichSciELOCorpus!=='function') {
      if(typeof toast==='function') toast('O módulo de enriquecimento SciELO não está disponível nesta sessão.');
      return;
    }
    CORPUS.format='SciELO';
    const total=(CORPUS.records||[]).length;
    if(!total) return;
    try{
      if(typeof setMsg==='function') setMsg('data-msg','<span class="spinner"></span>Recuperando países, instituições, áreas e citações do SciELO…','info');
      await enrichSciELOCorpus(CORPUS,(done,n,ok,fail)=>{
        if(typeof setMsg==='function') setMsg('data-msg','<span class="spinner"></span>Reconstruindo metadados SciELO: '+done+'/'+n+' · '+ok+' encontrados · '+fail+' não encontrados','info');
      });

      // Após o enriquecimento, refaz a base lógica do editor e reaplica as regras manuais.
      if(typeof edResetBase==='function') edResetBase();
      if(typeof edPrepareCorpus==='function') edPrepareCorpus();

      if(typeof ED_RAW_COMPUTE==='function' && ED_RAW_COMPUTE) ED_RAW_COMPUTE();
      else if(typeof computeAll==='function') computeAll();

      if(typeof renderAll==='function') renderAll();
      if(typeof ED_RAW_RENDER_CORPUS==='function' && ED_RAW_RENDER_CORPUS) ED_RAW_RENDER_CORPUS();
      else if(typeof renderCorpusUI==='function') renderCorpusUI();
      if(typeof adaptSciELOUI==='function') adaptSciELOUI();
      if(typeof edRenderUI==='function') edRenderUI();
      fixEnsureButton();

      const ep=CORPUS.enrichment;
      if(typeof setMsg==='function') setMsg('data-msg','Metadados SciELO recuperados'+(ep?' · '+ep.matched+'/'+ep.total+' artigos encontrados no OpenAlex':'')+'. Suas correções continuam aplicadas.','ok');
      if(typeof toast==='function') toast('Países, instituições e áreas do SciELO foram reconstruídos.');
      if(typeof saveResults==='function') Promise.resolve(saveResults(true)).catch(e=>console.warn('Não foi possível persistir o reparo:',e));
    }catch(e){
      console.error('Falha ao reconstruir SciELO:',e);
      if(typeof setMsg==='function') setMsg('data-msg','Não foi possível reconstruir os metadados SciELO: '+String(e.message||e),'warn');
      if(typeof toast==='function') toast('Falha ao consultar o enriquecimento SciELO.');
      fixEnsureButton(String(e.message||e));
    }
  }

  function fixNeedsRepair(){
    if(!fixIsSciELO()) return false;
    if(typeof RESULTS==='undefined'||!RESULTS) return true;
    const countries=RESULTS.countries?.length||0;
    const institutions=RESULTS.institutions?.length||0;
    const areas=RESULTS.areas?.length||0;
    return countries===0 || institutions===0 || areas===0;
  }

  function fixEnsureButton(error=''){
    if(!fixIsSciELO()) return;
    const box=document.getElementById('i-paises');
    if(!box) return;
    const empty=fixNeedsRepair();
    if(!empty) return;
    box.innerHTML='<b>Metadados geográficos/institucionais ainda não foram recuperados.</b><br><span class="small muted">O CSV SciELO não traz esses campos completos. A Sala pode reconstruí-los pelo OpenAlex.</span><br><button class="btn sm" style="margin-top:8px" type="button" onclick="fixRebuildSciELO(true)">Reconstruir metadados SciELO agora</button>'+(error?'<div class="small" style="margin-top:6px;color:#b23a3a">Última tentativa: '+String(error).replace(/[&<>]/g,'')+'</div>':'');
  }

  function installFix(){
    if(typeof reloadRaw!=='function' || typeof openProject!=='function' || typeof renderAll!=='function') return setTimeout(installFix,80);
    if(reloadRaw.__scieloFixed) return;

    FIX_RAW_RELOAD=reloadRaw;
    reloadRaw=async function(){
      await FIX_RAW_RELOAD();
      if(fixIsSciELO()) await fixRebuildSciELO(true);
    };
    reloadRaw.__scieloFixed=true;

    FIX_RAW_OPEN=openProject;
    openProject=async function(id){
      const out=await FIX_RAW_OPEN(id);
      const pid=(typeof PROJ!=='undefined'&&PROJ?.id)||id;
      fixEnsureButton();
      if(fixNeedsRepair() && !repaired.has(pid) && PROJ?.file?.path){
        repaired.add(pid);
        setTimeout(()=>reloadRaw().catch(e=>console.warn('Auto-reparo SciELO:',e)),220);
      }
      return out;
    };

    FIX_RAW_RENDER=renderAll;
    renderAll=function(){
      const out=FIX_RAW_RENDER();
      setTimeout(fixEnsureButton,0);
      return out;
    };

    // Se a página já abriu um projeto antes deste patch instalar, repara uma vez.
    const pid=(typeof PROJ!=='undefined'&&PROJ?.id)||'';
    fixEnsureButton();
    if(pid && fixNeedsRepair() && !repaired.has(pid) && PROJ?.file?.path){
      repaired.add(pid);
      setTimeout(()=>reloadRaw().catch(e=>console.warn('Auto-reparo SciELO:',e)),300);
    }
  }

  window.fixRebuildSciELO=fixRebuildSciELO;
  window.fixIsSciELO=fixIsSciELO;
  setTimeout(installFix,0);
})();