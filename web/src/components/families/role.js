import { createContext, useContext } from 'react';

// Who is looking at the families screens. A delegate sees only their own families (the server
// sends only those) and none of the manager's tools: no delegate pickers, no bulk payment,
// no moving a family to another delegate.
export const FamiliesRoleContext = createContext('admin');
export const useIsDelegate = () => useContext(FamiliesRoleContext) === 'delegate';
