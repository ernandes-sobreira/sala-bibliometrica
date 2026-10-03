/* Visualização da aba "Redes de cooperação" da Sala Bibliométrica.
   Injetado no script principal pelo carregador (index.html).
   Substitui apenas o desenho (drawNet). Não altera buildNet, renderNetwork,
   labelPropagation, KPIs, tabelas nem exportações. Se algo falhar aqui,
   o desenho original (drawNetLegacy) é usado. */

const NETV = {layout: 'compact', palette: 'default', state: null, ro: null, timer: null};

const NETV_LAYOUTS = {
  compact: {d0: 24, d1: 30, inter: 1.7, charge: -85,  range: 240, gravity: .065, cluster: .14, pad: 3, seed: 34, maxK: 1.7},
  medium:  {d0: 36, d1: 48, inter: 1.8, charge: -140, range: 400, gravity: .038, cluster: .09, pad: 4, seed: 50, maxK: 1.7},
  spread:  {d0: 54, d1: 74, inter: 1.9, charge: -260, range: 760, gravity: .018, cluster: .05, pad: 6, seed: 76, maxK: 1.7}
};

const NETV_PALETTES = {
  default:  {label: 'Padrão', colors: null},
  contrast: {label: 'Contraste forte', colors: ['#e6194b','#3cb44b','#4363d8','#f58231','#911eb4','#17a2b8','#f032e6','#9a6324','#000075','#808000','#800000','#469990']},
  pastel:   {label: 'Pastel', colors: ['#8dd3c7','#fb8072','#80b1d3','#fdb462','#b3de69','#bc80bd','#fccde5','#bebada','#ccebc5','#ffed6f']},
  viridis:  {label: 'Viridis', ramp: t => d3.interpolateViridis(.02 + .93*t)},
  cbsafe:   {label: 'Colorblind safe', colors: ['#0072B2','#E69F00','#009E73','#CC79A7','#56B4E9','#D55E00','#F0E442','#000000']},
  warm:     {label: 'Quente', ramp: t => d3.interpolateRgbBasis(['#fde047','#fb923c','#ef4444','#be185d','#7c2d12'])(t)},
  cool:     {label: 'Fria', ramp: t => d3.interpolateRgbBasis(['#99f6e4','#22d3ee','#3b82f6','#4338ca','#7e22ce','#134e4a'])(t)}
};

/* Uma comunidade = uma cor. As maiores comunidades recebem primeiro as cores mais distintas. */
function netvColors(nodes, comm){
  const size = new Map();
  nodes.forEach(n => { const c = comm.get(n.id); size.set(c, (size.get(c) || 0) + 1); });
  const ranked = [...size.keys()].sort((a,b) => size.get(b) - size.get(a) || a - b);
  const K = ranked.length, pal = NETV_PALETTES[NETV.palette] || NETV_PALETTES.default, out = new Map(), used = new Set();
  ranked.forEach((c, r) => {
    let col;
    if(pal.ramp){
      // sequência de van der Corput: as maiores comunidades ficam nos pontos mais distantes da rampa
      let t = 0, f = .5; for(let i = r; i > 0; i >>= 1){ if(i & 1) t += f; f /= 2; }
      col = pal.ramp(K > 1 ? t : .5);
    } else {
      const list = pal.colors || PAL, cycle = Math.floor(r / list.length), base = d3.color(list[r % list.length]);
      // paleta esgotada: repete o matiz com outra luminosidade, para a cor continuar única por comunidade
      if(cycle === 0) col = base;
      else { const h = d3.hsl(base), step = Math.ceil(cycle/2), dark = cycle % 2 === 1 && h.l > .32; h.l = dark ? Math.max(.12, h.l - .17*step) : Math.min(.9, h.l + (h.l < .32 ? .26 : .15)*step); col = h; }
    }
    let hex = d3.color(col).formatHex();
    for(let t = 0; used.has(hex) && t < 14; t++){ const h = d3.hsl(hex); h.l = h.l + .07 > .92 ? .14 + .05*t : h.l + .07; if(isNaN(h.h)) h.s = 0; hex = h.formatHex(); }
    used.add(hex); out.set(c, hex);
  });
  return out;
}

function netvEnsureControls(){
  if(document.getElementById('net-layout')) return;
  const labels = document.getElementById('net-labels'); if(!labels) return;
  const field = labels.closest('.field'); if(!field) return;
  const mk = (label, id, opts, cur, fn) => {
    const d = document.createElement('div'); d.className = 'field';
    d.innerHTML = '<label>' + label + '</label><select id="' + id + '">' + opts.map(([v,t]) => '<option value="' + v + '"' + (v === cur ? ' selected' : '') + '>' + t + '</option>').join('') + '</select>';
    d.querySelector('select').addEventListener('change', fn);
    return d;
  };
  const lay = mk('Layout', 'net-layout', [['compact','Compacta'],['medium','Média'],['spread','Espalhada']], NETV.layout, ev => { NETV.layout = ev.target.value; netvRedraw(); });
  const pal = mk('Paleta de cores', 'net-palette', Object.entries(NETV_PALETTES).map(([k,p]) => [k, p.label]), NETV.palette, ev => { NETV.palette = ev.target.value; netvRecolor(); });
  field.after(lay, pal);
  // Rótulos: redesenha só os rótulos, sem recalcular a rede
  labels.removeAttribute('onchange'); labels.onchange = null;
  labels.addEventListener('change', () => { if(NETV.state){ netvFit(); netvLabels(); NETV.state.place(); } else renderNetwork(); });
}

function netvClusterForce(comm, strength){
  let ns = [];
  function f(alpha){
    const c = new Map();
    for(const n of ns){ const k = comm.get(n.id); let o = c.get(k); if(!o){ o = {x: 0, y: 0, n: 0}; c.set(k, o); } o.x += n.x; o.y += n.y; o.n++; }
    for(const n of ns){ const o = c.get(comm.get(n.id)); if(o.n < 2) continue; n.vx += (o.x/o.n - n.x) * strength * alpha; n.vy += (o.y/o.n - n.y) * strength * alpha; }
  }
  f.initialize = _ => { ns = _; };
  return f;
}

function drawNet(nodes, edges, deg, comm, lblOpt){
  try{ netvDraw(nodes, edges, deg, comm); }
  catch(e){
    console.warn('Rede: o novo desenho falhou, usando o desenho original.', e);
    NETV.state = null;
    drawNetLegacy(nodes, edges, deg, comm, lblOpt);
  }
}

function netvRedraw(){
  if(!NET_CUR){ if(typeof RESULTS !== 'undefined' && RESULTS) renderNetwork(); return; }
  drawNet(NET_CUR.nodes, NET_CUR.edges, NET_CUR.deg, NET_CUR.comm, document.getElementById('net-labels').value);
}

function netvDraw(nodes, edges, deg, comm){
  netvEnsureControls();
  const box = document.getElementById('netbox'), W = box.clientWidth || 900, H = box.clientHeight || 560;
  const svg = d3.select('#netsvg').attr('viewBox', `0 0 ${W} ${H}`).attr('xmlns', 'http://www.w3.org/2000/svg'); svg.selectAll('*').remove();
  if(NET_SIM) NET_SIM.stop();
  NETV.state = null;
  if(!nodes.length){ svg.append('text').attr('x', W/2).attr('y', H/2).attr('text-anchor', 'middle').attr('fill', '#5b6b7a').text('Nenhum nó atende ao mínimo de documentos.'); return; }
  const P = NETV_LAYOUTS[NETV.layout] || NETV_LAYOUTS.compact;
  const bg = svg.append('rect').attr('width', W).attr('height', H).attr('fill', '#fff');
  const g = svg.append('g');
  const maxDeg = Math.max(1, ...nodes.map(n => deg.get(n.id))), maxW = Math.max(1, ...edges.map(e => e.w));
  const rOf = n => 4 + 14 * Math.sqrt(deg.get(n.id)/maxDeg);
  const links = edges.map(e => ({source: e.s, target: e.t, w: e.w, inter: comm.get(e.s) !== comm.get(e.t)}));

  // posição inicial determinística: comunidades em espiral a partir do centro, a maior no meio
  const size = new Map(); nodes.forEach(n => { const c = comm.get(n.id); size.set(c, (size.get(c) || 0) + 1); });
  const ranked = [...size.keys()].sort((a,b) => size.get(b) - size.get(a) || a - b), rank = new Map(ranked.map((c,i) => [c,i])), seen = new Map();
  const GA = Math.PI * (3 - Math.sqrt(5));
  nodes.forEach(n => {
    const c = comm.get(n.id), i = rank.get(c), m = seen.get(c) || 0; seen.set(c, m + 1);
    n.x = P.seed * Math.sqrt(i) * Math.cos(i*GA) + 6 * Math.sqrt(m) * Math.cos(m*GA);
    n.y = P.seed * Math.sqrt(i) * Math.sin(i*GA) + 6 * Math.sqrt(m) * Math.sin(m*GA);
    n.vx = 0; n.vy = 0; n.fx = null; n.fy = null;
  });

  // gravidade real em direção ao centro (formato oval acompanhando a proporção da área)
  const asp = Math.sqrt(Math.max(1, Math.min(1.8, W/H)));
  const byId = new Map(nodes.map(n => [n.id, n]));
  NET_SIM = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links).id(d => d.id)
      .distance(d => (P.d0 + P.d1*(1 - d.w/maxW)) * (d.inter ? P.inter : 1) + .5*(rOf(byId.get(d.source.id || d.source)) + rOf(byId.get(d.target.id || d.target))))
      .strength(d => (.3 + .7*(d.w/maxW)) * (d.inter ? .35 : 1)))
    .force('charge', d3.forceManyBody().strength(P.charge).distanceMax(P.range))
    .force('x', d3.forceX(0).strength(P.gravity/asp))
    .force('y', d3.forceY(0).strength(P.gravity*asp))
    .force('cluster', netvClusterForce(comm, P.cluster))
    .force('collide', d3.forceCollide(d => rOf(d) + P.pad).iterations(2))
    .stop();
  for(let i = 0; i < 320; i++) NET_SIM.tick();

  const link = g.append('g').attr('class', 'netv-links').selectAll('line').data(links).join('line').attr('stroke', '#9aa7b3').attr('stroke-opacity', .5).attr('stroke-width', d => .6 + 3 * (d.w/maxW));
  const node = g.append('g').attr('class', 'netv-nodes').selectAll('circle').data(nodes).join('circle').attr('r', rOf).attr('stroke-width', 1).style('cursor', 'grab');
  const labelLayer = g.append('g').attr('class', 'netv-labels');
  const zoom = d3.zoom().scaleExtent([.15, 8]).on('zoom', ev => g.attr('transform', ev.transform));
  svg.call(zoom);

  const S = NETV.state = {nodes, deg, comm, rOf, svg, bg, g, link, node, labelLayer, zoom, W, H, k: 1, rs: 1, maxW, label: null, P};
  const place = () => {
    link.attr('x1', d => d.source.x).attr('y1', d => d.source.y).attr('x2', d => d.target.x).attr('y2', d => d.target.y);
    node.attr('cx', d => d.x).attr('cy', d => d.y);
    if(S.label) S.label.attr('transform', d => `translate(${d.x},${d.y})`);
  };
  S.place = place;

  // tooltip (reaproveita o #tip já existente)
  const tip = document.getElementById('tip');
  node.on('mousemove', (ev, d) => {
    tip.innerHTML = '<b>' + esc(d.id) + '</b><br>Comunidade: ' + (comm.get(d.id) + 1) + '<br>Documentos: ' + fmt(d.docs) + '<br>Ligações (grau): ' + fmt(deg.get(d.id));
    tip.style.whiteSpace = 'normal'; tip.style.maxWidth = '340px'; tip.style.lineHeight = '1.45';
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let x = ev.clientX + 12, y = ev.clientY + 12;
    if(x + tw > window.innerWidth - 6) x = Math.max(6, ev.clientX - 12 - tw);
    if(y + th > window.innerHeight - 6) y = Math.max(6, ev.clientY - 12 - th);
    tip.style.left = x + 'px'; tip.style.top = y + 'px'; tip.style.opacity = 1;
  }).on('mouseleave', () => { tip.style.opacity = 0; tip.style.whiteSpace = ''; tip.style.maxWidth = ''; tip.style.lineHeight = ''; });

  NET_SIM.on('tick', place);
  node.call(d3.drag()
    .on('start', (ev,d) => { if(!ev.active) NET_SIM.alphaTarget(.15).restart(); d.fx = d.x; d.fy = d.y; })
    .on('drag', (ev,d) => { d.fx = ev.x; d.fy = ev.y; })
    .on('end', (ev,d) => { if(!ev.active) NET_SIM.alphaTarget(0); d.fx = null; d.fy = null; }));
  NET_SIM.on('end', () => netvLabels());

  netvRecolor();
  netvFit();
  netvLabels();
  place();

  if(!NETV.ro && typeof ResizeObserver !== 'undefined'){
    NETV.ro = new ResizeObserver(() => { clearTimeout(NETV.timer); NETV.timer = setTimeout(netvResize, 140); });
    NETV.ro.observe(box);
  }
}

function netvRecolor(){
  const S = NETV.state; if(!S) return;
  const col = netvColors(S.nodes, S.comm);
  S.node.attr('fill', d => col.get(S.comm.get(d.id))).attr('stroke', d => d3.color(col.get(S.comm.get(d.id))).darker(.7).formatHex());
}

/* Enquadra a rede na área disponível, qualquer que seja o tamanho da tela. */
function netvFit(){
  const S = NETV.state; if(!S) return;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  S.nodes.forEach(n => { const r = S.rOf(n); x0 = Math.min(x0, n.x - r); x1 = Math.max(x1, n.x + r); y0 = Math.min(y0, n.y - r); y1 = Math.max(y1, n.y + r); });
  const hasLabels = document.getElementById('net-labels').value !== '0';
  const padX = hasLabels ? Math.min(S.W * .2, 110) : 24, padY = 26;
  const bw = Math.max(1, x1 - x0), bh = Math.max(1, y1 - y0);
  const k = Math.max(.15, Math.min(S.P.maxK, (S.W - 2*padX)/bw, (S.H - 2*padY)/bh));
  S.k = k;
  // tamanho dos nós na tela quase constante: o zoom de enquadramento não os encolhe nem infla demais
  S.rs = Math.max(.8, Math.min(1.2, k)) / k;
  S.node.attr('r', d => S.rOf(d) * S.rs).attr('stroke-width', 1 / k);
  S.link.attr('stroke-width', d => (.6 + 3 * (d.w/S.maxW)) * S.rs);
  S.svg.call(S.zoom.transform, d3.zoomIdentity.translate(S.W/2 - k*(x0 + x1)/2, S.H/2 - k*(y0 + y1)/2).scale(k));
}

/* Rótulos: prioridade por grau, texto abreviado, posição escolhida entre 8 candidatas
   para não cruzar o próprio nó e reduzir sobreposição com outros rótulos e nós. */
function netvLabels(){
  const S = NETV.state; if(!S) return;
  const opt = document.getElementById('net-labels').value, nLab = opt === 'all' ? S.nodes.length : +opt;
  const chosen = [...S.nodes].sort((a,b) => S.deg.get(b.id) - S.deg.get(a.id) || b.docs - a.docs).slice(0, nLab);
  const fs = 11 / S.k, gap = 3 / S.k, h = fs * 1.15;
  let cx = 0, cy = 0; S.nodes.forEach(n => { cx += n.x; cy += n.y; }); cx /= S.nodes.length; cy /= S.nodes.length;
  const circles = S.nodes.map(n => ({n, r: S.rOf(n) * S.rs}));
  const placed = [];
  const ov = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  chosen.forEach(n => {
    const txt = cut(n.id, 26), w = txt.length * fs * .56, r = S.rOf(n) * S.rs, q = r * .72 + gap;
    const E  = {a: 'start',  dx: r + gap,  dy: fs*.35,          x0: n.x + r + gap,     y0: n.y - h/2};
    const Wd = {a: 'end',    dx: -r - gap, dy: fs*.35,          x0: n.x - r - gap - w, y0: n.y - h/2};
    const N  = {a: 'middle', dx: 0,        dy: -r - gap - fs*.25, x0: n.x - w/2,       y0: n.y - r - gap - h};
    const So = {a: 'middle', dx: 0,        dy: r + gap + fs*.85,  x0: n.x - w/2,       y0: n.y + r + gap};
    const NE = {a: 'start',  dx: q,        dy: -q,              x0: n.x + q,           y0: n.y - q - h*.8};
    const SE = {a: 'start',  dx: q,        dy: q + fs*.7,       x0: n.x + q,           y0: n.y + q};
    const NW = {a: 'end',    dx: -q,       dy: -q,              x0: n.x - q - w,       y0: n.y - q - h*.8};
    const SW = {a: 'end',    dx: -q,       dy: q + fs*.7,       x0: n.x - q - w,       y0: n.y + q};
    const right = n.x >= cx, down = n.y >= cy;
    const cands = right ? [E, down ? SE : NE, down ? So : N, down ? NE : SE, down ? N : So, Wd, down ? SW : NW, down ? NW : SW]
                        : [Wd, down ? SW : NW, down ? So : N, down ? NW : SW, down ? N : So, E, down ? SE : NE, down ? NE : SE];
    let best = null, bestCost = Infinity;
    for(let i = 0; i < cands.length; i++){
      const c = cands[i]; c.x1 = c.x0 + w; c.y1 = c.y0 + h;
      let cost = i * fs * .6;
      for(const p of placed){ cost += 3 * ov(c, p); if(cost >= bestCost) break; }
      if(cost < bestCost) for(const o of circles){ if(o.n === n) continue; cost += ov(c, {x0: o.n.x - o.r, x1: o.n.x + o.r, y0: o.n.y - o.r, y1: o.n.y + o.r}); if(cost >= bestCost) break; }
      if(cost < bestCost){ best = c; bestCost = cost; }
    }
    placed.push(best); n._lab = {txt, a: best.a, dx: best.dx, dy: best.dy};
  });
  S.label = S.labelLayer.selectAll('text').data(chosen, d => d.id).join('text')
    .text(d => d._lab.txt).attr('font-size', fs).attr('font-family', 'Inter, system-ui, sans-serif').attr('fill', '#1a2332')
    .attr('paint-order', 'stroke').attr('stroke', '#fff').attr('stroke-width', 3 / S.k).attr('stroke-linejoin', 'round').attr('pointer-events', 'none')
    .attr('text-anchor', d => d._lab.a).attr('x', d => d._lab.dx).attr('y', d => d._lab.dy)
    .attr('transform', d => `translate(${d.x},${d.y})`);
}

function netvResize(){
  const S = NETV.state; if(!S) return;
  const box = document.getElementById('netbox'), W = box.clientWidth, H = box.clientHeight;
  if(!W || !H || (W === S.W && H === S.H)) return;
  S.W = W; S.H = H;
  S.svg.attr('viewBox', `0 0 ${W} ${H}`); S.bg.attr('width', W).attr('height', H);
  netvFit(); netvLabels(); S.place();
}

try{ netvEnsureControls(); }catch(e){ console.warn('Rede: controles de layout/paleta não inseridos.', e); }
