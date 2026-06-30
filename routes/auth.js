const express = require('express');
const router = express.Router();
const passport = require('passport');
const { logActivity } = require('../middleware/auth');

router.get('/discord', passport.authenticate('discord'));

router.get('/discord/callback',
  passport.authenticate('discord', { failureRedirect: '/?error=auth_failed' }),
  (req, res) => {
    logActivity(req.user?.id, 'تسجيل دخول', 'auth', null, req.user?.username, req.ip);
    const isAdmin = req.session.adminLoginRedirect;
    delete req.session.adminLoginRedirect;
    if (isAdmin) {
      const role = req.user?.role;
      if (role === 'owner' || role === 'founder') return res.redirect('/admin');
      return req.logout(() => res.redirect('/403'));
    }
    res.redirect('/dashboard');
  }
);

router.get('/logout', (req, res) => {
  req.logout(() => res.redirect('/'));
});

router.get('/me', (req, res) => {
  if (req.isAuthenticated()) {
    const { id, discord_id, username, avatar, role, role_color, created_at, last_login, notifications_count } = req.user;
    res.json({ authenticated: true, user: { id, discord_id, username, avatar, role, role_color, created_at, last_login, notifications_count } });
  } else {
    res.json({ authenticated: false });
  }
});

module.exports = router;
