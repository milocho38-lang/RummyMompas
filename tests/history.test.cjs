const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const handlers = {};
const app = { innerHTML: '', addEventListener: (type, cb) => handlers[type] = cb };
const storage = new Map();
const context = vm.createContext({console, Intl, Date, Map, Set,
  document: { querySelector: () => app },
  localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k,v) => storage.set(k,v), removeItem: k => storage.delete(k) },
  window: { scrollTo(){} }, setTimeout, clearTimeout });
vm.runInContext(readFileSync(require('node:path').join(__dirname, '../js/app.js'), 'utf8'), context);
const run = code => vm.runInContext(code, context);
run(`var fixture = { id: 1, finished: true, finishedAt: '2025-12-31T23:00:00-05:00', players: ['Ana', 'Luis'], pointValue: 100, roundValue: 1000, rounds: [{winner:'Ana',points:{Ana:0,Luis:15}}] };`);
assert.equal(run('historyGameYear(fixture)'), '2025');
assert.equal(run('historyGameYear({createdAt:"2026-01-01T05:00:00Z"})'), '2026');
assert.equal(run('historyGameYear({})'), null);
assert.equal(run('historyGameYear({finishedAt:"invalid"})'), null);
assert.equal(run('historicalStats([]).length'), 0);
assert.equal(run('historicalStats([{...fixture,finished:false}]).length'), 0);
assert.equal(run('historicalStats([{...fixture,rounds:[]}]).length'), 0);
assert.equal(run('historicalStats([fixture,fixture])[0].games'), 1);
assert.equal(run('historicalStats([fixture])[0].average'), 1);
assert.equal(run('historicalStats([fixture])[1].average'), 2);
assert.equal(run('historicalStats([fixture])[0].exact'), 2500);
assert.equal(run('historicalStats([fixture])[0].mompas'), 3000);
assert.equal(run('historicalStats([fixture]).reduce((a,b)=>a+b.mompas,0)'), 0);
run(`var other = {...fixture,id:2,finishedAt:'2026-04-01T00:00:00Z',rounds:[{winner:'Luis',points:{Ana:15,Luis:0}}]};`);
assert.equal(run('historicalStats([fixture,other])[0].average'), 1.5);
assert.equal(run('historicalStats([fixture,other])[0].mompas'), 0);
run(`var tie = {...fixture,id:3,rounds:[{winner:'Ana',points:{Ana:0,Luis:15}},{winner:'Luis',points:{Ana:15,Luis:0}}]};`);
assert.equal(run('historicalStats([tie]).every(r=>r.average===1)'), true);
const before = run('JSON.stringify(fixture)');
run('historicalStats([fixture])');
assert.equal(run('JSON.stringify(fixture)'), before);
run('history=[fixture,other]; screen="history"; render()');
assert.equal((app.innerHTML.match(/<table /g)||[]).length, 4);
assert.match(app.innerHTML, /General · todos los años/);
const storageBefore = JSON.stringify([...storage]);
handlers.change({target:{id:'history-year',value:'2025'}});
assert.match(app.innerHTML, /1 partidas · 2025/);
assert.equal(run('history.length'), 2);
handlers.change({target:{id:'history-year',value:'all'}});
assert.match(app.innerHTML, /2 partidas · General/);
assert.equal(JSON.stringify([...storage]), storageBefore);
run('history=[]; render()');
assert.match(app.innerHTML, /Todavía no hay partidas/);
assert.doesNotMatch(app.innerHTML, /NaN|Infinity/);
// Different participation counts must remain per-player, not total-period counts.
run(`var third = {...fixture,id:4,finishedAt:'2026-05-01T12:00:00Z',players:['Ana','Pedro'],rounds:[{winner:'Pedro',points:{Ana:10,Pedro:0}}]}; history=[fixture,other,third]; historyYear='all'; render()`);
function assertPlayerCounts(expected) {
  const tables = [...app.innerHTML.matchAll(/<table class="score-table">([\s\S]*?)<\/table>/g)];
  assert.equal(tables.length, 2);
  for (const [,table] of tables) {
    assert.match(table, /<th>Partidas<br>jugadas<\/th>/);
    for (const [name,count] of Object.entries(expected)) assert.ok(table.includes(`<td>${name}</td><td>${count}</td>`));
  }
}
assertPlayerCounts({Ana:3,Luis:2,Pedro:1});
handlers.change({target:{id:'history-year',value:'2025'}});
assertPlayerCounts({Ana:1,Luis:1});
assert.doesNotMatch(app.innerHTML, /<td>Pedro<\/td>/);
handlers.change({target:{id:'history-year',value:'2026'}});
assertPlayerCounts({Ana:2,Luis:1,Pedro:1});
handlers.change({target:{id:'history-year',value:'all'}});
assertPlayerCounts({Ana:3,Luis:2,Pedro:1});
console.log('All checks passed, including per-player counts in both tables for General, 2025 and 2026.');
// All per-game presentations share standings without mutating the player/input order.
run(`var rankedFixture = {...fixture,id:70,players:['Luis','Pedro','Ana'],rounds:[{winner:'Ana',points:{Luis:30,Pedro:10,Ana:0}}]}; game=rankedFixture; history=[]; selectedHistoryId=null;`);
const originalGame = run('JSON.stringify(game)');
assert.equal(run('getStandings().map(r=>r.player).join(",")'), 'Ana,Pedro,Luis');
assert.equal(run('getStandings().map(r=>r.rank).join(",")'), '1,2,3');
function assertOrder(html, names) {
 let previous=-1;
 for (const name of names) {const index=html.indexOf(name);assert.ok(index>previous, `Expected ${name} in ranking order`);previous=index;}
}
const active=run('renderGame()');
assertOrder(active.match(/<tbody>([\s\S]*?)<\/tbody>/)[1], ['Ana','Pedro','Luis']);
const results=run('renderResults()');
assertOrder(results.match(/balance-list">([\s\S]*?)<\/details>/)[1], ['Ana','Pedro','Luis']);
assertOrder(results.match(/<tbody>([\s\S]*?)<\/tbody>/)[1], ['Ana','Pedro','Luis']);
assert.equal(run('JSON.stringify(game)'),originalGame);
run('screen="round";roundDraft=null;renderRound()');
handlers.input({target:{type:'number',dataset:{playerIndex:'0'},value:'42'}});
assert.equal(run('roundDraft.points.Luis'),'42');
assert.equal(run('roundDraft.points.Ana'),'');
assert.match(run('renderRound()'),/data-player-index="0"/);
assert.equal(run('game.players.join(",")'),'Luis,Pedro,Ana');
assert.equal(run('getStandings({...game,rounds:[]}).map(r=>r.rank).join(",")'),'1,1,1');
assert.equal(run('getStandings(tie).map(r=>r.rank).join(",")'),'1,1');
assert.equal(run('getStandings({...game,roundValue:0,pointValue:0,rounds:[{winner:"Pedro",points:{Luis:30,Pedro:0,Ana:10}}]}).map(r=>r.player).join(",")'),'Pedro,Ana,Luis');
// Capture export drawing and ensure complete ties show the same position.
const draws=[];
const paint=new Proxy({measureText:s=>({width:String(s).length*10}),createLinearGradient:()=>({addColorStop(){}}),fillText:(...args)=>draws.push(args)}, {get:(o,k)=>o[k]??(()=>{})});
context.document.createElement=()=>({getContext:()=>paint});
run('createResultCanvas(tie)');
assert.deepEqual(draws.filter(x=>x[1]===92 && x[0]!=='#').map(x=>x[0]),['1','1']);
console.log('Ranking checks passed: active/final/history/export, ties and tiebreakers, original order and input mapping preserved.');

if (process.env.RUMMY_VISUAL_HTML) {
 const fs=require('node:fs'),path=require('node:path');
 const css=fs.readFileSync(path.join(__dirname,'../css/styles.css'),'utf8');
 fs.writeFileSync(process.env.RUMMY_VISUAL_HTML,`<!doctype html><meta charset="utf-8"><style>${css} body{display:flex;align-items:flex-start;gap:24px;padding:16px;min-width:1050px}.qa{flex:none;width:390px}.qa.wide{width:600px} h1{font-size:18px}</style><div class="qa"><h1>Móvil 390px · Datos ficticios</h1>${active}</div><div class="qa wide"><h1>Escritorio 600px · Datos ficticios</h1>${results.replaceAll('<details class=', '<details open class=')}</div>`);
}

// Chronological cumulative chart rankings, absence, ties, duplicates, and annual reset.
run(`history=[third,other,fixture]; var chart=historyRankingSeries(history);`);
assert.equal(run('chart.games.map(g=>g.id).join(",")'),'1,2,4');
assert.equal(run('chart.players.find(p=>p.player==="Pedro").points.length'),1);
assert.equal(run('chart.players.find(p=>p.player==="Pedro").points[0].index'),2);
assert.equal(run('chart.players.find(p=>p.player==="Luis").points.length'),3);
assert.equal(run('chart.players.find(p=>p.player==="Ana").points[1].averageRank'),1);
assert.equal(run('chart.players.find(p=>p.player==="Luis").points[1].averageRank'),1);
assert.equal(run('chart.players.find(p=>p.player==="Ana").points[1].moneyRank'),1);
assert.equal(run('historyRankingSeries([fixture,fixture,{...other,finished:false},{...other,finishedAt:"bad"}]).games.length'),1);
assert.equal(run('historyRankingSeries([]).players.length'),0);
assert.equal(run('historyRankingSeries([other,third]).players.find(p=>p.player==="Luis").points[0].averageRank'),1);
assert.equal(run('historyRankingSeries([other,third]).players.find(p=>p.player==="Ana").points[0].averageRank'),2);
assert.match(run('renderRankingChart(chart,"moneyRank","Dinero")'),/Puesto en el ranking acumulado/);
assert.match(run('renderRankingChart(chart,"moneyRank","Dinero")'),/—/);
console.log('Chart checks passed: chronological cumulative ranks, ties, absence, deduplication and period reset.');
if (process.env.RUMMY_VISUAL_HTML) {
 const fs=require('node:fs');
 run('history=[fixture,other,third];historyYear="all"');
 fs.appendFileSync(process.env.RUMMY_VISUAL_HTML,`<div class="qa"><h1>Histórico y gráficas · 390px</h1>${run('renderHistory()')}</div>`);
}
