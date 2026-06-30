const express = require('express');
const router = express.Router();
const { getDB, saveDB, nextId } = require('../models/database');
const { isAuthenticated, hasRole, logActivity, sendNotification, sanitize } = require('../middleware/auth');

router.get('/ranks', (req, res) => {
  const data = getDB();
  res.json(data.ranks.filter(r=>r.is_active && !['owner','founder'].includes(r.slug)).sort((a,b)=>b.level-a.level));
});

router.get('/questions/:slug', isAuthenticated, (req, res) => {
  const data = getDB();
  res.json(data.application_questions.filter(q=>q.rank_slug===req.params.slug).sort((a,b)=>a.order_num-b.order_num));
});

router.post('/', isAuthenticated, (req, res) => {
  const { rank_slug, answers } = req.body;
  if (!rank_slug || !answers) return res.status(400).json({ error: 'بيانات ناقصة' });
  const data = getDB();
  const existing = data.applications.find(a=>a.user_id===req.user.id && a.rank_slug===rank_slug && a.status==='pending');
  if (existing) return res.status(400).json({ error: 'لديك طلب قيد الانتظار لهذه الرتبة' });
  const rank = data.ranks.find(r=>r.slug===rank_slug);
  if (!rank) return res.status(404).json({ error: 'الرتبة غير موجودة' });
  data.applications.push({
    id: nextId('applications'),
    user_id: req.user.id,
    rank_slug,
    status: 'pending',
    answers: JSON.stringify(answers),
    reviewer_id: null,
    review_note: null,
    reviewed_at: null,
    created_at: new Date().toISOString()
  });
  saveDB(data);
  logActivity(req.user.id, 'تقديم طلب', 'application', null, `رتبة: ${rank.name}`, req.ip);
  res.json({ success: true, message: 'تم إرسال طلبك بنجاح' });
});

router.get('/my', isAuthenticated, (req, res) => {
  const data = getDB();
  const apps = data.applications.filter(a=>a.user_id===req.user.id).map(a=>{
    const rank = data.ranks.find(r=>r.slug===a.rank_slug);
    const reviewer = data.users.find(u=>u.id===a.reviewer_id);
    return { ...a, rank_name: rank?.name, rank_color: rank?.color, reviewer_name: reviewer?.username };
  }).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
  res.json(apps);
});

router.get('/all', hasRole('moderator'), (req, res) => {
  const data = getDB();
  const { status, rank } = req.query;
  let apps = data.applications;
  if (status) apps = apps.filter(a=>a.status===status);
  if (rank) apps = apps.filter(a=>a.rank_slug===rank);
  res.json(apps.map(a=>{
    const user = data.users.find(u=>u.id===a.user_id);
    const r = data.ranks.find(r=>r.slug===a.rank_slug);
    return { ...a, username: user?.username, avatar: user?.avatar, discord_id: user?.discord_id, rank_name: r?.name, rank_color: r?.color };
  }).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)));
});

router.get('/:id', isAuthenticated, (req, res) => {
  const data = getDB();
  const app = data.applications.find(a=>a.id===parseInt(req.params.id));
  if (!app) return res.status(404).json({ error: 'الطلب غير موجود' });
  const user = data.users.find(u=>u.id===app.user_id);
  const rank = data.ranks.find(r=>r.slug===app.rank_slug);
  res.json({ ...app, username: user?.username, avatar: user?.avatar, rank_name: rank?.name });
});

router.patch('/:id', hasRole('moderator'), (req, res) => {
  const { status, review_note } = req.body;
  if (!['accepted','rejected','pending'].includes(status)) return res.status(400).json({ error: 'حالة غير صحيحة' });
  const data = getDB();
  const app = data.applications.find(a=>a.id===parseInt(req.params.id));
  if (!app) return res.status(404).json({ error: 'الطلب غير موجود' });
  app.status = status;
  app.reviewer_id = req.user.id;
  app.review_note = sanitize(review_note);
  app.reviewed_at = new Date().toISOString();
  saveDB(data);
  logActivity(req.user.id, `${status==='accepted'?'قبول':'رفض'} طلب`, 'application', app.id, null, req.ip);
  sendNotification(app.user_id, status==='accepted'?'✅ تم قبول طلبك':'❌ تم رفض طلبك',
    status==='accepted'?`تهانينا! تم قبول طلبك لرتبة ${app.rank_slug}`:`تم رفض طلبك. السبب: ${review_note||'لم يحدد'}`,
    status==='accepted'?'success':'danger', '/my-applications');
  res.json({ success: true });
});

router.delete('/:id', hasRole('admin'), (req, res) => {
  const data = getDB();
  const idx = data.applications.findIndex(a=>a.id===parseInt(req.params.id));
  if (idx===-1) return res.status(404).json({ error: 'الطلب غير موجود' });
  data.applications.splice(idx,1);
  saveDB(data);
  res.json({ success: true });
});

module.exports = router;
