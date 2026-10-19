const express = require('express');
const db = require('../db');
const {
  today, addDays, randomToken, invoiceStatus, getPlan, whatsappLink, formatMoney, formatDate,
} = require('../utils');

const router = express.Router();

// Toutes les pages /app nécessitent d'être connecté
router.use((req, res, next) => {
  if (!req.user) return res.redirect('/connexion');
  next();
});

function flash(req, type, text) {
  req.session.flash = { type, text };
}

function baseUrl(req) {
  return process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
}

function loadInvoices(userId) {
  return db.prepare(`
    SELECT i.*, c.name AS client_name, c.phone AS client_phone
    FROM invoices i JOIN clients c ON c.id = i.client_id
    WHERE i.user_id = ? ORDER BY i.issue_date DESC, i.id DESC
  `).all(userId).map((inv) => ({ ...inv, realStatus: invoiceStatus(inv) }));
}

function reminderMessage(req, inv, owner) {
  const due = inv.total - inv.amount_paid;
  return `Bonjour ${inv.client_name}, petit rappel de ${owner.business_name} : la facture ${inv.number} ` +
    `d'un montant restant de ${formatMoney(due)} est ${inv.realStatus === 'en_retard' ? 'arrivée à échéance le' : 'à régler avant le'} ` +
    `${formatDate(inv.due_date)}. Vous pouvez la consulter et payer par Mobile Money ici : ${baseUrl(req)}/f/${inv.token} . Merci !`;
}

// ---------- Tableau de bord ----------
router.get('/', (req, res) => {
  const invoices = loadInvoices(req.user.id);
  const active = invoices.filter((i) => i.realStatus !== 'annulee');
  const month = today().slice(0, 7);
  const stats = {
    billed: active.reduce((s, i) => s + i.total, 0),
    collected: active.reduce((s, i) => s + i.amount_paid, 0),
    outstanding: active.reduce((s, i) => s + Math.max(0, i.total - i.amount_paid), 0),
    overdue: active.filter((i) => i.realStatus === 'en_retard').reduce((s, i) => s + (i.total - i.amount_paid), 0),
    overdueCount: active.filter((i) => i.realStatus === 'en_retard').length,
    monthCollected: db.prepare(`
      SELECT COALESCE(SUM(p.amount),0) AS s FROM payments p JOIN invoices i ON i.id = p.invoice_id
      WHERE i.user_id = ? AND substr(p.paid_at,1,7) = ?`).get(req.user.id, month).s,
    clients: db.prepare('SELECT COUNT(*) AS n FROM clients WHERE user_id = ?').get(req.user.id).n,
  };

  // Encaissements des 6 derniers mois (pour le graphique)
  const months = [];
  const d = new Date();
  for (let k = 5; k >= 0; k--) {
    const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - k, 1));
    months.push(m.toISOString().slice(0, 7));
  }
  const rows = db.prepare(`
    SELECT substr(p.paid_at,1,7) AS m, SUM(p.amount) AS s FROM payments p
    JOIN invoices i ON i.id = p.invoice_id WHERE i.user_id = ? GROUP BY m`).all(req.user.id);
  const byMonth = Object.fromEntries(rows.map((r) => [r.m, r.s]));
  const chart = months.map((m) => ({
    label: new Date(m + '-01T00:00:00').toLocaleDateString('fr-FR', { month: 'short' }),
    value: byMonth[m] || 0,
  }));

  const toRemind = active
    .filter((i) => i.realStatus === 'en_retard')
    .slice(0, 5)
    .map((i) => ({ ...i, waLink: whatsappLink(i.client_phone, reminderMessage(req, i, req.user)) }));

  res.render('app/dashboard', {
    title: 'Tableau de bord', stats, chart, recent: invoices.slice(0, 6), toRemind,
    needsSetup: !(req.user.momo_wave || req.user.momo_orange || req.user.momo_mtn || req.user.momo_moov),
  });
});

// ---------- Clients ----------
router.get('/clients', (req, res) => {
  const clients = db.prepare(`
    SELECT c.*,
      (SELECT COALESCE(SUM(total - amount_paid),0) FROM invoices WHERE client_id = c.id AND status != 'annulee') AS balance,
      (SELECT COUNT(*) FROM invoices WHERE client_id = c.id) AS invoice_count
    FROM clients c WHERE c.user_id = ? ORDER BY c.name COLLATE NOCASE`).all(req.user.id);
  res.render('app/clients', { title: 'Clients', clients });
});

router.post('/clients', (req, res) => {
  const { name, phone, email, address } = req.body;
  if (!name || !name.trim()) {
    flash(req, 'error', 'Le nom du client est obligatoire.');
    return res.redirect('/app/clients');
  }
  const plan = getPlan(req.user);
  const count = db.prepare('SELECT COUNT(*) AS n FROM clients WHERE user_id = ?').get(req.user.id).n;
  if (count >= plan.clients) {
    flash(req, 'error', `L'offre ${plan.name} est limitée à ${plan.clients} clients. Passez à l'offre Pro pour continuer.`);
    return res.redirect('/app/abonnement');
  }
  const info = db.prepare('INSERT INTO clients (user_id, name, phone, email, address) VALUES (?, ?, ?, ?, ?)')
    .run(req.user.id, name.trim(), phone || '', email || '', address || '');
  flash(req, 'success', `Client « ${name.trim()} » ajouté.`);
  const back = req.body.redirect === 'facture' ? `/app/factures/nouvelle?client=${info.lastInsertRowid}` : '/app/clients';
  res.redirect(back);
});

router.post('/clients/:id/modifier', (req, res) => {
  const { name, phone, email, address } = req.body;
  db.prepare('UPDATE clients SET name = ?, phone = ?, email = ?, address = ? WHERE id = ? AND user_id = ?')
    .run(name, phone || '', email || '', address || '', req.params.id, req.user.id);
  flash(req, 'success', 'Client mis à jour.');
  res.redirect('/app/clients');
});

router.post('/clients/:id/supprimer', (req, res) => {
  db.prepare('DELETE FROM clients WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  flash(req, 'success', 'Client supprimé (et ses factures).');
  res.redirect('/app/clients');
});

// ---------- Factures ----------
router.get('/factures', (req, res) => {
  const filter = req.query.statut || 'toutes';
  let invoices = loadInvoices(req.user.id);
  if (filter !== 'toutes') invoices = invoices.filter((i) => i.realStatus === filter);
  res.render('app/invoices', { title: 'Factures', invoices, filter });
});

router.get('/factures/nouvelle', (req, res) => {
  const clients = db.prepare('SELECT * FROM clients WHERE user_id = ? ORDER BY name COLLATE NOCASE').all(req.user.id);
  res.render('app/invoice-new', {
    title: 'Nouvelle facture', clients, selectedClient: Number(req.query.client) || null,
    issueDate: today(), dueDate: addDays(today(), 15),
  });
});

router.post('/factures', (req, res) => {
  const plan = getPlan(req.user);
  const month = today().slice(0, 7);
  const monthCount = db.prepare(
    "SELECT COUNT(*) AS n FROM invoices WHERE user_id = ? AND substr(created_at,1,7) = ?"
  ).get(req.user.id, month).n;
  if (monthCount >= plan.invoicesPerMonth) {
    flash(req, 'error', `Vous avez atteint la limite de ${plan.invoicesPerMonth} factures ce mois-ci avec l'offre ${plan.name}.`);
    return res.redirect('/app/abonnement');
  }

  const client = db.prepare('SELECT * FROM clients WHERE id = ? AND user_id = ?').get(req.body.client_id, req.user.id);
  if (!client) {
    flash(req, 'error', 'Choisissez un client.');
    return res.redirect('/app/factures/nouvelle');
  }

  const toArray = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);
  const descs = toArray(req.body.description);
  const qtys = toArray(req.body.quantity);
  const prices = toArray(req.body.unit_price);
  const items = descs
    .map((d, k) => ({
      description: String(d || '').trim(),
      quantity: Math.max(1, parseInt(qtys[k], 10) || 1),
      unit_price: Math.max(0, parseInt(String(prices[k] || '0').replace(/\D/g, ''), 10) || 0),
    }))
    .filter((it) => it.description);

  if (items.length === 0) {
    flash(req, 'error', 'Ajoutez au moins une ligne à la facture.');
    return res.redirect('/app/factures/nouvelle');
  }

  const total = items.reduce((s, it) => s + it.quantity * it.unit_price, 0);
  const year = today().slice(0, 4);
  const last = db.prepare('SELECT number FROM invoices WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(req.user.id);
  const seq = (last ? parseInt(last.number.split('-').pop(), 10) || 0 : 0) + 1;
  const number = `FAC-${year}-${String(seq).padStart(4, '0')}`;

  const create = db.transaction(() => {
    const info = db.prepare(`
      INSERT INTO invoices (user_id, client_id, number, token, issue_date, due_date, notes, total)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      req.user.id, client.id, number, randomToken(), req.body.issue_date || today(),
      req.body.due_date || addDays(today(), 15), req.body.notes || '', total,
    );
    const ins = db.prepare('INSERT INTO invoice_items (invoice_id, description, quantity, unit_price) VALUES (?, ?, ?, ?)');
    items.forEach((it) => ins.run(info.lastInsertRowid, it.description, it.quantity, it.unit_price));
    return info.lastInsertRowid;
  });
  const id = create();
  flash(req, 'success', `Facture ${number} créée. Envoyez-la à votre client par WhatsApp !`);
  res.redirect(`/app/factures/${id}`);
});

function getOwnedInvoice(req) {
  const inv = db.prepare(`
    SELECT i.*, c.name AS client_name, c.phone AS client_phone FROM invoices i
    JOIN clients c ON c.id = i.client_id WHERE i.id = ? AND i.user_id = ?`).get(req.params.id, req.user.id);
  if (inv) inv.realStatus = invoiceStatus(inv);
  return inv;
}

router.get('/factures/:id', (req, res) => {
  const invoice = getOwnedInvoice(req);
  if (!invoice) return res.redirect('/app/factures');
  const items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(invoice.id);
  const payments = db.prepare('SELECT * FROM payments WHERE invoice_id = ? ORDER BY paid_at DESC').all(invoice.id);
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(invoice.client_id);
  const publicUrl = `${baseUrl(req)}/f/${invoice.token}`;
  const sendMsg = `Bonjour ${client.name}, voici votre facture ${invoice.number} de ${req.user.business_name} ` +
    `d'un montant de ${formatMoney(invoice.total)}, à régler avant le ${formatDate(invoice.due_date)}. ` +
    `Consultez-la et payez par Mobile Money ici : ${publicUrl} . Merci pour votre confiance !`;
  res.render('app/invoice-show', {
    title: `Facture ${invoice.number}`, invoice, items, payments, client, publicUrl,
    waSend: whatsappLink(client.phone, sendMsg),
    waRemind: whatsappLink(client.phone, reminderMessage(req, invoice, req.user)),
    today: today(),
  });
});

router.post('/factures/:id/paiement', (req, res) => {
  const invoice = getOwnedInvoice(req);
  if (!invoice) return res.redirect('/app/factures');
  const amount = parseInt(String(req.body.amount || '').replace(/\D/g, ''), 10);
  if (!amount || amount <= 0) {
    flash(req, 'error', 'Montant invalide.');
    return res.redirect(`/app/factures/${invoice.id}`);
  }
  db.transaction(() => {
    db.prepare('INSERT INTO payments (invoice_id, amount, method, reference, paid_at) VALUES (?, ?, ?, ?, ?)')
      .run(invoice.id, amount, req.body.method || 'Espèces', req.body.reference || '', req.body.paid_at || today());
    db.prepare('UPDATE invoices SET amount_paid = amount_paid + ? WHERE id = ?').run(amount, invoice.id);
  })();
  flash(req, 'success', `Paiement de ${formatMoney(amount)} enregistré.`);
  res.redirect(`/app/factures/${invoice.id}`);
});

router.post('/factures/:id/annuler', (req, res) => {
  db.prepare("UPDATE invoices SET status = 'annulee' WHERE id = ? AND user_id = ?").run(req.params.id, req.user.id);
  flash(req, 'success', 'Facture annulée.');
  res.redirect(`/app/factures/${req.params.id}`);
});

router.post('/factures/:id/supprimer', (req, res) => {
  db.prepare('DELETE FROM invoices WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  flash(req, 'success', 'Facture supprimée.');
  res.redirect('/app/factures');
});

// ---------- Paramètres ----------
router.get('/parametres', (req, res) => {
  res.render('app/settings', { title: 'Paramètres' });
});

router.post('/parametres', (req, res) => {
  const f = req.body;
  db.prepare(`UPDATE users SET name = ?, business_name = ?, phone = ?, city = ?, country = ?,
    momo_wave = ?, momo_orange = ?, momo_mtn = ?, momo_moov = ?, invoice_footer = ? WHERE id = ?`).run(
    f.name || req.user.name, f.business_name || req.user.business_name, f.phone || '', f.city || '',
    f.country || '', f.momo_wave || '', f.momo_orange || '', f.momo_mtn || '', f.momo_moov || '',
    f.invoice_footer || '', req.user.id,
  );
  flash(req, 'success', 'Paramètres enregistrés.');
  res.redirect('/app/parametres');
});

module.exports = router;
