require('dotenv').config({ quiet: true });
const path = require('path');
const express = require('express');
const cookieSession = require('cookie-session');
const db = require('./db');
const utils = require('./utils');

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

if (isProd && !process.env.SESSION_SECRET) {
  console.warn('⚠️  SESSION_SECRET manquant : définissez-le dans vos variables d\'environnement !');
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));
app.set('trust proxy', 1);

app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: isProd ? '7d' : 0 }));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieSession({
  name: 'wb_session',
  keys: [process.env.SESSION_SECRET || 'dev-secret-a-changer'],
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 jours
  sameSite: 'lax',
  httpOnly: true,
  secure: isProd,
}));

// Variables disponibles dans toutes les pages
app.use((req, res, next) => {
  res.locals.appName = process.env.APP_NAME || 'WariBook';
  res.locals.u = utils;
  res.locals.path = req.path;
  res.locals.flash = req.session.flash || null;
  if (req.session.flash) req.session.flash = null;
  res.locals.user = null;
  if (req.session.userId) {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
    if (user) {
      req.user = user;
      res.locals.user = user;
      res.locals.plan = utils.getPlan(user);
    } else {
      req.session.userId = null;
    }
  }
  next();
});

app.use(require('./routes/public'));
app.use(require('./routes/auth'));
app.use(require('./routes/billing'));
app.use('/app', require('./routes/app'));

app.use((req, res) => {
  res.status(404).render('error', { title: 'Page introuvable', message: "Cette page n'existe pas." });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', { title: 'Erreur', message: 'Une erreur est survenue. Réessayez dans un instant.' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`✅ WariBook est lancé : http://localhost:${PORT}`);
  });
}

module.exports = app;
