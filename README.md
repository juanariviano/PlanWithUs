# Plan With Us

Plan With Us is a platform that empowers individuals to launch and support community-driven environmental projects through funding and volunteering.

---

## Project Overview

Plan With Us aims to foster grassroots environmental action by connecting individuals with project ideas to those willing to support them. Users can submit environmental project proposals (e.g., cleanups, tree plantings), seek funding or volunteers, and collaborate with others to bring their ideas to life. The platform is designed for environmentally conscious individuals, community organizers, and anyone looking to contribute to sustainable change.

---

## Tech Stack

- **Frontend:** EJS (Embedded JavaScript templates)
- **Backend:** Express.js
- **Database:** PostgreSQL
- **Others:** Node.js, npm/yarn, etc.

---

## Installation

Step-by-step guide to get the project running locally.

```bash
git clone https://github.com/juanariviano/PlanWithUs.git

cd PlanWithUs

npm install

npm start
```

---

## Configuration

Example `.env` file:

```
# PostgreSQL Configuration
PG_USER=               # Your PostgreSQL username
PG_PASSWORD=           # Your PostgreSQL password
PG_HOST=               # Your database host (e.g., localhost)
PG_PORT=               # Your PostgreSQL port (commonly 5432)
PG_DATABASE=           # Your PostgreSQL database name (planwithus)

# Session Configuration
SESSION_SECRET=        # A secret key for signing sessions
```

---

## Usage

After starting the application, follow these steps to interact with the platform:

1. **Open your browser** and navigate to:
   `http://localhost:3000`

2. **Explore the Homepage** and browse existing environmental events.

3. **Create an Event**

   - Click on "create"
   - Upload your proposal as a PDF
   - Fill in the event title, description, and required support (funds, volunteers, etc.)

4. **Support an Event**

   - View details of active events
   - Choose to donate or volunteer

5. **User Account Features**

   - Sign up or log in to track your events
   - Manage your events and see your transactions
   - See your impact and get awarded for it

6. **Admin Features** (if applicable)

   - Approve or reject events
   - Monitor event progress

---

## Database Setup

How to set up the PostgreSQL database.

```bash
psql -U yourusername

CREATE DATABASE planwithus;

\c planwithus

\i migrations/001_create_tables.sql

\i migrations/002_seed_badges.sql
```

---

## Features

- User authentication (if applicable)
- CRUD operations
- Form handling with EJS
- Session management
