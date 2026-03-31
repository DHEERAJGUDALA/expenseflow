# Reimbursement Management System

A comprehensive, enterprise-grade web application for managing employee reimbursement requests, featuring dynamic multi-step approval workflows, OCR receipt processing, external API currency conversion, and a premium "fintech" aesthetic interface.

## 🚀 Key Features

*   **Role-Based Access Control:** Secure, isolated views and actions for Employees, Managers, and System Admins.
*   **Dynamic Approval Workflows (Rule Builder):**
    *   Create custom approval chains based on expense category and monetary thresholds.
    *   Designate sequential approvers (e.g., Line Manager -> Director).
    *   Assign "Special Approvers" (e.g., CFO) who can instantly bypass the entire chain.
    *   Set quorum percentage requirements for group approvals.
*   **Automated Manager Escalation:** Temporarily schedule managers on "Leave" to automatically reroute their pending approvals to the administrative queue.
*   **Receipt Processing & OCR:** Automatically extract expense amounts from uploaded receipt images to streamline data entry.
*   **Live Currency Conversion:** Integrated external API to fetch live exchange rates and display local currency equivalents instantly.
*   **Premium Web Interface:**
    *   Modern, "Stripe-style" layout featuring dark sidebars (`#0a0a0b`) and bright, content-focused main views.
    *   Dynamic micro-interactions powered by `framer-motion` (staggered lists, smooth page transitions, interactive modals).
    *   Fully functional Drag-and-Drop rule reordering utilizing `@dnd-kit`.
    *   Accessible, visually cohesive components managed through centralized CSS design variables (`index.css`) rather than inline utility classes.

## 🛠 Tech Stack

**Frontend**
*   **Framework:** React 18 (Vite)
*   **Routing:** React Router DOM v6
*   **Styling:** Tailwind CSS + Vanilla CSS Tokens
*   **Animations:** Framer Motion
*   **Components:** Radix UI (Unstyled, accessible primitives)
*   **Icons:** Lucide React
*   **Charts:** Recharts
*   **Data Handling:** DND-Kit (Drag and Drop)

**Backend / Database**
*   **BaaS:** Supabase (PostgreSQL, Authentication, Realtime)
*   **Security:** Row Level Security (RLS) policies
*   **Storage:** Supabase Storage (Receipts, Invoices)

## 🎨 Design System

We maintain a strict adherence to a centralized design token system within `index.css`.

**Colors:**
*   Primary Application: Indigo (`#4f46e5`)
*   Secondary/Neutral Elements: Slate (`#64748b`)
*   Success/Approvals: Green
*   Warnings/Pending: Yellow/Amber
*   Errors/Rejections: Red
*   Special Approvers/Admin: Purple

**Typography:**
*   Headings: **Sora** (Bold, structural, distinctive)
*   Body: **DM Sans** (Clean, highly legible for dense data)

## 📁 Project Structure

```
reimbursement-management/
├── frontend/
│   ├── src/
│   │   ├── components/       # Reusable UI components (Modals, Tables, Forms, Layout)
│   │   ├── context/          # React Contexts (AuthContext)
│   │   ├── lib/              # Utility classes and API interface (supabase.js, api.js, ocr.js)
│   │   ├── pages/            # Page-level components
│   │   ├── index.css         # Design system tokens and global styles
│   │   ├── main.jsx          # Application entry point
│   │   └── App.jsx           # Routing configuration
│   ├── package.json
│   ├── tailwind.config.js    # Standard Tailwind configuration
│   └── vite.config.js
├── database/                 # SQL schemas and migration scripts
├── README.md                 # Project Overview
└── BUG_JOURNAL.md            # Extensive documentation of past bug fixes and lessons learned
```

## ⚙️ Initial Setup

### Prerequisites
*   Node.js (v18+)
*   Supabase Account / Local CLI

### Local Configuration

1.  **Clone the Repository**
2.  **Environment Variables:** Create a `.env` file in the `frontend/` directory with your Supabase credentials.
    ```env
    VITE_SUPABASE_URL=your_project_url
    VITE_SUPABASE_ANON_KEY=your_anon_key
    ```
3.  **Install Dependencies:**
    ```bash
    cd frontend
    npm install
    ```
4.  **Database Migration:** Execute the `.sql` files found in the `database/` folder against your Supabase instance to prepare your database schemas, tables, and RLS policies.
5.  **Run Development Server:**
    ```bash
    npm run dev
    ```

## 📝 Usage Guide

1.  **Admin Initialization:** Register the first user, then modify their role in the Supabase `profiles` table directly to `admin`.
2.  **Employee Management:** The Admin can create new users, set explicit roles (Admin, Manager, Employee), and configure reporting lines.
3.  **Rule Configuration:** Admins use the Rule Builder page to establish automated routing configurations.
4.  **Submission:** Employees navigate to the Expense Form, optionally upload a receipt for OCR, and submit.
5.  **Approval Flow:** The system computes the required approval sequence. Managers view their specific tasks in their "Approvals" or "Manager Queue" pages.

