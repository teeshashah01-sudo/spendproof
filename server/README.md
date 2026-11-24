# SpendProof

SpendProof is a team expense management app for submitting, reviewing, and tracking expenses.

## Features

- User registration and sign-in
- Submitter and administrator roles
- Expense submissions with merchant, amount, category, and purpose
- JPG, PNG, and PDF receipt uploads
- Approve or reject expenses
- Audit history for submissions, receipts, and review decisions
- PostgreSQL data storage

## Technology

- TypeScript, React, and Vite
- Node.js and Express
- PostgreSQL and Prisma ORM

## Run locally

### Requirements

Install Node.js LTS and PostgreSQL. Create a PostgreSQL database named `spendproof`.

### Configure the backend

Create `server/.env` with your local values:

```env
DATABASE_URL="postgresql://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/spendproof?schema=public"
JWT_SECRET="YOUR_PRIVATE_RANDOM_SECRET"
ADMIN_EMAIL="your-admin-email@example.com"