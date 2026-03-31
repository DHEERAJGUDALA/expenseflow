export function normalizeEmail(value) {
  return value.trim().toLowerCase();
}

export function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validatePassword(password) {
  const requirements = [
    {
      label: "At least 8 characters",
      valid: password.length >= 8
    },
    {
      label: "One uppercase letter",
      valid: /[A-Z]/.test(password)
    },
    {
      label: "One lowercase letter",
      valid: /[a-z]/.test(password)
    },
    {
      label: "One number",
      valid: /\d/.test(password)
    }
  ];

  return {
    isValid: requirements.every((requirement) => requirement.valid),
    requirements
  };
}

export function getAuthErrorMessage(error) {
  const message = error?.message?.toLowerCase() || "";

  if (message.includes("invalid login credentials")) {
    return "The email or password is incorrect.";
  }

  if (message.includes("email not confirmed")) {
    return "Please verify your email address before signing in.";
  }

  if (message.includes("already registered")) {
    return "An account already exists for this email address.";
  }

  if (message.includes("password")) {
    return "Your password does not meet the project requirements.";
  }

  if (message.includes("network")) {
    return "Network error. Please check your connection and try again.";
  }

  return error?.message || "Something went wrong. Please try again.";
}

export function getEmailRedirectUrl() {
  if (typeof window === "undefined") {
    return undefined;
  }

  return new URL("/login", window.location.origin).toString();
}
