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
assert.equal((app.innerHTML.match(/<table /g)||[]).length, 2);
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
