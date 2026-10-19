const express = require('express');
const db = require('../db');
const { PLANS } = require('../utils');

const router = express.Router();

// Landing page
router.get('/', (req, res) => {
  res.render('landing', { title: 'Facturez et faites-vous payer plus vite', plans: PLANS });
});

// Page publique d'une facture (lien partagé au client par WhatsApp)
router.get('/f/:token', (req, res) => {
  const invoice = db.prepare('SELECT * FROM invoices WHERE token = ?').get(req.params.token);
  if (!invoice) {
    return res.status(404).render('error', { title: 'Facture introuvable', message: "Ce lien de facture n'est pas valide." });
  }
  const items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(invoice.id);
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(invoice.client_id);
  const owner = db.prepare('SELECT * FROM users WHERE id = ?').get(invoice.user_id);
  res.render('invoice-public', { title: `Facture ${invoice.number}`, invoice, items, client, owner });
});

router.get('/sante', (req, res) => res.json({ ok: true }));

module.exports = router;
