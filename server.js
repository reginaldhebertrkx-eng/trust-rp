require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');

if (!fs.existsSync('./data')) fs.mkdirSync('./data');
if (!fs.existsSync('./public/uploads')) fs.mkdirSync('./public/uploads', { recursive: true });

const { initDB } = require('./models/database');
initDB();

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));

const limiter = rateLimit({ windowMs: 15*60*1000, max: 300 });
const authLimiter = rateLimit({ windowMs: 15*60*1000, max: 20 });
const adminLimiter = rateLimit({ windowMs: 15*60*1000, max: 100 });
app.use(limiter);
app.use('/auth', authLimiter);
app.use('/admin', adminLimiter);

app.use(morgan('dev'));
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'trust-rp-secret-2024',
  resave: false,
  saveUninitialized: false,
  name: 'trp.sid',
  cookie: {
    secure: false,
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 7*24*60*60*1000
  }
}));

app.use(passport.initialize());
app.use(passport.session());
require('./config/passport')(passport);

app.use('/admin/assets', express.static(path.join(__dirname, 'public/admin')));
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

app.use('/auth', require('./routes/auth'));
app.use('/api/stats', require('./routes/stats'));
app.use('/api/user', require('./routes/user'));
app.use('/api/applications', require('./routes/applications'));
app.use('/api/tickets', require('./routes/tickets'));
app.use('/api/complaints', require('./routes/complaints'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/suggestions', require('./routes/suggestions'));
app.use('/api/announcements', require('./routes/announcements'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/thanks', require('./routes/thanks'));
app.use('/api/search', require('./routes/search'));
app.use('/admin', require('./routes/adminPanel'));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get(/^(?!\/admin|\/auth|\/api).*$/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message || 'خطأ في الخادم' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Trust RP: http://localhost:${PORT}`);
  console.log(`🔒 Admin:    http://localhost:${PORT}/admin`);
});
