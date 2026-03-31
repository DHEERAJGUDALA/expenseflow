import { supabase } from "../config/supabaseClient.js";

/**
 * Get all employees/profiles in the system
 * Accessible by: Admin, Manager
 */
export const getEmployees = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get current user's profile to check role
    const { data: currentUser, error: userError } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("id", userId)
      .single();

    if (userError || !currentUser) {
      return res.status(404).json({ error: "User profile not found" });
    }

    // Get all profiles
    const { data: employees, error } = await supabase
      .from("profiles")
      .select(`
        id,
        email,
        role,
        manager_id,
        created_at,
        manager:manager_id (id, email, role)
      `)
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
      .from("profiles")
      .select(`
        id,
        email,
        role,
        manager_id,
        created_at,
        manager:manager_id (id, email, role)
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
    const { email, role, manager_id, full_name, job_title } = req.body;
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
    } else {
      // Create new auth user WITHOUT sending email (to avoid rate limits)
      const tempPassword = `Temp${Math.random().toString(36).slice(2)}!123`;
      
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true, // Auto-confirm email to skip email verification
        user_metadata: {
          role: role || "employee",
          full_name: full_name || "",
          job_title: job_title || ""
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

    // Create profile record
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .insert({
        id: userId,
        email,
        role: role || "employee",
        manager_id: manager_id || null,
        company_id: adminProfile?.company_id || null,
        full_name: full_name || null,
        job_title: job_title || null
      })
      .select()
      .single();

    if (profileError) throw profileError;

    // Send password reset email so the employee can set their own password
    let resetEmailSent = false;
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

    res.status(201).json({ 
      employee: profile, 
      resetEmailSent,
      message: resetEmailSent 
        ? "Employee created successfully. A password reset link has been sent to their email." 
        : "Employee created successfully. Please send them a password reset link manually."
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
    const { role, manager_id } = req.body;
    const adminUserId = req.user.id;
    const userMetadataRole = req.user.user_metadata?.role;

    // Verify admin role - check both profile table and user_metadata
    const { data: adminProfile, error: adminError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", adminUserId)
      .single();

    const profileRole = adminProfile?.role;
    const isAdmin = profileRole === "admin" || userMetadataRole === "admin";

    if (!isAdmin) {
      return res.status(403).json({ error: "Only admins can update employees" });
    }

    // Prevent self-assignment as manager
    if (manager_id === id) {
      return res.status(400).json({ error: "Employee cannot be their own manager" });
    }

    // Build update object
    const updateData = {};
    if (role !== undefined) updateData.role = role;
    if (manager_id !== undefined) updateData.manager_id = manager_id;

    const { data: employee, error } = await supabase
      .from("profiles")
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
    const userMetadataRole = req.user.user_metadata?.role;

    // Verify admin - check both profile table and user_metadata
    const { data: adminProfile, error: adminError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", adminUserId)
      .single();

    const profileRole = adminProfile?.role;
    const isAdmin = profileRole === "admin" || userMetadataRole === "admin";

    if (!isAdmin) {
      return res.status(403).json({ error: "Only admins can delete employees" });
    }

    // Prevent admin from deleting themselves
    if (adminUserId === id) {
      return res.status(400).json({ error: "Cannot delete your own account" });
    }

    // Delete profile record
    const { error } = await supabase
      .from("profiles")
      .delete()
      .eq("id", id);

    if (error) throw error;

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
    const userMetadataRole = req.user.user_metadata?.role;

    if (!employee_id) {
      return res.status(400).json({ error: "Employee ID is required" });
    }

    // Verify admin - check both profile table and user_metadata
    const { data: adminProfile, error: adminError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", adminUserId)
      .single();

    const profileRole = adminProfile?.role;
    const isAdmin = profileRole === "admin" || userMetadataRole === "admin";

    if (!isAdmin) {
      return res.status(403).json({ error: "Only admins can assign managers" });
    }

    // Prevent self-assignment
    if (manager_id === employee_id) {
      return res.status(400).json({ error: "Employee cannot be their own manager" });
    }

    // Validate manager role if provided
    if (manager_id) {
      const { data: manager, error: managerError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", manager_id)
        .single();

      if (managerError || !manager) {
        return res.status(400).json({ error: "Invalid manager ID" });
      }

      if (manager.role === "employee") {
        return res.status(400).json({ error: "Cannot assign an employee as a manager. Promote them first." });
      }
    }

    // Update employee's manager
    const { data: updated, error } = await supabase
      .from("profiles")
      .update({ manager_id: manager_id || null })
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

    // Get current user's profile
    const { data: currentUser, error: userError } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("id", userId)
      .single();

    if (userError || !currentUser) {
      return res.status(404).json({ error: "User profile not found" });
    }

    if (currentUser.role === "employee") {
      return res.status(403).json({ error: "Only managers and admins can view team members" });
    }

    // Get direct reports
    const { data: team, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("manager_id", currentUser.id)
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
 */
export const getManagers = async (req, res) => {
  try {
    // Get all managers and admins
    const { data: managers, error } = await supabase
      .from("profiles")
      .select("id, email, role, full_name, job_title")
      .in("role", ["manager", "admin"])
      .order("email");

    if (error) throw error;

    res.json({ managers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Resend password reset email to an employee (Admin only)
 */
export const resendPasswordReset = async (req, res) => {
  try {
    const { id } = req.params;
    const adminUserId = req.user.id;
    const userMetadataRole = req.user.user_metadata?.role;

    // Verify admin role
    const { data: adminProfile, error: adminError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", adminUserId)
      .single();

    const profileRole = adminProfile?.role;
    const isAdmin = profileRole === "admin" || userMetadataRole === "admin";

    if (!isAdmin) {
      return res.status(403).json({ error: "Only admins can resend password reset emails" });
    }

    // Get employee's email
    const { data: employee, error: empError } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", id)
      .single();

    if (empError || !employee) {
      return res.status(404).json({ error: "Employee not found" });
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
