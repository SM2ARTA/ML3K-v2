/**
 * Auth system — dual mode:
 * 1. Simple password (backward compatible with v1)
 * 2. Supabase Auth (email/password for proper multi-user)
 */
import { supabase } from './supabase';

export type AppRole = 'admin' | 'viewer' | '';

/** Simple password auth (v1 compatible) */
export function simpleAuth(username: string, password: string): AppRole {
	if (username.toLowerCase() === 'come' && password.toLowerCase() === 'in') return 'admin';
	if (username.toLowerCase() === 'viewer') return 'viewer';
	return '';
}

/** Supabase email/password sign in */
export async function signIn(email: string, password: string): Promise<{ role: AppRole; error?: string }> {
	try {
		const { data, error } = await supabase.auth.signInWithPassword({ email, password });
		if (error) return { role: '', error: error.message };
		if (!data.user) return { role: '', error: 'No user returned' };

		// Check user_roles table for role
		const { data: roleData } = await supabase.from('user_roles').select('role').eq('user_id', data.user.id).single();
		return { role: (roleData?.role as AppRole) || 'viewer' };
	} catch (e: any) {
		return { role: '', error: e.message };
	}
}

/** Supabase sign up */
export async function signUp(email: string, password: string, displayName?: string): Promise<{ success: boolean; error?: string }> {
	try {
		const { data, error } = await supabase.auth.signUp({ email, password });
		if (error) return { success: false, error: error.message };
		if (!data.user) return { success: false, error: 'Sign up failed' };

		// Insert user role (default viewer)
		await supabase.from('user_roles').insert({
			user_id: data.user.id, email, role: 'viewer', display_name: displayName || email.split('@')[0]
		});

		return { success: true };
	} catch (e: any) {
		return { success: false, error: e.message };
	}
}

/** Sign out */
export async function signOut() {
	await supabase.auth.signOut();
}

/** Get current session */
export async function getSession() {
	const { data } = await supabase.auth.getSession();
	return data.session;
}

/** Check if a Supabase session exists and get the role */
export async function checkAuth(): Promise<AppRole> {
	try {
		const session = await getSession();
		if (!session?.user) return '';
		const { data } = await supabase.from('user_roles').select('role').eq('user_id', session.user.id).single();
		return (data?.role as AppRole) || 'viewer';
	} catch {
		return '';
	}
}
