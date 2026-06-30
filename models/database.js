const path = require('path');
const fs = require('fs');

if (!fs.existsSync('./data')) fs.mkdirSync('./data');

let db;
const DB_PATH = path.join(__dirname, '../data/trust_rp.json');

function loadDB() {
  if (fs.existsSync(DB_PATH)) {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  }
  return {
    users: [], applications: [], application_questions: [],
    tickets: [], ticket_messages: [], complaints: [], reports: [],
    suggestions: [], suggestion_votes: [], staff_thanks: [],
    announcements: [], notifications: [], activity_logs: [],
    ranks: [], faqs: [], rules: [], counters: {}
  };
}

function saveDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function getDB() {
  return loadDB();
}

function nextId(table) {
  const data = loadDB();
  if (!data.counters[table]) data.counters[table] = 0;
  data.counters[table]++;
  saveDB(data);
  return data.counters[table];
}

// تهيئة البيانات الافتراضية
function initDB() {
  const data = loadDB();
  
  if (!data.ranks || data.ranks.length === 0) {
    data.ranks = [
      { id:1, name:'Owner',       slug:'owner',        color:'#ff4757', level:10, description:'مالك السيرفر',    is_active:1 },
      { id:2, name:'Founder',     slug:'founder',      color:'#ffd700', level:9,  description:'مؤسس السيرفر',   is_active:1 },
      { id:3, name:'Head Admin',  slug:'head-admin',   color:'#ff6b35', level:8,  description:'رئيس الإدارة',   is_active:1 },
      { id:4, name:'Senior Admin',slug:'senior-admin', color:'#ff9f43', level:7,  description:'إداري أول',       is_active:1 },
      { id:5, name:'Admin',       slug:'admin',        color:'#ee5a24', level:6,  description:'إداري',           is_active:1 },
      { id:6, name:'Moderator',   slug:'moderator',    color:'#0652dd', level:5,  description:'مشرف',            is_active:1 },
      { id:7, name:'Support',     slug:'support',      color:'#1289a7', level:4,  description:'دعم',             is_active:1 },
      { id:8, name:'Helper',      slug:'helper',       color:'#5f27cd', level:3,  description:'مساعد',           is_active:1 },
    ];
    data.counters.ranks = 8;
  }

  if (!data.application_questions || data.application_questions.length === 0) {
    data.application_questions = [
      { id:1, rank_slug:'admin', question:'ما هو اسمك الحقيقي؟',              type:'text',     required:1, order_num:1 },
      { id:2, rank_slug:'admin', question:'كم عمرك؟',                          type:'number',   required:1, order_num:2 },
      { id:3, rank_slug:'admin', question:'كم ساعة يمكنك العمل يومياً؟',       type:'text',     required:1, order_num:3 },
      { id:4, rank_slug:'admin', question:'ما هي خبرتك في الإدارة؟',           type:'textarea', required:1, order_num:4 },
      { id:5, rank_slug:'admin', question:'لماذا تريد الانضمام لفريق الإدارة؟', type:'textarea', required:1, order_num:5 },
    ];
    data.counters.application_questions = 5;
  }

  saveDB(data);
  console.log('✅ قاعدة البيانات جاهزة');
  return { getDB, saveDB, nextId };
}

module.exports = { initDB, getDB, saveDB, nextId };
