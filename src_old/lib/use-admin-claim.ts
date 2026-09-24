import { useEffect, useState } from "react";
import { onIdTokenChanged, type User } from "firebase/auth";
import { adminAuthClient } from "./admin-auth-client";

type AdminClaimState = {
  adminUser: User | null;
  isAdmin: boolean;
  loading: boolean;
};

export function useAdminClaim(): AdminClaimState {
  const [state, setState] = useState<AdminClaimState>({
    adminUser: null,
    isAdmin: false,
    loading: true,
  });

  useEffect(() => {
    const unsubscribe = onIdTokenChanged(adminAuthClient, async (user) => {
      if (!user) {
        setState({ adminUser: null, isAdmin: false, loading: false });
        return;
      }
      const tokenResult = await user.getIdTokenResult();
      setState({ adminUser: user, isAdmin: tokenResult.claims.admin === true, loading: false });
    });
    return unsubscribe;
  }, []);

  return state;
}