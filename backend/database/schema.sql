-- Mumbai Share Auto Database Schema

-- Create database (run manually if needed)
-- CREATE DATABASE IF NOT EXISTS mumbai_share_auto;
-- USE mumbai_share_auto;

-- Table: users
-- Purpose: Store user accounts for authentication (admin, regular users, autowalas)
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  role ENUM('admin', 'user', 'autowala') DEFAULT 'user' NOT NULL,
  phone_number VARCHAR(15),
  full_name VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: autowala_details
-- Purpose: Store autowala-specific information (driver and auto details)
CREATE TABLE IF NOT EXISTS autowala_details (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  license_plate VARCHAR(20) NOT NULL UNIQUE,
  driver_name VARCHAR(100) NOT NULL,
  operating_location VARCHAR(100),
  driver_phone VARCHAR(15),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_autowala_user
    FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE CASCADE,

  INDEX idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: emergency_contacts
-- Purpose: Store emergency contacts for regular users
CREATE TABLE IF NOT EXISTS emergency_contacts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  contact_name VARCHAR(100) NOT NULL,
  contact_phone VARCHAR(15) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_emergency_user
    FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE CASCADE,

  INDEX idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: stands
-- Purpose: Store share auto stand locations and details
CREATE TABLE IF NOT EXISTS stands (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  latitude DECIMAL(10,8) NOT NULL,
  longitude DECIMAL(11,8) NOT NULL,
  operating_hours VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  -- Constraints for Mumbai coordinates
  CHECK (latitude BETWEEN 18.8 AND 19.3),
  CHECK (longitude BETWEEN 72.7 AND 73.0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: routes
-- Purpose: Store route information for each stand
CREATE TABLE IF NOT EXISTS routes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  stand_id INT NOT NULL,
  destination VARCHAR(100) NOT NULL,
  fare DECIMAL(6,2) NOT NULL,
  travel_time VARCHAR(20) NOT NULL,
  destination_lat DECIMAL(10,8) NOT NULL,
  destination_lng DECIMAL(11,8) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  -- Foreign key constraint
  CONSTRAINT fk_stand
    FOREIGN KEY (stand_id)
    REFERENCES stands(id)
    ON DELETE CASCADE,

  -- Index for faster lookups
  INDEX idx_stand_id (stand_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: bookings
-- Purpose: Store booking/reservation information for auto rides
CREATE TABLE IF NOT EXISTS bookings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  driver_id INT NULL,
  pickup_latitude DECIMAL(10,8) NOT NULL,
  pickup_longitude DECIMAL(11,8) NOT NULL,
  destination_latitude DECIMAL(10,8) NOT NULL,
  destination_longitude DECIMAL(11,8) NOT NULL,
  pickup_address VARCHAR(255) NOT NULL,
  destination_address VARCHAR(255) NOT NULL,
  estimated_fare DECIMAL(10,2) NOT NULL,
  status ENUM('requested', 'accepted', 'in_transit', 'completed', 'cancelled') DEFAULT 'requested' NOT NULL,
  requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  accepted_at TIMESTAMP NULL,
  started_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  cancelled_reason TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_booking_user
    FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE CASCADE,

  CONSTRAINT fk_booking_driver
    FOREIGN KEY (driver_id)
    REFERENCES users(id)
    ON DELETE CASCADE,

  INDEX idx_user_id (user_id),
  INDEX idx_driver_id (driver_id),
  INDEX idx_status (status),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: driver_status
-- Purpose: Track driver online/offline status and real-time location for WebSocket broadcasts
CREATE TABLE IF NOT EXISTS driver_status (
  id INT AUTO_INCREMENT PRIMARY KEY,
  driver_id INT NOT NULL UNIQUE,
  is_online BOOLEAN DEFAULT FALSE,
  availability_status ENUM('available', 'busy') DEFAULT 'available',
  current_latitude DECIMAL(10,8) NULL,
  current_longitude DECIMAL(11,8) NULL,
  last_location_update TIMESTAMP NULL,
  current_booking_id INT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_driver_status_user
    FOREIGN KEY (driver_id)
    REFERENCES users(id)
    ON DELETE CASCADE,

  CONSTRAINT fk_driver_status_booking
    FOREIGN KEY (current_booking_id)
    REFERENCES bookings(id)
    ON DELETE SET NULL,

  INDEX idx_driver_id (driver_id),
  INDEX idx_is_online (is_online)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: booking_messages
-- Purpose: Store chat messages between user and driver for a specific booking
CREATE TABLE IF NOT EXISTS booking_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  booking_id INT NOT NULL,
  sender_id INT NOT NULL,
  sender_role ENUM('user', 'driver') NOT NULL,
  message_text TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_message_booking
    FOREIGN KEY (booking_id)
    REFERENCES bookings(id)
    ON DELETE CASCADE,

  CONSTRAINT fk_message_sender
    FOREIGN KEY (sender_id)
    REFERENCES users(id)
    ON DELETE CASCADE,

  INDEX idx_booking_id (booking_id),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: network_connections
-- Purpose: Define direct connections between stands for graph traversal
CREATE TABLE IF NOT EXISTS network_connections (
  id INT AUTO_INCREMENT PRIMARY KEY,
  from_stand_id INT NOT NULL,
  to_stand_id INT NOT NULL,
  connection_type ENUM('direct', 'transfer') DEFAULT 'direct',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_from_stand
    FOREIGN KEY (from_stand_id)
    REFERENCES stands(id)
    ON DELETE CASCADE,

  CONSTRAINT fk_to_stand
    FOREIGN KEY (to_stand_id)
    REFERENCES stands(id)
    ON DELETE CASCADE,

  UNIQUE KEY unique_connection (from_stand_id, to_stand_id),
  INDEX idx_from_stand (from_stand_id),
  INDEX idx_to_stand (to_stand_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: route_cache
-- Purpose: Cache calculated routes to improve performance
CREATE TABLE IF NOT EXISTS route_cache (
  id INT AUTO_INCREMENT PRIMARY KEY,
  from_stand_id INT NOT NULL,
  to_stand_id INT NOT NULL,
  to_lat DECIMAL(10,8) NOT NULL,
  to_lng DECIMAL(11,8) NOT NULL,
  route_data JSON NOT NULL,
  total_time_minutes INT NOT NULL,
  segment_count INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,

  CONSTRAINT fk_cache_from_stand
    FOREIGN KEY (from_stand_id)
    REFERENCES stands(id)
    ON DELETE CASCADE,

  CONSTRAINT fk_cache_to_stand
    FOREIGN KEY (to_stand_id)
    REFERENCES stands(id)
    ON DELETE CASCADE,

  INDEX idx_route_lookup (from_stand_id, to_stand_id, to_lat, to_lng),
  INDEX idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: user_favorites
-- Purpose: Store user's favorite routes
CREATE TABLE IF NOT EXISTS user_favorites (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  from_stand_id INT NOT NULL,
  to_destination VARCHAR(100) NOT NULL,
  to_lat DECIMAL(10,8),
  to_lng DECIMAL(11,8),
  nickname VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_favorite_user
    FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE CASCADE,

  CONSTRAINT fk_favorite_from_stand
    FOREIGN KEY (from_stand_id)
    REFERENCES stands(id)
    ON DELETE CASCADE,

  INDEX idx_user_favorites (user_id),
  INDEX idx_user_stand_combo (user_id, from_stand_id, to_destination)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
