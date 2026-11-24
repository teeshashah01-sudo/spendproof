import express from "express";
import cors from "cors";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { db } from "./prisma/db";

const app = express();
const port = Number(process.env.PORT) || 3000;
const uploadsDir = path.resolve(process.env.UPLOAD_DIR || "uploads");
const jwtSecret = process.env.JWT_SECRET;

if (!jwtSecret) {
  throw new Error("JWT_SECRET is missing from server/.env");
}

fs.mkdirSync(uploadsDir, { recursive: true });

type AuthPayload = {
  id: number;
  email: string;
  role: string;
};

function routeId(request: Request): string {
  const value = request.params.id;
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

type AuthenticatedRequest = Request & {
  auth?: AuthPayload;
};

const storage = multer.diskStorage({
  destination: (_request, _file, callback) => callback(null, uploadsDir),
  filename: (_request, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    callback(null, `${randomUUID()}${extension}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_request, file, callback) => {
    const allowedTypes = ["image/jpeg", "image/png", "application/pdf"];
    if (allowedTypes.includes(file.mimetype)) {
      callback(null, true);
    } else {
      callback(new Error("Upload a JPG, PNG, or PDF receipt."));
    }
  },
});

const allowedOrigins = (process.env.CORS_ORIGINS || "http://localhost:5173,http://localhost:5174,https://localhost")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
  }),
);
app.use(express.json());
app.use("/uploads", express.static(uploadsDir));

function createToken(user: AuthPayload) {
  return jwt.sign(user, jwtSecret!, { expiresIn: "1d" });
}

function requireAuth(request: Request, response: Response, next: NextFunction) {
  const header = request.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;

  if (!token) {
    response.status(401).json({ error: "Please sign in." });
    return;
  }

  try {
    (request as AuthenticatedRequest).auth = jwt.verify(
      token,
      jwtSecret!,
    ) as AuthPayload;
    next();
  } catch {
    response.status(401).json({ error: "Your session expired. Please sign in again." });
  }
}

function requireReviewer(request: Request, response: Response, next: NextFunction) {
  const user = (request as AuthenticatedRequest).auth;

  if (!user || !["admin", "approver"].includes(user.role)) {
    response.status(403).json({ error: "Reviewer or administrator access is required." });
    return;
  }

  next();
}

async function canAccessExpense(
  request: Request,
  expenseId: string,
): Promise<boolean> {
  const user = (request as AuthenticatedRequest).auth;
  if (!user) return false;
  if (user.role === "admin" || user.role === "approver") return true;

  const expense = await db.orm.public.Expense
    .where({ id: expenseId })
    .first();

  return expense?.userId === user.id;
}

app.get("/api/health", (_request, response) => {
  response.json({ status: "SpendProof API is running" });
});

app.post("/api/auth/register", async (request, response) => {
  const { email, password, name } = request.body;

  if (
    typeof email !== "string" ||
    !email.includes("@") ||
    typeof password !== "string" ||
    password.length < 8
  ) {
    response.status(400).json({
      error: "Enter a valid email and a password with at least 8 characters.",
    });
    return;
  }

  try {
    const normalizedEmail = email.trim().toLowerCase();
    const existingUser = await db.orm.public.User
      .where({ email: normalizedEmail })
      .first();

    if (existingUser) {
      response.status(409).json({ error: "An account with that email already exists." });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const role =
      normalizedEmail === process.env.ADMIN_EMAIL?.trim().toLowerCase()
        ? "admin"
        : "submitter";

    const user = await db.orm.public.User.create({
      email: normalizedEmail,
      name: typeof name === "string" ? name.trim() : null,
      passwordHash,
      role,
    });

    const authUser = { id: user.id, email: user.email, role: user.role };

    response.status(201).json({
      token: createToken(authUser),
      user: authUser,
    });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "Could not create your account." });
  }
});

app.post("/api/auth/login", async (request, response) => {
  const { email, password } = request.body;

  if (typeof email !== "string" || typeof password !== "string") {
    response.status(400).json({ error: "Enter your email and password." });
    return;
  }

  try {
    const user = await db.orm.public.User
      .where({ email: email.trim().toLowerCase() })
      .first();

    if (!user?.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
      response.status(401).json({ error: "Email or password is incorrect." });
      return;
    }

    const authUser = { id: user.id, email: user.email, role: user.role };

    response.json({
      token: createToken(authUser),
      user: authUser,
    });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "Could not sign in." });
  }
});

app.get("/api/expenses", requireAuth, async (request, response) => {
  try {
    const user = (request as AuthenticatedRequest).auth!;
    const expenses =
      user.role === "admin" || user.role === "approver"
        ? await db.orm.public.Expense.all()
        : await db.orm.public.Expense.where({ userId: user.id }).all();

    response.json(expenses);
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "Could not load expenses." });
  }
});

app.get("/api/expenses/:id/audit", requireAuth, async (request, response) => {
  try {
    if (!(await canAccessExpense(request, routeId(request)))) {
      response.status(403).json({ error: "You can’t view this expense." });
      return;
    }

    const events = await db.orm.public.AuditEvent
      .where({ expenseId: routeId(request) })
      .all();

    response.json(events);
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "Could not load expense history." });
  }
});

app.post("/api/expenses", requireAuth, async (request, response) => {
  const { merchant, amount, category, purpose } = request.body;
  const user = (request as AuthenticatedRequest).auth!;

  if (
    typeof merchant !== "string" ||
    !merchant.trim() ||
    typeof amount !== "number" ||
    amount <= 0 ||
    typeof category !== "string" ||
    typeof purpose !== "string" ||
    !purpose.trim()
  ) {
    response.status(400).json({ error: "Please provide valid expense details." });
    return;
  }

  try {
    const expense = await db.orm.public.Expense.create({
      merchant: merchant.trim(),
      amount,
      category,
      purpose: purpose.trim(),
      userId: user.id,
    });

    await db.orm.public.AuditEvent.create({
      expenseId: expense.id,
      action: `Expense submitted by ${user.email}`,
    });

    response.status(201).json(expense);
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "Could not save the expense." });
  }
});

app.post(
  "/api/expenses/:id/receipt",
  requireAuth,
  upload.single("receipt"),
  async (request, response) => {
    if (!(await canAccessExpense(request, routeId(request)))) {
      response.status(403).json({ error: "You can’t update this expense." });
      return;
    }

    if (!request.file) {
      response.status(400).json({ error: "Choose a receipt file." });
      return;
    }

    try {
      const user = (request as AuthenticatedRequest).auth!;
      const expense = await db.orm.public.Expense
        .where({ id: routeId(request) })
        .update({ receiptUrl: `/uploads/${request.file.filename}` });

      if (!expense) {
        response.status(404).json({ error: "Expense not found." });
        return;
      }

      await db.orm.public.AuditEvent.create({
        expenseId: expense.id,
        action: `Receipt uploaded by ${user.email}`,
      });

      response.json(expense);
    } catch (error) {
      console.error(error);
      response.status(500).json({ error: "Could not save the receipt." });
    }
  },
);

app.patch(
  "/api/expenses/:id/status",
  requireAuth,
  requireReviewer,
  async (request, response) => {
    const { status } = request.body;

    if (status !== "Approved" && status !== "Rejected") {
      response.status(400).json({ error: "Status must be Approved or Rejected." });
      return;
    }

    try {
      const user = (request as AuthenticatedRequest).auth!;
      const expense = await db.orm.public.Expense
        .where({ id: routeId(request) })
        .update({ status });

      if (!expense) {
        response.status(404).json({ error: "Expense not found." });
        return;
      }

      await db.orm.public.AuditEvent.create({
        expenseId: expense.id,
        action: `Expense ${status.toLowerCase()} by ${user.email}`,
      });

      response.json(expense);
    } catch (error) {
      console.error(error);
      response.status(500).json({ error: "Could not update expense status." });
    }
  },
);

app.patch(
  "/api/users/:id/role",
  requireAuth,
  async (request, response) => {
    const actor = (request as AuthenticatedRequest).auth!;
    if (actor.role !== "admin") {
      response.status(403).json({ error: "Only an administrator can change roles." });
      return;
    }

    const role = request.body.role;
    if (!["submitter", "approver", "admin"].includes(role)) {
      response.status(400).json({ error: "Choose submitter, approver, or admin." });
      return;
    }

    try {
      const userId = Number(routeId(request));
      if (!Number.isInteger(userId)) {
        response.status(400).json({ error: "Invalid user ID." });
        return;
      }

      const user = await db.orm.public.User
        .where({ id: userId })
        .update({ role });

      if (!user) {
        response.status(404).json({ error: "User not found." });
        return;
      }

      response.json({ id: user.id, email: user.email, role: user.role });
    } catch (error) {
      console.error(error);
      response.status(500).json({ error: "Could not update user role." });
    }
  },
);

app.use(
  (error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    console.error(error);
    const message =
      error instanceof Error ? error.message : "Unexpected server error.";
    response.status(400).json({ error: message });
  },
);

app.listen(port, () => {
  console.log(`SpendProof API running at http://localhost:${port}`);
});

