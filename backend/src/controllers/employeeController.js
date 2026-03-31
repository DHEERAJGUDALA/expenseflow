import { supabase } from "../config/supabaseClient.js";

/**
 * Get all employees in the user's company
 * Accessible by: Admin, Manager
 */
export const getEmployees = async (req, res) => {
  try {
    const userId = req.user.id;

    // First get the current user's employee record to find their company
    const { data: currentEmployee, error: empError } = await supabase
      .from("employees")
      .select("company_id, role")
      .eq("user_id", userId)
      .single();

    if (empError || !currentEmployee) {
      return res.status(404).json({ error: "Employee record not found" });
    }

    // Get all employees in the same company
    const { data: employees, error } = await supabase
      .from("employees")
      .select(`
        *,
        manager:manager_id (id, full_name, email)
      `)
      .eq("company_id", currentEmployee.company_id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    res.json({ employees });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Get single employee by ID
 */
export const getEmployeeById = async (req, res) => {
  try {
    const { id } = req.params;

    const { data: employee, error } = await supabase
      .from("employees")
      .select(`
        *,
        manager:manager_id (id, full_name, email),
        company:company_id (id, name, currency_code, currency_symbol)
      `)
      .eq("id", id)
      .single();

    if (error) throw error;

    if (!employee) {
      return res.status(404).json({ error: "Employee not found" });
    }

    res.json({ employee });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Create a new employee (Admin only)
 * This also creates a Supabase auth user and sends invite
 */
export const createEmployee = async (req, res) => {
  try {
    const { email, full_name, role, manager_id, department, is_manager_approver } = req.body;
    const adminUserId = req.user.id;

    // Validate required fields
    if (!email || !full_name) {
      return res.status(400).json({ error: "Email and full name are required" });
    }

    // Validate role
    const validRoles = ["admin", "manager", "employee"];
    if (role && !validRoles.includes(role)) {
      return res.status(400).json({ error: "Invalid role. Must be admin, manager, or employee" });
    }

    // Get admin's company
    const { data: adminEmployee, error: adminError } = await supabase
      .from("employees")
      .select("company_id")
      .eq("user_id", adminUserId)
      .single();

    if (adminError || !adminEmployee) {
      return res.status(403).json({ error: "Admin record not found" });
    }

    // Check if manager exists in same company (if manager_id provided)
    if (manager_id) {
      const { data: manager, error: managerError } = await supabase
        .from("employees")
        .select("id, company_id")
        .eq("id", manager_id)
        .single();

      if (managerError || !manager || manager.company_id !== adminEmployee.company_id) {
        return res.status(400).json({ error: "Invalid manager ID" });
      }
    }

    // Create auth user with invite
    const { data: authData, error: authError } = await supabase.auth.admin.inviteUserByEmail(email, {
      data: {
        full_name,
        role: role || "employee"
      }
    });

    if (authError) {
      // If user already exists, try to get their ID
      if (authError.message.includes("already been registered")) {
        const { data: existingUser } = await supabase.auth.admin.listUsers();
        const user = existingUser?.users?.find(u => u.email === email);
        if (user) {
          // Create employee record for existing user
          const { data: employee, error: empError } = await supabase
            .from("employees")
            .insert({
              user_id: user.id,
              company_id: adminEmployee.company_id,
              email,
              full_name,
              role: role || "employee",
              manager_id: manager_id || null,
              department: department || null,
              is_manager_approver: is_manager_approver || false
            })
            .select()
            .single();

          if (empError) throw empError;
          return res.status(201).json({ employee, message: "Employee created (existing user)" });
        }
      }
      throw authError;
    }

    // Create employee record
    const { data: employee, error: empError } = await supabase
      .from("employees")
      .insert({
        user_id: authData.user.id,
        company_id: adminEmployee.company_id,
        email,
        full_name,
        role: role || "employee",
        manager_id: manager_id || null,
        department: department || null,
        is_manager_approver: is_manager_approver || false
      })
      .select()
      .single();

    if (empError) throw empError;

    res.status(201).json({ 
      employee, 
      message: "Employee created and invite sent" 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Update employee details (Admin only)
 */
export const updateEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    const { full_name, role, manager_id, department, is_manager_approver } = req.body;
    const adminUserId = req.user.id;

    // Verify admin belongs to same company
    const { data: adminEmployee, error: adminError } = await supabase
      .from("employees")
      .select("company_id, role")
      .eq("user_id", adminUserId)
      .single();

    if (adminError || adminEmployee.role !== "admin") {
      return res.status(403).json({ error: "Only admins can update employees" });
    }

    // Get target employee
    const { data: targetEmployee, error: targetError } = await supabase
      .from("employees")
      .select("company_id")
      .eq("id", id)
      .single();

    if (targetError || targetEmployee.company_id !== adminEmployee.company_id) {
      return res.status(403).json({ error: "Cannot update employee from different company" });
    }

    // Validate manager if provided
    if (manager_id) {
      // Prevent self-assignment as manager
      if (manager_id === id) {
        return res.status(400).json({ error: "Employee cannot be their own manager" });
      }

      const { data: manager, error: managerError } = await supabase
        .from("employees")
        .select("id, company_id")
        .eq("id", manager_id)
        .single();

      if (managerError || manager.company_id !== adminEmployee.company_id) {
        return res.status(400).json({ error: "Invalid manager ID" });
      }
    }

    // Build update object
    const updateData = { updated_at: new Date().toISOString() };
    if (full_name !== undefined) updateData.full_name = full_name;
    if (role !== undefined) updateData.role = role;
    if (manager_id !== undefined) updateData.manager_id = manager_id;
    if (department !== undefined) updateData.department = department;
    if (is_manager_approver !== undefined) updateData.is_manager_approver = is_manager_approver;

    const { data: employee, error } = await supabase
      .from("employees")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    res.json({ employee, message: "Employee updated successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Delete employee (Admin only)
 */
export const deleteEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    const adminUserId = req.user.id;

    // Verify admin
    const { data: adminEmployee, error: adminError } = await supabase
      .from("employees")
      .select("company_id, role, id")
      .eq("user_id", adminUserId)
      .single();

    if (adminError || adminEmployee.role !== "admin") {
      return res.status(403).json({ error: "Only admins can delete employees" });
    }

    // Prevent admin from deleting themselves
    if (adminEmployee.id === id) {
      return res.status(400).json({ error: "Cannot delete your own account" });
    }

    // Get target employee
    const { data: targetEmployee, error: targetError } = await supabase
      .from("employees")
      .select("company_id, user_id")
      .eq("id", id)
      .single();

    if (targetError || targetEmployee.company_id !== adminEmployee.company_id) {
      return res.status(403).json({ error: "Cannot delete employee from different company" });
    }

    // Delete employee record
    const { error } = await supabase
      .from("employees")
      .delete()
      .eq("id", id);

    if (error) throw error;

    // Optionally delete auth user (commented out - may want to keep for audit)
    // await supabase.auth.admin.deleteUser(targetEmployee.user_id);

    res.json({ message: "Employee deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Assign manager to employee (Admin only)
 */
export const assignManager = async (req, res) => {
  try {
    const { employee_id, manager_id } = req.body;
    const adminUserId = req.user.id;

    if (!employee_id) {
      return res.status(400).json({ error: "Employee ID is required" });
    }

    // Verify admin
    const { data: adminEmployee, error: adminError } = await supabase
      .from("employees")
      .select("company_id, role")
      .eq("user_id", adminUserId)
      .single();

    if (adminError || adminEmployee.role !== "admin") {
      return res.status(403).json({ error: "Only admins can assign managers" });
    }

    // Validate employee belongs to company
    const { data: employee, error: empError } = await supabase
      .from("employees")
      .select("company_id")
      .eq("id", employee_id)
      .single();

    if (empError || employee.company_id !== adminEmployee.company_id) {
      return res.status(400).json({ error: "Invalid employee ID" });
    }

    // Validate manager if provided
    if (manager_id) {
      if (manager_id === employee_id) {
        return res.status(400).json({ error: "Employee cannot be their own manager" });
      }

      const { data: manager, error: managerError } = await supabase
        .from("employees")
        .select("company_id, role")
        .eq("id", manager_id)
        .single();

      if (managerError || manager.company_id !== adminEmployee.company_id) {
        return res.status(400).json({ error: "Invalid manager ID" });
      }

      if (manager.role === "employee") {
        return res.status(400).json({ error: "Cannot assign an employee as a manager. Promote them first." });
      }
    }

    // Update employee's manager
    const { data: updated, error } = await supabase
      .from("employees")
      .update({ 
        manager_id: manager_id || null,
        updated_at: new Date().toISOString()
      })
      .eq("id", employee_id)
      .select()
      .single();

    if (error) throw error;

    res.json({ 
      employee: updated, 
      message: manager_id ? "Manager assigned successfully" : "Manager removed successfully" 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Get employees managed by current user (Manager view)
 */
export const getMyTeam = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get current user's employee ID
    const { data: currentEmployee, error: empError } = await supabase
      .from("employees")
      .select("id, role")
      .eq("user_id", userId)
      .single();

    if (empError || !currentEmployee) {
      return res.status(404).json({ error: "Employee record not found" });
    }

    if (currentEmployee.role === "employee") {
      return res.status(403).json({ error: "Only managers and admins can view team members" });
    }

    // Get direct reports
    const { data: team, error } = await supabase
      .from("employees")
      .select("*")
      .eq("manager_id", currentEmployee.id)
      .order("full_name");

    if (error) throw error;

    res.json({ team });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Get current user's employee profile
 */
export const getMyProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    const { data: employee, error } = await supabase
      .from("employees")
      .select(`
        *,
        manager:manager_id (id, full_name, email),
        company:company_id (id, name, currency_code, currency_symbol, country)
      `)
      .eq("user_id", userId)
      .single();

    if (error) throw error;

    if (!employee) {
      return res.status(404).json({ error: "Employee profile not found" });
    }

    res.json({ employee });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Get all managers in the company (for dropdown selection)
 */
export const getManagers = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get current user's company
    const { data: currentEmployee, error: empError } = await supabase
      .from("employees")
      .select("company_id")
      .eq("user_id", userId)
      .single();

    if (empError || !currentEmployee) {
      return res.status(404).json({ error: "Employee record not found" });
    }

    // Get all managers and admins
    const { data: managers, error } = await supabase
      .from("employees")
      .select("id, full_name, email, role, department")
      .eq("company_id", currentEmployee.company_id)
      .in("role", ["manager", "admin"])
      .order("full_name");

    if (error) throw error;

    res.json({ managers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
