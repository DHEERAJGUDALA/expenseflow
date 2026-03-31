import { supabase } from "../config/supabaseClient.js";

/**
 * Get all employees/profiles in the system
 * Accessible by: Admin, Manager
 */
export const getEmployees = async (req, res) => {
  try {
    const userId = req.user.id;

    console.log("[getEmployees] User ID:", userId);

    // Get current user's profile to check role AND company_id
    const { data: currentUser, error: userError } = await supabase
      .from("profiles")
      .select("id, role, company_id")
      .eq("id", userId)
      .single();

    console.log("[getEmployees] Current user profile:", currentUser);
    console.log("[getEmployees] Profile error:", userError);

    if (userError || !currentUser) {
      return res.status(404).json({ error: "User profile not found" });
    }

    // CRITICAL: Verify user has company_id (multi-tenancy requirement)
    if (!currentUser.company_id) {
      console.log("[getEmployees] ERROR: User has no company_id!");
      return res.status(403).json({ error: "No company assigned to your account" });
    }

    console.log("[getEmployees] Filtering by company_id:", currentUser.company_id);

    // Get all profiles SCOPED TO COMPANY
    const { data: employees, error } = await supabase
      .from("profiles")
      .select(`
        id,
        email,
        role,
        manager_id,
        created_at,
        company_id,
        full_name,
        manager:manager_id (id, email, role)
      `)
      .eq("company_id", currentUser.company_id) // MULTI-TENANCY FILTER
      .order("created_at", { ascending: false });

    console.log("[getEmployees] Found employees:", employees?.length);
    console.log("[getEmployees] Query error:", error);

    if (error) throw error;

    res.json({ employees });
  } catch (err) {
    console.error("[getEmployees] Exception:", err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * Get single employee by ID
 * CRITICAL: Only returns employee if they belong to same company
 */
export const getEmployeeById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Get current user's company_id
    const { data: currentUser, error: userError } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .single();

    if (userError || !currentUser) {
      return res.status(404).json({ error: "User profile not found" });
    }

    if (!currentUser.company_id) {
      return res.status(403).json({ error: "No company assigned to your account" });
    }

    // Get employee ONLY if in same company
    const { data: employee, error } = await supabase
      .from("profiles")
      .select(`
        id,
        email,
        role,
        manager_id,
        created_at,
        company_id,
        manager:manager_id (id, email, role)
      `)
      .eq("id", id)
      .eq("company_id", currentUser.company_id) // MULTI-TENANCY FILTER
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: "Employee not found or not in your company" });
      }
      throw error;
    }

    if (!employee) {
      return res.status(404).json({ error: "Employee not found or not in your company" });
    }

    res.json({ employee });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Create a new employee (Admin only)
 * This also creates a Supabase auth user and sends invite
 * CRITICAL: company_id ALWAYS inherited from creating admin, NEVER from request body
 */
export const createEmployee = async (req, res) => {
  try {
    const { email, password, role, manager_id, full_name, job_title } = req.body;
    const adminUserId = req.user.id;
    const userMetadataRole = req.user.user_metadata?.role;

    // Validate required fields
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    // Validate role
    const validRoles = ["admin", "manager", "employee"];
    if (role && !validRoles.includes(role)) {
      return res.status(400).json({ error: "Invalid role. Must be admin, manager, or employee" });
    }

    // Verify admin role - check both profile table and user_metadata
    const { data: adminProfile, error: adminError } = await supabase
      .from("profiles")
      .select("role, company_id")
      .eq("id", adminUserId)
      .single();

    const profileRole = adminProfile?.role;
    const isAdmin = profileRole === "admin" || userMetadataRole === "admin";

    if (!isAdmin) {
      return res.status(403).json({ error: "Only admins can create employees" });
    }

    // CRITICAL: Verify admin has company_id
    if (!adminProfile?.company_id) {
      return res.status(403).json({ error: "Admin account has no company assigned. Contact support." });
    }

    // CRITICAL: company_id comes from admin's profile, NEVER from request
    const inheritedCompanyId = adminProfile.company_id;

    // If manager_id provided, verify manager is in same company
    if (manager_id) {
      const { data: manager, error: managerError } = await supabase
        .from("profiles")
        .select("id, role, company_id")
        .eq("id", manager_id)
        .single();

      if (managerError || !manager) {
        return res.status(400).json({ error: "Invalid manager ID" });
      }

      if (manager.company_id !== inheritedCompanyId) {
        return res.status(400).json({ error: "Manager must be in the same company" });
      }

      if (manager.role === "employee") {
        return res.status(400).json({ error: "Cannot assign an employee as a manager. Promote them first." });
      }
    }

    // Check if user already exists in auth
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(u => u.email === email);

    let userId;

    if (existingUser) {
      // User already exists in auth
      userId = existingUser.id;

      // Check if profile exists
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", userId)
        .single();

      if (existingProfile) {
        return res.status(400).json({ error: "Employee already exists in the system" });
      }

      // Sync user_metadata for existing auth user with company_id
      await supabase.auth.admin.updateUserById(userId, {
        user_metadata: {
          role: role || "employee",
          full_name: full_name || "",
          company_id: inheritedCompanyId // Set company_id in auth metadata
        }
      });
    } else {
      // ═══════════════════════════════════════════════════════════════
      // Admin sets the password — use provided password or generate temp
      // ═══════════════════════════════════════════════════════════════
      const userPassword = password || `Temp${Math.random().toString(36).slice(2)}!123`;
      
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        password: userPassword,
        email_confirm: true, // Auto-confirm email to skip email verification
        user_metadata: {
          role: role || "employee",
          full_name: full_name || "",
          job_title: job_title || "",
          company_id: inheritedCompanyId // CRITICAL: Set company_id in auth metadata
        }
      });

      if (authError) {
        if (authError.message.includes("already registered") || authError.message.includes("already exists")) {
          return res.status(400).json({ error: "User with this email already exists" });
        }
        throw authError;
      }

      userId = authData.user.id;
    }

    // Create profile record with inherited company_id
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .insert({
        id: userId,
        email,
        role: role || "employee",
        manager_id: manager_id || null,
        company_id: inheritedCompanyId, // CRITICAL: Inherited from admin, NEVER from req.body
        full_name: full_name || null,
        job_title: job_title || null
      })
      .select()
      .single();

    if (profileError) throw profileError;

    // Only send password reset email if admin didn't provide a password
    let resetEmailSent = false;
    if (!password) {
      try {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password`
        });
        
        if (!resetError) {
          resetEmailSent = true;
        } else {
          console.error("Failed to send password reset email:", resetError);
        }
      } catch (resetErr) {
        console.error("Error sending password reset email:", resetErr);
      }
    }

    res.status(201).json({ 
      employee: profile, 
      resetEmailSent,
      passwordSetByAdmin: !!password,
      message: password
        ? "Employee created successfully. Password has been set by admin."
        : resetEmailSent 
          ? "Employee created successfully. A password reset link has been sent to their email." 
          : "Employee created successfully. Please send them a password reset link manually."
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Update employee details (Admin only)
 * CRITICAL: Can only update employees in same company
 */
export const updateEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    const { role, manager_id } = req.body;
    const adminUserId = req.user.id;
    const userMetadataRole = req.user.user_metadata?.role;

    // Verify admin role - check both profile table and user_metadata
    const { data: adminProfile, error: adminError } = await supabase
      .from("profiles")
      .select("role, company_id")
      .eq("id", adminUserId)
      .single();

    const profileRole = adminProfile?.role;
    const isAdmin = profileRole === "admin" || userMetadataRole === "admin";

    if (!isAdmin) {
      return res.status(403).json({ error: "Only admins can update employees" });
    }

    if (!adminProfile?.company_id) {
      return res.status(403).json({ error: "Admin account has no company assigned" });
    }

    // CRITICAL: Verify target employee is in same company
    const { data: targetEmployee, error: targetError } = await supabase
      .from("profiles")
      .select("id, company_id, full_name")
      .eq("id", id)
      .single();

    if (targetError || !targetEmployee) {
      return res.status(404).json({ error: "Employee not found" });
    }

    if (targetEmployee.company_id !== adminProfile.company_id) {
      return res.status(403).json({ error: "Cannot update employee from different company" });
    }

    // Prevent self-assignment as manager
    if (manager_id === id) {
      return res.status(400).json({ error: "Employee cannot be their own manager" });
    }

    // If manager_id provided, verify manager is in same company
    if (manager_id) {
      const { data: manager, error: managerError } = await supabase
        .from("profiles")
        .select("id, role, company_id")
        .eq("id", manager_id)
        .single();

      if (managerError || !manager) {
        return res.status(400).json({ error: "Invalid manager ID" });
      }

      if (manager.company_id !== adminProfile.company_id) {
        return res.status(400).json({ error: "Manager must be in the same company" });
      }

      if (manager.role === "employee") {
        return res.status(400).json({ error: "Cannot assign an employee as a manager. Promote them first." });
      }
    }

    // Build update object
    const updateData = {};
    if (role !== undefined) updateData.role = role;
    if (manager_id !== undefined) updateData.manager_id = manager_id;

    const { data: employee, error } = await supabase
      .from("profiles")
      .update(updateData)
      .eq("id", id)
      .eq("company_id", adminProfile.company_id) // Double-check company isolation
      .select()
      .single();

    if (error) throw error;

    // Sync user_metadata so frontend reads correct role on next login
    if (role !== undefined) {
      try {
        await supabase.auth.admin.updateUserById(id, {
          user_metadata: {
            role: role,
            full_name: employee.full_name || "",
            company_id: employee.company_id || null
          }
        });
      } catch (syncErr) {
        console.error("Failed to sync user_metadata:", syncErr.message);
      }
    }

    res.json({ employee, message: "Employee updated successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Delete employee (Admin only)
 * CRITICAL: Can only delete employees in same company
 */
export const deleteEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    const adminUserId = req.user.id;
    const userMetadataRole = req.user.user_metadata?.role;

    // Verify admin - check both profile table and user_metadata
    const { data: adminProfile, error: adminError } = await supabase
      .from("profiles")
      .select("role, company_id")
      .eq("id", adminUserId)
      .single();

    const profileRole = adminProfile?.role;
    const isAdmin = profileRole === "admin" || userMetadataRole === "admin";

    if (!isAdmin) {
      return res.status(403).json({ error: "Only admins can delete employees" });
    }

    if (!adminProfile?.company_id) {
      return res.status(403).json({ error: "Admin account has no company assigned" });
    }

    // Prevent admin from deleting themselves
    if (adminUserId === id) {
      return res.status(400).json({ error: "Cannot delete your own account" });
    }

    // CRITICAL: Verify target employee is in same company before deleting
    const { data: targetEmployee, error: targetError } = await supabase
      .from("profiles")
      .select("id, company_id, email")
      .eq("id", id)
      .single();

    if (targetError || !targetEmployee) {
      return res.status(404).json({ error: "Employee not found" });
    }

    if (targetEmployee.company_id !== adminProfile.company_id) {
      return res.status(403).json({ error: "Cannot delete employee from different company" });
    }

    // Delete profile record (scoped to company for extra safety)
    const { error } = await supabase
      .from("profiles")
      .delete()
      .eq("id", id)
      .eq("company_id", adminProfile.company_id); // Double-check company isolation

    if (error) throw error;

    res.json({ message: "Employee deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Assign manager to employee (Admin only)
 * CRITICAL: Both employee and manager must be in same company
 */
export const assignManager = async (req, res) => {
  try {
    const { employee_id, manager_id } = req.body;
    const adminUserId = req.user.id;
    const userMetadataRole = req.user.user_metadata?.role;

    if (!employee_id) {
      return res.status(400).json({ error: "Employee ID is required" });
    }

    // Verify admin - check both profile table and user_metadata
    const { data: adminProfile, error: adminError } = await supabase
      .from("profiles")
      .select("role, company_id")
      .eq("id", adminUserId)
      .single();

    const profileRole = adminProfile?.role;
    const isAdmin = profileRole === "admin" || userMetadataRole === "admin";

    if (!isAdmin) {
      return res.status(403).json({ error: "Only admins can assign managers" });
    }

    if (!adminProfile?.company_id) {
      return res.status(403).json({ error: "Admin account has no company assigned" });
    }

    // Prevent self-assignment
    if (manager_id === employee_id) {
      return res.status(400).json({ error: "Employee cannot be their own manager" });
    }

    // CRITICAL: Verify employee is in same company
    const { data: employee, error: empError } = await supabase
      .from("profiles")
      .select("id, company_id")
      .eq("id", employee_id)
      .single();

    if (empError || !employee) {
      return res.status(404).json({ error: "Employee not found" });
    }

    if (employee.company_id !== adminProfile.company_id) {
      return res.status(403).json({ error: "Cannot assign manager to employee from different company" });
    }

    // Validate manager role if provided and verify same company
    if (manager_id) {
      const { data: manager, error: managerError } = await supabase
        .from("profiles")
        .select("role, company_id")
        .eq("id", manager_id)
        .single();

      if (managerError || !manager) {
        return res.status(400).json({ error: "Invalid manager ID" });
      }

      // CRITICAL: Manager must be in same company
      if (manager.company_id !== adminProfile.company_id) {
        return res.status(403).json({ error: "Manager must be in the same company as employee" });
      }

      if (manager.role === "employee") {
        return res.status(400).json({ error: "Cannot assign an employee as a manager. Promote them first." });
      }
    }

    // Update employee's manager (double-check company isolation)
    const { data: updated, error } = await supabase
      .from("profiles")
      .update({ manager_id: manager_id || null })
      .eq("id", employee_id)
      .eq("company_id", adminProfile.company_id) // Extra safety check
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
 * Already scoped by manager_id, but add company_id filter for extra safety
 */
export const getMyTeam = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get current user's profile with company_id
    const { data: currentUser, error: userError } = await supabase
      .from("profiles")
      .select("id, role, company_id")
      .eq("id", userId)
      .single();

    if (userError || !currentUser) {
      return res.status(404).json({ error: "User profile not found" });
    }

    if (!currentUser.company_id) {
      return res.status(403).json({ error: "No company assigned to your account" });
    }

    if (currentUser.role === "employee") {
      return res.status(403).json({ error: "Only managers and admins can view team members" });
    }

    // Get direct reports scoped to company (extra safety)
    const { data: team, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("manager_id", currentUser.id)
      .eq("company_id", currentUser.company_id) // Extra company isolation
      .order("email");

    if (error) throw error;

    res.json({ team });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Get current user's profile
 */
export const getMyProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    const { data: profile, error } = await supabase
      .from("profiles")
      .select(`
        id,
        email,
        role,
        manager_id,
        created_at,
        manager:manager_id (id, email, role)
      `)
      .eq("id", userId)
      .single();

    if (error) throw error;

    if (!profile) {
      return res.status(404).json({ error: "Profile not found" });
    }

    res.json({ employee: profile });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Get all managers (for dropdown selection)
 * CRITICAL: Only return managers from same company
 */
export const getManagers = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get current user's company_id
    const { data: currentUser, error: userError } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .single();

    if (userError || !currentUser) {
      return res.status(404).json({ error: "User profile not found" });
    }

    if (!currentUser.company_id) {
      return res.status(403).json({ error: "No company assigned to your account" });
    }

    // Get all managers and admins SCOPED TO COMPANY
    const { data: managers, error } = await supabase
      .from("profiles")
      .select("id, email, role, full_name, job_title")
      .in("role", ["manager", "admin"])
      .eq("company_id", currentUser.company_id) // MULTI-TENANCY FILTER
      .order("email");

    if (error) throw error;

    res.json({ managers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Resend password reset email to an employee (Admin only)
 * CRITICAL: Can only reset password for employees in same company
 */
export const resendPasswordReset = async (req, res) => {
  try {
    const { id } = req.params;
    const adminUserId = req.user.id;
    const userMetadataRole = req.user.user_metadata?.role;

    // Verify admin role
    const { data: adminProfile, error: adminError } = await supabase
      .from("profiles")
      .select("role, company_id")
      .eq("id", adminUserId)
      .single();

    const profileRole = adminProfile?.role;
    const isAdmin = profileRole === "admin" || userMetadataRole === "admin";

    if (!isAdmin) {
      return res.status(403).json({ error: "Only admins can resend password reset emails" });
    }

    if (!adminProfile?.company_id) {
      return res.status(403).json({ error: "Admin account has no company assigned" });
    }

    // Get employee's email AND verify same company
    const { data: employee, error: empError } = await supabase
      .from("profiles")
      .select("email, company_id")
      .eq("id", id)
      .single();

    if (empError || !employee) {
      return res.status(404).json({ error: "Employee not found" });
    }

    // CRITICAL: Verify employee is in same company
    if (employee.company_id !== adminProfile.company_id) {
      return res.status(403).json({ error: "Cannot reset password for employee from different company" });
    }

    // Send password reset email
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(employee.email, {
      redirectTo: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password`
    });

    if (resetError) {
      throw resetError;
    }

    res.json({ 
      message: `Password reset link sent to ${employee.email}`,
      email: employee.email
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
