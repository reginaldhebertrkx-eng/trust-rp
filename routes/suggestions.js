const express = require('express');
const router = express.Router();
const { getDB, saveDB, nextId } = require('../models/database');
const { isAuthenticated, sanitize } = require('../middleware/auth');

router.post('/', isAuthenticated, (req, res) => {
  const { title, description } = req.body;
  if (!title || !description) return res.status(400).json({ error: 'بيانات ناقصة' });
  const data = getDB();
  data.suggestions.push({ id:nextId('suggestions'), user_id:req.user.id, title:sanitize(title), description:sanitize(description), status:'pending', votes_up:0, votes_down:0, reviewer_id:null, review_note:null, created_at:new Date().toISOString() });
  saveDB(data);
  res.json({ success:true });
});

router.get('/', (req, res) => {
  const data = getDB();
  res.json(data.suggestions.map(s=>{ const u=data.users.find(u=>u.id===s.user_id); return {...s,username:u?.username,avatar:u?.avatar}; }).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)));
});

router.post('/:id/vote', isAuthenticated, (req, res) => {
  const { vote } = req.body;
  if (![1,-1].includes(vote)) return res.status(400).json({ error: 'تصويت غير صحيح' });
  const data = getDB();
  const sug = data.suggestions.find(s=>s.id===parseInt(req.params.id));
  if (!sug) return res.status(404).json({ error: 'غير موجود' });
  const existing = data.suggestion_votes.find(v=>v.suggestion_id===sug.id && v.user_id===req.user.id);
  if (existing) { existing.vote=vote; }
  else { data.suggestion_votes.push({ id:nextId('suggestion_votes'), suggestion_id:sug.id, user_id:req.user.id, vote, created_at:new Date().toISOString() }); }
  sug.votes_up = data.suggestion_votes.filter(v=>v.suggestion_id===sug.id && v.vote===1).length;
  sug.votes_down = data.suggestion_votes.filter(v=>v.suggestion_id===sug.id && v.vote===-1).length;
  saveDB(data);
  res.json({ success:true, votes_up:sug.votes_up, votes_down:sug.votes_down });
});

router.patch('/:id', isAuthenticated, (req, res) => {
  const { status, review_note } = req.body;
  const data = getDB();
  const sug = data.suggestions.find(s=>s.id===parseInt(req.params.id));
  if (!sug) return res.status(404).json({ error: 'غير موجود' });
  sug.status=status; sug.reviewer_id=req.user.id; sug.review_note=sanitize(review_note);
  saveDB(data);
  res.json({ success:true });
});

router.delete('/:id', isAuthenticated, (req, res) => {
  const data = getDB();
  const idx = data.suggestions.findIndex(s=>s.id===parseInt(req.params.id));
  if (idx===-1) return res.status(404).json({ error: 'غير موجود' });
  data.suggestions.splice(idx,1);
  saveDB(data);
  res.json({ success:true });
});

module.exports = router;
