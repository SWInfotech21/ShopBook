-- Schema for daily_expenses25
SET NAMES utf8mb4;
SET time_zone = '+05:30';

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('readonly_admin','admin','user') NOT NULL,
  active TINYINT(1) DEFAULT 1,
  allowed_time_start TIME NULL,
  allowed_time_end TIME NULL,
  email VARCHAR(255) NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS password_resets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  token VARCHAR(255) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pwreset_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS accounts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL UNIQUE,
  type ENUM('cash','bank','wallet') NOT NULL,
  opening_balance DECIMAL(15,2) NOT NULL DEFAULT 0,
  current_balance DECIMAL(15,2) NOT NULL DEFAULT 0,
  notes TEXT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  transaction_ref VARCHAR(50) NOT NULL UNIQUE,
  type ENUM('MT','R','T','PS','PP','LN_GIVEN','LN_REPAY') NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  commission_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  commission_account_id INT NULL,
  received_in_account_id INT NULL,
  debit_from_account_id INT NULL,
  option_pay_later TINYINT(1) DEFAULT 0,
  remarks VARCHAR(1000) NULL,
  created_by INT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_tx_commission_account FOREIGN KEY (commission_account_id) REFERENCES accounts(id),
  CONSTRAINT fk_tx_received_account FOREIGN KEY (received_in_account_id) REFERENCES accounts(id),
  CONSTRAINT fk_tx_debit_account FOREIGN KEY (debit_from_account_id) REFERENCES accounts(id),
  CONSTRAINT fk_tx_user FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS transaction_lines (
  id INT AUTO_INCREMENT PRIMARY KEY,
  transaction_id INT NOT NULL,
  account_id INT NOT NULL,
  direction ENUM('debit','credit') NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  notes VARCHAR(255) NULL,
  CONSTRAINT fk_tl_tx FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE,
  CONSTRAINT fk_tl_acc FOREIGN KEY (account_id) REFERENCES accounts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS loans (
  id INT AUTO_INCREMENT PRIMARY KEY,
  transaction_id INT NOT NULL,
  party_name VARCHAR(255) NULL,
  amount DECIMAL(15,2) NOT NULL,
  due_date DATE NULL,
  status ENUM('open','partially_paid','closed') NOT NULL DEFAULT 'open',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_loan_tx FOREIGN KEY (transaction_id) REFERENCES transactions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  entity VARCHAR(50) NOT NULL,
  entity_id INT NOT NULL,
  action VARCHAR(50) NOT NULL,
  old_value JSON NULL,
  new_value JSON NULL,
  performed_by INT NOT NULL,
  performed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_entity (entity, entity_id),
  CONSTRAINT fk_audit_user FOREIGN KEY (performed_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
