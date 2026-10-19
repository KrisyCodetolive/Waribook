// Abonnements payants (Pro / Business) via CinetPay
const express = require('express');
const db = require('../db');
const cinetpay = require('../cinetpay');
const { PLANS, getPlan, randomToken, addDays, today } = require('../utils');

const router = express.Router();

function baseUrl(req) {
  return process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
}

function activate(subscription) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(subscription.user_id);
  // Prolonge à partir de la date d'expiration actuelle si l'abonnement est encore actif
  const start = user.plan_expires_at && user.plan_expires_at > today() ? user.plan_expires_at : today();
  db.transaction(() => {
    db.prepare("UPDATE subscriptions SET status = 'payee' WHERE id = ?").run(subscription.id);
    db.prepare('UPDATE users SET plan = ?, plan_expires_at = ? WHERE id = ?')
      .run(subscription.plan, addDays(start, 30), subscription.user_id);
  })();
}

router.get('/app/abonnement', (req, res) => {
  if (!req.user) return res.redirect('/connexion');
  const history = db.prepare('SELECT * FROM subscriptions WHERE user_id = ? ORDER BY id DESC LIMIT 10').all(req.user.id);
  res.render('app/billing', {
    title: 'Abonnement', plans: PLANS, current: getPlan(req.user), history, demo: !cinetpay.isConfigured(),
  });
});

router.post('/app/abonnement/:plan', async (req, res, next) => {
  try {
    if (!req.user) return res.redirect('/connexion');
    const plan = PLANS[req.params.plan];
    if (!plan || plan.price === 0) return res.redirect('/app/abonnement');

    const transactionId = `WB${Date.now()}${randomToken(3)}`.toUpperCase();
    const info = db.prepare('INSERT INTO subscriptions (user_id, plan, amount, transaction_id) VALUES (?, ?, ?, ?)')
      .run(req.user.id, plan.id, plan.price, transactionId);

    if (!cinetpay.isConfigured()) {
      // Mode démo : activation immédiate sans paiement
      activate(db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(info.lastInsertRowid));
      req.session.flash = { type: 'success', text: `Mode démo : offre ${plan.name} activée pour 30 jours (aucun paiement réel).` };
      return res.redirect('/app/abonnement');
    }

    const paymentUrl = await cinetpay.initPayment({
      transactionId, amount: plan.price, description: `Abonnement ${plan.name} - 1 mois`, user: req.user, baseUrl: baseUrl(req),
    });
    res.redirect(paymentUrl);
  } catch (err) {
    next(err);
  }
});

async function verifyAndActivate(transactionId) {
  const sub = db.prepare('SELECT * FROM subscriptions WHERE transaction_id = ?').get(transactionId);
  if (!sub || sub.status === 'payee') return sub;
  if (await cinetpay.checkPayment(transactionId)) {
    activate(sub);
    return { ...sub, status: 'payee' };
  }
  return sub;
}

// CinetPay appelle cette URL (serveur à serveur) après un paiement
router.post('/paiement/notification', async (req, res) => {
  const transactionId = req.body.cpm_trans_id || req.body.transaction_id;
  if (transactionId && cinetpay.isConfigured()) {
    try { await verifyAndActivate(transactionId); } catch (e) { console.error(e); }
  }
  res.status(200).send('OK');
});
router.get('/paiement/notification', (req, res) => res.status(200).send('OK'));

// Le client revient ici après avoir payé
async function handleReturn(req, res) {
  const transactionId = req.query.transaction_id || req.body?.transaction_id;
  let sub = null;
  if (transactionId && cinetpay.isConfigured()) {
    try { sub = await verifyAndActivate(transactionId); } catch (e) { console.error(e); }
  }
  req.session.flash = sub && sub.status === 'payee'
    ? { type: 'success', text: 'Paiement confirmé, merci ! Votre abonnement est actif.' }
    : { type: 'info', text: 'Paiement en cours de vérification. Actualisez cette page dans quelques instants.' };
  res.redirect('/app/abonnement');
}
router.get('/paiement/retour', handleReturn);
router.post('/paiement/retour', handleReturn);

module.exports = router;
