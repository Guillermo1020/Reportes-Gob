CREATE DATABASE IF NOT EXISTS portal_gobierno CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE portal_gobierno;

CREATE TABLE IF NOT EXISTS reports (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  category VARCHAR(80) NOT NULL,
  description TEXT NOT NULL,
  address VARCHAR(255) NOT NULL,
  latitude DECIMAL(10, 7) NULL,
  longitude DECIMAL(10, 7) NULL,
  reporter_name VARCHAR(120) NULL,
  reporter_email VARCHAR(180) NULL,
  photo_path VARCHAR(255) NOT NULL,
  status ENUM('pendiente', 'proceso', 'resuelto', 'denegado') NOT NULL DEFAULT 'pendiente',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
