/* SciELO metadata enrichment v2: DOI-first Crossref -> OpenAlex, with fallbacks.
   This overrides the earlier title-only enrichment without changing WoS/Scopus/PubMed flows. */

function scv2Norm(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/<[^>]+>/g,' ').replace(/&[a-z]+;/g,' ').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();}
function scv2Tokens(s){const stop=new Set('a o os as um uma de da do das dos e em no na nos nas por para com sem sobre entre ao aos que se the of and in on for to from by with an is are be as at or into using use el la los las del y en un una al this that study analysis assessment case role effect effects'.split(/\s+/));return new Set(scv2Norm(s).split(' ').filter(x=>x.length>2&&!stop.has(x)));}
function scv2Sim(a,b){const A=scv2Tokens(a),B=scv2Tokens(b);if(!A.size||!B.size)return 0;let i=0;A.forEach(x=>{if(B.has(x))i++});const dice=2*i/(A.size+B.size),contain=i/Math.min(A.size,B.size);return Math.max(dice,contain*.96);}
async function scv2Fetch(url,ms=12000){const ctl=new AbortController(),tm=setTimeout(()=>ctl.abort(),ms);try{const r=await fetch(url,{signal:ctl.signal,headers:{Accept:'application/json'}});if(!r.ok)throw new Error('HTTP '+r.status);return await r.json();}finally{clearTimeout(tm);}}
function scv2Year(x){const parts=x?.['published-print']?.['date-parts']||x?.['published-online']?.['date-parts']||x?.issued?.['date-parts'];return Number(parts?.[0]?.[0])||0;}
function scv2CountryName(code){if(!code)return '';try{return new Intl.DisplayNames(['pt-BR'],{type:'region'}).of(String(code).toUpperCase())||code;}catch(e){return code;}}
function scv2CountriesFromText(txt){const n=scv2Norm(txt),out=[];const add=x=>{if(x&&!out.includes(x))out.push(x)};if(/\b(brasil|brazil)\b/.test(n)||/universidade federal|universidade estadual|instituto federal|embrapa|fiocruz|ufmt|ufms|uems|usp|unicamp|unesp|unemat/.test(n))add('Brasil');if(/\bargentina\b/.test(n))add('Argentina');if(/\bchile\b/.test(n))add('Chile');if(/\bcolombia\b/.test(n))add('Colômbia');if(/\bperu\b/.test(n))add('Peru');if(/\bmexico\b/.test(n))add('México');if(/\b(portugal)\b/.test(n))add('Portugal');if(/\b(spain|espana)\b/.test(n))add('Espanha');if(/\b(france|franca)\b/.test(n))add('França');if(/\b(germany|alemanha)\b/.test(n))add('Alemanha');if(/\b(italy|italia)\b/.test(n))add('Itália');if(/\b(united kingdom|england|scotland|uk)\b/.test(n))add('Reino Unido');if(/\b(united states|usa|u s a)\b/.test(n))add('Estados Unidos');if(/\bcanada\b/.test(n))add('Canadá');if(/\bchina\b/.test(n))add('China');if(/\bindia\b/.test(n))add('Índia');if(/\baustralia\b/.test(n))add('Austrália');if(/\bjapan|japao\b/.test(n))add('Japão');return out;}
function scv2TitleTerms(title){return [...scv2Tokens(title)].filter(x=>x.length>=4).slice(0,12);}

async function scv2Crossref(rec){
  const yr=Number(rec.year)||0,filter=yr?('&filter=from-pub-date:'+yr+'-01-01,until-pub-date:'+yr+'-12-31'):'';
  const url='https://api.crossref.org/works?query.bibliographic='+encodeURIComponent(rec.title)+filter+'&rows=6';
  const data=await scv2Fetch(url,12000),items=data?.message?.items||[];
  const ranked=items.map(x=>{const t=Array.isArray(x.title)?x.title[0]:x.title||'';let score=scv2Sim(rec.title,t);if(yr&&scv2Year(x)===yr)score+=.12;return{x,score,title:t};}).sort((a,b)=>b.score-a.score);
  const hit=ranked[0];if(!hit||hit.score<.70)return null;
  const x=hit.x,inst=[],countries=[];
  (x.author||[]).forEach(a=>(a.affiliation||[]).forEach(z=>{if(z?.name){inst.push(z.name);scv2CountriesFromText(z.name).forEach(c=>countries.push(c));}}));
  return{doi:String(x.DOI||'').trim(),title:hit.title,score:hit.score,institutions:[...new Set(inst)],countries:[...new Set(countries)],areas:[...new Set((x.subject||[]).filter(Boolean))],citations:Number(x['is-referenced-by-count'])||0,source:'Crossref'};
}

async function scv2OpenAlexByDOI(doi){
  if(!doi)return null;
  const canonical='https://doi.org/'+doi.replace(/^https?:\/\/doi\.org\//i,'');
  const url='https://api.openalex.org/works?filter=doi:'+encodeURIComponent(canonical)+'&per-page=1';
  const d=await scv2Fetch(url,12000);return d?.results?.[0]||null;
}
async function scv2OpenAlexByTitle(rec){
  const yr=Number(rec.year)||0,filter=yr?('&filter=publication_year:'+yr):'';
  const url='https://api.openalex.org/works?search='+encodeURIComponent(rec.title)+filter+'&per-page=6';
  const d=await scv2Fetch(url,12000),ranked=(d?.results||[]).map(w=>({w,score:scv2Sim(rec.title,w.display_name)+(Number(w.publication_year)===yr?.12:0)})).sort((a,b)=>b.score-a.score);return ranked[0]?.score>=.70?ranked[0].w:null;
}
function scv2FromOpenAlex(w){
  if(!w)return null;const inst=[],countries=[],areas=[],kws=[];
  (w.authorships||[]).forEach(a=>{(a.institutions||[]).forEach(i=>{if(i?.display_name)inst.push(i.display_name);if(i?.country_code)countries.push(scv2CountryName(i.country_code));});(a.countries||[]).forEach(c=>countries.push(scv2CountryName(c)));});
  (w.keywords||[]).forEach(k=>{if(k?.display_name&&(k.score==null||k.score>=.25))kws.push(k.display_name);});
  if(w.primary_topic?.field?.display_name)areas.push(w.primary_topic.field.display_name);
  (w.topics||[]).forEach(t=>{if(t?.field?.display_name)areas.push(t.field.display_name);});
  return{doi:String(w.doi||'').replace(/^https?:\/\/doi\.org\//i,''),institutions:[...new Set(inst.filter(Boolean))],countries:[...new Set(countries.filter(Boolean))],areas:[...new Set(areas.filter(Boolean))].slice(0,8),keywords:[...new Set(kws.filter(Boolean))].slice(0,15),citations:Number(w.cited_by_count)||0,openalexId:w.id||'',referencedWorks:w.referenced_works||[],source:'OpenAlex'};
}

async function enrichOneSciELO(rec){
  let cr=null,oa=null;
  try{cr=await scv2Crossref(rec);}catch(e){console.warn('Crossref SciELO:',e);}
  if(cr?.doi){try{oa=scv2FromOpenAlex(await scv2OpenAlexByDOI(cr.doi));}catch(e){console.warn('OpenAlex DOI:',e);}}
  if(!oa){try{oa=scv2FromOpenAlex(await scv2OpenAlexByTitle(rec));}catch(e){console.warn('OpenAlex título:',e);}}
  const inst=[...(oa?.institutions||[]),...(cr?.institutions||[])],countries=[...(oa?.countries||[]),...(cr?.countries||[])];
  if(!countries.length)inst.forEach(s=>scv2CountriesFromText(s).forEach(c=>countries.push(c)));
  rec.institutions=[...new Set(inst.filter(Boolean))];
  rec.countries=[...new Set(countries.filter(Boolean))];
  rec.area=[...new Set([...(oa?.areas||[]),...(cr?.areas||[])].filter(Boolean))].slice(0,10);
  rec.keywords=(oa?.keywords?.length?oa.keywords:scv2TitleTerms(rec.title));
  rec.citations=Math.max(Number(oa?.citations)||0,Number(cr?.citations)||0,Number(rec.citations)||0);
  rec.doi=oa?.doi||cr?.doi||rec.doi||'';
  rec.openalexId=oa?.openalexId||'';rec.referencedWorks=oa?.referencedWorks||[];
  rec.enriched=!!(oa||cr);rec.enrichmentSource=oa?'OpenAlex + Crossref':cr?'Crossref':'';
  if(!rec.enriched)throw new Error('sem correspondência confiável no Crossref/OpenAlex');
  return rec;
}

async function enrichSciELOCorpus(corpus,onProgress){
  if(typeof dedupeSciELO==='function')corpus.records=dedupeSciELO(corpus.records);
  let ok=0,fail=0,next=0;const total=corpus.records.length;
  async function worker(){while(true){const i=next++;if(i>=total)return;const r=corpus.records[i];try{await enrichOneSciELO(r);ok++;}catch(e){fail++;r.keywords=r.keywords?.length?r.keywords:scv2TitleTerms(r.title);r.enriched=false;r.enrichmentError=String(e.message||e);}if(onProgress)onProgress(ok+fail,total,ok,fail);}}
  await Promise.all(Array.from({length:Math.min(3,total||1)},worker));
  corpus.enrichment={matched:ok,unmatched:fail,total,source:'Crossref + OpenAlex v2'};return corpus;
}
