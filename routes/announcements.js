const express = require('express');
const router = express.Router();
const { getDB, saveDB, nextId } = require('../models/database');
const { hasRole, logActivity, sanitize } = require('../middleware/auth');

router.get('/', (req, res) => {
  const data = getDB();
  res.json(data.announcements.map(a=>{ const u=data.users.find(u=>u.id===a.author_id); return {...a,username:u?.username,avatar:u?.avatar,role_color:u?.role_color}; }).sort((a,b)=>b.is_pinned-a.is_pinned||new Date(b.created_at)-new Date(a.created_at)));
});

router.post('/', hasRole('admin'), (req, res) => {
  const { title, content, type, is_pinned } = req.body;
  if (!title || !content) return res.status(400).json({ error: 'بيانات ناقصة' });
  const data = getDB();
  data.announcements.push({ id:nextId('announcements'), author_id:req.user.id, title:sanitize(title), content:sanitize(content), type:type||'info', is_pinned:is_pinned?1:0, created_at:new Date().toISOString() });
  saveDB(data);
  logActivity(req.user.id, 'نشر إعلان', 'announcement', null, title, req.ip);
  res.json({ success:true });
});

router.patch('/:id', hasRole('admin'), (req, res) => {
  const { title, content, type, is_pinned } = req.body;
  const data = getDB();
  const ann = data.announcements.find(a=>a.id===parseInt(req.params.id));
  if (!ann) return res.status(404).json({ error: 'غير موجود' });
  ann.title=sanitize(title); ann.content=sanitize(content); ann.type=type; ann.is_pinned=is_pinned?1:0;
  saveDB(data);
  res.json({ success:true });
});

router.delete('/:id', hasRole('admin'), (req, res) => {
  const data = getDB();
  const idx = data.announcements.findIndex(a=>a.id===parseInt(req.params.id));
  if (idx===-1) return res.status(404).json({ error: 'غير موجود' });
  data.announcements.splice(idx,1);
  saveDB(data);
  logActivity(req.user.id, 'حذف إعلان', 'announcement', parseInt(req.params.id), null, req.ip);
  res.json({ success:true });
});

module.exports = router;
