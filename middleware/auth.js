const { getDB, saveDB, nextId } = require('../models/database');

const ROLE_LEVELS = {
  user:0, helper:3, support:4, moderator:5,
  admin:6, 'senior-admin':7, 'head-admin':8, founder:9, owner:10
};

function isAuthenticated(req, res, next) {
  if (req.isAuthenticated()) return next();
  return res.status(401).json({ error: 'يجب تسجيل الدخول أولاً', redirect: '/auth/discord' });
}

function isOwnerOrFounder(req, res, next) {
  if (!req.isAuthenticated()) {
    if (req.accepts('html')) return res.redirect('/admin/login');
    return res.status(401).json({ error: 'غير مصرح' });
  }
  const role = req.user.role;
  if (role === 'owner' || role === 'founder') return next();
  logActivity(req.user.id, '⛔ محاولة دخول غير مصرحة', 'security', null, `IP: ${req.ip}`, req.ip);
  if (req.accepts('html')) return res.status(403).sendFile(require('path').join(__dirname, '../public/403.html'));
  return res.status(403).json({ error: '⛔ ممنوع' });
}

function adminApiGuard(req, res, next) {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'غير مصرح' });
  const role = req.user.role;
  if (role === 'owner' || role === 'founder') return next();
  logActivity(req.user.id, '⛔ محاولة الوصول لـ Admin API', 'security', null, `${req.method} ${req.path}`, req.ip);
  return res.status(403).json({ error: '⛔ ممنوع' });
}

function hasRole(minRole) {
  return (req, res, next) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'يجب تسجيل الدخول' });
    const userLevel = ROLE_LEVELS[req.user.role] || 0;
    const requiredLevel = ROLE_LEVELS[minRole] || 0;
    if (userLevel >= requiredLevel) return next();
    return res.status(403).json({ error: 'ليس لديك صلاحية' });
  };
}

function logActivity(userId, action, targetType=null, targetId=null, details=null, ip=null) {
  try {
    const data = getDB();
    data.activity_logs.push({
      id: nextId('activity_logs'),
      user_id: userId,
      action, target_type: targetType,
      target_id: targetId,
      details, ip_address: ip,
      created_at: new Date().toISOString()
    });
    if (data.activity_logs.length > 1000) data.activity_logs = data.activity_logs.slice(-1000);
    saveDB(data);
  } catch(e) { console.error('Log error:', e); }
}

function sendNotification(userId, title, message, type='info', link=null) {
  try {
    const data = getDB();
    data.notifications.push({
      id: nextId('notifications'),
      user_id: userId, title, message, type, link,
      is_read: 0, created_at: new Date().toISOString()
    });
    const user = data.users.find(u => u.id === userId);
    if (user) user.notifications_count = (user.notifications_count || 0) + 1;
    saveDB(data);
  } catch(e) { console.error('Notification error:', e); }
}

async function sendWebhook(webhookUrl, data) {
  if (!webhookUrl || webhookUrl.includes('YOUR_WEBHOOK')) return;
  try { const axios = require('axios'); await axios.post(webhookUrl, data); }
  catch(e) { console.error('Webhook error:', e.message); }
}

function sanitize(str) {
  if (!str) return '';
  const xss = require('xss');
  return xss(str.toString().trim());
}

module.exports = { isAuthenticated, isOwnerOrFounder, adminApiGuard, hasRole, logActivity, sendNotification, sendWebhook, sanitize, ROLE_LEVELS };
