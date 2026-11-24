import "./App.css";
import { useEffect, useState, type FormEvent } from "react";

const API = (import.meta.env.VITE_API_URL || "http://localhost:3000").replace(/\/+$/, "");

type AuthUser = {
  id: number;
  email: string;
  role: string;
};

type AuthResult = {
  token: string;
  user: AuthUser;
};

type Expense = {
  id: string;
  merchant: string;
  amount: number;
  category: string;
  purpose: string;
  status: string;
  receiptUrl: string | null;
};

type AuditEvent = {
  id: string;
  expenseId: string;
  action: string;
  createdAt: string;
};

function App() {
  const [token, setToken] = useState(
    () => localStorage.getItem("spendproofToken") ?? "",
  );

  const [user, setUser] = useState<AuthUser | null>(() => {
    const saved = localStorage.getItem("spendproofUser");
    return saved ? (JSON.parse(saved) as AuthUser) : null;
  });

  const [isRegistering, setIsRegistering] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Travel");
  const [purpose, setPurpose] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [history, setHistory] = useState<Record<string, AuditEvent[]>>({});
  const [message, setMessage] = useState("");

  async function loadExpenses(currentToken: string) {
    const response = await fetch(`${API}/api/expenses`, {
      headers: { Authorization: `Bearer ${currentToken}` },
    });

    if (!response.ok) {
      throw new Error("Could not load expenses.");
    }

    const savedExpenses: Expense[] = await response.json();
    setExpenses(savedExpenses);

    const historyEntries = await Promise.all(
      savedExpenses.map(async (expense) => {
        const auditResponse = await fetch(
          `${API}/api/expenses/${expense.id}/audit`,
          {
            headers: { Authorization: `Bearer ${currentToken}` },
          },
        );

        if (!auditResponse.ok) {
          return [expense.id, []] as const;
        }

        const events: AuditEvent[] = await auditResponse.json();
        return [expense.id, events] as const;
      }),
    );

    setHistory(Object.fromEntries(historyEntries));
  }

  useEffect(() => {
    if (!token) return;

    loadExpenses(token).catch(() => {
      setMessage("Could not load expenses. Please sign in again.");
    });
  }, [token]);

  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    try {
      const endpoint = isRegistering ? "register" : "login";
      const response = await fetch(`${API}/api/auth/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isRegistering ? { name, email, password } : { email, password },
        ),
      });

      const result = await response.json();

      if (!response.ok) {
        setMessage(result.error ?? "Could not sign in.");
        return;
      }

      const authResult = result as AuthResult;

      localStorage.setItem("spendproofToken", authResult.token);
      localStorage.setItem(
        "spendproofUser",
        JSON.stringify(authResult.user),
      );

      setToken(authResult.token);
      setUser(authResult.user);
      setPassword("");
      setMessage(`Signed in as ${authResult.user.role}.`);
    } catch {
      setMessage("Could not connect to the server.");
    }
  }

  function signOut() {
    localStorage.removeItem("spendproofToken");
    localStorage.removeItem("spendproofUser");
    setToken("");
    setUser(null);
    setExpenses([]);
    setHistory({});
    setMessage("You have signed out.");
  }

  async function submitExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    try {
      const response = await fetch(`${API}/api/expenses`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          merchant,
          amount: Number(amount),
          category,
          purpose,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setMessage(result.error ?? "Could not submit expense.");
        return;
      }

      const newExpense = result as Expense;
      let receiptFailed = false;

      if (receipt) {
        const formData = new FormData();
        formData.append("receipt", receipt);

        const receiptResponse = await fetch(
          `${API}/api/expenses/${newExpense.id}/receipt`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: formData,
          },
        );

        receiptFailed = !receiptResponse.ok;
      }

      setMerchant("");
      setAmount("");
      setPurpose("");
      setReceipt(null);

      setMessage(
        receiptFailed
          ? "Expense submitted, but the receipt upload failed."
          : "Expense submitted for review.",
      );

      await loadExpenses(token);
    } catch {
      setMessage("Could not submit expense. Check that the server is running.");
    }
  }

  async function updateStatus(
    id: string,
    status: "Approved" | "Rejected",
  ) {
    setMessage("");

    try {
      const response = await fetch(`${API}/api/expenses/${id}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status }),
      });

      const result = await response.json();

      if (!response.ok) {
        setMessage(result.error ?? "Could not update expense.");
        return;
      }

      setMessage(`Expense ${status.toLowerCase()}.`);
      await loadExpenses(token);
    } catch {
      setMessage("Could not update expense. Check that the server is running.");
    }
  }

  if (!user || !token) {
    return (
      <main className="app-shell">
        <h1>SpendProof</h1>
        <h2>{isRegistering ? "Create an account" : "Sign in"}</h2>

        <form onSubmit={authenticate}>
          {isRegistering && (
            <p>
              <label>
                Name
                <br />
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
            </p>
          )}

          <p>
            <label>
              Email
              <br />
              <input
                required
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
          </p>

          <p>
            <label>
              Password (at least 8 characters)
              <br />
              <input
                required
                minLength={8}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
          </p>

          <button type="submit">
            {isRegistering ? "Create account" : "Sign in"}
          </button>
        </form>

        <p>{message}</p>

        <button
          type="button"
          onClick={() => {
            setIsRegistering(!isRegistering);
            setMessage("");
          }}
        >
          {isRegistering
            ? "Already have an account? Sign in"
            : "New here? Create an account"}
        </button>
      </main>
    );
  }

  const canReview = user.role === "admin" || user.role === "approver";

  return (
    <main className="app-shell">
      <header>
        <h1>SpendProof</h1>
        <p>
          Signed in as <strong>{user.email}</strong> ({user.role}){" "}
          <button onClick={signOut}>Sign out</button>
        </p>
      </header>

      <h2>Submit an expense</h2>

      <form onSubmit={submitExpense}>
        <p>
          <label>
            Merchant
            <br />
            <input
              required
              value={merchant}
              onChange={(event) => setMerchant(event.target.value)}
            />
          </label>
        </p>

        <p>
          <label>
            Amount
            <br />
            <input
              required
              min="0.01"
              step="0.01"
              type="number"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </label>
        </p>

        <p>
          <label>
            Category
            <br />
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              <option>Travel</option>
              <option>Meals</option>
              <option>Equipment</option>
              <option>Other</option>
            </select>
          </label>
        </p>

        <p>
          <label>
            Purpose
            <br />
            <textarea
              required
              value={purpose}
              onChange={(event) => setPurpose(event.target.value)}
            />
          </label>
        </p>

        <p>
          <label>
            Receipt (JPG, PNG, or PDF; max 5 MB)
            <br />
            <input
              type="file"
              accept=".jpg,.jpeg,.png,.pdf"
              onChange={(event) =>
                setReceipt(event.target.files?.[0] ?? null)
              }
            />
          </label>
        </p>

        <button type="submit">Submit expense</button>
      </form>

      <p role="status">{message}</p>

      <h2>{canReview ? "Team expenses" : "My expenses"}</h2>

      {expenses.length === 0 ? (
        <p>No expenses yet.</p>
      ) : (
        expenses.map((expense) => (
          <article key={expense.id}>
            <h3>{expense.merchant}</h3>
            <p>
              Amount: {expense.amount.toFixed(2)} | Category: {expense.category}
            </p>
            <p>Purpose: {expense.purpose}</p>
            <p>
              Status: <strong>{expense.status}</strong>
            </p>

            {expense.receiptUrl && (
              <p>
                <a
                  href={`${API}${expense.receiptUrl}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View receipt
                </a>
              </p>
            )}

            {canReview && expense.status === "Submitted" && (
              <p>
                <button onClick={() => updateStatus(expense.id, "Approved")}>
                  Approve
                </button>{" "}
                <button onClick={() => updateStatus(expense.id, "Rejected")}>
                  Reject
                </button>
              </p>
            )}

            <h4>History</h4>

            {history[expense.id]?.length ? (
              <ul>
                {history[expense.id].map((item) => (
                  <li key={item.id}>
                    {item.action} —{" "}
                    {new Date(item.createdAt).toLocaleString()}
                  </li>
                ))}
              </ul>
            ) : (
              <p>No history recorded.</p>
            )}
          </article>
        ))
      )}
    </main>
  );
}

export default App;
