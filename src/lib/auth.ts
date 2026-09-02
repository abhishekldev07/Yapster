import { User } from "@supabase/supabase-js";
import { supabase } from "../supabase-client";

export const getAuthErrorMessage = (error: unknown): string => {
  const message = error instanceof Error ? error.message.toLowerCase() : "";

  if (message.includes("already registered") || message.includes("already exists")) {
    return "An account with this email already exists. Try signing in instead.";
  }
  if (message.includes("invalid login credentials")) {
    return "The email or password is incorrect.";
  }
  if (message.includes("email not confirmed") || message.includes("not verified")) {
    return "Please verify your email before signing in.";
  }
  if (message.includes("expired") || message.includes("invalid token") || message.includes("invalid otp")) {
    return "That code is invalid or has expired. Request a new code and try again.";
  }
  if (message.includes("rate limit") || message.includes("too many")) {
    return "Too many attempts. Please wait a moment before trying again.";
  }
  if (message.includes("password")) {
    return "Use a password with at least 8 characters, including uppercase, lowercase, and a digit.";
  }
  if (message.includes("email")) {
    return "Enter a valid email address.";
  }

  return "Something went wrong. Please try again.";
};

export const syncProfileFromUser = async (user: User) => {
  const metadata = user.user_metadata ?? {};
  const { error } = await supabase.from("profiles").upsert(
    {
      id: user.id,
      username: metadata.user_name ?? null,
      display_name: metadata.full_name ?? null,
      date_of_birth: metadata.date_of_birth ?? null,
      avatar_url: metadata.avatar_url ?? null,
    },
    { onConflict: "id" }
  );

  if (error) throw new Error(error.message);
};

export const isValidPassword = (password: string) =>
  password.length >= 8 &&
  /[a-z]/.test(password) &&
  /[A-Z]/.test(password) &&
  /\d/.test(password);

export const isAtLeastThirteen = (dateOfBirth: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) return false;

  const today = new Date();
  const cutoff = new Date(today.getFullYear() - 13, today.getMonth(), today.getDate());
  return date <= cutoff;
};
