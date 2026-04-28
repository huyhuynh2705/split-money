const PREFIX = "split-money:identity:";

export function getIdentity(groupCode: string): string | null {
  try {
    return localStorage.getItem(PREFIX + groupCode);
  } catch {
    return null;
  }
}

export function setIdentity(groupCode: string, member: string): void {
  try {
    localStorage.setItem(PREFIX + groupCode, member);
  } catch {
    // ignore quota / private mode errors
  }
}

export function clearIdentity(groupCode: string): void {
  try {
    localStorage.removeItem(PREFIX + groupCode);
  } catch {
    // ignore
  }
}
