-- Enhanced Approval Workflow Schema
-- This extends your existing schema to support flexible approval rules

-- 6. Approval Workflows Table (defines rules for each employee)
CREATE TABLE IF NOT EXISTS public.approval_workflows (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  workflow_name TEXT NOT NULL,
  
  -- Workflow Configuration
  approval_type TEXT NOT NULL, -- 'sequential', 'parallel', 'percentage'
  approval_threshold INTEGER, -- For percentage-based (e.g., 60 means 60%)
  is_active BOOLEAN DEFAULT true,
  
  -- Special approver can override
  has_special_approver BOOLEAN DEFAULT false,
  special_approver_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  
  UNIQUE(employee_id, workflow_name)
);

-- 7. Approval Steps Table (defines the sequence/list of approvers)
CREATE TABLE IF NOT EXISTS public.approval_steps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workflow_id UUID REFERENCES public.approval_workflows(id) ON DELETE CASCADE NOT NULL,
  approver_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  
  step_order INTEGER NOT NULL, -- For sequential: 1, 2, 3... For parallel: all same number
  is_required BOOLEAN DEFAULT true, -- If false, can be skipped in percentage voting
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  
  UNIQUE(workflow_id, approver_id)
);

-- 8. Expense Approval Logs Table (tracks each approval action)
CREATE TABLE IF NOT EXISTS public.expense_approval_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  expense_id UUID REFERENCES public.expenses(id) ON DELETE CASCADE NOT NULL,
  workflow_id UUID REFERENCES public.approval_workflows(id) ON DELETE SET NULL,
  approver_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  
  action TEXT NOT NULL, -- 'approved', 'rejected', 'skipped'
  comments TEXT,
  step_order INTEGER, -- Which step this was in the workflow
  
  -- Metadata
  is_special_override BOOLEAN DEFAULT false, -- If special approver did this
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_approval_workflows_employee ON approval_workflows(employee_id);
CREATE INDEX IF NOT EXISTS idx_approval_steps_workflow ON approval_steps(workflow_id);
CREATE INDEX IF NOT EXISTS idx_expense_approval_logs_expense ON expense_approval_logs(expense_id);

-- Add workflow_id to expenses table to link to active workflow
ALTER TABLE public.expenses 
ADD COLUMN IF NOT EXISTS workflow_id UUID REFERENCES public.approval_workflows(id) ON DELETE SET NULL;

-- Comments
COMMENT ON TABLE approval_workflows IS 'Stores approval workflow configurations for each employee';
COMMENT ON TABLE approval_steps IS 'Defines the approvers and their sequence for each workflow';
COMMENT ON TABLE expense_approval_logs IS 'Logs all approval actions on expenses';
