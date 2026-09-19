/** Anything owned by whoever created it — a session, a document, a book, an exam. */
export interface Owned {
    createdBy: string;
}

export interface Requester {
    id: string;
    role: string | null;
}

/**
 * True when the requester owns the row, or is an admin — who may view and
 * manage anyone's content, not just their own. The single check every
 * module's "is this mine?" guard should call, so admin access stays
 * consistent everywhere instead of being reimplemented per module.
 */
export const canAccessOwned = (row: Owned, requester: Requester): boolean =>
    row.createdBy === requester.id || requester.role === "admin";
