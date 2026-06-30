const DiscordStrategy = require('passport-discord').Strategy;
const { getDB, saveDB, nextId } = require('../models/database');

const ROLE_COLORS = {
  owner:'#ff4757', founder:'#ffd700', 'head-admin':'#ff6b35',
  'senior-admin':'#ff9f43', admin:'#ee5a24', moderator:'#0652dd',
  support:'#1289a7', helper:'#5f27cd', user:'#6c757d'
};

module.exports = (passport) => {
  passport.use(new DiscordStrategy({
    clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackURL: process.env.DISCORD_CALLBACK_URL,
    scope: ['identify', 'email', 'guilds'],
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      const data = getDB();
      let userRole = 'user';
      
      if (profile.id === process.env.FOUNDER_DISCORD_ID) {
        userRole = 'founder';
      }

      const avatarUrl = profile.avatar
        ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`
        : `https://cdn.discordapp.com/embed/avatars/0.png`;

      const existing = data.users.find(u => u.discord_id === profile.id);
      
      if (existing) {
        if (existing.banned) return done(null, false, { message: 'تم حظر حسابك' });
        const newRole = existing.discord_id === process.env.FOUNDER_DISCORD_ID ? 'founder' : userRole;
        existing.username = profile.username;
        existing.avatar = avatarUrl;
        existing.role = newRole;
        existing.role_color = ROLE_COLORS[newRole] || '#6c757d';
        existing.last_login = new Date().toISOString();
        saveDB(data);
        return done(null, existing);
      } else {
        const newUser = {
          id: nextId('users'),
          discord_id: profile.id,
          username: profile.username,
          avatar: avatarUrl,
          email: profile.email || '',
          role: userRole,
          role_color: ROLE_COLORS[userRole] || '#6c757d',
          banned: 0,
          ban_reason: null,
          notifications_count: 0,
          created_at: new Date().toISOString(),
          last_login: new Date().toISOString()
        };
        data.users.push(newUser);
        saveDB(data);
        return done(null, newUser);
      }
    } catch (err) {
      return done(err);
    }
  }));

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser((id, done) => {
    const data = getDB();
    const user = data.users.find(u => u.id === id);
    done(null, user || false);
  });
};
