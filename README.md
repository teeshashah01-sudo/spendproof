# SpendProof

SpendProof is a mobile-friendly team expense app built with React, TypeScript, Node.js, Express, PostgreSQL, and Prisma ORM. Users can submit expenses and receipts; administrators and approvers can review expenses and see an audit history.

## Features

- Account registration and sign-in with hashed passwords
- Submitter, approver, and administrator roles
- Expense submission, approval, and rejection
- JPG, PNG, and PDF receipt uploads (up to 5 MB)
- Expense activity history
- Responsive web interface and an Android wrapper powered by Capacitor

## Requirements

- Node.js 24 LTS or newer
- PostgreSQL 15 or newer
- Git
- Android Studio and Android SDK only if building the Android app

## Run locally on Windows

### 1. Get the project

~~~powershell
git clone YOUR_REPOSITORY_URL
cd spendproof
~~~

### 2. Configure PostgreSQL and the API

Create a PostgreSQL database named spendproof.

Copy the example environment file:

~~~powershell
Copy-Item server/.env.example server/.env
~~~

Edit server/.env and set your PostgreSQL password and a private JWT secret. Do not commit this file.

### 3. Install and initialize the backend

~~~powershell
cd server
npm ci
npx prisma contract emit
npx prisma db init
npm run dev
~~~

Leave this terminal open. The API runs at http://localhost:3000.

For an already initialized development database, use npm run db:update instead of npx prisma db init.

### 4. Start the web app

Open a second terminal:

~~~powershell
cd client
npm ci
Copy-Item .env.example .env
npm run dev
~~~

Open the Local URL printed by Vite, usually http://localhost:5173.

Register with the email configured as ADMIN_EMAIL in server/.env to create the first administrator. Other accounts register as submitters.

## Environment variables

The server example file documents DATABASE_URL, JWT_SECRET, ADMIN_EMAIL, PORT, CORS_ORIGINS, and UPLOAD_DIR. The client uses VITE_API_URL; its local default is http://localhost:3000.

For a public deployment, set VITE_API_URL to the deployed HTTPS API address and set the server's CORS_ORIGINS to the deployed web origin and Capacitor's https://localhost origin. The API, PostgreSQL database, and receipt storage must be hosted separately; Git stores source code but does not run these services.

Receipt files are stored on the server's local disk by default. For a hosted production deployment, configure durable object storage before relying on receipt uploads.

## Android project

The Capacitor Android project is in client/android. Build the React client with the correct VITE_API_URL, then run:

~~~powershell
cd client
npm run build
npx cap sync android
npx cap open android
~~~

Use Android Studio to run it on an emulator or device. The API must be hosted on HTTPS for use outside the development computer.

## Repository hygiene

- Never commit server/.env, client/.env, database passwords, JWT secrets, or private receipt files.
- Keep the .env.example files as templates with placeholders only.
- Do not commit Android signing keystores.

