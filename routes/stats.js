const express = require('express');
const router = express.Router();
const { getDB } = require('../models/database');

router.get('/', (req, res) => {
  const data = getDB();
  res.json({
    applications: data.applications.length,
    applications_pending: data.applications.filter(a=>a.status==='pending').length,
    tickets: data.tickets.filter(t=>t.status==='open').length,
    complaints: data.complaints.filter(c=>c.status==='pending').length,
    reports: data.reports.filter(r=>r.status==='pending').length,
    suggestions: data.suggestions.length,
    total_users: data.users.length,
    staff_count: data.users.filter(u=>u.role!=='user').length,
    announcements: data.announcements.length,
  });
});

module.exports = router;
