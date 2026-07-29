-- Sajra (Family Tree) database schema
CREATE DATABASE IF NOT EXISTS sajra CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE sajra;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(150) NULL,
  email VARCHAR(150) NULL,
  role ENUM('admin','editor') NOT NULL DEFAULT 'editor',
  password VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS members (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  name_ur VARCHAR(150) NULL,
  gender ENUM('male','female') NOT NULL,
  dob DATE NULL,
  dod DATE NULL,
  birthplace VARCHAR(150) NULL,
  photo VARCHAR(255) NULL,
  bio TEXT NULL,
  father_id INT NULL,
  mother_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (father_id) REFERENCES members(id) ON DELETE SET NULL,
  FOREIGN KEY (mother_id) REFERENCES members(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS spouses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  member_id INT NOT NULL,
  spouse_id INT NOT NULL,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
  FOREIGN KEY (spouse_id) REFERENCES members(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_pair (member_id, spouse_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS gallery_images (
  id INT AUTO_INCREMENT PRIMARY KEY,
  filename VARCHAR(255) NOT NULL,
  caption VARCHAR(255) NULL,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Default admin login: username = admin, password = admin123
-- (Change this password after first login)
INSERT INTO users (username, name, role, password) VALUES
('admin', 'Administrator', 'admin', '$2y$10$qABwmnQKaoRc5hYJxxebJ.RyyOQKq4CV6xEw4Pqws47Db0Rw8J6xq')
ON DUPLICATE KEY UPDATE username = username;
