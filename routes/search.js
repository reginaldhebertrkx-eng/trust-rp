const express = require('express');
const router = express.Router();
const { getDB } = require('../models/database');
const { isAuthenticated } = require('../middleware/auth');

router.get('/', isAuthenticated, (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 2) return res.json({ results: {} });
  const data = getDB();
  const query = q.toLowerCase();
  const STAFF = ['admin','senior-admin','head-admin','founder','owner'];
  const results = {};

  if (STAFF.includes(req.user.role)) {
    results.users = data.users.filter(u=>u.username.toLowerCase().includes(query)).slice(0,10).map(u=>({ id:u.id, username:u.username, avatar:u.avatar, role:u.role, role_color:u.role_color }));
  }

  results.tickets = data.tickets.filter(t=>(t.user_id===req.user.id || STAFF.includes(req.user.role)) && t.title.toLowerCase().includes(query)).slice(0,10);
  results.applications = data.applications.filter(a=>a.user_id===req.user.id && a.rank_slug.toLowerCase().includes(query)).slice(0,10);

  res.json({ results });
});

module.exports = router;
