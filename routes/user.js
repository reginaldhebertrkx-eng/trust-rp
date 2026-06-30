const express = require('express');
const router = express.Router();
const { getDB } = require('../models/database');
const { isAuthenticated } = require('../middleware/auth');

router.get('/profile', isAuthenticated, (req, res) => {
  const data = getDB();
  const user = data.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
  const { id, discord_id, username, avatar, role, role_color, created_at, last_login, notifications_count } = user;
  res.json({ id, discord_id, username, avatar, role, role_color, created_at, last_login, notifications_count });
});

module.exports = router;
