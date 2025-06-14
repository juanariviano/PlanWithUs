-- USERS table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255),
    email VARCHAR(255),
    password VARCHAR(255),
    created_at TIMESTAMP WITHOUT TIME ZONE,
    balance DECIMAL(15, 2) DEFAULT 0.00,
    bank_account VARCHAR(255)
);

-- EVENT table
CREATE TABLE IF NOT EXISTS event (
    id SERIAL PRIMARY KEY,
    event_name VARCHAR(50),
    coordinator_name VARCHAR(50),
    email VARCHAR(100),
    target_money INT,
    proposal_file BYTEA,
    additional_notes TEXT,
    status VARCHAR(20),
    raised_money INT,
    thumbnail_photo TEXT,
    end_date TIMESTAMP WITHOUT TIME ZONE,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    volunteer_needed BOOLEAN,
    volunteer_description TEXT,
    max_volunteers INT
);

-- VOLUNTEERS table
CREATE TABLE IF NOT EXISTS volunteers (
    id SERIAL PRIMARY KEY,
    event_id INT REFERENCES event(id) ON DELETE CASCADE,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(50),
    message TEXT,
    status VARCHAR(50),
    created_at TIMESTAMP WITHOUT TIME ZONE,
    updated_at TIMESTAMP WITHOUT TIME ZONE,
    coordinator_email VARCHAR(255)
);

-- DONATION_HISTORY table
CREATE TABLE IF NOT EXISTS donation_history (
    id SERIAL PRIMARY KEY,
    event_id INT REFERENCES event(id) ON DELETE CASCADE,
    donation_amount INT,
    donation_date TIMESTAMP WITHOUT TIME ZONE,
    user_id INT REFERENCES users(id) ON DELETE CASCADE
);

-- BADGES table
CREATE TABLE IF NOT EXISTS badges (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    image_url TEXT  -- URL or file path to the badge image
);

-- USER_BADGES table
CREATE TABLE IF NOT EXISTS user_badges (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    badge_id INTEGER NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
    awarded_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, badge_id)
);

-- USER_TRANSACTIONS table
CREATE TABLE IF NOT EXISTS user_transactions (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    transaction_type VARCHAR(20) CHECK (transaction_type IN ('TOP_UP', 'WITHDRAWAL', 'DONATION', 'EVENT_INCOME')),
    amount DECIMAL(15, 2),
    transaction_date TIMESTAMP WITHOUT TIME ZONE,
    event_id INT REFERENCES event(id) ON DELETE SET NULL,
    donation_id INT REFERENCES donation_history(id) ON DELETE SET NULL,
    description TEXT
);
