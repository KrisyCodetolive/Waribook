const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');

const router = express.Router();

router.get('/inscription', (req, res) => {
  if (req.user) return res.redirect('/app');
  res.render('auth/signup', { title: 'Créer un compte', values: {}, error: null });
});

router.post('/inscription', (req, res) => {
  const { name, email, password, business_name, phone } = req.body;
  const values = { name, email, business_name, phone };
  const cleanEmail = String(email || '').trim().toLowerCase();

  let error = null;
  if (!name || !cleanEmail || !password || !business_name) error = 'Merci de remplir tous les champs obligatoires.';
  else if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) error = 'Adresse e-mail invalide.';
  else if (password.length < 8) error = 'Le mot de passe doit contenir au moins 8 caractères.';
  else if (db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail)) error = 'Un compte existe déjà avec cet e-mail.';

  if (error) return res.status(400).render('auth/signup', { title: 'Créer un compte', values, error });

  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare(
    'INSERT INTO users (name, email, password_hash, business_name, phone) VALUES (?, ?, ?, ?, ?)'
  ).run(name.trim(), cleanEmail, hash, business_name.trim(), (phone || '').trim());

  req.session.userId = info.lastInsertRowid;
  req.session.flash = { type: 'success', text: 'Bienvenue ! Commencez par ajouter vos numéros Mobile Money dans Paramètres.' };
  res.redirect('/app');
});

router.get('/connexion', (req, res) => {
  if (req.user) return res.redirect('/app');
  res.render('auth/login', { title: 'Connexion', email: '', error: null });
});

router.post('/connexion', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(req.body.password || '', user.password_hash)) {
    return res.status(401).render('auth/login', { title: 'Connexion', email, error: 'E-mail ou mot de passe incorrect.' });
  }
  req.session.userId = user.id;
  res.redirect('/app');
});

router.post('/deconnexion', (req, res) => {
  req.session = null;
  res.redirect('/');
});

module.exports = router;
