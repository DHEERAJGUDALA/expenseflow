# ReimbursementManagement System

A comprehensive expense reimbursement management system with **OCR receipt scanning**, built for hackathon submission.

## Features

### Core Features
- **User Authentication** - Secure login/signup with Supabase Auth
- **Role-based Access Control** - Admin, Manager, and Employee roles
- **Expense Submission** - Create and track expense requests
- **OCR Receipt Scanning** - Automatically extract amount, date, merchant, and category from receipt images using Tesseract.js
- **Multi-currency Support** - USD, EUR, GBP, INR with automatic conversion
- **Approval Workflow** - Manager approval system with comments
- **Dashboard Analytics** - Visual stats and expense tracking

### OCR Capabilities
- Extracts **amount** with currency detection
- Parses **dates** in multiple formats (DD/MM/YYYY, MM/DD/YYYY, etc.)
- Identifies **merchant names** from receipts
- Auto-categorizes expenses (meals, travel, accommodation, etc.)
- Confidence scoring for extracted data

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18 + Vite |
| Styling | Tailwind CSS |
| Backend | Node.js + Express |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth |
| OCR | Tesseract.js |

## Project Structure

```
ReimbursementManagement/
├── backend/
│   ├── src/
│   │   ├── controllers/
│   │   │   ├── approvalController.js   # Approval workflow
│   │   │   ├── employeeController.js   # Employee/profile management
│   │   │   ├── expenseController.js    # Expense CRUD
│   │   │   ├── ocrController.js        # OCR endpoints
│   │   │   └── userController.js       # User management
│   │   ├── routes/
│   │   ├── services/
│   │   │   └── ocrService.js           # Tesseract OCR processing
│   │   ├── middleware/
│   │   ├── config/
│   │   ├── app.js
│   │   └── server.js
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── DashboardPage.jsx       # Main dashboard
│   │   │   ├── ExpenseFormPage.jsx     # Create expense + OCR
│   │   │   ├── ExpenseListPage.jsx     # View expenses
│   │   │   ├── ApprovalsPage.jsx       # Manager approvals
│   │   │   ├── EmployeeManagementPage.jsx  # Admin employee mgmt
│   │   │   ├── LoginPage.jsx
│   │   │   └── SignupPage.jsx
│   │   ├── components/
│   │   ├── context/
│   │   ├── lib/
│   │   └── App.jsx
│   └── package.json
└── database_schema.sql
```

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn
- Supabase account

### 1. Clone the repository
```bash
git clone https://github.com/praveenkumarkunchala2005/ReimbursementManagement.git
cd ReimbursementManagement
```

### 2. Setup Backend
```bash
cd backend
npm install
```

Create `.env` file:
```env
PORT=3000
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

Start the server:
```bash
npm run dev
```

### 3. Setup Frontend
```bash
cd frontend
npm install
```

Create `.env` file:
```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY=your_anon_key
VITE_API_URL=http://localhost:3000/api
```

Start the development server:
```bash
npm run dev
```

### 4. Database Setup
Run the SQL commands in `database_schema.sql` in your Supabase SQL editor.

## API Endpoints

### Authentication
All endpoints (except public) require Bearer token authentication.

### Expenses
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/expenses` | Create expense |
| GET | `/api/expenses` | Get all expenses (admin) |
| GET | `/api/expenses/my-expenses` | Get user's expenses |
| GET | `/api/expenses/:id` | Get single expense |
| PUT | `/api/expenses/:id` | Update expense |
| DELETE | `/api/expenses/:id` | Delete expense |
| GET | `/api/expenses/stats` | Get expense statistics |

### OCR
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/ocr/scan` | Scan receipt image (base64) |
| GET | `/api/ocr/supported` | Get supported currencies/categories |

### Approvals
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/approvals/pending` | Get pending approvals |
| GET | `/api/approvals/history` | Get approval history |
| POST | `/api/approvals` | Approve/reject expense |

### Employees
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/employees` | Get all employees |
| GET | `/api/employees/me` | Get current user profile |
| GET | `/api/employees/my-team` | Get manager's team |
| POST | `/api/employees/assign-manager` | Assign manager |

## User Roles

| Role | Capabilities |
|------|--------------|
| **Employee** | Submit expenses, view own expenses, upload receipts |
| **Manager** | All employee capabilities + approve/reject team expenses |
| **Admin** | All capabilities + manage employees, view all expenses |

## OCR Usage

1. Navigate to **Submit Expense** page
2. Click **Upload Receipt** or drag & drop an image
3. Wait for OCR processing
4. Review and confirm extracted data
5. Submit expense

The OCR supports:
- JPG, PNG, WEBP images
- Multiple date formats
- Currency symbols ($, €, £, ₹)
- Common merchant name patterns

## Screenshots

### Dashboard
![Dashboard](docs/dashboard.png)

### Expense Form with OCR
![Expense Form](docs/expense-form.png)

### Approvals Page
![Approvals](docs/approvals.png)

## Team

- **Praveen Kumar Kunchala** - Full Stack Developer

## License

MIT License

---

Built with React, Node.js, Supabase, and Tesseract.js
