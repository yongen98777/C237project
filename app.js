require('dotenv').config();
const express = require('express');
const session = require('express-session');
const mysql = require('mysql2');
const bcrypt = require('bcryptjs');
const methodOverride = require('method-override');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ============ DATABASE CONNECTION ============
const db = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'Yongen987',
    database: process.env.DB_NAME || 'gaming_tournament'
});

db.connect((err) => {
    if (err) {
        console.error('❌ Database connection failed:', err);
        process.exit(1);
    }
    console.log('✅ Connected to MySQL database');
});

// ============ MIDDLEWARE ============
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
    secret: process.env.SESSION_SECRET || 'default_secret_key',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000
    }
}));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Make user data available to all views
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    res.locals.isAuthenticated = !!req.session.user;
    res.locals.success = req.session.success || null;
    res.locals.error = req.session.error || null;
    req.session.success = null;
    req.session.error = null;
    next();
});

// ============ AUTHENTICATION MIDDLEWARE ============
const isAuthenticated = (req, res, next) => {
    if (req.session.user) return next();
    req.session.error = 'Please login first';
    res.redirect('/auth/login');
};

const isOrganizer = (req, res, next) => {
    if (!req.session.user) {
        req.session.error = 'Please login first';
        return res.redirect('/auth/login');
    }
    if (req.session.user.role === 'admin' || req.session.user.role === 'organizer') {
        return next();
    }
    req.session.error = 'You need organizer or admin permissions';
    res.redirect('/dashboard');
};

const isAdmin = (req, res, next) => {
    if (!req.session.user) {
        req.session.error = 'Please login first';
        return res.redirect('/auth/login');
    }
    if (req.session.user.role === 'admin') return next();
    req.session.error = 'Admin access required';
    res.redirect('/dashboard');
};

// ============ AUTH ROUTES ============

// Login page
app.get('/auth/login', (req, res) => {
    if (req.session.user) return res.redirect('/dashboard');
    res.render('login');
});

// Login process
app.post('/auth/login', async (req, res) => {
    const { email, password } = req.body;
    
    db.query('SELECT * FROM users WHERE email = ?', [email], async (err, results) => {
        if (err || results.length === 0) {
            req.session.error = 'Invalid email or password';
            return res.redirect('/auth/login');
        }
        
        const user = results[0];
        const isValid = await bcrypt.compare(password, user.password);
        
        if (!isValid) {
            req.session.error = 'Invalid email or password';
            return res.redirect('/auth/login');
        }
        
        req.session.user = {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            gaming_handle: user.gaming_handle,
            xp_points: user.xp_points
        };
        
        req.session.success = 'Welcome back!';
        res.redirect('/dashboard');
    });
});

// Register page
app.get('/auth/register', (req, res) => {
    if (req.session.user) return res.redirect('/dashboard');
    res.render('register');
});

// Register process
app.post('/auth/register', async (req, res) => {
    const { username, email, password, confirm_password, role, gaming_handle } = req.body;
    
    if (password !== confirm_password) {
        req.session.error = 'Passwords do not match';
        return res.redirect('/auth/register');
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    db.query(
        'INSERT INTO users (username, email, password, role, gaming_handle) VALUES (?, ?, ?, ?, ?)',
        [username, email, hashedPassword, role || 'player', gaming_handle],
        (err) => {
            if (err) {
                if (err.code === 'ER_DUP_ENTRY') {
                    req.session.error = 'Username or email already exists';
                } else {
                    req.session.error = 'Registration failed';
                }
                return res.redirect('/auth/register');
            }
            
            req.session.success = 'Registration successful! Please login.';
            res.redirect('/auth/login');
        }
    );
});

// Logout
app.get('/auth/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// ============ DASHBOARD ============
app.get('/dashboard', isAuthenticated, (req, res) => {
    db.query(
        'SELECT COUNT(*) as total FROM tournaments',
        (err, stats) => {
            db.query(
                `SELECT t.*, u.username as creator_name 
                 FROM tournaments t 
                 LEFT JOIN users u ON t.created_by = u.id 
                 ORDER BY t.created_at DESC LIMIT 10`,
                (err, tournaments) => {
                    res.render('dashboard', { 
                        stats: stats ? stats[0] : { total: 0 },
                        tournaments: tournaments || []
                    });
                }
            );
        }
    );
});

// ============ TOURNAMENT ROUTES ============

// View all tournaments
app.get('/tournaments', (req, res) => {
    const { status, game, search } = req.query;
    let query = `
        SELECT t.*, u.username as creator_name 
        FROM tournaments t 
        LEFT JOIN users u ON t.created_by = u.id
    `;
    const conditions = [];
    const values = [];
    
    if (status) { conditions.push('t.status = ?'); values.push(status); }
    if (game) { conditions.push('t.game = ?'); values.push(game); }
    if (search) {
        conditions.push('(t.name LIKE ? OR t.game LIKE ?)');
        values.push(`%${search}%`, `%${search}%`);
    }
    
    if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY t.created_at DESC';
    
    db.query(query, values, (err, tournaments) => {
        res.render('tournaments', { tournaments: tournaments || [], filters: { status, game, search } });
    });
});

// Create tournament page
app.get('/tournaments/create', isOrganizer, (req, res) => {
    res.render('create-tournament');
});

// Create tournament
app.post('/tournaments', isOrganizer, (req, res) => {
    const { name, game, format, prize_pool, max_teams, start_date, end_date } = req.body;
    
    db.query(
        `INSERT INTO tournaments (name, game, format, prize_pool, max_teams, start_date, end_date, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [name, game, format, prize_pool, max_teams, start_date, end_date, req.session.user.id],
        (err) => {
            if (err) {
                req.session.error = 'Failed to create tournament';
                return res.redirect('/tournaments/create');
            }
            req.session.success = 'Tournament created successfully!';
            res.redirect('/tournaments');
        }
    );
});

// View single tournament
app.get('/tournaments/:id', (req, res) => {
    const tournamentId = req.params.id;
    
    db.query(
        `SELECT t.*, u.username as creator_name 
         FROM tournaments t 
         LEFT JOIN users u ON t.created_by = u.id 
         WHERE t.id = ?`,
        [tournamentId],
        (err, results) => {
            if (err || results.length === 0) {
                req.session.error = 'Tournament not found';
                return res.redirect('/tournaments');
            }
            
            const tournament = results[0];
            
            db.query(
                `SELECT t.*, u.username as captain_name 
                 FROM teams t 
                 LEFT JOIN users u ON t.captain_id = u.id 
                 WHERE t.tournament_id = ?`,
                [tournamentId],
                (err, teams) => {
                    db.query(
                        `SELECT m.*, 
                         t1.name as team1_name, t2.name as team2_name, 
                         w.name as winner_name
                         FROM matches m
                         LEFT JOIN teams t1 ON m.team1_id = t1.id
                         LEFT JOIN teams t2 ON m.team2_id = t2.id
                         LEFT JOIN teams w ON m.winner_id = w.id
                         WHERE m.tournament_id = ?
                         ORDER BY m.scheduled_time DESC`,
                        [tournamentId],
                        (err, matches) => {
                            res.render('tournament-detail', { 
                                tournament, 
                                teams: teams || [],
                                matches: matches || []
                            });
                        }
                    );
                }
            );
        }
    );
});

// Edit tournament page
app.get('/tournaments/:id/edit', isOrganizer, (req, res) => {
    db.query('SELECT * FROM tournaments WHERE id = ?', [req.params.id], (err, results) => {
        if (err || results.length === 0) {
            req.session.error = 'Tournament not found';
            return res.redirect('/tournaments');
        }
        res.render('edit-tournament', { tournament: results[0] });
    });
});

// Update tournament
app.put('/tournaments/:id', isOrganizer, (req, res) => {
    const { name, game, format, prize_pool, max_teams, status, start_date, end_date } = req.body;
    
    db.query(
        `UPDATE tournaments 
         SET name = ?, game = ?, format = ?, prize_pool = ?, 
             max_teams = ?, status = ?, start_date = ?, end_date = ?
         WHERE id = ?`,
        [name, game, format, prize_pool, max_teams, status, start_date, end_date, req.params.id],
        (err) => {
            if (err) {
                req.session.error = 'Failed to update tournament';
                return res.redirect(`/tournaments/${req.params.id}/edit`);
            }
            req.session.success = 'Tournament updated successfully!';
            res.redirect(`/tournaments/${req.params.id}`);
        }
    );
});

// Delete tournament
app.delete('/tournaments/:id', isAdmin, (req, res) => {
    db.query('DELETE FROM tournaments WHERE id = ?', [req.params.id], (err) => {
        if (err) {
            req.session.error = 'Failed to delete tournament';
            return res.redirect('/tournaments');
        }
        req.session.success = 'Tournament deleted successfully!';
        res.redirect('/tournaments');
    });
});

// ============ MATCH ROUTES ============

// Create match page
app.get('/matches/create', isOrganizer, (req, res) => {
    const { tournament_id } = req.query;
    
    db.query('SELECT id, name FROM tournaments WHERE status != "completed"', (err, tournaments) => {
        db.query('SELECT id, name FROM teams', (err, teams) => {
            res.render('create-match', { 
                tournaments: tournaments || [],
                teams: teams || [],
                selected_tournament: tournament_id
            });
        });
    });
});

// Create match
app.post('/matches', isOrganizer, (req, res) => {
    const { tournament_id, team1_id, team2_id, scheduled_time } = req.body;
    
    db.query(
        `INSERT INTO matches (tournament_id, team1_id, team2_id, scheduled_time, status)
         VALUES (?, ?, ?, ?, 'scheduled')`,
        [tournament_id, team1_id, team2_id, scheduled_time],
        (err) => {
            if (err) {
                req.session.error = 'Failed to create match';
                return res.redirect('/matches/create');
            }
            req.session.success = 'Match created successfully!';
            res.redirect(`/tournaments/${tournament_id}`);
        }
    );
});

// View all matches
app.get('/matches', (req, res) => {
    db.query(
        `SELECT m.*, 
         t1.name as team1_name, t2.name as team2_name, 
         w.name as winner_name,
         tour.name as tournament_name
         FROM matches m
         LEFT JOIN teams t1 ON m.team1_id = t1.id
         LEFT JOIN teams t2 ON m.team2_id = t2.id
         LEFT JOIN teams w ON m.winner_id = w.id
         LEFT JOIN tournaments tour ON m.tournament_id = tour.id
         ORDER BY m.scheduled_time DESC`,
        (err, matches) => {
            res.render('matches', { matches: matches || [] });
        }
    );
});

// Update match score
app.put('/matches/:id/score', isOrganizer, (req, res) => {
    const { team1_score, team2_score, winner_id } = req.body;
    
    db.query(
        `UPDATE matches 
         SET team1_score = ?, team2_score = ?, winner_id = ?, status = 'completed', completed_at = NOW()
         WHERE id = ?`,
        [team1_score, team2_score, winner_id, req.params.id],
        (err) => {
            if (err) {
                req.session.error = 'Failed to update match';
                return res.redirect('/matches');
            }
            
            // Give XP to winning team
            if (winner_id) {
                db.query(
                    `SELECT user_id FROM team_members WHERE team_id = ?`,
                    [winner_id],
                    (err, members) => {
                        if (!err && members.length > 0) {
                            const userIds = members.map(m => m.user_id);
                            db.query(
                                `UPDATE users SET xp_points = xp_points + 10 WHERE id IN (?)`,
                                [userIds]
                            );
                        }
                    }
                );
            }
            
            req.session.success = 'Match score updated!';
            res.redirect('/matches');
        }
    );
});

// ============ TEAM ROUTES ============

// Create team
app.post('/teams', isAuthenticated, (req, res) => {
    const { name, tournament_id } = req.body;
    
    db.query(
        'INSERT INTO teams (name, tournament_id, captain_id) VALUES (?, ?, ?)',
        [name, tournament_id, req.session.user.id],
        (err, result) => {
            if (err) {
                req.session.error = 'Failed to create team';
                return res.redirect(`/tournaments/${tournament_id}`);
            }
            
            const teamId = result.insertId;
            db.query(
                'INSERT INTO team_members (team_id, user_id) VALUES (?, ?)',
                [teamId, req.session.user.id]
            );
            
            req.session.success = 'Team created successfully!';
            res.redirect(`/tournaments/${tournament_id}`);
        }
    );
});

// Join team
app.post('/teams/:id/join', isAuthenticated, (req, res) => {
    db.query(
        'INSERT INTO team_members (team_id, user_id) VALUES (?, ?)',
        [req.params.id, req.session.user.id],
        (err) => {
            if (err) {
                req.session.error = 'Failed to join team';
                return res.redirect('/tournaments');
            }
            req.session.success = 'You have joined the team!';
            res.redirect('/tournaments');
        }
    );
});

// ============ HOME PAGE ============
app.get('/', (req, res) => {
    db.query(
        `SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN status = 'registration' THEN 1 ELSE 0 END) as registration,
            SUM(CASE WHEN status = 'ongoing' THEN 1 ELSE 0 END) as ongoing,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
         FROM tournaments`,
        (err, statsResults) => {
            db.query(
                `SELECT t.*, u.username as creator_name 
                 FROM tournaments t 
                 LEFT JOIN users u ON t.created_by = u.id 
                 ORDER BY t.created_at DESC LIMIT 5`,
                (err, tournaments) => {
                    res.render('index', {
                        stats: statsResults ? statsResults[0] : { total: 0, registration: 0, ongoing: 0, completed: 0 },
                        recentTournaments: tournaments || []
                    });
                }
            );
        }
    );
});

// ============ START SERVER ============
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});