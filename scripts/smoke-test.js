// Test automatique : vérifie que les pages principales fonctionnent.
process.env.DATABASE_PATH = require('path').join(require('os').tmpdir(), `waribook-test-${Date.now()}.db`);
const assert = require('assert');
const app = require('../src/server');

(async () => {
  const server = app.listen(0);
  const base = `http://localhost:${server.address().port}`;
  let cookie = '';
  const req = async (path, opts = {}) => {
    const res = await fetch(base + path, { redirect: 'manual', ...opts, headers: { cookie, ...(opts.headers || {}) } });
    const sc = res.headers.getSetCookie?.() || [];
    if (sc.length) cookie = sc.map((c) => c.split(';')[0]).join('; ');
    return res;
  };
  const form = (o) => ({ method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(o).toString() });
  try {
    let r = await req('/'); assert.equal(r.status, 200); assert.match(await r.text(), /Faites-vous payer/);
    r = await req('/app'); assert.equal(r.status, 302);
    r = await req('/inscription', form({ name: 'Test User', email: 'test@ex.com', password: 'motdepasse', business_name: 'Test SARL', phone: '0700000000' }));
    assert.equal(r.status, 302);
    r = await req('/app'); assert.equal(r.status, 200);
    r = await req('/app/clients', form({ name: 'Client A', phone: '0102030405' })); assert.equal(r.status, 302);
    r = await req('/app/factures', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'client_id=1&description=Produit+1&quantity=2&unit_price=10000&description=Produit+2&quantity=1&unit_price=5000' });
    assert.equal(r.status, 302);
    const loc = r.headers.get('location');
    r = await req(loc); const html = await r.text(); assert.match(html, /25 000 FCFA/); assert.match(html, /wa\.me\/2250102030405/);
    const token = html.match(/\/f\/([a-f0-9]{32})/)[1];
    r = await req(loc + '/paiement', form({ amount: '25000', method: 'Wave' })); assert.equal(r.status, 302);
    cookie = '';
    r = await req('/f/' + token); assert.match(await r.text(), /PAYÉE/);
    console.log('✅ Tous les tests sont passés');
  } catch (e) {
    console.error('❌ Échec :', e); process.exitCode = 1;
  } finally { server.close(); }
})();
