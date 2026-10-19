// Crée un compte de démonstration avec des clients et des factures.
// Utilisation : npm run seed   → connexion avec demo@waribook.africa / demo1234
require('dotenv').config({ quiet: true });
const bcrypt = require('bcryptjs');
const db = require('../src/db');
const { randomToken, today, addDays } = require('../src/utils');

const email = 'demo@waribook.africa';
db.prepare('DELETE FROM users WHERE email = ?').run(email);
const u = db.prepare(`INSERT INTO users (name, email, password_hash, business_name, phone, city, momo_wave, momo_orange, momo_mtn, invoice_footer)
  VALUES (?,?,?,?,?,?,?,?,?,?)`).run('Awa Koné', email, bcrypt.hashSync('demo1234', 10), 'Boutique Awa Déco', '0700000000', 'Abidjan',
  '07 00 00 00 00', '07 11 11 11 11', '05 22 22 22 22', 'Merci pour votre confiance !').lastInsertRowid;

const clients = [
  ['Maquis Chez Tantie', '0701020304', 'Yopougon'], ['Hôtel Les Palmiers', '0505060708', 'Grand-Bassam'],
  ['M. Traoré Ibrahim', '0102030405', 'Cocody'], ['Pharmacie du Plateau', '0708091011', 'Plateau'],
].map(([name, phone, address]) => db.prepare('INSERT INTO clients (user_id, name, phone, address) VALUES (?,?,?,?)').run(u, name, phone, address).lastInsertRowid);

const t = today();
const data = [
  [0, -70, 'Rideaux sur mesure', 3, 45000, 135000],
  [1, -50, 'Coussins brodés', 20, 8500, 170000],
  [2, -35, 'Tapis berbère 2x3m', 1, 220000, 100000],
  [3, -20, 'Décoration vitrine', 1, 150000, 150000],
  [0, -10, 'Nappes en wax', 12, 6000, 0],
  [2, -3, 'Lampe en bois sculpté', 2, 38000, 0],
];
data.forEach(([ci, offset, desc, q, p, paid], k) => {
  const issue = addDays(t, offset);
  const id = db.prepare(`INSERT INTO invoices (user_id, client_id, number, token, issue_date, due_date, total, amount_paid, created_at)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(u, clients[ci], `FAC-${t.slice(0, 4)}-${String(k + 1).padStart(4, '0')}`, randomToken(),
    issue, addDays(issue, 15), q * p, paid, issue + ' 10:00:00').lastInsertRowid;
  db.prepare('INSERT INTO invoice_items (invoice_id, description, quantity, unit_price) VALUES (?,?,?,?)').run(id, desc, q, p);
  if (paid) db.prepare('INSERT INTO payments (invoice_id, amount, method, paid_at) VALUES (?,?,?,?)').run(id, paid, 'Wave', addDays(issue, 7));
});
console.log('✅ Compte démo créé : demo@waribook.africa / demo1234');
