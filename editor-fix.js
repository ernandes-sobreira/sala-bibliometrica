/* Reparo complementar do editor: preserva/recupera enriquecimento SciELO após recarga do CSV bruto. */
(()=>{
  let FIX_RAW_RELOAD=null, FIX_RAW_OPEN=null;
  const repaired=new Set();

  async function fixRebuildSciELO(){
    if(typeof CORPUS==='undefined'||!CORPUS||CORPUS.format!=='SciELO') return;
    if(typeof enrichSciELOCorpus!=='function') return;
    const total=(CORPUS.records||[]).length;
    if(!total) return;
    try{
      if(typeof setMsg==='function') setMsg('data-msg','<span class="spinner"></span>Recuperando países, instituições, áreas e citações do SciELO…','info');
      await enrichSciELOCorpus(CORPUS,(done,n,ok,fail)=>{
        if(typeof setMsg==='function') setMsg('data-msg','<span class="spinner"></span>Reconstruindo metadados SciELO: '+done+'/'+n+' · '+ok+' encontrados · '+fail+' não encontrados','info');
      });

      // O editor pode ter capturado o CSV bruto como base. Após o enriquecimento,
      // refazemos a base lógica e reaplicamos as regras de padronização do projeto.
      if(typeof edResetBase==='function') edResetBase();
      if(typeof edPrepareCorpus==='function') edPrepareCorpus();

      if(typeof ED_RAW_COMPUTE==='function' && ED_RAW_COMPUTE) ED_RAW_COMPUTE();
      else if(typeof computeAll==='function') computeAll();

      if(typeof renderAll==='function') renderAll();
      if(typeof ED_RAW_RENDER_CORPUS==='function' && ED_RAW_RENDER_CORPUS) ED_RAW_RENDER_CORPUS();
      else if(typeof renderCorpusUI==='function') renderCorpusUI();
      if(typeof adaptSciELOUI==='function') adaptSciELOUI();
      if(typeof edRenderUI==='function') edRenderUI();

      const ep=CORPUS.enrichment;
      if(typeof setMsg==='function') setMsg('data-msg','Metadados SciELO recuperados'+(ep?' · '+ep.matched+'/'+ep.total+' artigos encontrados no OpenAlex':'')+'. Suas correções continuam aplicadas.','ok');
      if(typeof toast==='function') toast('Países, instituições e áreas do SciELO foram reconstruídos.');
    }catch(e){
      console.error('Falha ao reconstruir SciELO:',e);
      if(typeof setMsg==='function') setMsg('data-msg','Não foi possível reconstruir os metadados SciELO: '+String(e.message||e),'warn');
    }
  }

  function fixNeedsRepair(){
    if(typeof RESULTS==='undefined'||!RESULTS) return false;
    const f=String(RESULTS.format||'').toLowerCase();
    if(f!=='scielo') return false;
    const countries=RESULTS.countries?.length||0;
    const institutions=RESULTS.institutions?.length||0;
    const areas=RESULTS.areas?.length||0;
    return countries===0 || institutions===0 || areas===0;
  }

  function installFix(){
    if(typeof reloadRaw!=='function' || typeof openProject!=='function') return setTimeout(installFix,80);
    if(reloadRaw.__scieloFixed) return;

    FIX_RAW_RELOAD=reloadRaw;
    reloadRaw=async function(){
      await FIX_RAW_RELOAD();
      if(typeof CORPUS!=='undefined' && CORPUS?.format==='SciELO') await fixRebuildSciELO();
    };
    reloadRaw.__scieloFixed=true;

    FIX_RAW_OPEN=openProject;
    openProject=async function(id){
      const out=await FIX_RAW_OPEN(id);
      const pid=(typeof PROJ!=='undefined'&&PROJ?.id)||id;
      if(fixNeedsRepair() && !repaired.has(pid) && PROJ?.file?.path){
        repaired.add(pid);
        setTimeout(()=>reloadRaw().catch(e=>console.warn('Auto-reparo SciELO:',e)),180);
      }
      return out;
    };

    // Se a página já abriu um projeto antes deste patch instalar, também repara uma vez.
    const pid=(typeof PROJ!=='undefined'&&PROJ?.id)||'';
    if(pid && fixNeedsRepair() && !repaired.has(pid) && PROJ?.file?.path){
      repaired.add(pid);
      setTimeout(()=>reloadRaw().catch(e=>console.warn('Auto-reparo SciELO:',e)),250);
    }
  }

  window.fixRebuildSciELO=fixRebuildSciELO;
  setTimeout(installFix,0);
})();