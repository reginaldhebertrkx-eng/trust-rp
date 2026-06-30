const express = require('express');
const router = express.Router();
const { getDB, saveDB } = require('../models/database');
const { isAuthenticated } = require('../middleware/auth');

router.get('/', isAuthenticated, (req, res) => {
  const data = getDB();
  res.json(data.notifications.filter(n=>n.user_id===req.user.id).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,30));
});

router.patch('/read-all', isAuthenticated, (req, res) => {
  const data = getDB();
  data.notifications.filter(n=>n.user_id===req.user.id).forEach(n=>n.is_read=1);
  const user = data.users.find(u=>u.id===req.user.id);
  if (user) user.notifications_count=0;
  saveDB(data);
  res.json({ success:true });
});

router.patch('/:id/read', isAuthenticated, (req, res) => {
  const data = getDB();
  const n = data.notifications.find(n=>n.id===parseInt(req.params.id) && n.user_id===req.user.id);
  if (n) { n.is_read=1; saveDB(data); }
  res.json({ success:true });
});

module.exports = router;
