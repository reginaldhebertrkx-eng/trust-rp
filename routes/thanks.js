const express = require('express');
const router = express.Router();
const { getDB, saveDB, nextId } = require('../models/database');
const { isAuthenticated, sanitize } = require('../middleware/auth');

router.post('/', isAuthenticated, (req, res) => {
  const { staff_name, staff_discord, message, rating } = req.body;
  if (!staff_name || !message || !rating) return res.status(400).json({ error: 'بيانات ناقصة' });
  if (rating < 1 || rating > 5) return res.status(400).json({ error: 'التقييم يجب أن يكون بين 1 و 5' });
  const data = getDB();
  data.staff_thanks.push({ id:nextId('staff_thanks'), user_id:req.user.id, staff_name:sanitize(staff_name), staff_discord:sanitize(staff_discord), message:sanitize(message), rating:parseInt(rating), created_at:new Date().toISOString() });
  saveDB(data);
  res.json({ success:true });
});

router.get('/', (req, res) => {
  const data = getDB();
  res.json(data.staff_thanks.map(t=>{ const u=data.users.find(u=>u.id===t.user_id); return {...t,username:u?.username,avatar:u?.avatar}; }).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,20));
});

module.exports = router;
