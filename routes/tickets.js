const express = require('express');
const router = express.Router();
const { getDB, saveDB, nextId } = require('../models/database');
const { isAuthenticated, hasRole, logActivity, sendNotification, sanitize } = require('../middleware/auth');

router.post('/', isAuthenticated, (req, res) => {
  const { title, type, message } = req.body;
  if (!title || !type || !message) return res.status(400).json({ error: 'بيانات ناقصة' });
  const data = getDB();
  const openCount = data.tickets.filter(t=>t.user_id===req.user.id && t.status==='open').length;
  if (openCount >= 3) return res.status(400).json({ error: 'لديك 3 تذاكر مفتوحة بالفعل' });
  const ticketId = nextId('tickets');
  data.tickets.push({ id:ticketId, user_id:req.user.id, title:sanitize(title), type:sanitize(type), status:'open', assigned_to:null, closed_by:null, closed_at:null, created_at:new Date().toISOString() });
  data.ticket_messages.push({ id:nextId('ticket_messages'), ticket_id:ticketId, user_id:req.user.id, message:sanitize(message), created_at:new Date().toISOString() });
  saveDB(data);
  logActivity(req.user.id, 'إنشاء تذكرة', 'ticket', ticketId, type, req.ip);
  res.json({ success:true, ticket_id:ticketId });
});

router.get('/my', isAuthenticated, (req, res) => {
  const data = getDB();
  res.json(data.tickets.filter(t=>t.user_id===req.user.id).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)));
});

router.get('/all', hasRole('helper'), (req, res) => {
  const data = getDB();
  const { status } = req.query;
  let tickets = data.tickets;
  if (status) tickets = tickets.filter(t=>t.status===status);
  res.json(tickets.map(t=>{
    const user = data.users.find(u=>u.id===t.user_id);
    return { ...t, username:user?.username, avatar:user?.avatar };
  }).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)));
});

router.get('/:id', isAuthenticated, (req, res) => {
  const data = getDB();
  const ticket = data.tickets.find(t=>t.id===parseInt(req.params.id));
  if (!ticket) return res.status(404).json({ error: 'التذكرة غير موجودة' });
  const STAFF = ['helper','support','moderator','admin','senior-admin','head-admin','founder','owner'];
  if (ticket.user_id !== req.user.id && !STAFF.includes(req.user.role)) return res.status(403).json({ error: 'غير مصرح' });
  const user = data.users.find(u=>u.id===ticket.user_id);
  const messages = data.ticket_messages.filter(m=>m.ticket_id===ticket.id).map(m=>{
    const mu = data.users.find(u=>u.id===m.user_id);
    return { ...m, username:mu?.username, avatar:mu?.avatar, role:mu?.role, role_color:mu?.role_color };
  }).sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
  res.json({ ...ticket, username:user?.username, avatar:user?.avatar, messages });
});

router.post('/:id/reply', isAuthenticated, (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'الرسالة فارغة' });
  const data = getDB();
  const ticket = data.tickets.find(t=>t.id===parseInt(req.params.id));
  if (!ticket) return res.status(404).json({ error: 'التذكرة غير موجودة' });
  if (ticket.status==='closed') return res.status(400).json({ error: 'التذكرة مغلقة' });
  const STAFF = ['helper','support','moderator','admin','senior-admin','head-admin','founder','owner'];
  if (ticket.user_id !== req.user.id && !STAFF.includes(req.user.role)) return res.status(403).json({ error: 'غير مصرح' });
  data.ticket_messages.push({ id:nextId('ticket_messages'), ticket_id:ticket.id, user_id:req.user.id, message:sanitize(message), created_at:new Date().toISOString() });
  saveDB(data);
  if (req.user.id !== ticket.user_id) sendNotification(ticket.user_id, '💬 رد جديد على تذكرتك', `تم الرد على: ${ticket.title}`, 'info', `/tickets/${ticket.id}`);
  res.json({ success:true });
});

router.patch('/:id/status', isAuthenticated, (req, res) => {
  const { status } = req.body;
  const data = getDB();
  const ticket = data.tickets.find(t=>t.id===parseInt(req.params.id));
  if (!ticket) return res.status(404).json({ error: 'التذكرة غير موجودة' });
  const STAFF = ['helper','support','moderator','admin','senior-admin','head-admin','founder','owner'];
  if (ticket.user_id !== req.user.id && !STAFF.includes(req.user.role)) return res.status(403).json({ error: 'غير مصرح' });
  ticket.status = status;
  if (status==='closed') { ticket.closed_by=req.user.id; ticket.closed_at=new Date().toISOString(); }
  else { ticket.closed_by=null; ticket.closed_at=null; }
  saveDB(data);
  logActivity(req.user.id, status==='closed'?'إغلاق تذكرة':'إعادة فتح تذكرة', 'ticket', ticket.id, null, req.ip);
  res.json({ success:true });
});

router.patch('/:id', hasRole('helper'), (req, res) => {
  const { status, assigned_to } = req.body;
  const data = getDB();
  const ticket = data.tickets.find(t=>t.id===parseInt(req.params.id));
  if (!ticket) return res.status(404).json({ error: 'التذكرة غير موجودة' });
  if (status) { ticket.status=status; if (status==='closed') { ticket.closed_by=req.user.id; ticket.closed_at=new Date().toISOString(); } }
  if (assigned_to !== undefined) ticket.assigned_to = assigned_to;
  saveDB(data);
  res.json({ success:true });
});

router.delete('/:id', hasRole('admin'), (req, res) => {
  const data = getDB();
  const idx = data.tickets.findIndex(t=>t.id===parseInt(req.params.id));
  if (idx===-1) return res.status(404).json({ error: 'التذكرة غير موجودة' });
  data.ticket_messages = data.ticket_messages.filter(m=>m.ticket_id!==parseInt(req.params.id));
  data.tickets.splice(idx,1);
  saveDB(data);
  res.json({ success:true });
});

module.exports = router;
