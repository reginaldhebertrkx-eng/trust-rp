const express = require('express');
const router = express.Router();
const path = require('path');
const { getDB, saveDB, nextId } = require('../models/database');
const { isOwnerOrFounder, adminApiGuard, logActivity, sendNotification, sanitize } = require('../middleware/auth');

const ROLE_COLORS = { owner:'#ff4757', founder:'#ffd700', 'head-admin':'#ff6b35', 'senior-admin':'#ff9f43', admin:'#ee5a24', moderator:'#0652dd', support:'#1289a7', helper:'#5f27cd', user:'#6c757d' };

router.get('/login', (req, res) => {
  if (req.isAuthenticated()) {
    if (req.user.role==='owner'||req.user.role==='founder') return res.redirect('/admin');
    return res.status(403).sendFile(path.join(__dirname,'../public/403.html'));
  }
  req.session.adminLoginRedirect = true;
  res.redirect('/auth/discord');
});

router.get('/', isOwnerOrFounder, (req, res) => {
  logActivity(req.user.id,'دخول لوحة التحكم','admin',null,null,req.ip);
  res.sendFile(path.join(__dirname,'../public/admin/index.html'));
});

router.get('/api/me', adminApiGuard, (req, res) => {
  const { id, discord_id, username, avatar, role, role_color } = req.user;
  res.json({ id, discord_id, username, avatar, role, role_color });
});

router.get('/api/stats', adminApiGuard, (req, res) => {
  const data = getDB();
  res.json({
    users: data.users.length,
    staff: data.users.filter(u=>u.role!=='user').length,
    applications: data.applications.length,
    apps_pending: data.applications.filter(a=>a.status==='pending').length,
    tickets_open: data.tickets.filter(t=>t.status==='open').length,
    complaints_pending: data.complaints.filter(c=>c.status==='pending').length,
    reports_pending: data.reports.filter(r=>r.status==='pending').length,
    suggestions: data.suggestions.length,
    announcements: data.announcements.length,
    banned_users: data.users.filter(u=>u.banned).length,
  });
});
router.get('/api/users', adminApiGuard, (req, res) => {
  const { search, role, banned } = req.query;
  const data = getDB();
  let users = data.users;
  if (search) users = users.filter(u=>u.username.toLowerCase().includes(search.toLowerCase()));
  if (role) users = users.filter(u=>u.role===role);
  if (banned!==undefined && banned!=='') users = users.filter(u=>u.banned===(banned==='true'?1:0));
  res.json({ users: users.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)), total: users.length });
});

router.patch('/api/users/:id', adminApiGuard, (req, res) => {
  const { role, banned, ban_reason } = req.body;
  const data = getDB();
  const target = data.users.find(u=>u.id===parseInt(req.params.id));
  if (!target) return res.status(404).json({ error: 'غير موجود' });
  if (target.discord_id===process.env.FOUNDER_DISCORD_ID && req.user.role!=='owner') return res.status(403).json({ error: '⛔ لا يمكن تعديل الـ Founder' });
  if (target.role==='owner' && req.user.role==='founder') return res.status(403).json({ error: '⛔ لا يمكن تعديل الـ Owner' });
  if (role!==undefined) { target.role=role; target.role_color=ROLE_COLORS[role]||'#6c757d'; }
  if (banned!==undefined) { target.banned=banned?1:0; target.ban_reason=sanitize(ban_reason)||null; }
  saveDB(data);
  logActivity(req.user.id,'تعديل مستخدم','user',target.id,target.username,req.ip);
  res.json({ success:true });
});

router.delete('/api/users/:id', adminApiGuard, (req, res) => {
  const data = getDB();
  const target = data.users.find(u=>u.id===parseInt(req.params.id));
  if (!target) return res.status(404).json({ error: 'غير موجود' });
  if (target.discord_id===process.env.FOUNDER_DISCORD_ID) return res.status(403).json({ error: '⛔ لا يمكن حذف الـ Founder' });
  if (target.role==='owner' && req.user.role==='founder') return res.status(403).json({ error: '⛔ لا يمكن حذف الـ Owner' });
  const idx = data.users.findIndex(u=>u.id===parseInt(req.params.id));
  data.users.splice(idx,1); saveDB(data);
  logActivity(req.user.id,'حذف مستخدم','user',target.id,target.username,req.ip);
  res.json({ success:true });
});
router.get('/api/applications', adminApiGuard, (req, res) => {
  const { status, rank } = req.query;
  const data = getDB();
  let apps = data.applications;
  if (status) apps = apps.filter(a=>a.status===status);
  if (rank) apps = apps.filter(a=>a.rank_slug===rank);
  res.json(apps.map(a=>{ const u=data.users.find(u=>u.id===a.user_id); const r=data.ranks.find(r=>r.slug===a.rank_slug); return {...a,username:u?.username,avatar:u?.avatar,discord_id:u?.discord_id,rank_name:r?.name,rank_color:r?.color}; }).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)));
});

router.get('/api/applications/:id', adminApiGuard, (req, res) => {
  const data = getDB();
  const app = data.applications.find(a=>a.id===parseInt(req.params.id));
  if (!app) return res.status(404).json({ error: 'غير موجود' });
  const u=data.users.find(u=>u.id===app.user_id);
  const r=data.ranks.find(r=>r.slug===app.rank_slug);
  res.json({...app,username:u?.username,avatar:u?.avatar,rank_name:r?.name});
});

router.patch('/api/applications/:id', adminApiGuard, (req, res) => {
  const { status, review_note } = req.body;
  const data = getDB();
  const app = data.applications.find(a=>a.id===parseInt(req.params.id));
  if (!app) return res.status(404).json({ error: 'غير موجود' });
  app.status=status; app.reviewer_id=req.user.id; app.review_note=sanitize(review_note); app.reviewed_at=new Date().toISOString();
  saveDB(data);
  logActivity(req.user.id,`${status==='accepted'?'قبول':'رفض'} طلب`,'application',app.id,null,req.ip);
  sendNotification(app.user_id,status==='accepted'?'✅ تم قبول طلبك':'❌ تم رفض طلبك',status==='accepted'?`تهانينا! تم قبول طلبك لرتبة ${app.rank_slug}`:`تم رفض طلبك. السبب: ${review_note||'لم يحدد'}`,status==='accepted'?'success':'danger','/my-applications');
  res.json({ success:true });
});

router.delete('/api/applications/:id', adminApiGuard, (req, res) => {
  const data = getDB();
  const idx = data.applications.findIndex(a=>a.id===parseInt(req.params.id));
  if (idx===-1) return res.status(404).json({ error: 'غير موجود' });
  data.applications.splice(idx,1); saveDB(data);
  res.json({ success:true });
});
router.get('/api/tickets', adminApiGuard, (req, res) => {
  const { status } = req.query;
  const data = getDB();
  let tickets = data.tickets;
  if (status) tickets = tickets.filter(t=>t.status===status);
  res.json(tickets.map(t=>{ const u=data.users.find(u=>u.id===t.user_id); return {...t,username:u?.username,avatar:u?.avatar}; }).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)));
});

router.get('/api/tickets/:id', adminApiGuard, (req, res) => {
  const data = getDB();
  const ticket = data.tickets.find(t=>t.id===parseInt(req.params.id));
  if (!ticket) return res.status(404).json({ error: 'غير موجود' });
  const u=data.users.find(u=>u.id===ticket.user_id);
  const messages=data.ticket_messages.filter(m=>m.ticket_id===ticket.id).map(m=>{ const mu=data.users.find(u=>u.id===m.user_id); return {...m,username:mu?.username,avatar:mu?.avatar,role:mu?.role,role_color:mu?.role_color}; }).sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
  res.json({...ticket,username:u?.username,avatar:u?.avatar,messages});
});

router.post('/api/tickets/:id/reply', adminApiGuard, (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'فارغة' });
  const data = getDB();
  const ticket = data.tickets.find(t=>t.id===parseInt(req.params.id));
  if (!ticket) return res.status(404).json({ error: 'غير موجود' });
  data.ticket_messages.push({ id:nextId('ticket_messages'), ticket_id:ticket.id, user_id:req.user.id, message:sanitize(message), created_at:new Date().toISOString() });
  saveDB(data);
  sendNotification(ticket.user_id,'💬 رد جديد على تذكرتك',`تم الرد من الإدارة على: ${ticket.title}`,'info',`/tickets/${ticket.id}`);
  res.json({ success:true });
});

router.patch('/api/tickets/:id', adminApiGuard, (req, res) => {
  const { status, assigned_to } = req.body;
  const data = getDB();
  const ticket = data.tickets.find(t=>t.id===parseInt(req.params.id));
  if (!ticket) return res.status(404).json({ error: 'غير موجود' });
  if (status) { ticket.status=status; if(status==='closed'){ticket.closed_by=req.user.id;ticket.closed_at=new Date().toISOString();}else{ticket.closed_by=null;ticket.closed_at=null;} }
  if (assigned_to!==undefined) ticket.assigned_to=assigned_to;
  saveDB(data);
  logActivity(req.user.id,status==='closed'?'إغلاق تذكرة':'تعديل تذكرة','ticket',ticket.id,null,req.ip);
  res.json({ success:true });
});

router.delete('/api/tickets/:id', adminApiGuard, (req, res) => {
  const data = getDB();
  const idx=data.tickets.findIndex(t=>t.id===parseInt(req.params.id));
  if (idx===-1) return res.status(404).json({ error: 'غير موجود' });
  data.ticket_messages=data.ticket_messages.filter(m=>m.ticket_id!==parseInt(req.params.id));
  data.tickets.splice(idx,1); saveDB(data);
  res.json({ success:true });
});
router.get('/api/complaints', adminApiGuard, (req, res) => {
  const { status } = req.query;
  const data = getDB();
  let items = data.complaints;
  if (status) items=items.filter(c=>c.status===status);
  res.json(items.map(c=>{ const u=data.users.find(u=>u.id===c.user_id); return {...c,username:u?.username,avatar:u?.avatar}; }).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)));
});

router.patch('/api/complaints/:id', adminApiGuard, (req, res) => {
  const { status, review_note } = req.body;
  const data = getDB();
  const item=data.complaints.find(c=>c.id===parseInt(req.params.id));
  if (!item) return res.status(404).json({ error: 'غير موجود' });
  item.status=status; item.reviewer_id=req.user.id; item.review_note=sanitize(review_note); item.reviewed_at=new Date().toISOString();
  saveDB(data);
  res.json({ success:true });
});

router.delete('/api/complaints/:id', adminApiGuard, (req, res) => {
  const data = getDB();
  const idx=data.complaints.findIndex(c=>c.id===parseInt(req.params.id));
  if (idx===-1) return res.status(404).json({ error: 'غير موجود' });
  data.complaints.splice(idx,1); saveDB(data);
  res.json({ success:true });
});

router.get('/api/reports', adminApiGuard, (req, res) => {
  const { status } = req.query;
  const data = getDB();
  let items = data.reports;
  if (status) items=items.filter(r=>r.status===status);
  res.json(items.map(r=>{ const u=data.users.find(u=>u.id===r.user_id); return {...r,username:u?.username,avatar:u?.avatar}; }).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)));
});

router.patch('/api/reports/:id', adminApiGuard, (req, res) => {
  const { status, review_note } = req.body;
  const data = getDB();
  const item=data.reports.find(r=>r.id===parseInt(req.params.id));
  if (!item) return res.status(404).json({ error: 'غير موجود' });
  item.status=status; item.reviewer_id=req.user.id; item.review_note=sanitize(review_note); item.reviewed_at=new Date().toISOString();
  saveDB(data);
  res.json({ success:true });
});

router.delete('/api/reports/:id', adminApiGuard, (req, res) => {
  const data = getDB();
  const idx=data.reports.findIndex(r=>r.id===parseInt(req.params.id));
  if (idx===-1) return res.status(404).json({ error: 'غير موجود' });
  data.reports.splice(idx,1); saveDB(data);
  res.json({ success:true });
});
router.get('/api/ranks', adminApiGuard, (req, res) => {
  const data = getDB();
  res.json(data.ranks.map(r=>({...r,total_apps:data.applications.filter(a=>a.rank_slug===r.slug).length})).sort((a,b)=>b.level-a.level));
});

router.post('/api/ranks', adminApiGuard, (req, res) => {
  const { name, slug, color, level, description } = req.body;
  if (!name||!slug) return res.status(400).json({ error: 'الاسم والـ slug مطلوبان' });
  const data = getDB();
  if (data.ranks.find(r=>r.slug===slug)) return res.status(400).json({ error: 'الـ slug موجود' });
  data.ranks.push({ id:nextId('ranks'), name:sanitize(name), slug:sanitize(slug), color:color||'#f0c040', level:parseInt(level)||1, description:sanitize(description), is_active:1 });
  saveDB(data);
  res.json({ success:true });
});

router.patch('/api/ranks/:id', adminApiGuard, (req, res) => {
  const { name, color, level, description, is_active } = req.body;
  const data = getDB();
  const rank=data.ranks.find(r=>r.id===parseInt(req.params.id));
  if (!rank) return res.status(404).json({ error: 'غير موجود' });
  rank.name=sanitize(name); rank.color=color; rank.level=parseInt(level); rank.description=sanitize(description); rank.is_active=is_active?1:0;
  saveDB(data);
  res.json({ success:true });
});

router.delete('/api/ranks/:id', adminApiGuard, (req, res) => {
  const data = getDB();
  const rank=data.ranks.find(r=>r.id===parseInt(req.params.id));
  if (!rank) return res.status(404).json({ error: 'غير موجود' });
  if (['owner','founder'].includes(rank.slug)) return res.status(400).json({ error: 'لا يمكن حذف هذه الرتبة' });
  const idx=data.ranks.findIndex(r=>r.id===parseInt(req.params.id));
  data.ranks.splice(idx,1); saveDB(data);
  res.json({ success:true });
});

router.get('/api/questions', adminApiGuard, (req, res) => {
  const { slug } = req.query;
  const data = getDB();
  let qs = data.application_questions;
  if (slug) qs=qs.filter(q=>q.rank_slug===slug);
  res.json(qs.sort((a,b)=>a.order_num-b.order_num));
});

router.post('/api/questions', adminApiGuard, (req, res) => {
  const { rank_slug, question, type, required, order_num } = req.body;
  if (!rank_slug||!question) return res.status(400).json({ error: 'بيانات ناقصة' });
  const data = getDB();
  data.application_questions.push({ id:nextId('application_questions'), rank_slug, question:sanitize(question), type:type||'text', required:required?1:0, order_num:parseInt(order_num)||0 });
  saveDB(data);
  res.json({ success:true });
});

router.delete('/api/questions/:id', adminApiGuard, (req, res) => {
  const data = getDB();
  const idx=data.application_questions.findIndex(q=>q.id===parseInt(req.params.id));
  if (idx===-1) return res.status(404).json({ error: 'غير موجود' });
  data.application_questions.splice(idx,1); saveDB(data);
  res.json({ success:true });
});
router.get('/api/announcements', adminApiGuard, (req, res) => {
  const data = getDB();
  res.json(data.announcements.map(a=>{ const u=data.users.find(u=>u.id===a.author_id); return {...a,username:u?.username}; }).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)));
});

router.post('/api/announcements', adminApiGuard, (req, res) => {
  const { title, content, type, is_pinned } = req.body;
  if (!title||!content) return res.status(400).json({ error: 'بيانات ناقصة' });
  const data = getDB();
  data.announcements.push({ id:nextId('announcements'), author_id:req.user.id, title:sanitize(title), content:sanitize(content), type:type||'info', is_pinned:is_pinned?1:0, created_at:new Date().toISOString() });
  saveDB(data);
  logActivity(req.user.id,'نشر إعلان','announcement',null,title,req.ip);
  res.json({ success:true });
});

router.delete('/api/announcements/:id', adminApiGuard, (req, res) => {
  const data = getDB();
  const idx=data.announcements.findIndex(a=>a.id===parseInt(req.params.id));
  if (idx===-1) return res.status(404).json({ error: 'غير موجود' });
  data.announcements.splice(idx,1); saveDB(data);
  res.json({ success:true });
});

router.post('/api/broadcast', adminApiGuard, (req, res) => {
  const { title, message, type, target_role } = req.body;
  if (!title||!message) return res.status(400).json({ error: 'بيانات ناقصة' });
  const data = getDB();
  let users = data.users.filter(u=>!u.banned);
  if (target_role && target_role!=='') users=users.filter(u=>u.role===target_role);
  users.forEach(u=>{ data.notifications.push({ id:nextId('notifications'), user_id:u.id, title:sanitize(title), message:sanitize(message), type:type||'info', link:null, is_read:0, created_at:new Date().toISOString() }); u.notifications_count=(u.notifications_count||0)+1; });
  saveDB(data);
  logActivity(req.user.id,'إرسال إشعار جماعي',null,null,`"${title}" -> ${users.length} مستخدم`,req.ip);
  res.json({ success:true, sent_to:users.length });
});

router.get('/api/suggestions', adminApiGuard, (req, res) => {
  const data = getDB();
  res.json(data.suggestions.map(s=>{ const u=data.users.find(u=>u.id===s.user_id); return {...s,username:u?.username,avatar:u?.avatar}; }).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)));
});

router.patch('/api/suggestions/:id', adminApiGuard, (req, res) => {
  const { status, review_note } = req.body;
  const data = getDB();
  const s=data.suggestions.find(s=>s.id===parseInt(req.params.id));
  if (!s) return res.status(404).json({ error: 'غير موجود' });
  s.status=status; s.reviewer_id=req.user.id; s.review_note=sanitize(review_note);
  saveDB(data);
  res.json({ success:true });
});

router.delete('/api/suggestions/:id', adminApiGuard, (req, res) => {
  const data = getDB();
  const idx=data.suggestions.findIndex(s=>s.id===parseInt(req.params.id));
  if (idx===-1) return res.status(404).json({ error: 'غير موجود' });
  data.suggestions.splice(idx,1); saveDB(data);
  res.json({ success:true });
});
router.get('/api/logs', adminApiGuard, (req, res) => {
  const { search, type } = req.query;
  const data = getDB();
  let logs = data.activity_logs;
  if (search) logs=logs.filter(l=>(l.action&&l.action.includes(search))||(l.details&&l.details.includes(search)));
  if (type) logs=logs.filter(l=>l.target_type===type);
  res.json(logs.map(l=>{ const u=data.users.find(u=>u.id===l.user_id); return {...l,username:u?.username,avatar:u?.avatar,role_color:u?.role_color}; }).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,200));
});

router.delete('/api/logs', adminApiGuard, (req, res) => {
  if (req.user.role!=='owner') return res.status(403).json({ error: 'فقط الـ Owner' });
  const data = getDB();
  const cutoff = new Date(Date.now()-30*24*60*60*1000).toISOString();
  const before = data.activity_logs.length;
  data.activity_logs=data.activity_logs.filter(l=>l.created_at>cutoff);
  saveDB(data);
  res.json({ success:true, changes:before-data.activity_logs.length });
});

router.get('/api/db/tables', adminApiGuard, (req, res) => {
  const data = getDB();
  res.json(Object.keys(data).filter(k=>Array.isArray(data[k])).map(k=>({ name:k, count:data[k].length })));
});

router.post('/api/db/cleanup', adminApiGuard, (req, res) => {
  if (req.user.role!=='owner') return res.status(403).json({ error: 'فقط الـ Owner' });
  const { type } = req.body;
  const data = getDB();
  const cutoff30 = new Date(Date.now()-30*24*60*60*1000).toISOString();
  const cutoff90 = new Date(Date.now()-90*24*60*60*1000).toISOString();
  let changes = 0;
  if (type==='old-logs') { const b=data.activity_logs.length; data.activity_logs=data.activity_logs.filter(l=>l.created_at>cutoff90); changes=b-data.activity_logs.length; }
  if (type==='old-notifs') { const b=data.notifications.length; data.notifications=data.notifications.filter(n=>!n.is_read||n.created_at>cutoff30); changes=b-data.notifications.length; }
  if (type==='closed-tickets') { const ids=data.tickets.filter(t=>t.status==='closed'&&t.closed_at<cutoff90).map(t=>t.id); data.ticket_messages=data.ticket_messages.filter(m=>!ids.includes(m.ticket_id)); const b=data.tickets.length; data.tickets=data.tickets.filter(t=>!ids.includes(t.id)); changes=b-data.tickets.length; }
  saveDB(data);
  res.json({ success:true, changes });
});

router.get('*splat', isOwnerOrFounder, (req, res) => {
  res.sendFile(path.join(__dirname,'../public/admin/index.html'));
});

module.exports = router;
