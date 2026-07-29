-- Sajra (Family Tree) database schema — PostgreSQL / Supabase
-- Run this against your Supabase project's database (e.g. via the SQL Editor).

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(150) NULL,
  email VARCHAR(150) NULL,
  role VARCHAR(10) NOT NULL DEFAULT 'editor' CHECK (role IN ('admin', 'editor')),
  password VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS members (
  id SERIAL PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  name_ur VARCHAR(150) NULL,
  gender VARCHAR(10) NOT NULL CHECK (gender IN ('male', 'female')),
  dob DATE NULL,
  dod DATE NULL,
  birthplace VARCHAR(150) NULL,
  photo VARCHAR(255) NULL,
  bio TEXT NULL,
  father_id INT NULL REFERENCES members(id) ON DELETE SET NULL,
  mother_id INT NULL REFERENCES members(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS spouses (
  id SERIAL PRIMARY KEY,
  member_id INT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  spouse_id INT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  CONSTRAINT uniq_pair UNIQUE (member_id, spouse_id)
);

CREATE TABLE IF NOT EXISTS gallery_images (
  id SERIAL PRIMARY KEY,
  filename VARCHAR(255) NOT NULL,
  caption VARCHAR(255) NULL,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Default admin login: username = admin, password = admin123
-- (Change this password after first login)
INSERT INTO users (username, name, role, password) VALUES
('admin', 'Administrator', 'admin', '$2y$10$qABwmnQKaoRc5hYJxxebJ.RyyOQKq4CV6xEw4Pqws47Db0Rw8J6xq')
ON CONFLICT (username) DO NOTHING;
