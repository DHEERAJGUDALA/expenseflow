-- Enable UUID extension for auto-generating IDs
create extension if not exists "uuid-ossp";

-- 1. Profiles Table (extends auth.users)
create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  role text not null default 'employee',
  manager_id uuid references public.profiles(id) on delete set null,
  email text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Note for Supabase: You might want to automatically generate a profile when a new auth user is created using a trigger. 

-- 2. Expenses Table
create table public.expenses (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.profiles(id) on delete cascade not null, -- Equivalent to the requested "employee" column
  description text not null,
  expense_date date not null,
  category text not null,
  paid_by text,
  remarks text,
  amount numeric(10,2) not null,
  status text default 'pending',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Manager Approvals Table
create table public.manager_approvals (
  id uuid primary key default uuid_generate_v4(),
  ticket_id uuid references public.expenses(id) on delete cascade not null,
  manager_id uuid references public.profiles(id) on delete cascade not null,
  request_owner_id uuid references public.profiles(id) on delete cascade not null,
  approval_subject text,
  category text,
  request_status text,
  total_amount numeric(10,2),
  status text default 'pending',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. Admin Approvals Table
create table public.admin_approvals (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  is_manager_approve boolean default false,
  is_approve_sequence boolean default false,
  minimum_approval integer default 1,
  approver_list uuid[] default '{}',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 5. Individual Approvals Table
create table public.individual_approvals (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  manager_id uuid references public.profiles(id) on delete cascade not null,
  approved_or_not boolean,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security (RLS) optionally depending on requirements
-- alter table public.profiles enable row level security;
-- alter table public.expenses enable row level security;
-- alter table public.manager_approvals enable row level security;
-- alter table public.admin_approvals enable row level security;
-- alter table public.individual_approvals enable row level security;
