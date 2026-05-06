CREATE DATABASE IF NOT EXISTS inventory_db;
USE inventory_db;

CREATE TABLE IF NOT EXISTS items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    inventory_name VARCHAR(255),
    description TEXT,
    photo VARCHAR(255)
);