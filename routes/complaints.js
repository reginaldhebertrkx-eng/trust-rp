const express = require('express');
const router = express.Router();
const { getDB, saveDB, nextId } = require('../models/database');
const { isAuthenticated, hasRole, logActivity, sanitize } = require('../middleware/auth');

router.post('/', isAuthenticated, (req, res) => {
  const { type, against_name, against_discord, description } = req.body;
  if (!type || !against_name || !description) return res.status(400).json({ error: 'بيانات ناقصة' });
  const data = getDB();
  data.complaints.push({ id:nextId('complaints'), user_id:req.user.id, type:sanitize(type), against_name:sanitize(against_name), against_discord:sanitize(against_discord), description:sanitize(description), status:'pending', reviewer_id:null, review_note:null, reviewed_at:null, created_at:new Date().toISOString() });
  saveDB(data);
  logActivity(req.user.id, 'تقديم شكوى', 'complaint', null, `ضد: ${against_name}`, req.ip);
  res.json({ success:true });
});

router.get('/my', isAuthenticated, (req, res) => {
  const data = getDB();
  res.json(data.complaints.filter(c=>c.user_id===req.user.id).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)));
});

router.get('/all', hasRole('moderator'), (req, res) => {
  const data = getDB();
  const { status } = req.query;
  let items = data.complaints;
  if (status) items = items.filter(c=>c.status===status);
  res.json(items.map(c=>{ const u=data.users.find(u=>u.id===c.user_id); return {...c,username:u?.username,avatar:u?.avatar}; }).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)));
});

router.patch('/:id', hasRole('moderator'), (req, res) => {
  const { status, review_note } = req.body;
  const data = getDB();
  const item = data.complaints.find(c=>c.id===parseInt(req.params.id));
  if (!item) return res.status(404).json({ error: 'غير موجود' });
  item.status=status; item.reviewer_id=req.user.id; item.review_note=sanitize(review_note); item.reviewed_at=new Date().toISOString();
  saveDB(data);
  logActivity(req.user.id, 'معالجة شكوى', 'complaint', item.id, status, req.ip);
  res.json({ success:true });
});

router.delete('/:id', hasRole('admin'), (req, res) => {
  const data = getDB();
  const idx = data.complaints.findIndex(c=>c.id===parseInt(req.params.id));
  if (idx===-1) return res.status(404).json({ error: 'غير موجود' });
  data.complaints.splice(idx,1);
  saveDB(data);
  res.json({ success:true });
});

module.exports = router;
