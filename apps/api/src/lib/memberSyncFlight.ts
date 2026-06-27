type MemberSyncResult = {
  syncedMembers: number;
  voice: {
    ok: boolean;
    status: number | null;
    count: number;
    details?: string;
  };
};

let syncInFlight: Promise<MemberSyncResult> | null = null;
let lastSyncAt: string | null = null;
let lastSyncError: string | null = null;
let lastSyncResult: MemberSyncResult | null = null;

export function getMemberSyncStatus(): {
  running: boolean;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  lastSyncResult: MemberSyncResult | null;
} {
  return {
    running: syncInFlight !== null,
    lastSyncAt,
    lastSyncError,
    lastSyncResult
  };
}

/** Single-flight wrapper — concurrent callers share one in-progress sync. */
export function runMemberSyncSingleFlight(
  syncFn: () => Promise<MemberSyncResult>
): Promise<MemberSyncResult> {
  if (syncInFlight) return syncInFlight;

  syncInFlight = syncFn()
    .then((result) => {
      lastSyncAt = new Date().toISOString();
      lastSyncError = null;
      lastSyncResult = result;
      return result;
    })
    .catch((err) => {
      lastSyncError = err instanceof Error ? err.message : String(err);
      throw err;
    })
    .finally(() => {
      syncInFlight = null;
    });

  return syncInFlight;
}
