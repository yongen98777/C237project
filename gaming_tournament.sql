-- Create database
CREATE DATABASE IF NOT EXISTS gaming_tournament;
USE gaming_tournament;

-- Users table
CREATE TABLE users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role ENUM('admin', 'organizer', 'player') DEFAULT 'player',
    gaming_handle VARCHAR(50),
    xp_points INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tournaments table
CREATE TABLE tournaments (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    game VARCHAR(50) NOT NULL,
    format VARCHAR(50) NOT NULL,
    prize_pool DECIMAL(10,2) DEFAULT 0.00,
    max_teams INT DEFAULT 16,
    status ENUM('registration', 'ongoing', 'completed') DEFAULT 'registration',
    start_date DATE,
    end_date DATE,
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Teams table
CREATE TABLE teams (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(50) NOT NULL,
    tournament_id INT,
    captain_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
    FOREIGN KEY (captain_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Team members table
CREATE TABLE team_members (
    team_id INT,
    user_id INT,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (team_id, user_id),
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Matches table
CREATE TABLE matches (
    id INT PRIMARY KEY AUTO_INCREMENT,
    tournament_id INT,
    team1_id INT,
    team2_id INT,
    winner_id INT,
    team1_score INT DEFAULT 0,
    team2_score INT DEFAULT 0,
    status ENUM('scheduled', 'ongoing', 'completed') DEFAULT 'scheduled',
    scheduled_time DATETIME,
    completed_at TIMESTAMP NULL,
    FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
    FOREIGN KEY (team1_id) REFERENCES teams(id) ON DELETE SET NULL,
    FOREIGN KEY (team2_id) REFERENCES teams(id) ON DELETE SET NULL,
    FOREIGN KEY (winner_id) REFERENCES teams(id) ON DELETE SET NULL
);

-- Insert sample users (password: 'password123' hashed)
INSERT INTO users (username, email, password, role, gaming_handle) VALUES
('admin', 'admin@example.com', '$2a$10$H7zPZq8yZq8yZq8yZq8yZuZq8yZq8yZq8yZq8yZq8yZq8yZq8y', 'admin', 'AdminPro'),
('organizer1', 'org@example.com', '$2a$10$H7zPZq8yZq8yZq8yZq8yZuZq8yZq8yZq8yZq8yZq8yZq8yZq8y', 'organizer', 'OrgMaster'),
('player1', 'player@example.com', '$2a$10$H7zPZq8yZq8yZq8yZq8yZuZq8yZq8yZq8yZq8yZq8yZq8yZq8y', 'player', 'GamerPro'),
('player2', 'player2@example.com', '$2a$10$H7zPZq8yZq8yZq8yZq8yZuZq8yZq8yZq8yZq8yZq8yZq8yZq8y', 'player', 'NinjaGamer');

-- Insert sample tournaments (UPDATED TO 2026)
INSERT INTO tournaments (name, game, format, prize_pool, max_teams, status, start_date, end_date, created_by) VALUES
('Summer Showdown 2026', 'Valorant', '5v5', 1000.00, 16, 'ongoing', '2026-06-01', '2026-06-30', 2),
('Weekly CS2 Cup 2026', 'Counter-Strike 2', '5v5', 500.00, 8, 'registration', '2026-07-01', '2026-07-07', 2),
('Dota 2 Championship 2026', 'Dota 2', '5v5', 2000.00, 12, 'completed', '2026-05-01', '2026-05-15', 2);